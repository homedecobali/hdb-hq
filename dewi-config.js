// DEWI - gedeelde configuratie voor alle DEWI-panelen (Home Deco Bali).
// De SUPABASE_ANON_KEY staat ook in organisation.html (DEWI zelf) - houd
// beide exact gelijk. Dit is de publishable/anon key, geen geheim.
window.DEWI_CONFIG = {
  SUPABASE_URL: "https://jucubuoftjehwancegma.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Y3VidW9mdGplaHdhbmNlZ21hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2OTYwMDIsImV4cCI6MjA5ODI3MjAwMn0.gKYBE76kVv5XdMb-GuFAELdSp5R7OjCIiUzw7hW2Jus",

  // n8n-webhook die executies + pipeline-stappen teruggeeft (workflow "DEWI · Agent Run API").
  // Vervangt het /api/agent-run proxy, zodat het dashboard statisch kan blijven.
  AGENT_RUN_API: "https://homedecobali.app.n8n.cloud/webhook/dewi/agent-run",

  // Uniforme venstertoggles (dewi-frame.js):
  //   COCKPIT_URL = waar de "COCKPIT"-knop heen springt
  //   FRAME_POS   = "bottom-right" (default) of "top-right"
  COCKPIT_URL: "kpi.html",
  FRAME_POS: "bottom-right"
};
// compat: code die nog BRIDGE_CONFIG leest blijft werken
window.BRIDGE_CONFIG = window.DEWI_CONFIG;
