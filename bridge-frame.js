/* ============================================================================
   THE BRIDGE — bridge-frame.js
   Zet bovenin elk paneel twee links:

     ⤢  VOLLEDIG SCHERM  — springt uit de cockpit-iframe naar een eigen tab.
                            Staat de pagina al standalone, dan schakelt hij
                            echte browser-fullscreen aan/uit (Fullscreen API).
     ↩  COCKPIT          — terug naar de cockpit-view (breekt ook uit de iframe).

   Gebruik: één regel in de <head> van elke pagina, ná bridge-config.js:
       <script src="bridge-frame.js"></script>

   De links worden ingehaakt in de bestaande header als die er is
   (agents.html / competition.html: <header><nav>, organisation.html: .depbtn-rij),
   anders als zwevende balk rechtsboven (credentials.html).

   Config (optioneel, in bridge-config.js):
       window.BRIDGE_CONFIG.COCKPIT_URL = "/";   // default "/"
   ============================================================================ */
(function () {
  "use strict";

  var CFG      = window.BRIDGE_CONFIG || {};
  var COCKPIT  = CFG.COCKPIT_URL || "/";
  var inFrame  = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  var LBL_FULL = inFrame ? "Volledig scherm" : "Volledig scherm";
  var TIP_FULL = inFrame ? "Open dit paneel buiten de cockpit, in een eigen tab"
                         : "Browser-fullscreen aan/uit";

  /* ---------- acties ---------- */
  function goFullscreen(ev) {
    ev.preventDefault();
    if (inFrame) {
      window.open(location.href, "_blank", "noopener");
      return;
    }
    var el = document.documentElement;
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (fs) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch (e) { /* stil falen: sommige browsers blokkeren dit in een iframe */ }
  }

  function goCockpit(ev) {
    ev.preventDefault();
    try {
      if (inFrame) window.top.location.href = COCKPIT;
      else location.href = COCKPIT;
    } catch (e) { location.href = COCKPIT; }
  }

  /* ---------- zwevende variant (pagina's zonder header) ---------- */
  function floatCSS() {
    if (document.getElementById("bridge-frame-css")) return;
    var s = document.createElement("style");
    s.id = "bridge-frame-css";
    s.textContent = [
      "body.bridge-frame-float{padding-top:46px}",
      "#bridge-frame{position:fixed;top:9px;right:14px;z-index:2147483000;display:flex;gap:6px;",
      "  font:500 11px/1 'Segoe UI',system-ui,-apple-system,sans-serif;letter-spacing:.10em;text-transform:uppercase}",
      "#bridge-frame a{display:flex;align-items:center;gap:6px;text-decoration:none;cursor:pointer;",
      "  padding:8px 13px;border-radius:999px;color:#7d8da8;background:rgba(11,15,20,.85);",
      "  border:1px solid rgba(30,41,55,.95);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:.15s}",
      "#bridge-frame a:hover{color:#e6edf3;border-color:#5eb0ff;text-decoration:none}",
      "#bridge-frame a:focus-visible{outline:2px solid #5eb0ff;outline-offset:2px}",
      "#bridge-frame .ic{font-size:13px;line-height:1;letter-spacing:0}",
      "#bridge-frame.hidden{display:none}",
      "@media(max-width:760px){#bridge-frame .tx{display:none}#bridge-frame a{padding:8px 10px}}",
      "@media print{#bridge-frame{display:none}}"
    ].join("");
    (document.head || document.documentElement).appendChild(s);
  }

  function mk(tag, html, title, handler, cls) {
    var a = document.createElement(tag);
    if (cls) a.className = cls;
    if (tag === "a") { a.href = handler === goCockpit ? COCKPIT : location.href; }
    a.title = title;
    a.innerHTML = html;
    a.addEventListener("click", handler);
    return a;
  }

  var HTML_FULL = "<span class='ic'>\u2922</span><span class='tx'>" + LBL_FULL + "</span>";
  var HTML_BACK = "<span class='ic'>\u21a9</span><span class='tx'>Cockpit</span>";

  /* ---------- plaatsing ---------- */
  function build() {
    if (document.getElementById("bridge-frame") || document.querySelector("[data-bridge-frame]")) return;

    var nav = document.querySelector("header nav");
    var org = document.getElementById("logoutBtn");

    if (nav) {
      // agents.html / competition.html — als extra nav-links
      var a1 = mk("a", HTML_FULL, TIP_FULL, goFullscreen);
      var a2 = mk("a", HTML_BACK, "Terug naar de cockpit-view", goCockpit);
      a1.setAttribute("data-bridge-frame", "1");
      a2.setAttribute("data-bridge-frame", "1");
      nav.appendChild(a1);
      nav.appendChild(a2);
      return;
    }

    if (org) {
      // organisation.html — naast de EXIT-knop, zelfde .depbtn-stijl
      var b1 = mk("button", "<span class='ic'>\u2922</span>FULLSCREEN", TIP_FULL, goFullscreen, "depbtn");
      var b2 = mk("button", "<span class='ic'>\u21a9</span>COCKPIT", "Terug naar de cockpit-view", goCockpit, "depbtn");
      b1.setAttribute("data-bridge-frame", "1");
      b2.setAttribute("data-bridge-frame", "1");
      org.parentNode.insertBefore(b1, org);
      org.parentNode.insertBefore(b2, org);
      return;
    }

    // credentials.html — zwevende balk rechtsboven
    floatCSS();
    document.body.classList.add("bridge-frame-float");
    var bar = document.createElement("div");
    bar.id = "bridge-frame";
    bar.appendChild(mk("a", HTML_FULL, TIP_FULL, goFullscreen));
    bar.appendChild(mk("a", HTML_BACK, "Terug naar de cockpit-view", goCockpit));
    document.body.appendChild(bar);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
