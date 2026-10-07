/* =====================================================================
   DEWI · dewi-nav.js — MENU-LADE (☰) + COMMANDOPALET (Ctrl/⌘-K)
   =====================================================================
   Eén bron voor de navigatie op alle dash-pagina's. Wordt geladen door
   dewi-frame.js (dat elke cockpit-pagina al laadt); kpi.html laadt hem
   daarnaast synchroon in <head> zodat de cockpit zich direct als host kan
   aanmelden. Niet per pagina kopiëren — nieuwe pagina = één regel in NAV.

   28-09: geen vaste zijbalk meer. Op elk scherm (desktop én mobiel) is het
   menu een lade achter de ☰-knop linksonder; hij neemt geen ruimte in en
   sluit na een keuze, met Esc of een klik ernaast. Elk item doet hetzelfde:
   het opent dat scherm (pagina = navigeren; zone = op kpi.html uitklappen en
   ernaartoe scrollen). Er gaan vanuit het menu geen zijpanelen meer open.

   Groepen: HANDEL · MARKETING · STUDIO'S · SYSTEEM · SETUP.
   Item-soorten:
     url   — gewone pagina (elders: navigeren)
     pane  — (historisch veld) wordt genegeerd; het item navigeert naar url
     zone  — zone in kpi.html → op de cockpit: uitklappen + scrollen;
             elders: kpi.html#z-<zone>

   Host-API (alleen kpi.html):
     DEWI_NAV.attach({ onItem(it)→bool })   — alleen nog voor zone-items (uitklappen + scrollen)
     DEWI_NAV.refresh()        — huidige-pagina-markering bijwerken
     DEWI_NAV.toggle()         — lade open/dicht
     DEWI_NAV.openPalette()

   Niet getoond: binnen een iframe (sidepane) — daar stuurt Ctrl-K door naar
   de cockpit — en voor accounts met app_metadata.dewi_role = 'team'.
   Agentnamen in het palet: view bridge_agent_index (anon-select), lazy.
   ===================================================================== */
