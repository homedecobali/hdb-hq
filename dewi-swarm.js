/* ==========================================================================
   dewi-swarm.js — wandelende crew-avatars tussen afdelingen en agents (ORG view)
   --------------------------------------------------------------------------
   Drop-in module. Enige koppeling in organisation.html:

       <script src="dewi-swarm.js" defer></script>

   Wat deze versie doet (v2 — "kantoorgangen"):
   - De crew zijn kleine MENSFIGUURTJES (kop + romp in de afdelingskleur,
     wiebelende beentjes), niet langer bolletjes.
   - Ze bewegen ORTHOGONAAL, als door kantoorgangen:
       * langs de agents van de bronafdeling naar BENEDEN,
       * onder de laatste agent langs naar LINKS of RECHTS,
       * in de doelafdeling langs de agents weer naar BOVEN
         tot de doel-agent.
     (Zelfde-afdeling = recht omhoog/omlaag. Richting MANAGEMENT loopt de
      route via de bovenste gang.)
   - Ambient verkeer loopt altijd door; statuswijzigingen (.ac-run) sturen
     een gekleurd figuurtje "naar management" met een naamlabel.
   - Respecteert prefers-reduced-motion en pauzeert bij verborgen tab.

   Publieke API (optioneel):
       DEWI_SWARM.on() / .off() / .toggle()
       DEWI_SWARM.rescan()                     // na herbouw organigram
       DEWI_SWARM.event(agentId, kind)         // kind: ok|error|running|stale
   ========================================================================== */
