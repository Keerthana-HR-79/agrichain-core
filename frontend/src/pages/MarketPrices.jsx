import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import "./market-prices.css";

const CROP_ICONS = {
  Rice: "🌾", Wheat: "🌿", Maize: "🌽", Groundnut: "🥜",
  Soyabean: "🫘", Cotton: "☁️", Sugarcane: "🎋", Tomato: "🍅",
  Onion: "🧅", Potato: "🥔", Turmeric: "🟡", Chilli: "🌶️",
  Sunflower: "🌻", Banana: "🍌", Barley: "🌾",
};

// `cls` is the plain-CSS modifier class (was a Tailwind colour string).
const SOURCE_BADGE = {
  data_gov:        { label: "Live • data.gov.in",  cls: "mkt-badge--data_gov" },
  data_gov_cached: { label: "Last verified",       cls: "mkt-badge--data_gov_cached" },
  simulated:       { label: "Simulated ±5%",       cls: "mkt-badge--simulated" },
  admin:           { label: "Admin Updated",       cls: "mkt-badge--admin" },
  default:         { label: "Base Rate",           cls: "mkt-badge--default" },
  cached:          { label: "Cached",              cls: "mkt-badge--cached" },
};

const TREND_CONFIG = {
  rising:  { icon: "📈", cls: "mkt-trend--rising",  label: "Rising" },
  falling: { icon: "📉", cls: "mkt-trend--falling", label: "Falling" },
  stable:  { icon: "➡️", cls: "mkt-trend--stable",  label: "Stable" },
};

