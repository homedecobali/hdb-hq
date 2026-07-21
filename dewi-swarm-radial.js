/* ==========================================================================
   dewi-swarm-radial.js — bewegende avatars tussen de nodes (CONSTELLATION)
   --------------------------------------------------------------------------
   Tegenhanger van dewi-swarm.js, die voor het ORGANIGRAM is gemaakt. Die
   module leest .org-lane / .agent-card uit #view-org; in de radiale weergave
   bestaat dat niet. Deze versie leest de nodes uit #stage.

   Inhaken in constellation.html:

       <script src="dewi-swarm-radial.js" defer></script>

   en in applyRow(), na het bijwerken van de node:

       if(window.DEWI_SWARM_RADIAL) DEWI_SWARM_RADIAL.event(r.agent_id, r.status);

   Werkt verder zelfstandig:
   - ankerpunten komen uit #nodes (.node.agent / .node.hub / .node.core);
     posities worden periodiek opnieuw gemeten, dus uitklappende clusters,
     declutter en resize lopen vanzelf mee
   - kleuren worden overgenomen uit de node zelf (statusdot / afdelingsnaam),
     zodat de crew altijd de actuele status draagt
   - de avatars lopen ACHTER de node-chips langs (z-index 1), zodat labels
     leesbaar blijven
   - respecteert prefers-reduced-motion en pauzeert bij een verborgen tab

   Publieke API:
       DEWI_SWARM_RADIAL.on() / .off() / .toggle()
       DEWI_SWARM_RADIAL.rescan()
       DEWI_SWARM_RADIAL.event(agentId, kind)   // kind: ok|error|running|stale
   ========================================================================== */