(function () {
  "use strict";

  /* ---- afstelling ------------------------------------------------------ */
  var CFG = {
    ambientMin:   5,      // minimaal aantal wandelaars
    ambientMax:  16,      // bovengrens (performance)
    perAgents:    3,      // ~1 wandelaar per N agents
    walkMin:     52,      // wandelsnelheid ambient (px/sec)
    walkMax:     92,
    eventSpeed: 150,      // snelheid event-figuur (px/sec)
    pauseMs:    [250, 1700],   // "even bij het bureau blijven staan"
    trailMax:   160,
    size:        30,      // figuurhoogte-basis (px)
    eventSize:   36,
    corridorGap: 14,      // afstand van de horizontale gang onder de lanes
    remeasureMs: 1000
  };

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var STATUS_COLOR = {
    ok:      "#3ee08f",
    running: "#00d4ff",
    error:   "#E31E24",
    stale:   "#ffb547",
    idle:    "#5e7c8e"
  };
  var RUNCLS = { "run-ok": "ok", "run-go": "running", "run-err": "error", "run-stale": "stale" };

  var rnd  = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };

  /* ---- kleur-helpers (SVG heeft echte hex nodig) ----------------------- */
  function hex2rgb(h) {
    if (typeof h !== "string") return null;
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim());
    if (!m) return null;
    h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mixHex(a, b, t) {
    var pa = hex2rgb(a), pb = hex2rgb(b);
    if (!pa || !pb) return a;
    var out = pa.map(function (v, i) {
      var n = Math.round(v + (pb[i] - v) * t);
      return ("0" + n.toString(16)).slice(-2);
    });
    return "#" + out.join("");
  }

  /* ---- state ----------------------------------------------------------- */
  var host = null, layer = null, btn = null;
  var running = false, rafId = null, lastT = 0, measureAcc = 0;
  var anchors = new Map();          // key -> anchor
  var depts = [], agents = [], hub = null;
  var walkers = [], trail = [];
  var sigCache = new Map();         // agentId -> handtekening van de run-badge
  var laneGeoms = [];               // {el, cx, top, bottom}
  var bottomCorridorY = 0, topCorridorY = 0;

  /* ====================================================================== */
  /* STIJL                                                                  */
  /* ====================================================================== */
  function injectStyle() {
    if (document.getElementById("dewi-swarm-style")) return;
    var s = document.createElement("style");
    s.id = "dewi-swarm-style";
    s.textContent = [
      "#dewiSwarm{position:absolute;left:0;top:0;pointer-events:none;z-index:5;overflow:hidden}",
      "#dewiSwarm .sw{position:absolute;left:0;top:0;will-change:transform}",
      "#dewiSwarm .sw svg{display:block;width:100%;height:100%;overflow:visible;",
      "  filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}",
      "#dewiSwarm .sw.ev svg{filter:drop-shadow(0 0 8px currentColor) drop-shadow(0 2px 3px rgba(0,0,0,.5))}",
      "#dewiSwarm .sw .dsw-leg{transform-box:fill-box;transform-origin:top center}",
      "#dewiSwarm .sw .dsw-leg-a{animation:dsw-step-a .5s ease-in-out infinite}",
      "#dewiSwarm .sw .dsw-leg-b{animation:dsw-step-b .5s ease-in-out infinite}",
      "#dewiSwarm .sw.rest .dsw-leg{animation-play-state:paused}",
      "@keyframes dsw-step-a{0%,100%{transform:translateY(0) rotate(10deg)}50%{transform:translateY(-.5px) rotate(-10deg)}}",
      "@keyframes dsw-step-b{0%,100%{transform:translateY(0) rotate(-10deg)}50%{transform:translateY(-.5px) rotate(10deg)}}",
      "#dewiSwarm .tr{position:absolute;left:0;top:0;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;",
      "  border-radius:50%;opacity:.5;animation:dsw-fade .55s linear forwards}",
      "@keyframes dsw-fade{to{opacity:0;transform:scale(.35)}}",
      "#dewiSwarm .ring{position:absolute;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;",
      "  border-radius:50%;border:2px solid currentColor;animation:dsw-ring .6s ease-out forwards}",
      "@keyframes dsw-ring{to{transform:scale(3.2);opacity:0}}",
      "#dewiSwarm .tag{position:absolute;left:0;top:0;transform:translate(10px,-16px);white-space:nowrap;",
      "  font:700 9px/1 system-ui;letter-spacing:.4px;padding:3px 6px;border-radius:6px;",
      "  background:rgba(8,13,20,.88);border:1px solid rgba(255,255,255,.14);",
      "  animation:dsw-tag 1.5s ease-out forwards}",
      "@keyframes dsw-tag{0%{opacity:0;transform:translate(10px,-10px)}",
      "  18%{opacity:1;transform:translate(10px,-16px)}100%{opacity:0;transform:translate(10px,-26px)}}",
      "@media (prefers-reduced-motion:reduce){#dewiSwarm .sw .dsw-leg{animation:none}}"
    ].join("");
    document.head.appendChild(s);
  }

  /* ====================================================================== */
  /* ANKERPUNTEN                                                            */
  /* ====================================================================== */
  function centerIn(el) {
    var r = el.getBoundingClientRect(), h = host.getBoundingClientRect();
    return {
      x: r.left - h.left + host.scrollLeft + r.width / 2,
      y: r.top - h.top + host.scrollTop + r.height / 2
    };
  }

  function accentOf(el) {
    var lane = el.closest(".org-lane, .mgmt-block");
    var c = lane ? getComputedStyle(lane).getPropertyValue("--a").trim() : "";
    return c || "#00d4ff";
  }

  function initials(name) {
    var p = String(name || "").replace(/\(.*?\)/g, "").trim().split(/\s+/);
    return (((p[0] && p[0][0]) || "?") + ((p[1] && p[1][0]) || (p[0] && p[0][1]) || "")).toUpperCase();
  }

  function upsert(key, el, type, extra) {
    var a = anchors.get(key);
    if (!a) { a = { key: key, type: type }; anchors.set(key, a); }
    a.el = el;
    if (extra) for (var k in extra) a[k] = extra[k];
    return a;
  }

  function rescan() {
    if (!host) return;
    var seen = new Set();

    // afdelingskoppen
    var lanes = host.querySelectorAll(".org-lane");
    depts = [];
    Array.prototype.forEach.call(lanes, function (lane, i) {
      var head = lane.querySelector(".lane-head") || lane;
      var nameEl = lane.querySelector(".lane-name");
      var a = upsert("dept:" + i, head, "dept", {
        color: getComputedStyle(lane).getPropertyValue("--a").trim() || "#00d4ff",
        label: nameEl ? nameEl.textContent.trim() : "AFDELING",
        icon: (lane.querySelector(".lane-ic") || {}).textContent || ""
      });
      depts.push(a); seen.add(a.key);
    });

    // management = hub
    var mg = host.querySelector(".mgmt-block");
    if (mg) {
      hub = upsert("hub", mg.querySelector(".mgmt-head") || mg, "hub", {
        color: getComputedStyle(mg).getPropertyValue("--a").trim() || "#ffd166",
        label: "MANAGEMENT"
      });
      seen.add("hub");
    } else { hub = null; }

    // agentkaarten
    agents = [];
    var cards = host.querySelectorAll(".agent-card[data-agent]");
    Array.prototype.forEach.call(cards, function (card) {
      var id = card.getAttribute("data-agent");
      var nm = card.querySelector(".ac-name");
      var a = upsert("agent:" + id, card, "agent", {
        id: id,
        color: accentOf(card),
        label: nm ? nm.textContent.trim() : id,
        ini: initials(nm ? nm.textContent : id)
      });
      agents.push(a); seen.add(a.key);
    });

    // verdwenen ankers opruimen
    anchors.forEach(function (a, k) { if (!seen.has(k)) anchors.delete(k); });

    measure();
    refreshPaths();
    resizeLayer();
    seedSignatures();
    balanceAmbient();
  }

  /* ---- lane-geometrie + gangen ---------------------------------------- */
  function measureGeom() {
    laneGeoms = [];
    var h = host.getBoundingClientRect();
    var els = host.querySelectorAll(".org-lane, .mgmt-block");
    var maxBottom = 0, minLaneTop = Infinity, mgmtBottom = 0;
    Array.prototype.forEach.call(els, function (el) {
      var r = el.getBoundingClientRect();
      var top = r.top - h.top + host.scrollTop;
      var left = r.left - h.left + host.scrollLeft;
      var g = { el: el, cx: left + r.width / 2, top: top, bottom: top + r.height };
      laneGeoms.push(g);
      if (el.classList.contains("mgmt-block")) {
        if (g.bottom > mgmtBottom) mgmtBottom = g.bottom;
      } else {
        if (g.bottom > maxBottom) maxBottom = g.bottom;
        if (g.top < minLaneTop) minLaneTop = g.top;
      }
    });
    if (!isFinite(minLaneTop)) minLaneTop = maxBottom;
    bottomCorridorY = maxBottom + CFG.corridorGap;
    topCorridorY = mgmtBottom ? (mgmtBottom + minLaneTop) / 2 : Math.max(0, minLaneTop - 16);
  }

  function laneOf(el) {
    var lane = el.closest ? el.closest(".org-lane, .mgmt-block") : null;
    if (!lane) return null;
    for (var i = 0; i < laneGeoms.length; i++) if (laneGeoms[i].el === lane) return laneGeoms[i];
    return null;
  }

  function measure() {
    measureGeom();
    anchors.forEach(function (a) {
      if (!a.el || !a.el.isConnected) return;
      var c = centerIn(a.el);
      a.x = c.x; a.y = c.y;
      if (a.type === "agent") {
        var av = a.el.querySelector(".mini-av");
        var nc = av ? centerIn(av) : c;      // knooppunt = het mini-avatar (de "desk")
        a.nx = nc.x; a.ny = nc.y;
        a.lane = laneOf(a.el);
        a.isMgmt = !!(a.el.closest && a.el.closest(".mgmt-block"));
      }
    });
    // walkers met verdwenen ankers herrichten
    walkers = walkers.filter(function (w) {
      return w.from && w.to && w.from.x != null && w.to.x != null;
    });
  }

  function resizeLayer() {
    if (!layer || !host) return;
    layer.style.width = host.scrollWidth + "px";
    layer.style.height = host.scrollHeight + "px";
  }

  /* ====================================================================== */
  /* PADEN — orthogonale "kantoorgang"-routing                              */
  /* ====================================================================== */
  function nodePos(a) {
    return { x: (a.nx != null ? a.nx : a.x), y: (a.ny != null ? a.ny : a.y) };
  }

  function buildPath(A, B) {
    var pa = nodePos(A), pb = nodePos(B);
    var la = A.lane, lb = B.lane;

    // zelfde afdeling → recht langs de kolom omhoog/omlaag
    if (la && lb && la.el === lb.el) {
      return [{ x: pa.x, y: pa.y }, { x: pa.x, y: pb.y }, { x: pb.x, y: pb.y }];
    }

    // richting/vanuit management → via de bovenste gang; anders de onderste
    var useTop = (A.isMgmt || B.isMgmt);
    var corr = useTop ? topCorridorY : bottomCorridorY;

    return [
      { x: pa.x, y: pa.y },      // sta bij de agent
      { x: pa.x, y: corr },      // daal/stijg langs de eigen kolom naar de gang
      { x: pb.x, y: corr },      // loop door de gang, onder de laatste agent langs
      { x: pb.x, y: pb.y }       // stijg langs de doelkolom naar de doel-agent
    ];
  }

  function setPath(w, pts) {
    w.path = pts;
    w.seg = [];
    w.total = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      w.seg.push(l);
      w.total += l;
    }
    w.dist = 0;
  }

  function posAt(w) {
    var d = w.dist, i = 0, pts = w.path;
    while (i < w.seg.length && d > w.seg[i]) { d -= w.seg[i]; i++; }
    if (i >= w.seg.length) {
      var last = pts[pts.length - 1];
      return { x: last.x, y: last.y, dx: 0, dy: 0 };
    }
    var a = pts[i], b = pts[i + 1], l = w.seg[i] || 1, t = d / l;
    return {
      x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
      dx: (b.x - a.x) / l, dy: (b.y - a.y) / l
    };
  }

  function refreshPaths() {
    walkers.forEach(function (w) {
      if (!w.from || !w.to) return;
      var ratio = w.total > 0 ? w.dist / w.total : 0;
      setPath(w, buildPath(w.from, w.to));
      w.dist = ratio * w.total;
    });
  }

  /* ====================================================================== */
  /* AVATARS (mensfiguurtjes)                                               */
  /* ====================================================================== */
  function walkerSVG(accent, ini) {
    var shirt = (typeof accent === "string" && /^#/.test(accent)) ? accent : "#00d4ff";
    var shirtSh = mixHex(shirt, "#000000", .32);
    var shirtHi = mixHex(shirt, "#ffffff", .24);
    var skin = "#e0aa79", hair = "#241f22";
    var chest = ini
      ? '<text x="12" y="19.4" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" ' +
        'font-weight="800" font-size="5.6" fill="#06131a" opacity=".72">' +
        String(ini).toUpperCase().slice(0, 2) + '</text>'
      : "";
    return '<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse class="dsw-sh" cx="12" cy="30.2" rx="6.4" ry="1.9" fill="rgba(0,0,0,.34)"/>' +
      '<g class="dsw-legs">' +
        '<rect class="dsw-leg dsw-leg-a" x="9.1" y="21.4" width="2.5" height="7.6" rx="1.25" fill="' + shirtSh + '"/>' +
        '<rect class="dsw-leg dsw-leg-b" x="12.4" y="21.4" width="2.5" height="7.6" rx="1.25" fill="' + shirtSh + '"/>' +
      '</g>' +
      '<path class="dsw-body" d="M12 11.4c3.8 0 5.7 2.7 6.1 6.6 .2 2 .3 3.5-.35 4.2H6.25c-.65-.7-.55-2.2-.35-4.2C6.3 14.1 8.2 11.4 12 11.4z" fill="' + shirt + '"/>' +
      '<path d="M12 11.4c3.8 0 5.7 2.7 6.1 6.6-2.1-2.8-4.1-3.7-6.1-3.7s-4 .9-6.1 3.7C6.3 14.1 8.2 11.4 12 11.4z" fill="' + shirtHi + '" opacity=".6"/>' +
      chest +
      '<circle cx="12" cy="7.3" r="5" fill="' + skin + '"/>' +
      '<path d="M7 7.2a5 5 0 0 1 10 0c-1.3-2.1-3.1-3.1-5-3.1S8.3 5.1 7 7.2z" fill="' + hair + '"/>' +
      '<circle cx="10.1" cy="6" r=".7" fill="rgba(255,255,255,.7)"/>' +
      '</svg>';
  }

  function makeWalkerEl(size, color, ini) {
    var d = document.createElement("div");
    d.className = "sw";
    var w = size, h = Math.round(size * 32 / 24);
    d.style.width = w + "px";
    d.style.height = h + "px";
    d.style.marginLeft = (-w / 2) + "px";
    d.style.marginTop = (-h / 2) + "px";
    d.innerHTML = walkerSVG(color, ini);
    layer.appendChild(d);
    return d;
  }

  function recolor(el, color, ini) { el.innerHTML = walkerSVG(color, ini); }

  function remove(w) { if (w.el && w.el.parentNode) w.el.parentNode.removeChild(w.el); }

  /* ---- doel-pools ------------------------------------------------------ */
  function agentPool() {
    if (agents.length) return agents;
    var p = depts.slice();
    if (hub) p.push(hub);
    return p;
  }
  function randomAgent(exclude) {
    var pool = agentPool();
    if (!pool.length) return null;
    for (var i = 0; i < 8; i++) {
      var c = pick(pool);
      if (c !== exclude && c.x != null) return c;
    }
    return pool[0];
  }

  function spawnAmbient() {
    var A = randomAgent(null); if (!A) return;
    var B = randomAgent(A);    if (!B) return;
    var color = A.color || "#00d4ff";
    var w = {
      kind: "ambient", from: A, to: B, wait: 0,
      speed: rnd(CFG.walkMin, CFG.walkMax), color: color,
      el: makeWalkerEl(CFG.size, color, A.ini)
    };
    setPath(w, buildPath(A, B));
    walkers.push(w);
  }

  function balanceAmbient() {
    var want = Math.max(CFG.ambientMin,
      Math.min(CFG.ambientMax, Math.round(agents.length / CFG.perAgents)));
    var have = walkers.filter(function (w) { return w.kind === "ambient"; }).length;
    while (have < want) { spawnAmbient(); have++; }
    while (have > want) {
      for (var i = walkers.length - 1; i >= 0; i--) {
        if (walkers[i].kind === "ambient") { remove(walkers[i]); walkers.splice(i, 1); break; }
      }
      have--;
    }
  }

  /* ---- event-figuur: agent -> management ------------------------------- */
  function fireEvent(agentId, kind) {
    if (!running) return;
    var A = anchors.get("agent:" + agentId); if (!A || A.x == null) return;
    var color = STATUS_COLOR[kind] || STATUS_COLOR.idle;

    var dst = null;
    var mg = agents.filter(function (a) { return a.isMgmt; });
    if (mg.length) dst = pick(mg);
    else if (hub) dst = hub;
    else dst = randomAgent(A);
    if (!dst) return;

    var w = {
      kind: "event", status: kind, from: A, to: dst, wait: 0,
      speed: CFG.eventSpeed * (kind === "error" ? 1.3 : 1), color: color,
      el: makeWalkerEl(CFG.eventSize, color, A.ini)
    };
    w.el.classList.add("ev");
    w.el.style.color = color;
    setPath(w, buildPath(A, dst));
    walkers.push(w);

    spawnTag(A.x, A.y, color, A.label);   // naamlabel stijgt op vanaf de kaart
  }

  function spawnTag(x, y, color, label) {
    var tag = document.createElement("div");
    tag.className = "tag";
    tag.style.color = color;
    tag.style.left = x + "px";
    tag.style.top = y + "px";
    tag.textContent = label;
    layer.appendChild(tag);
    setTimeout(function () { if (tag.parentNode) tag.parentNode.removeChild(tag); }, 1600);
  }

  function ping(x, y, color) {
    var r = document.createElement("div");
    r.className = "ring";
    r.style.color = color;
    r.style.left = x + "px";
    r.style.top = y + "px";
    layer.appendChild(r);
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 640);
  }

  function puff(x, y, color) {
    if (trail.length > CFG.trailMax) return;
    var d = document.createElement("div");
    d.className = "tr";
    d.style.background = color;
    d.style.left = x + "px";
    d.style.top = y + "px";
    layer.appendChild(d);
    trail.push(d);
    setTimeout(function () {
      if (d.parentNode) d.parentNode.removeChild(d);
      var i = trail.indexOf(d); if (i >= 0) trail.splice(i, 1);
    }, 560);
  }

  /* ====================================================================== */
  /* LOOP                                                                   */
  /* ====================================================================== */
  function visible() {
    return host && host.offsetParent !== null && !document.hidden;
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    var dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (!visible()) return;

    measureAcc += dt * 1000;
    if (measureAcc > CFG.remeasureMs) { measureAcc = 0; measure(); refreshPaths(); resizeLayer(); }

    for (var i = walkers.length - 1; i >= 0; i--) {
      var w = walkers[i];

      if (w.wait > 0) { w.wait -= dt * 1000; if (w.el) w.el.classList.add("rest"); continue; }
      if (w.el) w.el.classList.remove("rest");

      if (!w.from || !w.to || w.from.x == null || w.to.x == null) { remove(w); walkers.splice(i, 1); continue; }

      w.dist += w.speed * dt;

      if (w.dist >= w.total) {
        var end = w.path[w.path.length - 1];
        ping(end.x, end.y, w.color);

        if (w.kind === "event") { remove(w); walkers.splice(i, 1); continue; }

        // ambient: kies een nieuwe bestemming, blijf even staan
        w.from = w.to;
        w.to = randomAgent(w.from) || w.from;
        setPath(w, buildPath(w.from, w.to));
        w.wait = rnd(CFG.pauseMs[0], CFG.pauseMs[1]);
        w.speed = rnd(CFG.walkMin, CFG.walkMax);
        if (w.from.color) { w.color = w.from.color; recolor(w.el, w.color, w.from.ini); }
        continue;
      }

      var p = posAt(w);
      var moving = (p.dx || p.dy);
      var bob = (!REDUCED && moving) ? Math.sin(w.dist / 6) * 1.3 : 0;
      w.el.style.transform = "translate3d(" + p.x.toFixed(1) + "px," + (p.y + bob).toFixed(1) + "px,0)";

      if (w.kind === "event" || Math.random() < 0.10) puff(p.x, p.y + CFG.size * 0.42, w.color);
    }
  }

  /* ====================================================================== */
  /* LIVE TRIGGERS — afgeleid uit de .ac-run badge                          */
  /* ====================================================================== */
  function sigOf(card) {
    var run = card.querySelector(".ac-run");
    if (!run) return "";
    var rt = run.querySelector(".rt");
    return run.className + "|" + (rt ? rt.textContent : "");
  }

  function seedSignatures() {
    sigCache.clear();
    agents.forEach(function (a) { sigCache.set(a.id, sigOf(a.el)); });
  }

  function kindFromCard(card) {
    var run = card.querySelector(".ac-run");
    if (!run) return "idle";
    for (var cls in RUNCLS) if (run.classList.contains(cls)) return RUNCLS[cls];
    return "idle";
  }

  var mo = null;
  function observe() {
    if (mo || !host) return;
    mo = new MutationObserver(function (recs) {
      var dirty = new Set(), structural = false;
      recs.forEach(function (r) {
        var t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (!t) return;
        if (r.type === "childList" &&
            (t.id === "orgBoard" || t.id === "orgTop" || t.classList.contains("org-tree"))) {
          structural = true; return;
        }
        var card = t.closest ? t.closest(".agent-card[data-agent]") : null;
        if (card) dirty.add(card);
      });
      if (structural) { rescan(); return; }
      dirty.forEach(function (card) {
        var id = card.getAttribute("data-agent");
        var sig = sigOf(card);
        if (sigCache.get(id) === sig) return;
        var first = !sigCache.has(id);
        sigCache.set(id, sig);
        if (!first) fireEvent(id, kindFromCard(card));
      });
    });
    mo.observe(host, {
      subtree: true, childList: true,
      attributes: true, attributeFilter: ["class", "style", "title"],
      characterData: true
    });
  }

  /* ====================================================================== */
  /* AAN / UIT                                                              */
  /* ====================================================================== */
  function start() {
    if (running) return;
    running = true;
    layer.style.display = "";
    rescan(); observe();
    lastT = performance.now();
    rafId = requestAnimationFrame(tick);
    if (btn) btn.classList.add("active");
    try { localStorage.setItem("dewi.swarm", "1"); } catch (e) {}
  }

  function stop() {
    if (!running) return;
    running = false;
    if (rafId) cancelAnimationFrame(rafId); rafId = null;
    walkers.forEach(remove); walkers = [];
    layer.innerHTML = "";
    layer.style.display = "none";
    if (btn) btn.classList.remove("active");
    try { localStorage.setItem("dewi.swarm", "0"); } catch (e) {}
  }

  function toggle() { running ? stop() : start(); }

  /* ====================================================================== */
  /* BOOT                                                                   */
  /* ====================================================================== */
  function mountButton() {
    var header = document.querySelector("header"); if (!header) return;
    var ref = document.getElementById("depsBtn");
    btn = document.createElement("button");
    btn.className = "depbtn";
    btn.id = "swarmBtn";
    btn.title = "Wandelende crew tussen afdelingen en agents aan/uit";
    btn.innerHTML = '<span class="ic">\uD83D\uDEB6</span>CREW';
    btn.addEventListener("click", toggle);
    if (ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref.nextSibling);
    else header.appendChild(btn);
  }

  function boot() {
    host = document.getElementById("view-org");
    if (!host) return;
    injectStyle();
    if (getComputedStyle(host).position === "static") host.style.position = "relative";

    layer = document.createElement("div");
    layer.id = "dewiSwarm";
    layer.style.display = "none";
    host.insertBefore(layer, host.firstChild);

    mountButton();

    window.addEventListener("resize", function () { measure(); refreshPaths(); resizeLayer(); });
    document.addEventListener("visibilitychange", function () { lastT = performance.now(); });

    var saved = null;
    try { saved = localStorage.getItem("dewi.swarm"); } catch (e) {}
    var wantOn = saved === null ? !REDUCED : saved === "1";

    // het organigram wordt na login opnieuw opgebouwd; wacht op de kaarten
    var tries = 0;
    (function waitForCards() {
      if (document.querySelector(".agent-card[data-agent]")) {
        if (wantOn) start(); else { rescan(); observe(); }
        return;
      }
      if (tries++ < 120) setTimeout(waitForCards, 250);
    })();
  }

  window.DEWI_SWARM = {
    on: start, off: stop, toggle: toggle,
    rescan: function () { if (host) rescan(); },
    event: fireEvent,
    config: CFG,
    get running() { return running; }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
