import { useState, useEffect, useMemo, useCallback } from "react";

// ------------------------------------------------------------------
// Openstaande Orders — KPI-venster (Home Deco Bali)
// Haalt live de openstaande (betaalde, onverzonden) orders op uit
// Shopify via de Anthropic API + Shopify MCP.
// ------------------------------------------------------------------

const SHOPIFY_MCP = { type: "url", url: "https://setup.shopify.com/mcp", name: "shopify" };
const ORDER_QUERY = "status:open AND fulfillment_status:unfulfilled";

// Kleuren & tokens
const T = {
  ink: "#1C2B24",
  inkSoft: "#5B6B62",
  bg: "#F7F7F3",
  card: "#FFFFFF",
  line: "#E3E4DC",
  green: "#2E6B4F",
  greenSoft: "#E7F0EB",
  amber: "#B97D10",
  amberSoft: "#F8EFDC",
  red: "#B3402A",
  redSoft: "#F7E6E1",
};

const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });

function daysOpen(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function agingColor(d) {
  if (d <= 2) return { bar: T.green, chipBg: T.greenSoft, chipFg: T.green };
  if (d <= 5) return { bar: T.amber, chipBg: T.amberSoft, chipFg: T.amber };
  return { bar: T.red, chipBg: T.redSoft, chipFg: T.red };
}

// Zoekt in ruwe tekst het JSON-object dat met {"orders" begint en
// parseert het via een accolade-teller (robuust tegen omringende tekst).
function extractOrdersJson(text) {
  if (!text) return null;
  const start = text.indexOf('{"orders"');
  if (start === -1) {
    try {
      const p = JSON.parse(text);
      if (p && Array.isArray(p.orders)) return p;
    } catch (e) {}
    return null;
  }
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch (e) {
          return null;
        }
      }
    }
  }
  return null;
}

async function fetchOpenOrders() {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content:
            `Roep de Shopify-tool "list-orders" aan met first: 50 en query: "${ORDER_QUERY}". ` +
            `Antwoord daarna uitsluitend met het woord OK, zonder de data te herhalen.`,
        },
      ],
      mcp_servers: [SHOPIFY_MCP],
    }),
  });

  if (!response.ok) {
    throw new Error(`Verbinding mislukt (HTTP ${response.status}). Probeer het opnieuw.`);
  }

  const data = await response.json();
  const blocks = Array.isArray(data.content) ? data.content : [];

  // 1) Voorkeur: de ruwe tooldata uit de MCP-toolresultaten
  for (const b of blocks) {
    if (b.type !== "mcp_tool_result") continue;
    const text = (b.content || []).map((c) => c.text || "").join("\n");
    const parsed = extractOrdersJson(text);
    if (parsed) return parsed;
  }
  // 2) Terugvaloptie: tekstblokken
  const txt = blocks.filter((b) => b.type === "text").map((b) => b.text || "").join("\n");
  const parsed = extractOrdersJson(txt);
  if (parsed) return parsed;

  throw new Error("Geen orderdata gevonden in het antwoord van Shopify. Ververs om het opnieuw te proberen.");
}

const statusLabel = {
  PAID: "Betaald",
  PENDING: "In afwachting",
  PARTIALLY_PAID: "Deels betaald",
  PARTIALLY_REFUNDED: "Deels terugbetaald",
  REFUNDED: "Terugbetaald",
  AUTHORIZED: "Geautoriseerd",
  UNFULFILLED: "Niet verzonden",
  PARTIALLY_FULFILLED: "Deels verzonden",
  FULFILLED: "Verzonden",
};

