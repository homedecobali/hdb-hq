/* ==========================================================================
   dewi-swarm.js — bewegende avatars tussen afdelingen en agents (ORG view)
   --------------------------------------------------------------------------
   Drop-in module. Enige wijziging in organisation.html:

       <script src="dewi-swarm.js" defer></script>

   direct onder de bestaande <script src="dewi-agents.js"></script>.

   Werkt volledig zelfstandig:
   - ankerpunten worden uit de DOM gelezen (.org-lane / .mgmt-block /
     [data-agent]); er is geen koppeling met de renderfuncties nodig
   - live triggers worden afgeleid uit de .ac-run badge die
     updateOrgStatus() al bijwerkt (MutationObserver + dedupe)
   - ambient verkeer blijft doorlopen zodat er altijd beweging is
   - respecteert prefers-reduced-motion en pauzeert bij verborgen tab
     of wanneer de CONSTELLATION-view actief is

   Publieke API (optioneel, niet verplicht):
       DEWI_SWARM.on() / .off() / .toggle()
       DEWI_SWARM.rescan()                     // na herbouw organigram
       DEWI_SWARM.event(agentId, kind)         // kind: ok|error|running|stale
   ========================================================================== */
(function () {
  "use strict";

  /* ---- afstelling ------------------------------------------------------ */
  var CFG = {
    ambientMin:   6,      // minimaal aantal rondlopende avatars
    ambientMax:  24,      // absolute bovengrens (performance)
    perAgents:    3,      // 1 ambient avatar per N agents
    ambientSpeed:[0.18, 0.40],   // fractie van het pad per seconde
    eventSpeed:   0.95,
    pauseMs:     [150, 1500],    // wachttijd bij aankomst
    trailMax:    180,
    size:         15,
    eventSize:    22,
    bow:          0.20,   // boogsterkte van het pad (0 = kaarsrecht)
    remeasureMs: 1200
  };

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var STATUS_COLOR = {
    ok:      "#3ee08f",
    running: "#00d4ff",
    error:   "#E31E24",
    stale:   "#ffb547",
    idle:    "#5e7c8e"
  };
  var STATUS_GLYPH = { ok: "\u2713", running: "\u27F3", error: "\u2715", stale: "!", idle: "\u00b7" };
  var RUNCLS = { "run-ok": "ok", "run-go": "running", "run-err": "error", "run-stale": "stale" };

  var rnd  = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };

  /* ---- state ----------------------------------------------------------- */
  var host = null, layer = null, btn = null;
  var running = false, rafId = null, lastT = 0, measureAcc = 0;
  var anchors = new Map();          // key -> anchor
  var depts = [], agents = [], hub = null;
  var walkers = [], trail = [];
  var sigCache = new Map();         // agentId -> handtekening van de run-badge

  /* ====================================================================== */
  /* STIJL                                                                  */
  /* ====================================================================== */
  function injectStyle() {
    if (document.getElementById("dewi-swarm-style")) return;
    var s = document.createElement("style");
    s.id = "dewi-swarm-style";
    s.textContent = [
      "#dewiSwarm{position:absolute;left:0;top:0;pointer-events:none;z-index:5;overflow:hidden}",
      "#dewiSwarm .sw{position:absolute;left:0;top:0;will-change:transform;border-radius:50%;",
      "  display:grid;place-items:center;font:800 8px/1 system-ui;color:#06131a;",
      "  box-shadow:0 2px 6px rgba(0,0,0,.45)}",
      "#dewiSwarm .sw::after{content:'';position:absolute;left:22%;top:16%;width:26%;height:26%;",
      "  border-radius:50%;background:rgba(255,255,255,.55)}",
      "#dewiSwarm .sw.ev{font-size:11px;font-weight:900}",
      "#dewiSwarm .tr{position:absolute;left:0;top:0;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;",
      "  border-radius:50%;opacity:.55;animation:dsw-fade .55s linear forwards}",
      "@keyframes dsw-fade{to{opacity:0;transform:scale(.35)}}",
      "#dewiSwarm .ring{position:absolute;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;",
      "  border-radius:50%;border:2px solid currentColor;animation:dsw-ring .6s ease-out forwards}",
      "@keyframes dsw-ring{to{transform:scale(3.2);opacity:0}}",
      "#dewiSwarm .tag{position:absolute;left:0;top:0;transform:translate(10px,-16px);white-space:nowrap;",
      "  font:700 9px/1 system-ui;letter-spacing:.4px;padding:3px 6px;border-radius:6px;",
      "  background:rgba(8,13,20,.88);border:1px solid rgba(255,255,255,.14);",
      "  animation:dsw-tag 1.5s ease-out forwards}",
      "@keyframes dsw-tag{0%{opacity:0;transform:translate(10px,-10px)}",
      "  18%{opacity:1;transform:translate(10px,-16px)}100%{opacity:0;transform:translate(10px,-26px)}}"
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
    return ((p[0] && p[0][0]) || "?") + ((p[1] && p[1][0]) || (p[0] && p[0][1]) || "");
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
    resizeLayer();
    seedSignatures();
    balanceAmbient();
  }

  function measure() {
    anchors.forEach(function (a) {
      if (!a.el || !a.el.isConnected) return;
      var c = centerIn(a.el);
      a.x = c.x; a.y = c.y;
    });
    // walkers met verdwenen ankers herrichten
    walkers = walkers.filter(function (w) {
      return w.a && w.b && w.a.x != null && w.b.x != null;
    });
  }

  function resizeLayer() {
    if (!layer || !host) return;
    layer.style.width = host.scrollWidth + "px";
    layer.style.height = host.scrollHeight + "px";
  }

  /* ====================================================================== */
  /* PADEN                                                                  */
  /* ====================================================================== */
  function control(a, b, bias) {
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.hypot(dx, dy) || 1;
    var bow = Math.min(120, len * CFG.bow) * (bias == null ? (Math.random() < 0.5 ? 1 : -1) : bias);
    return { x: mx + (-dy / len) * bow, y: my + (dx / len) * bow };
  }

  function bez(a, c, b, t) {
    var u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
             y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  }

  /* ====================================================================== */
  /* AVATARS                                                                */
  /* ====================================================================== */
  function makeEl(cls, size, color, text) {
    var d = document.createElement("div");
    d.className = "sw" + (cls ? " " + cls : "");
    d.style.width = d.style.height = size + "px";
    d.style.marginLeft = d.style.marginTop = (-size / 2) + "px";
    d.style.background = "radial-gradient(120% 120% at 30% 25%, " +
      "color-mix(in srgb," + color + " 92%, #fff), color-mix(in srgb," + color + " 62%, #0b0f17) 74%)";
    d.style.color = "#06131a";
    if (text) d.textContent = text;
    layer.appendChild(d);
    return d;
  }

  function randomAnchor(exclude) {
    var pool = agents.concat(depts);
    if (hub) pool.push(hub);
    if (!pool.length) return null;
    for (var i = 0; i < 8; i++) {
      var c = pick(pool);
      if (c !== exclude && c.x != null) return c;
    }
    return pool[0];
  }

  function spawnAmbient() {
    var a = randomAnchor(null); if (!a) return;
    var b = randomAnchor(a); if (!b) return;
    var color = (a.type === "agent" ? a.color : a.color) || "#00d4ff";
    var w = {
      kind: "ambient", a: a, b: b, t: 0, wait: 0,
      speed: rnd(CFG.ambientSpeed[0], CFG.ambientSpeed[1]),
      c: control(a, b), color: color,
      el: makeEl("", CFG.size, color, a.type === "agent" ? (a.ini || "").slice(0, 2) : (a.icon || ""))
    };
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

  function remove(w) { if (w.el && w.el.parentNode) w.el.parentNode.removeChild(w.el); }

  /* ---- event-avatar: agent -> afdeling -> management -------------------- */
  function fireEvent(agentId, kind) {
    if (!running) return;
    var a = anchors.get("agent:" + agentId); if (!a || a.x == null) return;
    var lane = a.el.closest(".org-lane, .mgmt-block");
    var dst = null;
    if (lane) {
      for (var i = 0; i < depts.length; i++) {
        if (depts[i].el.closest(".org-lane") === lane) { dst = depts[i]; break; }
      }
      if (!dst && lane.classList.contains("mgmt-block")) dst = hub;
    }
    if (!dst) dst = hub || randomAnchor(a);
    if (!dst) return;

    var color = STATUS_COLOR[kind] || STATUS_COLOR.idle;
    var w = {
      kind: "event", status: kind, a: a, b: dst, t: 0, wait: 0,
      speed: CFG.eventSpeed * (kind === "error" ? 1.35 : 1),
      c: control(a, dst, 1), color: color, relay: (dst !== hub && hub) ? hub : null,
      el: makeEl("ev", CFG.eventSize, color, STATUS_GLYPH[kind] || "\u00b7")
    };
    w.el.style.boxShadow = "0 0 14px " + color + ", 0 2px 6px rgba(0,0,0,.5)";
    walkers.push(w);

    // naamlabel dat opstijgt vanaf de kaart
    var tag = document.createElement("div");
    tag.className = "tag";
    tag.style.color = color;
    tag.style.left = a.x + "px"; tag.style.top = a.y + "px";
    tag.textContent = a.label;
    layer.appendChild(tag);
    setTimeout(function () { if (tag.parentNode) tag.parentNode.removeChild(tag); }, 1600);
  }

  function ping(x, y, color) {
    var r = document.createElement("div");
    r.className = "ring";
    r.style.color = color;
    r.style.left = x + "px"; r.style.top = y + "px";
    layer.appendChild(r);
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 640);
  }

  function puff(x, y, color) {
    if (trail.length > CFG.trailMax) return;
    var d = document.createElement("div");
    d.className = "tr";
    d.style.background = color;
    d.style.left = x + "px"; d.style.top = y + "px";
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
    if (measureAcc > CFG.remeasureMs) { measureAcc = 0; measure(); resizeLayer(); }

    for (var i = walkers.length - 1; i >= 0; i--) {
      var w = walkers[i];
      if (w.wait > 0) { w.wait -= dt * 1000; continue; }
      if (w.a.x == null || w.b.x == null) { remove(w); walkers.splice(i, 1); continue; }

      w.t += dt * w.speed;

      if (w.t >= 1) {
        ping(w.b.x, w.b.y, w.color);
        if (w.kind === "event") {
          if (w.relay) {                       // doorsturen naar MANAGEMENT
            w.a = w.b; w.b = w.relay; w.relay = null;
            w.c = control(w.a, w.b, -1); w.t = 0; w.speed *= 0.8;
            continue;
          }
          remove(w); walkers.splice(i, 1); continue;
        }
        // ambient: nieuwe bestemming
        w.a = w.b;
        w.b = randomAnchor(w.a) || w.a;
        w.c = control(w.a, w.b);
        w.t = 0;
        w.wait = rnd(CFG.pauseMs[0], CFG.pauseMs[1]);
        w.speed = rnd(CFG.ambientSpeed[0], CFG.ambientSpeed[1]);
        if (w.a.type === "agent") { w.color = w.a.color; }
        continue;
      }

      var p = bez(w.a, w.c, w.b, w.t);
      var bob = w.kind === "ambient" ? Math.sin(w.t * Math.PI * 8) * 2.2 : 0;
      w.el.style.transform = "translate3d(" + p.x.toFixed(1) + "px," + (p.y + bob).toFixed(1) + "px,0)";

      if (w.kind === "event" || Math.random() < 0.16) puff(p.x, p.y, w.color);
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
    btn.title = "Bewegende avatars tussen afdelingen en agents aan/uit";
    btn.innerHTML = '<span class="ic">\uD83D\uDC63</span>CREW';
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

    window.addEventListener("resize", function () { measure(); resizeLayer(); });
    document.addEventListener("visibilitychange", function () { lastT = performance.now(); });

    var saved = null;
    try { saved = localStorage.getItem("dewi.swarm"); } catch (e) {}
    var wantOn = saved === null ? !REDUCED : saved === "1";
    // het organigram wordt na login opnieuw opgebouwd; even wachten op de kaarten
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