(function (global) {
  "use strict";
  if (global.DEWI_NAV) return;

  var doc = document;
  var KEY_ANON_FALLBACK =             // publishable anon-key; gelijk houden met dewi-config.js
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Y3VidW9mdGplaHdhbmNlZ21hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2OTYwMDIsImV4cCI6MjA5ODI3MjAwMn0.gKYBE76kVv5XdMb-GuFAELdSp5R7OjCIiUzw7hW2Jus";
  var URL_FALLBACK = "https://jucubuoftjehwancegma.supabase.co";

  /* ---------------------------------------------------------------- menu */
  var NAV = [
    { id: "handel", label: "Handel", items: [
      { id: "cockpit", label: "KPI-cockpit", url: "kpi.html", ic: "\u25C9", c: "#00d4ff", kw: "kpi dashboard home start overzicht" },
      { id: "z-shop",  label: "Shopify",     zone: "shop", ic: "S", c: "#2fd47e", kw: "omzet winst orders onverzonden verkoop marge webshop winkel" },
      { id: "team",    label: "Team-dashboard", url: "team.html", ic: "T", c: "#2fd47e", kw: "team collega marco ingrid lisette" }
    ]},
    { id: "marketing", label: "Marketing", items: [
      { id: "z-meta",   label: "Meta Ads",      zone: "meta",   ic: "M", c: "#ff3f9a", kw: "facebook instagram ads spend mer budget advertenties" },
      { id: "z-google", label: "Google Ads",    zone: "google", ic: "G", c: "#4285f4", kw: "pmax roas cpc conversies" },
      { id: "z-stats",  label: "Stats & Social", zone: "stats", ic: "\u25CF", c: "#00c8ff", kw: "ga4 sessies conversie funnel brevo mail utm kanalen instagram volgers pinterest" },
      { id: "comp",     label: "Concurrentie",  pane: "comp", url: "competition.html", ic: "\u2694", c: "#00d4ff", kw: "competition competitor intel" }
    ]},
    { id: "studios", label: "Studio's", items: [
      { id: "st-social",    label: "Social-studio",    pane: "social",    url: "social-studio.html",    ic: "\u2726", c: "#ff9f40", kw: "social goedkeuring posts reels nieuwsbrief mail studio" },
      { id: "st-meta",      label: "Meta-studio",      pane: "meta",      url: "meta-studio.html",      ic: "M", c: "#ff3f9a", kw: "creatives ads studio" },
      { id: "st-google",    label: "Google-studio",    pane: "google",    url: "google-studio.html",    ic: "G", c: "#4285f4", kw: "pmax studio" },
      { id: "st-pinterest", label: "Pinterest-studio", pane: "pinterest", url: "pinterest-studio.html", ic: "P", c: "#e60023", kw: "pins shop the look trends studio" }
    ]},
    { id: "systeem", label: "Systeem", items: [
      { id: "org",           label: "Organisatie",  pane: "org",           url: "organisation.html",  ic: "\u2261", c: "#a37bff", kw: "organigram agents afdelingen alarm" },
      { id: "agents",        label: "Agents",       pane: "agents",        url: "agents.html",        ic: "\u2699", c: "#a37bff", kw: "pipeline runs" },
      { id: "constellation", label: "Constellation", pane: "constellation", url: "constellation.html", ic: "\u2735", c: "#a37bff", kw: "swarm" },
      { id: "creds",         label: "Credentials",  pane: "creds",         url: "credentials.html",   ic: "\u26BF", c: "#a37bff", kw: "keys connectors tokens" },
      { id: "z-dewi",        label: "DEWI-zone",    zone: "dewi",          ic: "D", c: "#a37bff", kw: "to-do todo memos stille agents systeem voorstellen" }
    ]},
    { id: "setup", label: "Setup", items: [
      { id: "usage", label: "Verbruik tools", url: "usage.html", ic: "%", c: "#3ecf8e", kw: "verbruik kosten plafond limiet quota abonnement n8n executies anthropic api cloudinary credits brevo apify pdfshift" }
    ]}
  ];
  /* extra palet-doelen (geen menu-item): kaarten binnen de cockpit */
  var CARDS = [
    { label: "Onverzonden bestellingen", zone: "shop",  anchor: "ro-table",   kw: "open orders verzenden backorder 2602" },
    { label: "Omzet & winst 7 dagen",    zone: "shop",  anchor: "sale-table", kw: "marge kostprijs brutowinst btw" },
    { label: "Actieve advertenties",     zone: "meta",  anchor: "live-table", kw: "ads campagnes weekbudget" },
    { label: "Website (GA4)",            zone: "stats", anchor: "web-chart",  kw: "sessies gebruikers weergaven" },
    { label: "Mail (Brevo)",             zone: "stats", anchor: "mail-chart", kw: "nieuwsbrief bounces" },
    { label: "Mailings per type",        zone: "stats", anchor: "mailbd-body", kw: "brevo campagnes aanbieding verhaal" },
    { label: "Funnel & rendement",       zone: "stats", anchor: "fun-steps",  kw: "mer cac conversie winkelwagen checkout" },
    { label: "Omzet per kanaal",         zone: "stats", anchor: "chan-body",  kw: "attributie following" },
    { label: "Kanalen (UTM)",            zone: "stats", anchor: "utm-body",   kw: "utm clicks bio" },
    { label: "Pinterest (outreach)",     zone: "stats", anchor: "pin-body",   kw: "pins" },
    { label: "Systeem — stilte-detectie", zone: "dewi", anchor: "system",     kw: "stil agents mislukt" },
    { label: "To-do's (DEWI)",           zone: "dewi",  anchor: "memos",      kw: "memo taken" }
  ];

  /* ------------------------------------------------------------- context */
  function base(u) { return String(u || "").split("?")[0].split("#")[0].split("/").pop().toLowerCase() || "index.html"; }
  var PAGE = base(location.pathname);
  var inFrame = (function () { try { return global.self !== global.top; } catch (e) { return true; } })();
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
  var KBD = isMac ? "\u2318K" : "Ctrl K";

  function isTeam() {
    try {
      var raw = localStorage.getItem("sb-jucubuoftjehwancegma-auth-token"); if (!raw) return false;
      var tok = JSON.parse(raw).access_token; if (!tok) return false;
      var p = tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); while (p.length % 4) p += "=";
      var cl = JSON.parse(atob(p));
      return !!(cl && cl.app_metadata && cl.app_metadata.dewi_role === "team");
    } catch (e) { return false; }
  }
  function escH(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var host = null;
  var API = {
    NAV: NAV,
    attach: function (h) { host = h || null; refresh(); },
    refresh: function () { refresh(); },
    openPalette: function () { openPalette(); },
    toggle: function () { toggleDrawer(); },
    go: function (it) { activate(it); }
  };
  global.DEWI_NAV = API;

  /* In een sidepane: geen zijbalk; Ctrl-K opent het palet van de cockpit. */
  if (inFrame) {
    doc.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
        try { if (global.parent && global.parent.DEWI_NAV) { e.preventDefault(); global.parent.DEWI_NAV.openPalette(); } } catch (x) {}
      }
    });
    return;
  }
  if (isTeam()) return;

  /* ---------------------------------------------------------------- stijl */
  function css() {
    if (doc.getElementById("dewi-nav-css")) return;
    var s = doc.createElement("style"); s.id = "dewi-nav-css";
    s.textContent = [
      ":root{--dn-w:236px;--dn-bg:#04070d;--dn-panel:#0d1420;--dn-line:#1c2940;--dn-cyan:#00d4ff;--dn-muted:#7d8ca3;--dn-text:#dfe8f5;--dn-yellow:#ffd400;--dn-green:#4fd1a1}",
      "#dewi-nav{position:fixed;top:0;left:0;bottom:0;width:var(--dn-w);z-index:60;display:flex;flex-direction:column;",
      "  background:linear-gradient(180deg,#0a111c,var(--dn-bg));border-right:1px solid var(--dn-line);",
      "  font:13px/1.35 'Segoe UI',system-ui,-apple-system,sans-serif;color:var(--dn-text);overflow:hidden;",
      "  transform:translateX(-102%);transition:transform .2s ease;box-shadow:14px 0 34px rgba(0,0,0,.6);visibility:hidden}",
      "html.dn-open #dewi-nav{transform:none;visibility:visible}",
      "#dn-scrim{position:fixed;inset:0;z-index:59;background:rgba(2,4,8,.45);opacity:0;pointer-events:none;transition:opacity .2s}",
      "html.dn-open #dn-scrim{opacity:1;pointer-events:auto}",
      "#dewi-nav *{box-sizing:border-box}",
      "#dewi-nav .dn-brand{display:flex;align-items:center;gap:9px;padding:13px 16px 10px;white-space:nowrap;text-decoration:none}",
      "#dewi-nav .dn-live{width:9px;height:9px;border-radius:50%;background:var(--dn-green);box-shadow:0 0 8px var(--dn-green);flex:none;animation:dnpulse 1.6s ease-in-out infinite}",
      "@keyframes dnpulse{0%,100%{opacity:1}50%{opacity:.25}}",
      "#dewi-nav .dn-name{font-weight:900;letter-spacing:.28em;color:var(--dn-cyan);font-size:14px}",
      "#dewi-nav .dn-by{color:var(--dn-yellow);font-size:10px;letter-spacing:.08em;font-weight:800}",
      "#dewi-nav .dn-search{margin:0 10px 8px;display:flex;align-items:center;gap:8px;cursor:pointer;appearance:none;",
      "  border:1px solid var(--dn-line);background:rgba(0,0,0,.32);color:var(--dn-muted);font:600 11px system-ui;letter-spacing:.3px;",
      "  padding:7px 10px;border-radius:11px;text-align:left;white-space:nowrap}",
      "#dewi-nav .dn-search:hover{border-color:var(--dn-cyan);color:var(--dn-text);box-shadow:0 0 0 1px rgba(0,212,255,.3)}",
      "#dewi-nav .dn-search .tx{flex:1}",
      "#dewi-nav kbd{font:700 9.5px ui-monospace,Consolas,monospace;color:var(--dn-muted);border:1px solid var(--dn-line);border-radius:5px;padding:1px 5px;background:rgba(255,255,255,.03)}",
      "#dewi-nav .dn-groups{flex:1;overflow-y:auto;overflow-x:hidden;padding:0 0 10px;scrollbar-width:none}",
      "#dewi-nav .dn-groups::-webkit-scrollbar{display:none}",
      "#dewi-nav .dn-gl{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dn-muted);padding:9px 16px 3px;white-space:nowrap}",
      "#dewi-nav .dn-it{display:flex;align-items:center;gap:10px;margin:1px 8px;padding:4px 8px;border-radius:8px;cursor:pointer;",
      "  color:var(--dn-text);text-decoration:none;white-space:nowrap;border:1px solid transparent;position:relative}",
      "#dewi-nav .dn-it:hover,#dewi-nav .dn-it:focus-visible{background:rgba(255,255,255,.04);border-color:var(--dn-line);outline:none}",
      "#dewi-nav .dn-ic{width:22px;height:22px;border-radius:6px;flex:none;display:flex;align-items:center;justify-content:center;",
      "  font-size:11px;font-weight:900;color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);border:1px solid color-mix(in srgb,var(--c) 45%,transparent)}",
      "#dewi-nav .dn-lb{flex:1;overflow:hidden;text-overflow:ellipsis}",
      "#dewi-nav .dn-kind{font-size:9px;letter-spacing:.08em;color:var(--dn-muted);opacity:.8}",
      /* huidige pagina: gekleurde streep + tekst in merkkleur */
      "#dewi-nav .dn-it.cur{color:var(--c);background:color-mix(in srgb,var(--c) 9%,transparent)}",
      "#dewi-nav .dn-it.cur::before{content:'';position:absolute;left:-8px;top:6px;bottom:6px;width:3px;border-radius:0 3px 3px 0;background:var(--c)}",
      /* paneel open op de cockpit: inverse (vulkleur = merkkleur, tekst donker) — zelfde regel als de oude .pagebtn.on */
      "#dewi-nav .dn-it.on{background:var(--c);color:#04070d;font-weight:700;border-color:var(--c)}",
      "#dewi-nav .dn-it.on .dn-ic{color:#04070d;background:rgba(0,0,0,.14);border-color:rgba(0,0,0,.25)}",
      "#dewi-nav .dn-it.on.light{color:#fff}",
      "#dewi-nav .dn-it.on .dn-kind{color:inherit}",
      "#dn-burger{display:flex;position:fixed;left:12px;bottom:14px;z-index:61;width:42px;height:42px;border-radius:50%;align-items:center;justify-content:center;",
      "  background:rgba(7,11,18,.92);border:1px solid rgba(0,212,255,.45);color:var(--dn-cyan);font:700 18px system-ui;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.5)}",
      "#dn-burger:hover,#dn-burger:focus-visible{border-color:var(--dn-cyan);box-shadow:0 0 0 2px rgba(0,212,255,.25);outline:none}",
      "html.dn-open #dn-burger{opacity:0;pointer-events:none}",
      "@media (prefers-reduced-motion:reduce){#dewi-nav,#dn-scrim{transition:none}#dewi-nav .dn-live{animation:none}}",
      "@media print{#dewi-nav,#dn-burger,#dn-scrim{display:none}}",
      /* ---- commandopalet (stijl = zoekveld organisation.html) ---- */
      "#dn-pal{position:fixed;inset:0;z-index:2147483100;display:none;align-items:flex-start;justify-content:center;padding-top:12vh;",
      "  background:rgba(2,4,8,.66);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);font:13px/1.35 'Segoe UI',system-ui,sans-serif;color:#dfe8f5}",
      "#dn-pal.open{display:flex}",
      "#dn-pal .pb{width:min(620px,92vw);background:#0d1420;border:1px solid #1c2940;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.7),0 0 0 1px rgba(0,212,255,.08);overflow:hidden}",
      "#dn-pal input{display:block;width:calc(100% - 24px);margin:12px;appearance:none;border:1px solid #1c2940;background:rgba(0,0,0,.32);color:#dfe8f5;",
      "  font:600 13px system-ui;letter-spacing:.3px;padding:10px 12px;border-radius:11px;outline:none}",
      "#dn-pal input:focus{border-color:#00d4ff;box-shadow:0 0 0 1px rgba(0,212,255,.3)}",
      "#dn-pal input::placeholder{color:#5e7c8e}",
      "#dn-pal .pl{max-height:min(420px,56vh);overflow-y:auto;padding:0 6px 8px}",
      "#dn-pal .ph{font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:#7d8ca3;padding:9px 10px 4px}",
      "#dn-pal .pr{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:9px;cursor:pointer;border:1px solid transparent}",
      "#dn-pal .pr.sel{background:rgba(0,212,255,.08);border-color:rgba(0,212,255,.35)}",
      "#dn-pal .pr .dn-ic{width:22px;height:22px;border-radius:6px;flex:none;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;",
      "  color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);border:1px solid color-mix(in srgb,var(--c) 45%,transparent)}",
      "#dn-pal .pr .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}",
      "#dn-pal .pr .s{color:#7d8ca3;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46%}",
      "#dn-pal .pr .st{width:7px;height:7px;border-radius:50%;flex:none}",
      "#dn-pal .pe{color:#7d8ca3;font-size:12px;padding:14px 12px}",
      "#dn-pal .pf{display:flex;gap:14px;border-top:1px solid #1c2940;padding:7px 12px;color:#5e7c8e;font-size:10.5px}",
      "#dn-pal .pf kbd{font:700 9.5px ui-monospace,Consolas,monospace;border:1px solid #1c2940;border-radius:4px;padding:0 4px;margin-right:4px;color:#7d8ca3}"
    ].join("\n");
    (doc.head || doc.documentElement).appendChild(s);
  }

  /* --------------------------------------------------------------- acties */
  function allItems() { var out = []; NAV.forEach(function (g) { g.items.forEach(function (it) { it.group = g.label; out.push(it); }); }); return out; }
  function hrefOf(it) {
    if (it.zone) return "kpi.html#z-" + it.zone + (it.anchor ? "~" + it.anchor : "");
    return it.url || "#";
  }
  function activate(it) {
    closeDrawer();
    if (it && it.zone && host && host.onItem) { try { if (host.onItem(it) === true) { closeDrawer(); refresh(); return; } } catch (e) { console.warn("dewi-nav host:", e); } }
    location.href = hrefOf(it);
  }
  function openAgent(a) {
    closeDrawer();
    location.href = "organisation.html?agent=" + encodeURIComponent(a.agent_id);
  }
  function closeDrawer() { doc.documentElement.classList.remove("dn-open"); }
  function toggleDrawer() {
    var open = doc.documentElement.classList.toggle("dn-open");
    if (open && navEl) { var f = navEl.querySelector(".dn-it.cur") || navEl.querySelector(".dn-it"); if (f) setTimeout(function () { f.focus(); }, 60); }
  }

  /* --------------------------------------------------------------- opbouw */
  var navEl = null;
  function build() {
    if (doc.getElementById("dewi-nav")) return;
    css();
    var root = doc.documentElement;
    root.classList.add("dn-on");

    navEl = doc.createElement("aside");
    navEl.id = "dewi-nav"; navEl.setAttribute("aria-label", "DEWI-navigatie");
    var h = '<a class="dn-brand" href="kpi.html" title="KPI-cockpit"><span class="dn-live"></span><span class="dn-name">DEWI</span><span class="dn-by">by Rick</span></a>'
      + '<button type="button" class="dn-search" title="Zoeken (' + KBD + ')"><span>\u2315</span><span class="tx">Zoeken</span><kbd>' + KBD + '</kbd></button>'
      + '<nav class="dn-groups">';
    NAV.forEach(function (g) {
      h += '<div class="dn-grp"><div class="dn-gl">' + escH(g.label) + '</div>';
      g.items.forEach(function (it) {
        var light = /^#(4285f4|e60023)$/i.test(it.c) ? " light" : "";
        h += '<a class="dn-it' + light + '" data-id="' + it.id + '" href="' + escH(hrefOf(it)) + '" style="--c:' + it.c + '" title="' + escH(it.label) + '">'
          + '<span class="dn-ic">' + it.ic + '</span><span class="dn-lb">' + escH(it.label) + '</span>'
          + '</a>';
      });
      h += '</div>';
    });
    h += '</nav>';
    navEl.innerHTML = h;
    doc.body.appendChild(navEl);

    var scrim = doc.createElement("div"); scrim.id = "dn-scrim";
    scrim.addEventListener("click", closeDrawer);
    doc.body.appendChild(scrim);
    var burger = doc.createElement("button");
    burger.id = "dn-burger"; burger.type = "button"; burger.setAttribute("aria-label", "Menu openen"); burger.title = "Menu"; burger.textContent = "\u2630";
    burger.addEventListener("click", function (e) { e.stopPropagation(); toggleDrawer(); });
    doc.body.appendChild(burger);
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && root.classList.contains("dn-open")) closeDrawer(); });

    var byId = {}; allItems().forEach(function (it) { byId[it.id] = it; });
    navEl.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest(".dn-it");
      if (a) {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;   // nieuw tabblad mag
        e.preventDefault(); activate(byId[a.getAttribute("data-id")]); return;
      }
      if (e.target.closest(".dn-search")) { closeDrawer(); openPalette(); return; }
    });
    refresh();
  }

  function refresh() {
    if (!navEl) return;
    Array.prototype.forEach.call(navEl.querySelectorAll(".dn-it"), function (a) {
      var it = null; allItems().some(function (x) { if (x.id === a.getAttribute("data-id")) { it = x; return true; } return false; });
      if (!it) return;
      var cur = !it.zone && it.url && base(it.url) === PAGE;
      a.classList.toggle("cur", !!cur);
      a.classList.remove("on");
    });
  }

  /* ------------------------------------------------------------ commandopalet */
  var pal = null, palInput = null, palList = null, palSel = 0, palRows = [];
  var agents = null, agentsLoading = false;

  function loadAgents() {
    if (agents || agentsLoading) return;
    agentsLoading = true;
    var cfg = global.DEWI_CONFIG || global.BRIDGE_CONFIG || {};
    var url = (cfg.SUPABASE_URL || URL_FALLBACK) + "/rest/v1/bridge_agent_index?select=agent_id,agent_name,bridge_dept,schedule_human,last_status,paused&order=agent_name";
    var key = cfg.SUPABASE_ANON_KEY || KEY_ANON_FALLBACK;
    fetch(url, { headers: { apikey: key, Authorization: "Bearer " + key } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (rows) { agents = Array.isArray(rows) ? rows : []; })
      .catch(function (e) { agents = []; agents.error = e; console.warn("dewi-nav agents:", e); })
      .then(function () { agentsLoading = false; if (pal && pal.classList.contains("open")) renderPal(); });
  }

  function buildPal() {
    if (pal) return;
    css();
    pal = doc.createElement("div"); pal.id = "dn-pal";
    pal.innerHTML = '<div class="pb" role="dialog" aria-label="Commandopalet">'
      + '<input type="search" placeholder="zoek pagina \u00b7 zone \u00b7 agent" autocomplete="off" spellcheck="false">'
      + '<div class="pl"></div>'
      + '<div class="pf"><span><kbd>\u2191\u2193</kbd>kiezen</span><span><kbd>\u21B5</kbd>openen</span><span><kbd>Esc</kbd>sluiten</span></div></div>';
    doc.body.appendChild(pal);
    palInput = pal.querySelector("input"); palList = pal.querySelector(".pl");
    palInput.addEventListener("input", function () { palSel = 0; renderPal(); });
    palInput.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); choose(palRows[palSel]); }
      else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
    });
    pal.addEventListener("mousedown", function (e) { if (e.target === pal) closePalette(); });
    palList.addEventListener("click", function (e) {
      var r = e.target.closest(".pr"); if (!r) return;
      choose(palRows[Number(r.getAttribute("data-i"))]);
    });
    palList.addEventListener("mousemove", function (e) {
      var r = e.target.closest(".pr"); if (!r) return;
      var i = Number(r.getAttribute("data-i")); if (i !== palSel) { palSel = i; mark(); }
    });
  }
  function move(d) { if (!palRows.length) return; palSel = (palSel + d + palRows.length) % palRows.length; mark(true); }
  function mark(scroll) {
    Array.prototype.forEach.call(palList.querySelectorAll(".pr"), function (r) {
      var on = Number(r.getAttribute("data-i")) === palSel;
      r.classList.toggle("sel", on);
      if (on && scroll) r.scrollIntoView({ block: "nearest" });
    });
  }
  function score(q, text) {
    if (!q) return 1;
    var t = norm(text), words = q.split(/\s+/).filter(Boolean), s = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i], ix = t.indexOf(w);
      if (ix < 0) return 0;
      s += ix === 0 ? 30 : (/[\s\-·&(]/.test(t.charAt(ix - 1)) ? 18 : 6);
    }
    return s;
  }
  var ST_CLR = { error: "#ff5d5d", stale: "#e67e22", running: "#00d4ff", ok: "#4fd1a1", idle: "#7d8ca3" };
  function renderPal() {
    var q = norm(palInput.value.trim());
    var rows = [];
    allItems().forEach(function (it) {
      var sc = score(q, it.label + " " + it.group + " " + (it.kw || "") + (it.zone ? " zone" : " pagina"));
      if (sc) rows.push({ kind: "page", sec: it.zone ? "Zones" : "Pagina's", it: it, sc: sc + (norm(it.label).indexOf(q) === 0 ? 20 : 0) });
    });
    if (q) CARDS.forEach(function (cd) {
      var sc = score(q, cd.label + " " + (cd.kw || ""));
      if (sc) rows.push({ kind: "card", sec: "Zones", it: cd, sc: sc - 4 });
    });
    if (q) {
      if (agents) agents.forEach(function (a) {
        var sc = score(q, (a.agent_name || "") + " " + (a.bridge_dept || "") + " " + (a.agent_id || ""));
        if (sc) rows.push({ kind: "agent", sec: "Agents", a: a, sc: sc - 2 });
      });
    }
    var ORDER = { "Pagina's": 0, "Zones": 1, "Agents": 2 };
    rows.sort(function (x, y) { return (ORDER[x.sec] - ORDER[y.sec]) || (y.sc - x.sc); });
    var capA = 0; rows = rows.filter(function (r) { return r.kind !== "agent" || ++capA <= 12; });
    palRows = rows; if (palSel >= rows.length) palSel = 0;

    var h = "", sec = null;
    rows.forEach(function (r, i) {
      if (r.sec !== sec) { sec = r.sec; h += '<div class="ph">' + sec + '</div>'; }
      if (r.kind === "agent") {
        var a = r.a, stt = a.paused ? "idle" : (a.last_status || "idle");
        h += '<div class="pr" data-i="' + i + '" style="--c:#a37bff"><span class="dn-ic">A</span>'
          + '<span class="t">' + escH(a.agent_name) + '</span>'
          + '<span class="s">' + escH(String(a.bridge_dept || "").toUpperCase()) + (a.schedule_human ? " \u00b7 " + escH(a.schedule_human) : "") + (a.paused ? " \u00b7 pauze" : "") + '</span>'
          + '<span class="st" style="background:' + (ST_CLR[stt] || "#7d8ca3") + '" title="' + escH(stt) + '"></span></div>';
      } else if (r.kind === "card") {
        var z = zoneItem(r.it.zone);
        h += '<div class="pr" data-i="' + i + '" style="--c:' + (z ? z.c : "#00d4ff") + '"><span class="dn-ic">\u25A4</span>'
          + '<span class="t">' + escH(r.it.label) + '</span><span class="s">kaart \u00b7 ' + escH(z ? z.label : r.it.zone) + '</span></div>';
      } else {
        var it = r.it;
        h += '<div class="pr" data-i="' + i + '" style="--c:' + it.c + '"><span class="dn-ic">' + it.ic + '</span>'
          + '<span class="t">' + escH(it.label) + '</span><span class="s">' + escH(it.group) + (it.zone ? " \u00b7 zone" : (it.pane && host ? " \u00b7 zijpaneel" : "")) + '</span></div>';
      }
    });
    if (q && !agents) h += '<div class="pe">agents laden\u2026</div>';
    else if (q && agents && agents.error) h += '<div class="pe">agentnamen niet beschikbaar (' + escH(agents.error.message || agents.error) + ')</div>';
    if (!rows.length) h += '<div class="pe">Niets gevonden voor \u201C' + escH(palInput.value) + '\u201D.</div>';
    palList.innerHTML = h;
    mark();
  }
  function zoneItem(z) { var f = null; allItems().some(function (it) { if (it.zone === z) { f = it; return true; } return false; }); return f; }
  function choose(r) {
    if (!r) return;
    closePalette();
    if (r.kind === "agent") openAgent(r.a);
    else if (r.kind === "card") activate({ id: "card", zone: r.it.zone, anchor: r.it.anchor, label: r.it.label });
    else activate(r.it);
  }
  function openPalette() {
    buildPal(); loadAgents();
    pal.classList.add("open");
    palInput.value = ""; palSel = 0; renderPal();
    setTimeout(function () { palInput.focus(); }, 0);
  }
  function closePalette() { if (pal) pal.classList.remove("open"); }

  doc.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (pal && pal.classList.contains("open")) closePalette(); else openPalette();
    }
  });

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", build);
  else build();
})(window);