function Chip({ bg, fg, children }) {
  return (
    <span
      style={{
        background: bg,
        color: fg,
        borderRadius: 999,
        padding: "3px 10px",
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div
      style={{
        background: T.card,
        border: `1px solid ${T.line}`,
        borderRadius: 14,
        padding: "16px 18px",
        flex: "1 1 150px",
        minWidth: 150,
      }}
    >
      <div style={{ fontSize: 12, color: T.inkSoft, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: T.ink, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub ? <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
}

export default function OpenstaandeOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [search, setSearch] = useState("");
  const [oldestFirst, setOldestFirst] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOpenOrders();
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e.message || "Er ging iets mis bij het ophalen van de orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = orders;
    if (q) {
      list = list.filter(
        (o) =>
          (o.name || "").toLowerCase().includes(q) ||
          (o.customerName || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return oldestFirst ? ta - tb : tb - ta;
    });
  }, [orders, search, oldestFirst]);

  const stats = useMemo(() => {
    if (!orders.length) return { count: 0, total: 0, avg: 0, oldest: 0, urgent: 0 };
    const total = orders.reduce((s, o) => s + (parseFloat(o.totalPrice) || 0), 0);
    const ages = orders.map((o) => daysOpen(o.createdAt));
    return {
      count: orders.length,
      total,
      avg: total / orders.length,
      oldest: Math.max(...ages),
      urgent: ages.filter((d) => d > 5).length,
    };
  }, [orders]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        color: T.ink,
        fontFamily: "'Avenir Next', 'Segoe UI', system-ui, sans-serif",
        padding: "28px 24px 48px",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* Kop */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: T.green, fontWeight: 700 }}>
              KPI · Fulfilment
            </div>
            <h1 style={{ margin: "6px 0 0", fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>
              Openstaande orders
            </h1>
            <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 4 }}>
              Betaald, nog niet verzonden
              {updatedAt ? ` · bijgewerkt ${updatedAt.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: T.green,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Bezig met ophalen…" : "Vernieuwen"}
          </button>
        </div>

        {/* KPI-blokken */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
          <Kpi label="Openstaand" value={loading ? "–" : stats.count} sub="orders te verzenden" />
          <Kpi label="Totale waarde" value={loading ? "–" : eur.format(stats.total)} sub="nog te verzenden omzet" />
          <Kpi label="Gem. orderwaarde" value={loading ? "–" : eur.format(stats.avg || 0)} />
          <Kpi
            label="Oudste order"
            value={loading ? "–" : `${stats.oldest} dg`}
            sub={stats.urgent > 0 ? `${stats.urgent} order(s) > 5 dagen` : "alles binnen 5 dagen"}
          />
        </div>

        {/* Werkbalk */}
        <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op ordernummer of klant…"
            style={{
              flex: "1 1 240px",
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${T.line}`,
              background: T.card,
              fontSize: 14,
              color: T.ink,
              outline: "none",
            }}
          />
          <button
            onClick={() => setOldestFirst((v) => !v)}
            style={{
              background: T.card,
              border: `1px solid ${T.line}`,
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: T.ink,
              cursor: "pointer",
            }}
          >
            {oldestFirst ? "Oudste eerst ↑" : "Nieuwste eerst ↓"}
          </button>
        </div>

        {/* Fout */}
        {error ? (
          <div
            style={{
              marginTop: 18,
              background: T.redSoft,
              border: `1px solid ${T.red}33`,
              color: T.red,
              borderRadius: 12,
              padding: "14px 16px",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        ) : null}

        {/* Laadstatus */}
        {loading && !orders.length ? (
          <div style={{ marginTop: 26, color: T.inkSoft, fontSize: 14 }}>
            Orders worden opgehaald uit Shopify… dit duurt een paar seconden.
          </div>
        ) : null}

        {/* Orderlijst */}
        {!loading || orders.length ? (
          <div
            style={{
              marginTop: 18,
              background: T.card,
              border: `1px solid ${T.line}`,
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {/* Tabelkop */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "110px 1.4fr 90px 1fr 60px 110px 130px 130px",
                gap: 12,
                padding: "12px 18px",
                fontSize: 11,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: T.inkSoft,
                borderBottom: `1px solid ${T.line}`,
              }}
            >
              <div>Order</div>
              <div>Klant</div>
              <div>Datum</div>
              <div>Wachttijd</div>
              <div style={{ textAlign: "right" }}>Items</div>
              <div style={{ textAlign: "right" }}>Bedrag</div>
              <div>Betaling</div>
              <div>Verzending</div>
            </div>

            {visible.length === 0 && !loading ? (
              <div style={{ padding: "28px 18px", color: T.inkSoft, fontSize: 14 }}>
                {orders.length === 0
                  ? "Geen openstaande orders — alles is verzonden. 🎉"
                  : "Geen orders gevonden voor deze zoekopdracht."}
              </div>
            ) : null}

            {visible.map((o, i) => {
              const d = daysOpen(o.createdAt);
              const c = agingColor(d);
              const pct = Math.min(d / 14, 1) * 100;
              return (
                <div
                  key={o.id || i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "110px 1.4fr 90px 1fr 60px 110px 130px 130px",
                    gap: 12,
                    padding: "14px 18px",
                    alignItems: "center",
                    fontSize: 14,
                    borderBottom: i < visible.length - 1 ? `1px solid ${T.line}` : "none",
                  }}
                >
                  <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{o.name}</div>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.customerName || "—"}
                  </div>
                  <div style={{ color: T.inkSoft }}>{dateFmt.format(new Date(o.createdAt))}</div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: T.bg, borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(pct, 6)}%`, height: "100%", background: c.bar, borderRadius: 999 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: c.chipFg, whiteSpace: "nowrap" }}>
                        {d} dg
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{o.lineItemCount ?? "—"}</div>
                  <div style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {eur.format(parseFloat(o.totalPrice) || 0)}
                  </div>
                  <div>
                    <Chip bg={T.greenSoft} fg={T.green}>
                      {statusLabel[o.financialStatus] || o.financialStatus}
                    </Chip>
                  </div>
                  <div>
                    <Chip bg={c.chipBg} fg={c.chipFg}>
                      {statusLabel[o.fulfillmentStatus] || o.fulfillmentStatus}
                    </Chip>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div style={{ marginTop: 14, fontSize: 12, color: T.inkSoft }}>
          Wachttijd: <span style={{ color: T.green, fontWeight: 700 }}>groen</span> ≤ 2 dagen ·{" "}
          <span style={{ color: T.amber, fontWeight: 700 }}>oranje</span> 3–5 dagen ·{" "}
          <span style={{ color: T.red, fontWeight: 700 }}>rood</span> &gt; 5 dagen
        </div>
      </div>
    </div>
  );
}
