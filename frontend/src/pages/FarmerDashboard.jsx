import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api, getUser, logout } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { expectedYield, formatYield } from "@/lib/yield";
import "./dashboard.css";

export default function FarmerDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [listings, setListings] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "farmer") { navigate("/login"); return; }
    setUser(u);
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [listRes, contractRes] = await Promise.all([
        api.get("/listings/my-listings"),
        api.get("/contracts/farmer"),
      ]);
      setListings(listRes.data.listings || []);
      setContracts(contractRes.data.contracts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const totalYield = listings.reduce((s, l) => s + (expectedYield(l).tonnes || 0), 0);
  const verifiedFarms = listings.filter((l) => l.farm_verified).length;
  const pendingContracts = contracts.filter((c) => c.status === "pending").length;
  const activeContracts = contracts.filter((c) => c.status === "accepted").length;

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
        <div className="dash-header dash-header--stack">
          <div>
            <h1 className="dash-title">
              Good day, {user?.name?.split(" ")[0]} 👨‍🌾
            </h1>
            <p className="dash-subtitle">Here&apos;s your farm overview</p>
          </div>
          <Link to="/create-listing" className="dash-cta">
            <span>+</span> New Listing
          </Link>
        </div>

        {/* Stats */}
        <div className="dash-stats">
          {[
            { label: "Total Listings", value: listings.length, icon: "🌾", cls: "dash-stat--green" },
            { label: "Expected Yield", value: `${totalYield.toFixed(1)} T`, icon: "🌾", cls: "dash-stat--blue" },
            { label: "Verified Farms", value: verifiedFarms, icon: "✅", cls: "dash-stat--emerald" },
            { label: "Pending Contracts", value: pendingContracts, icon: "📋", cls: "dash-stat--yellow" },
          ].map((s) => (
            <div key={s.label} className={`dash-stat ${s.cls}`}>
              <div className="dash-stat__icon">{s.icon}</div>
              <div className="dash-stat__value">{s.value}</div>
              <div className="dash-stat__label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="dash-grid">
          {/* My Listings */}
          <div className="dash-panel">
            <div className="dash-panel__head dash-panel__head--row">
              <h2 className="dash-panel__title">My Listings</h2>
              <Link to="/my-listings" className="dash-link">View all →</Link>
            </div>
            <div className="dash-list">
              {listings.length === 0 ? (
                <div className="dash-empty">
                  <p className="dash-empty__icon">🌱</p>
                  <p className="dash-empty__text">No listings yet</p>
                  <Link to="/create-listing" className="dash-empty__link">
                    Create your first listing →
                  </Link>
                </div>
              ) : (
                listings.slice(0, 5).map((l) => (
                  <Link key={l.id} to={`/listing/${l.id}`} className="dash-row">
                    {l.image_url ? (
                      <img src={l.image_url} alt={l.crop_name} className="dash-row__thumb" />
                    ) : (
                      <div className="dash-row__thumb dash-row__thumb--ph">🌿</div>
                    )}
                    <div className="dash-row__body">
                      <p className="dash-row__name">{l.crop_name}</p>
                      <p className="dash-row__meta">{l.district}, {l.state}</p>
                    </div>
                    <div className="dash-row__right">
                      <p className="dash-row__yield">{formatYield(l, 1)}</p>
                      <p className="dash-row__sub">{l.land_size} acres</p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Contract Requests */}
          <div className="dash-panel">
            <div className="dash-panel__head dash-panel__head--row">
              <h2 className="dash-panel__title">Contract Requests</h2>
              <Link to="/farmer-contracts" className="dash-link">View all →</Link>
            </div>
            <div className="dash-list">
              {contracts.length === 0 ? (
                <div className="dash-empty">
                  <p className="dash-empty__icon">📋</p>
                  <p className="dash-empty__text">No contract requests yet</p>
                </div>
              ) : (
                contracts.slice(0, 5).map((c) => (
                  <div key={c.id} className="dash-item">
                    <div className="dash-item__top">
                      <p className="dash-item__name">{c.crop_name}</p>
                      <span className={`badge ${statusColor(c.status)}`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="dash-item__meta">{c.buyer_name} • {c.quantity} tons @ ₹{c.offered_price}/Q</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="dash-actions dash-actions--4">
          {[
            { href: "/create-listing", icon: "🌾", label: "New Listing" },
            { href: "/my-listings", icon: "📦", label: "My Listings" },
            { href: "/farmer-contracts", icon: "📋", label: "Contracts" },
            { href: "/marketplace", icon: "🏪", label: "Marketplace" },
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
