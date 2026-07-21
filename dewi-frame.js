/* =====================================================================
   DEWI · dewi-frame.js — UNIFORME VENSTERTOGGLES
   =====================================================================
   Zet op elk DEWI-scherm dezelfde twee pillen rechtsonder:

     ⤢  VOLLEDIG SCHERM
         · in een cockpit-paneel (iframe) -> springt het paneel uit de
           cockpit en opent het als heel scherm (top-level navigatie)
         · staat de pagina al los -> echte browser-fullscreen aan/uit
     ↩  COCKPIT
         · terug naar de KPI-cockpit (kpi.html)
         · verborgen op de cockpit zelf en binnen een cockpit-paneel
           (daar ben je immers al in de cockpit)

   Gebruik: één regel in elke pagina, ná dewi-config.js:
       <script src="dewi-frame.js"></script>

   Config (optioneel, in dewi-config.js):
       COCKPIT_URL : "kpi.html"          // waar ↩ COCKPIT heen gaat
       FRAME_POS   : "bottom-right"      // of "top-right"

   Let op: de balk staat bewust RECHTSONDER. Rechtsboven botst hij met de
   metrics/klok van organisation.html en met de #top-balk van kpi.html.
   Eén regel FRAME_POS:"top-right" in dewi-config.js verplaatst hem overal
   tegelijk.
   ===================================================================== */
(function (global) {
  "use strict";

  var CFG      = global.DEWI_CONFIG || global.BRIDGE_CONFIG || {};
  var COCKPIT  = CFG.COCKPIT_URL || "kpi.html";
  var POS      = CFG.FRAME_POS   || "bottom-right";

  var inFrame = (function () {
    try { return global.self !== global.top; } catch (e) { return true; }
  })();

  function base(u) { return String(u).split("?")[0].split("#")[0].split("/").pop().toLowerCase(); }
  var isCockpit = base(location.pathname) === base(COCKPIT) ||
                  document.documentElement.hasAttribute("data-dewi-cockpit");

  var fsEl  = function () { return document.fullscreenElement || document.webkitFullscreenElement; };
  var IC_IN = "\u2922", IC_OUT = "\u2921", IC_BACK = "\u21a9";

  /* ------------------------------------------------------------------ stijl */
  function css() {
    if (document.getElementById("dewi-frame-css")) return;
    var vert = POS === "top-right" ? "top:10px" : "bottom:12px";
    var s = document.createElement("style");
    s.id = "dewi-frame-css";
    s.textContent = [
      "#dewi-frame{position:fixed;right:12px;" + vert + ";z-index:2147483000;",
      "  display:flex;gap:6px;opacity:.55;transition:opacity .15s;",
      "  font:600 10.5px/1 'Segoe UI',system-ui,-apple-system,sans-serif;",
      "  letter-spacing:.12em;text-transform:uppercase}",
      "#dewi-frame:hover{opacity:1}",
      "#dewi-frame button{display:flex;align-items:center;gap:7px;cursor:pointer;font:inherit;",
      "  padding:8px 13px;border-radius:999px;color:#7d8ca3;",
      "  background:rgba(7,11,18,.88);border:1px solid #1c2940;",
      "  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:.15s}",
      "#dewi-frame button:hover{color:#dfe8f5;border-color:#00d4ff;box-shadow:0 0 0 1px rgba(0,212,255,.22)}",
      "#dewi-frame button:focus-visible{outline:2px solid #00d4ff;outline-offset:2px}",
      "#dewi-frame .ic{font-size:13px;letter-spacing:0;line-height:1}",
      "#dewi-frame.dewi-hidden{display:none}",
      "@media(max-width:620px){#dewi-frame .tx{display:none}#dewi-frame button{padding:9px 11px}}",
      "@media print{#dewi-frame{display:none}}"
    ].join("");
    (document.head || document.documentElement).appendChild(s);
  }

  /* ------------------------------------------------------------------ acties */
  function toggleFullscreen() {
    if (inFrame) {
      // uit de cockpit springen: dit paneel als heel scherm openen
      try { global.top.location.href = location.href; }
      catch (e) { global.open(location.href, "_blank", "noopener"); }
      return;
    }
    var el = document.documentElement;
    try {
      if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else        (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch (e) { /* browser weigert: stil laten */ }
  }

  function toCockpit() {
    try {
      if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } catch (e) {}
    location.href = COCKPIT;
  }

  /* ------------------------------------------------------------------ opbouw */
  function build() {
    if (document.getElementById("dewi-frame")) return;
    css();

    var bar = document.createElement("div");
    bar.id = "dewi-frame";

    // knop 1 — fullscreen (staat op ELK scherm, ook op de cockpit zelf)
    var bFull = document.createElement("button");
    bFull.type = "button";
    bar.appendChild(bFull);

    // knop 2 — terug naar cockpit (niet op de cockpit, niet in een paneel)
    var bBack = null;
    if (!isCockpit && !inFrame) {
      bBack = document.createElement("button");
      bBack.type = "button";
      bBack.title = "Terug naar de KPI-cockpit";
      bBack.innerHTML = "<span class='ic'>" + IC_BACK + "</span><span class='tx'>Cockpit</span>";
      bBack.addEventListener("click", toCockpit);
      bar.appendChild(bBack);
    }

    function paint() {
      var out = !inFrame && fsEl();
      bFull.innerHTML = "<span class='ic'>" + (out ? IC_OUT : IC_IN) + "</span>" +
                        "<span class='tx'>" + (out ? "Verlaat fullscreen" : "Volledig scherm") + "</span>";
      bFull.title = inFrame ? "Dit paneel uit de cockpit halen en als heel scherm openen"
                            : (out ? "Fullscreen verlaten" : "Browser-fullscreen aan");
    }
    paint();
    bFull.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", paint);
    document.addEventListener("webkitfullscreenchange", paint);

    document.body.appendChild(bar);

    // Dubbele COCKPIT-knop in de header van organisation.html uitschakelen:
    // de uniforme balk neemt die rol over, en binnen een cockpit-paneel zou
    // hij anders een cockpit-in-een-cockpit laden.
    var old = document.getElementById("cockpitBtn");
    if (old) old.style.display = "none";

    // Balk verbergen zolang een loginscherm openstaat (#authGate / #login).
    var gates = ["authGate", "login"].map(function (id) { return document.getElementById(id); })
                                     .filter(Boolean);
    if (gates.length) {
      var sync = function () {
        var open = gates.some(function (g) {
          return g.offsetParent !== null && getComputedStyle(g).display !== "none";
        });
        bar.classList.toggle("dewi-hidden", open);
      };
      sync();
      gates.forEach(function (g) {
        new MutationObserver(sync).observe(g, { attributes: true, attributeFilter: ["class", "style"] });
      });
      setTimeout(sync, 1500);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();

  global.DEWI_FRAME = { cockpitUrl: COCKPIT, inFrame: inFrame, isCockpit: isCockpit };
})(window);