(function () {
  "use strict";

  var CFG = {
    ambientMin:   5,
    ambientMax:  20,
    perAgents:    3,
    ambientSpeed:[0.16, 0.36],
    eventSpeed:   0.90,
    pauseMs:     [200, 1600],
    trailMax:    140,
    size:         15,
    eventSize:    22,
    bow:          0.22,
    remeasureMs:  700       // korter dan de org-variant: nodes schuiven hier echt
  };

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var STATUS_COLOR = { ok:"#3ee08f", running:"#00d4ff", error:"#E31E24", stale:"#ffb547", idle:"#5e7c8e" };
  var STATUS_GLYPH = { ok:"\u2713", running:"\u27F3", error:"\u2715", stale:"!", idle:"\u00b7" };

  var rnd  = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };

  var stage = null, nodesEl = null, layer = null, btn = null;
  var running = false, rafId = null, lastT = 0, measureAcc = 0;
  var anchors = [], agentsA = [], hubsA = [], core = null;
  var byId = {};
  var walkers = [], trail = [];

  /* ------------------------------------------------------------------ stijl */
  function injectStyle() {
    if (document.getElementById("dewi-swarm-radial-style")) return;
    var s = document.createElement("style");
    s.id = "dewi-swarm-radial-style";
    s.textContent = [
      "#dewiSwarmR{position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden}",
      "#dewiSwarmR .sw{position:absolute;left:0;top:0;will-change:transform;border-radius:50%;",
      "  display:grid;place-items:center;font:800 8px/1 system-ui;color:#06131a;",
      "  box-shadow:0 2px 6px rgba(0,0,0,.5)}",
      "#dewiSwarmR .sw::after{content:'';position:absolute;left:22%;top:16%;width:26%;height:26%;",
      "  border-radius:50%;background:rgba(255,255,255,.55)}",
      "#dewiSwarmR .sw.ev{font-size:11px;font-weight:900;z-index:2}",
      "#dewiSwarmR .tr{position:absolute;left:0;top:0;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;",
      "  border-radius:50%;opacity:.5;animation:dswr-fade .55s linear forwards}",
      "@keyframes dswr-fade{to{opacity:0;transform:scale(.35)}}",
      "#dewiSwarmR .ring{position:absolute;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;",
      "  border-radius:50%;border:2px solid currentColor;animation:dswr-ring .6s ease-out forwards}",
      "@keyframes dswr-ring{to{transform:scale(3);opacity:0}}",
      "#dewiSwarmR .tag{position:absolute;left:0;top:0;transform:translate(10px,-16px);white-space:nowrap;",
      "  font:700 9px/1 system-ui;letter-spacing:.4px;padding:3px 6px;border-radius:6px;z-index:3;",
      "  background:rgba(8,13,20,.9);border:1px solid rgba(255,255,255,.14);",
      "  animation:dswr-tag 1.5s ease-out forwards}",
      "@keyframes dswr-tag{0%{opacity:0;transform:translate(10px,-10px)}",
      "  18%{opacity:1;transform:translate(10px,-16px)}100%{opacity:0;transform:translate(10px,-26px)}}",
      /* eigen knopstijl, zodat de module niet afhangt van de paginastijl */
      "#swarmBtnR{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:7px;",
      "  font:700 11px system-ui;letter-spacing:.1em;padding:7px 12px;border-radius:11px;",
      "  border:1px solid rgba(0,212,255,.16);background:rgba(0,0,0,.32);color:#5e7c8e;",
      "  transition:color .15s,background .15s,box-shadow .15s}",
      "#swarmBtnR:hover{color:#cfe2ec}",
      "#swarmBtnR.active{background:linear-gradient(180deg,rgba(0,212,255,.22),rgba(0,212,255,.07));",
      "  color:#00d4ff;box-shadow:inset 0 0 0 1px rgba(0,212,255,.45)}",
      "#swarmBtnR .ic{font-size:12px;letter-spacing:0}"
    ].join("");
    (document.head || document.documentElement).appendChild(s);
  }

  /* ------------------------------------------------------------- ankerpunten */
  function centerIn(el) {
    var r = el.getBoundingClientRect(), h = stage.getBoundingClientRect();
    return { x: r.left - h.left + r.width / 2, y: r.top - h.top + r.height / 2 };
  }

  function cssColor(el, prop) {
    if (!el) return null;
    var v = getComputedStyle(el)[prop];
    return (v && v !== "rgba(0, 0, 0, 0)") ? v : null;
  }

  function initials(name) {
    var p = String(name || "").replace(/\(.*?\)/g, "").trim().split(/\s+/);
    return (((p[0] && p[0][0]) || "?") + ((p[1] && p[1][0]) || (p[0] && p[0][1]) || "")).toUpperCase();
  }

  function rescan() {
    if (!nodesEl) return;
    anchors = []; agentsA = []; hubsA = []; core = null; byId = {};

    Array.prototype.forEach.call(nodesEl.querySelectorAll(".node"), function (el) {
      var id = el.id || "";
      var a = { el: el, key: id };

      if (el.classList.contains("core")) {
        a.type = "core"; a.color = "#00d4ff"; a.label = "SHOP CORE"; a.glyph = "\u25C6";
        core = a;
      } else if (el.classList.contains("hub")) {
        var nm = el.querySelector(".nm");
        a.type = "hub";
        a.color = cssColor(nm, "color") || "#00d4ff";
        a.label = nm ? nm.textContent.trim() : "AFDELING";
        a.glyph = (el.querySelector(".box") || {}).textContent || "";
        hubsA.push(a);
      } else if (el.classList.contains("agent")) {
        var spans = el.querySelectorAll("span");
        var txt = "";
        for (var i = 0; i < spans.length; i++) {
          var c = spans[i].className || "";
          if (c.indexOf("sd") === -1 && c.indexOf("cnt") === -1 && c.indexOf("caret") === -1) {
            txt = spans[i].textContent.trim(); break;
          }
        }
        a.type = "agent";
        a.color = cssColor(el.querySelector(".sd"), "backgroundColor") || "#5e7c8e";
        a.label = txt || id.replace(/^n-/, "");
        a.glyph = initials(txt).slice(0, 2);
        // id van de agent zelf, zodat .event() hem terugvindt
        if (id.indexOf("n-") === 0 && id.indexOf("n-cl-") !== 0) byId[id.slice(2)] = a;
        agentsA.push(a);
      } else return;

      anchors.push(a);
    });

    measure();
    balanceAmbient();
  }

  function measure() {
    anchors.forEach(function (a) {
      if (!a.el || !a.el.isConnected) { a.x = a.y = null; return; }
      var c = centerIn(a.el);
      a.x = c.x; a.y = c.y;
      // kleur meelopen met de status: de dot verandert live
      if (a.type === "agent") {
        var c2 = cssColor(a.el.querySelector(".sd"), "backgroundColor");
        if (c2) a.color = c2;
      }
    });
    for (var i = walkers.length - 1; i >= 0; i--) {
      var w = walkers[i];
      if (!w.a || !w.b || w.a.x == null || w.b.x == null) { remove(w); walkers.splice(i, 1); }
    }
  }

  /* -------------------------------------------------------------------- pad */
  function control(a, b, bias) {
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    var bow = Math.min(110, len * CFG.bow) * (bias == null ? (Math.random() < 0.5 ? 1 : -1) : bias);
    return { x: mx + (-dy / len) * bow, y: my + (dx / len) * bow };
  }
  function bez(a, c, b, t) {
    var u = 1 - t;
    return { x: u*u*a.x + 2*u*t*c.x + t*t*b.x, y: u*u*a.y + 2*u*t*c.y + t*t*b.y };
  }

  /* ---------------------------------------------------------------- avatars */
  function makeEl(cls, size, color, text) {
    var d = document.createElement("div");
    d.className = "sw" + (cls ? " " + cls : "");
    d.style.width = d.style.height = size + "px";
    d.style.marginLeft = d.style.marginTop = (-size / 2) + "px";
    d.style.background = "radial-gradient(120% 120% at 30% 25%, " +
      "color-mix(in srgb," + color + " 92%, #fff), color-mix(in srgb," + color + " 62%, #0b0f17) 74%)";
    if (text) d.textContent = text;
    layer.appendChild(d);
    return d;
  }

  function randomAnchor(exclude) {
    var pool = anchors.filter(function (a) { return a.x != null && a !== exclude; });
    return pool.length ? pick(pool) : null;
  }

  function spawnAmbient() {
    var a = randomAnchor(null); if (!a) return;
    var b = randomAnchor(a);    if (!b) return;
    walkers.push({
      kind: "ambient", a: a, b: b, t: 0, wait: 0,
      speed: rnd(CFG.ambientSpeed[0], CFG.ambientSpeed[1]),
      c: control(a, b), color: a.color,
      el: makeEl("", CFG.size, a.color, a.glyph)
    });
  }

  function balanceAmbient() {
    var want = Math.max(CFG.ambientMin,
      Math.min(CFG.ambientMax, Math.round(agentsA.length / CFG.perAgents)));
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

  function nearestHub(a) {
    var best = null, bd = Infinity;
    hubsA.forEach(function (h) {
      if (h.x == null) return;
      var d = Math.hypot(h.x - a.x, h.y - a.y);
      if (d < bd) { bd = d; best = h; }
    });
    return best;
  }

  /* ---- event-avatar: agent -> dichtstbijzijnde hub -> core --------------- */
  function fireEvent(agentId, kind) {
    if (!running) return;
    var a = byId[agentId];
    // agent zit in een ingeklapt cluster: dan is er geen eigen node
    if (!a || a.x == null) return;

    var hub = nearestHub(a);
    var dst = hub || core;
    if (!dst) return;

    var color = STATUS_COLOR[kind] || STATUS_COLOR.idle;
    var w = {
      kind: "event", a: a, b: dst, t: 0, wait: 0,
      speed: CFG.eventSpeed * (kind === "error" ? 1.35 : 1),
      c: control(a, dst, 1), color: color,
      relay: (dst !== core && core) ? core : null,
      el: makeEl("ev", CFG.eventSize, color, STATUS_GLYPH[kind] || "\u00b7")
    };
    w.el.style.boxShadow = "0 0 14px " + color + ", 0 2px 6px rgba(0,0,0,.5)";
    walkers.push(w);

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
    r.className = "ring"; r.style.color = color;
    r.style.left = x + "px"; r.style.top = y + "px";
    layer.appendChild(r);
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 640);
  }

  function puff(x, y, color) {
    if (trail.length > CFG.trailMax) return;
    var d = document.createElement("div");
    d.className = "tr"; d.style.background = color;
    d.style.left = x + "px"; d.style.top = y + "px";
    layer.appendChild(d); trail.push(d);
    setTimeout(function () {
      if (d.parentNode) d.parentNode.removeChild(d);
      var i = trail.indexOf(d); if (i >= 0) trail.splice(i, 1);
    }, 560);
  }

  /* ------------------------------------------------------------------- loop */
  function visible() { return stage && stage.offsetParent !== null && !document.hidden; }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    var dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (!visible()) return;

    measureAcc += dt * 1000;
    if (measureAcc > CFG.remeasureMs) { measureAcc = 0; measure(); }

    for (var i = walkers.length - 1; i >= 0; i--) {
      var w = walkers[i];
      if (w.wait > 0) { w.wait -= dt * 1000; continue; }
      if (w.a.x == null || w.b.x == null) { remove(w); walkers.splice(i, 1); continue; }

      w.t += dt * w.speed;

      if (w.t >= 1) {
        ping(w.b.x, w.b.y, w.color);
        if (w.kind === "event") {
          if (w.relay) {
            w.a = w.b; w.b = w.relay; w.relay = null;
            w.c = control(w.a, w.b, -1); w.t = 0; w.speed *= 0.8;
            continue;
          }
          remove(w); walkers.splice(i, 1); continue;
        }
        w.a = w.b;
        w.b = randomAnchor(w.a) || w.a;
        w.c = control(w.a, w.b);
        w.t = 0;
        w.wait = rnd(CFG.pauseMs[0], CFG.pauseMs[1]);
        w.speed = rnd(CFG.ambientSpeed[0], CFG.ambientSpeed[1]);
        w.color = w.a.color;
        if (w.el) w.el.style.background = "radial-gradient(120% 120% at 30% 25%, " +
          "color-mix(in srgb," + w.color + " 92%, #fff), color-mix(in srgb," + w.color + " 62%, #0b0f17) 74%)";
        continue;
      }

      var p = bez(w.a, w.c, w.b, w.t);
      var bob = w.kind === "ambient" ? Math.sin(w.t * Math.PI * 8) * 2.2 : 0;
      w.el.style.transform = "translate3d(" + p.x.toFixed(1) + "px," + (p.y + bob).toFixed(1) + "px,0)";
      if (w.kind === "event" || Math.random() < 0.14) puff(p.x, p.y, w.color);
    }
  }

  /* --------------------------------------------------------------- aan / uit */
  function start() {
    if (running) return;
    running = true;
    layer.style.display = "";
    rescan();
    lastT = performance.now();
    rafId = requestAnimationFrame(tick);
    if (btn) btn.classList.add("active");
    try { localStorage.setItem("dewi.swarm.radial", "1"); } catch (e) {}
  }
  function stop() {
    if (!running) return;
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    walkers.forEach(remove); walkers = []; trail = [];
    layer.innerHTML = "";
    layer.style.display = "none";
    if (btn) btn.classList.remove("active");
    try { localStorage.setItem("dewi.swarm.radial", "0"); } catch (e) {}
  }
  function toggle() { running ? stop() : start(); }

  /* -------------------------------------------------------------------- boot */
  function mountButton() {
    var header = document.querySelector("header"); if (!header) return;
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "swarmBtnR";
    btn.title = "Bewegende avatars tussen de nodes aan/uit";
    btn.innerHTML = '<span class="ic">\uD83D\uDC63</span>CREW';
    btn.addEventListener("click", toggle);
    var sp = header.querySelector(".spacer");
    if (sp) header.insertBefore(btn, sp); else header.appendChild(btn);
  }

  function boot() {
    stage   = document.getElementById("stage");
    nodesEl = document.getElementById("nodes");
    if (!stage || !nodesEl) return;
    injectStyle();
    if (getComputedStyle(stage).position === "static") stage.style.position = "relative";

    layer = document.createElement("div");
    layer.id = "dewiSwarmR";
    layer.style.display = "none";
    stage.insertBefore(layer, nodesEl);   // achter de node-chips, voor het raster

    mountButton();

    // het knooppuntenveld wordt volledig herbouwd bij uitklappen/registry-load
    new MutationObserver(function () { if (running) rescan(); })
      .observe(nodesEl, { childList: true });

    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", function () { lastT = performance.now(); });

    var saved = null;
    try { saved = localStorage.getItem("dewi.swarm.radial"); } catch (e) {}
    var wantOn = saved === null ? !REDUCED : saved === "1";

    var tries = 0;
    (function waitForNodes() {
      if (nodesEl.querySelector(".node.agent")) { if (wantOn) start(); else rescan(); return; }
      if (tries++ < 120) setTimeout(waitForNodes, 250);
    })();
  }

  window.DEWI_SWARM_RADIAL = {
    on: start, off: stop, toggle: toggle,
    rescan: function () { if (nodesEl) rescan(); },
    event: fireEvent,
    config: CFG,
    get running() { return running; }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
