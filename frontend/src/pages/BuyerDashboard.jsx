import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import "./dashboard.css";

export default function BuyerDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [marketPrices, setMarketPrices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "buyer") { navigate("/login"); return; }
    setUser(u);
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [contractRes, priceRes] = await Promise.all([
        api.get("/contracts/buyer"),
        api.get("/market-prices"),
      ]);
      setContracts(contractRes.data.contracts || []);
      setMarketPrices(priceRes.data.prices || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const totalInvested = contracts
    .filter((c) => ["accepted", "completed"].includes(c.status))
    .reduce((s, c) => s + parseFloat(c.offered_price || 0) * parseFloat(c.quantity || 0) * 10, 0);

  const activeContracts = contracts.filter((c) => c.status === "accepted").length;
  const pendingContracts = contracts.filter((c) => c.status === "pending").length;
  const completedContracts = contracts.filter((c) => c.status === "completed").length;

  // Honest source summary — don't claim "live data.gov.in" for seed/simulated rows.
  const liveCount = marketPrices.filter(
    (p) => p.source === "data_gov" || p.source === "data_gov_cached"
  ).length;
  const allSeedPrices = marketPrices.length > 0 && marketPrices.every((p) => p.source === "default");
  const priceSubtitle = allSeedPrices
    ? "Reference rates — not yet synced with live mandi data"
    : liveCount > 0
    ? `${liveCount}/${marketPrices.length} live from data.gov.in • APMC mandi`
    : "Simulated rates — live data.gov.in feed unavailable";

  const statusColor = (s) => ({
    pending: "status-pending", accepted: "status-accepted",
    rejected: "status-rejected", completed: "status-completed",
  }[s] || "status-pending");

  if (loading) return (
    <div className="page-loader">
      <div className="page-loader__box">
        <div className="spinner" />
        <p className="page-loader__text">Loading dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="dash-page">
      <Navbar />
      <div className="dash-container">
        {/* Header */}
        <div className="dash-header">
          <div>
            <h1 className="dash-title">
              Hello, {user?.name?.split(" ")[0]} 🏢
            </h1>
            <p className="dash-subtitle">Your agricultural investment portfolio</p>
          </div>
          <Link to="/marketplace" className="dash-cta">
            Browse Crops →
          </Link>
        </div>

        {/* Stats */}
        <div className="dash-stats">
          {[
            { label: "Total Invested", value: `₹${(totalInvested / 100000).toFixed(1)}L`, icon: "💰", cls: "dash-stat--green" },
            { label: "Active Contracts", value: activeContracts, icon: "✅", cls: "dash-stat--blue" },
            { label: "Pending Approvals", value: pendingContracts, icon: "⏳", cls: "dash-stat--yellow" },
            { label: "Completed Deals", value: completedContracts, icon: "🏆", cls: "dash-stat--purple" },
          ].map((s) => (
            <div key={s.label} className={`dash-stat ${s.cls}`}>
              <div className="dash-stat__icon">{s.icon}</div>
              <div className="dash-stat__value">{s.value}</div>
              <div className="dash-stat__label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="dash-grid">
          {/* My Contracts */}
          <div className="dash-panel">
            <div className="dash-panel__head dash-panel__head--row">
              <h2 className="dash-panel__title">My Contracts</h2>
              <Link to="/buyer-contracts" className="dash-link">View all →</Link>
            </div>
            <div className="dash-list">
              {contracts.length === 0 ? (
                <div className="dash-empty">
                  <p className="dash-empty__icon">📋</p>
                  <p className="dash-empty__text">No contracts yet</p>
                  <Link to="/marketplace" className="dash-empty__link">
                    Browse crops to get started →
                  </Link>
                </div>
              ) : (
                contracts.slice(0, 5).map((c) => (
                  <Link key={c.id} to={`/listing/${c.listing_id}`} className="dash-row">
                    {c.image_url ? (
                      <img src={c.image_url} alt={c.crop_name} className="dash-row__thumb" />
                    ) : (
                      <div className="dash-row__thumb dash-row__thumb--ph">🌿</div>
                    )}
                    <div className="dash-row__body">
                      <p className="dash-row__name">{c.crop_name}</p>
                      <p className="dash-row__meta">Farmer: {c.farmer_name} • {c.quantity} tons</p>
                    </div>
                    <span className={`badge badge--shrink0 ${statusColor(c.status)}`}>
                      {c.status}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Market Prices */}
          <div className="dash-panel">
            <div className="dash-panel__head">
              <h2 className="dash-panel__title">Market Prices</h2>
              <p className="dash-panel__sub">{priceSubtitle}</p>
            </div>
            <div className="dash-list">
              {marketPrices.slice(0, 8).map((p) => (
                <div key={p.crop_name} className="dash-price">
                  <div>
                    <p className="dash-price__name">{p.crop_name}</p>
                    <p className="dash-price__market">{p.market_name}</p>
                  </div>
                  <div className="dash-price__right">
                    <p className="dash-price__val">₹{p.price_per_quintal}</p>
                    <p className="dash-price__unit">/quintal</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="dash-actions dash-actions--3">
          {[
            { href: "/marketplace", icon: "🏪", label: "Browse Marketplace" },
            { href: "/buyer-contracts", icon: "📋", label: "My Contracts" },
            { href: "/notifications", icon: "🔔", label: "Notifications" },
          ].map((a) => (
            <Link key={a.href} to={a.href} className="dash-action">
              <div className="dash-action__icon">{a.icon}</div>
              <div className="dash-action__label">{a.label}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
