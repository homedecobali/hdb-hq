/* =====================================================================
   DEWI · dewi-agents.js — ÉÉN BRON VAN WAARHEID voor agent-tellingen
   =====================================================================
   Alle DEWI-panelen (organisation.html, kpi.html, agents.html) halen hun
   agent-telling uit DIT bestand. Er staat nergens meer een hardcoded
   aantal of een eigen telformule in een pagina.

   Bron:      Supabase-view  'bridge_agent_index'
              (1 rij per agent: agent_id, agent_name, bridge_dept,
               schedule_human, paused, last_status, last_run, ...)
   Regels:    - paused                          -> gepauzeerd
              - last_status = 'error'           -> fout
              - last_status = 'stale'           -> verouderd (per-agent schema)
              - last_status = 'running'         -> ok (telt mee als draaiend)
              - last_status = 'idle' / geen run -> idle (nog niet gedraaid)
              - laatste run ouder dan 48u       -> verouderd (vangnet)
              - anders                          -> ok

   Wil je de regels aanpassen (bijv. andere stale-drempel)? Doe dat HIER,
   dan veranderen alle panelen tegelijk mee.
   ===================================================================== */
(function (global) {
  "use strict";

  var VIEW = "bridge_agent_index";   // de canonieke bron
  var STALE_HOURS = 48;              // vangnet-drempel, zelfde als voorheen in agents.html

  /* Eén classificatiefunctie voor ALLE panelen. */
  function classify(a, now) {
    now = now || Date.now();
    if (a.paused) return "paused";
    if (a.last_status === "error") return "error";
    if (a.last_status === "stale") return "stale";
    if (a.last_status === "running") return "running";
    if (a.last_status === "idle" || !a.last_run) return "idle";
    if (new Date(a.last_run).getTime() < now - STALE_HOURS * 3600 * 1000) return "stale";
    return "ok";
  }

  /* Telt een agentlijst volgens de classificatie hierboven. */
  function count(agents) {
    var c = { total: (agents || []).length, ok: 0, running: 0, idle: 0, error: 0, stale: 0, paused: 0 };
    var now = Date.now();
    (agents || []).forEach(function (a) { var s = classify(a, now); if (c[s] !== undefined) c[s]++; });
    return c;
  }

  /* Laadt de canonieke agentlijst + telling. `sb` = een Supabase-client. */
  function load(sb) {
    return sb.from(VIEW).select("*").order("bridge_dept").order("agent_name")
      .then(function (res) {
        if (res.error) throw res.error;
        var agents = res.data || [];
        return { agents: agents, counts: count(agents) };
      });
  }

  /* "73 totaal · 54 ok · 15 verouderd · 4 gepauzeerd" (0-categorieën verborgen,
     behalve totaal en ok). running telt mee bij ok. */
  function summaryText(c) {
    var p = [c.total + " totaal", (c.ok + c.running) + " ok"];
    if (c.stale) p.push(c.stale + " verouderd");
    if (c.error) p.push(c.error + " fout");
    if (c.idle) p.push(c.idle + " idle");
    if (c.paused) p.push(c.paused + " gepauzeerd");
    return p.join(" \u00b7 ");
  }

  /* Zelfde samenvatting, maar met gekleurde getallen voor in panelen. */
  var COL = { ok: "#3ee08f", stale: "#ffb547", error: "#ff5f6b", idle: "#7d8ca3", paused: "#7d8ca3" };
  function summaryHTML(c) {
    var seg = function (n, label, col) {
      return "<span style='white-space:nowrap'><b style='color:" + (col || "inherit") + "'>" + n + "</b> " + label + "</span>";
    };
    var p = [seg(c.total, "totaal"), seg(c.ok + c.running, "ok", COL.ok)];
    if (c.stale) p.push(seg(c.stale, "verouderd", COL.stale));
    if (c.error) p.push(seg(c.error, "fout", COL.error));
    if (c.idle) p.push(seg(c.idle, "idle", COL.idle));
    if (c.paused) p.push(seg(c.paused, "gepauzeerd", COL.paused));
    return p.join(" \u00b7 ");
  }

  global.DEWI_AGENTS = {
    VIEW: VIEW,
    STALE_HOURS: STALE_HOURS,
    classify: classify,
    count: count,
    load: load,
    summaryText: summaryText,
    summaryHTML: summaryHTML
  };
})(window);