export default function MarketPricesPage() {
  const [prices,   setPrices]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [histLoading, setHistLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [search,   setSearch]   = useState("");

  useEffect(() => {
    fetchPrices();
    // Refresh prices every 5 minutes
    const iv = setInterval(fetchPrices, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (selected) fetchHistory(selected.crop_name);
  }, [selected]);

  const fetchPrices = async () => {
    try {
      const res = await api.get("/market-prices");
      setPrices(res.data.prices || []);
      setLastUpdated(new Date());
      if (!selected && res.data.prices?.length > 0) {
        setSelected(res.data.prices[0]);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchHistory = async (cropName) => {
    setHistLoading(true);
    try {
      const res = await api.get(`/market-prices/history/${cropName}`);
      const raw = res.data.history || [];
      // Format for chart
      setHistory(raw.reverse().map((r) => ({
        date:  new Date(r.recorded_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        price: parseFloat(r.price_per_quintal),
        source: r.source,
      })));
    } catch (e) { console.error(e); }
    finally { setHistLoading(false); }
  };

  const filtered = prices.filter((p) =>
    !search || p.crop_name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedHistory = history;

  // Honest dataset-level source summary — the per-row badges already tell the
  // truth; this stops the page header claiming "data.gov.in" for seed/simulated data.
  const liveCount = prices.filter(
    (p) => p.source === "data_gov" || p.source === "data_gov_cached"
  ).length;
  const allSeedPrices = prices.length > 0 && prices.every((p) => p.source === "default");

  return (
    <div className="mkt">
      <Navbar />
      <div className="mkt__inner">

        {/* Header */}
        <div className="mkt__head">
          <div>
            <h1 className="mkt__title">
              Market Prices 📊
            </h1>
            {allSeedPrices ? (
              <p className="mkt__subtitle">
                Reference seed rates — not yet synced with live mandi data. Run the daily
                sync to pull live{" "}
                <a href="https://data.gov.in" target="_blank" rel="noopener" className="mkt__link">
                  data.gov.in
                </a>
                {" "}(Govt. of India) prices.
              </p>
            ) : liveCount > 0 ? (
              <p className="mkt__subtitle">
                National APMC mandi rates — {liveCount} of {prices.length} sourced live from{" "}
                <a href="https://data.gov.in" target="_blank" rel="noopener" className="mkt__link">
                  data.gov.in
                </a>
                {" "}(Govt. of India), refreshed daily at 6 AM IST. Per-crop source is labelled below.
              </p>
            ) : (
              <p className="mkt__subtitle">
                Simulated market rates (±5%) — the live{" "}
                <a href="https://data.gov.in" target="_blank" rel="noopener" className="mkt__link">
                  data.gov.in
                </a>
                {" "}feed was unavailable at last sync. Per-crop source is labelled below.
              </p>
            )}
          </div>
          {lastUpdated && (
            <p className="mkt__fetched">
              Last fetched: {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>

        <div className="mkt__grid">

          {/* Left: crop list */}
          <div className="mkt__left">
            <div className="mkt-card">
              <div className="mkt-search">
                <input type="text" placeholder="Search crop..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="mkt-search__input"/>
              </div>

              {loading ? (
                <div className="mkt-loading">
                  <div className="mkt-spinner"/>
                </div>
              ) : (
                <div className="mkt-list">
                  {filtered.map((p) => {
                    const src = SOURCE_BADGE[p.source] || SOURCE_BADGE.default;
                    const isSelected = selected?.crop_name === p.crop_name;
                    return (
                      <button key={p.crop_name} onClick={() => setSelected(p)}
                        className={`mkt-crop ${isSelected ? "mkt-crop--selected" : ""}`}>
                        <div className="mkt-crop__row">
                          <div className="mkt-crop__left">
                            <span className="mkt-crop__icon">{CROP_ICONS[p.crop_name] || "🌿"}</span>
                            <div>
                              <p className="mkt-crop__name">{p.crop_name}</p>
                              <span className={`mkt-badge ${src.cls}`}>
                                {src.label}
                              </span>
                            </div>
                          </div>
                          <div className="mkt-crop__right">
                            <p className="mkt-crop__price">
                              ₹{parseFloat(p.price_per_quintal).toLocaleString("en-IN")}
                            </p>
                            <p className="mkt-crop__unit">per quintal</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: detail + chart */}
          <div className="mkt__right">
            {selected ? (
              <>
                {/* Price card */}
                <div className="mkt-panel">
                  <div className="mkt-price__head">
                    <div className="mkt-price__id">
                      <span className="mkt-price__icon">{CROP_ICONS[selected.crop_name] || "🌿"}</span>
                      <div>
                        <h2 className="mkt-price__name">{selected.crop_name}</h2>
                        <p className="mkt-price__market">{selected.market_name || "National Mandi Avg"}</p>
                      </div>
                    </div>
                    <div className="mkt-price__right">
                      <p className="mkt-price__value">
                        ₹{parseFloat(selected.price_per_quintal).toLocaleString("en-IN")}
                      </p>
                      <p className="mkt-price__unit">per quintal</p>
                    </div>
                  </div>

                  {/* Info grid */}
                  <div className="mkt-info">
                    {[
                      { label: "Per kg",     value: `₹${(parseFloat(selected.price_per_quintal)/100).toFixed(1)}` },
                      { label: "Per tonne",  value: `₹${(parseFloat(selected.price_per_quintal)*10).toLocaleString("en-IN")}` },
                      { label: "Source",     value: SOURCE_BADGE[selected.source]?.label || "—" },
                      { label: "Date",       value: selected.recorded_date ? new Date(selected.recorded_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Today" },
                    ].map((r) => (
                      <div key={r.label} className="mkt-info__tile">
                        <p className="mkt-info__label">{r.label}</p>
                        <p className="mkt-info__value">{r.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Source note */}
                  {selected.source === "simulated" && (
                    <div className="mkt-note mkt-note--warn">
                      <p className="mkt-note__text--warn">
                        ⚡ Live data.gov.in price unavailable — showing a simulated rate
                        based on the national base price with ±5% daily variation.
                        Actual settlement uses the latest available rate at harvest time.
                      </p>
                    </div>
                  )}
                  {(selected.source === "data_gov" || selected.source === "data_gov_cached") && (
                    <div className="mkt-note mkt-note--ok">
                      <p className="mkt-note__text--ok">
                        {selected.source === "data_gov_cached" ? "🕓 Last verified price from " : "✅ Live price sourced from "}
                        <a href="https://data.gov.in" target="_blank" rel="noopener"
                          className="mkt-note__link">data.gov.in</a>
                        {" "}— the Govt. of India open-data Mandi feed (Agmarknet). Updated daily at 6 AM IST.
                      </p>
                    </div>
                  )}
                </div>

                {/* Price history chart */}
                <div className="mkt-panel">
                  <div className="mkt-chart__head">
                    <h3 className="mkt-chart__title">30-Day Price History</h3>
                    {history.length > 0 && (() => {
                      const prices = history.map((h) => h.price);
                      const change = prices.length >= 2
                        ? ((prices[prices.length-1] - prices[0]) / prices[0] * 100).toFixed(1)
                        : 0;
                      const trend = change > 3 ? "rising" : change < -3 ? "falling" : "stable";
                      const tc = TREND_CONFIG[trend];
                      return (
                        <div className={`mkt-trend ${tc.cls}`}>
                          <span>{tc.icon}</span>
                          <span>{tc.label} ({change > 0 ? "+" : ""}{change}%)</span>
                        </div>
                      );
                    })()}
                  </div>

                  {histLoading ? (
                    <div className="mkt-chart__loading">
                      <div className="mkt-spinner"/>
                    </div>
                  ) : history.length === 0 ? (
                    <div className="mkt-chart__empty">
                      <div className="mkt-chart__empty-box">
                        <p className="mkt-chart__empty-icon">📊</p>
                        <p className="mkt-chart__empty-text">No history yet — data builds up daily</p>
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false}/>
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => `₹${v.toLocaleString("en-IN")}`}
                          width={80}/>
                        <Tooltip
                          formatter={(v) => [`₹${v.toLocaleString("en-IN")}`, "Price/quintal"]}
                          labelStyle={{ fontWeight: "bold" }}/>
                        <Line
                          type="monotone"
                          dataKey="price"
                          stroke="#16a34a"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: "#16a34a" }}
                          activeDot={{ r: 5 }}/>
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* How settlement works */}
                <div className="mkt-settle">
                  <h3 className="mkt-settle__title">⚖️ How Market Settlement Works</h3>
                  <p className="mkt-settle__text">
                    At harvest, the buyer enters the current APMC market price.
                    AgriChain automatically pays the farmer whichever is higher:
                    the <strong>contracted price</strong> or the <strong>live market price</strong>.
                    This protects farmers from price drops while letting them benefit from price rises.
                    The 10% escrow buffer covers any market price increase above the contracted amount.
                  </p>
                </div>
              </>
            ) : (
              <div className="mkt-empty">
                <p className="mkt-empty__icon">📊</p>
                <p className="mkt-empty__text">Select a crop to see details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
