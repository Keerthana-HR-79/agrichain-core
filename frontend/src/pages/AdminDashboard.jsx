import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import "./admin.css";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [listings, setListings] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [broadcast, setBroadcast] = useState({ title: "", message: "", target_role: "all" });
  const [broadcastStatus, setBroadcastStatus] = useState("");
  const [disputes, setDisputes] = useState([]);
  const [disputeFilter, setDisputeFilter] = useState("open");
  const [disputesLoading, setDisputesLoading] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [resolvingId, setResolvingId] = useState(null);
  const [resolution, setResolution] = useState("");
  const [marketRefreshing, setMarketRefreshing] = useState(false);
  const [marketMsg, setMarketMsg] = useState("");
  const [scrapeLog, setScrapeLog] = useState(null);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "admin") { navigate("/login"); return; }
    setUser(u);
    fetchAll();
    loadScrapeLog();
  }, []);

  const fetchAll = async () => {
    try {
      const [statsRes, usersRes, listingsRes, contractsRes, disputesRes] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/users"),
        api.get("/admin/listings"),
        api.get("/admin/contracts"),
        api.get("/contracts/disputes", { params: { status: "open" } }),
      ]);
      setStats(statsRes.data.stats);
      setUsers(usersRes.data.users);
      setListings(listingsRes.data.listings);
      setContracts(contractsRes.data.contracts);
      const open = disputesRes.data.disputes || [];
      setDisputes(open);
      setOpenCount(open.length);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadScrapeLog = async () => {
    try {
      const res = await api.get("/market-prices/scrape-log");
      setScrapeLog((res.data.logs || [])[0] || null);
    } catch (e) { /* non-fatal — log table may be empty on a fresh DB */ }
  };

  // Force a live re-fetch from data.gov.in. The endpoint returns immediately and
  // runs the ~15-crop scrape in the background (~30s), so we re-read the log after.
  const refreshMarketPrices = async () => {
    setMarketRefreshing(true);
    setMarketMsg("");
    try {
      const res = await api.post("/market-prices/scrape");
      setMarketMsg(res.data.message || "Refresh started in the background.");
      setTimeout(async () => {
        await loadScrapeLog();
        setMarketRefreshing(false);
        setMarketMsg("✅ Refresh complete — reload the Market Prices page to see updated rates.");
      }, 35000);
    } catch (err) {
      setMarketMsg(err.response?.data?.message || "Failed to start refresh.");
      setMarketRefreshing(false);
    }
  };

  const loadDisputes = async (status) => {
    setDisputesLoading(true);
    try {
      const res = await api.get("/contracts/disputes", { params: { status } });
      const rows = res.data.disputes || [];
      setDisputes(rows);
      if (status === "open") setOpenCount(rows.length);
    } catch (e) { console.error(e); }
    finally { setDisputesLoading(false); }
  };

  const changeDisputeFilter = (status) => {
    setDisputeFilter(status);
    setResolvingId(null);
    setResolution("");
    loadDisputes(status);
  };

  const resolveDispute = async (id, outcome) => {
    if (!resolution.trim()) return alert("Please add a resolution note");
    try {
      await api.put(`/contracts/${id}/dispute/resolve`, { resolution: resolution.trim(), outcome });
      setResolvingId(null);
      setResolution("");
      setOpenCount((n) => Math.max(0, n - 1));
      loadDisputes(disputeFilter);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to resolve dispute");
    }
  };

  const toggleUser = async (id) => {
    try {
      await api.put(`/admin/users/${id}/toggle`);
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, is_active: !u.is_active } : u));
    } catch (e) { alert("Failed"); }
  };

  const verifyFarm = async (id) => {
    try {
      await api.put(`/admin/listings/${id}/verify`);
      setListings((prev) => prev.map((l) => l.id === id ? { ...l, farm_verified: true } : l));
      alert("Farm verified successfully!");
    } catch (e) { alert("Failed"); }
  };

  const sendBroadcast = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post("/admin/notify", broadcast);
      setBroadcastStatus(res.data.message);
      setBroadcast({ title: "", message: "", target_role: "all" });
    } catch (e) { setBroadcastStatus("Failed to send"); }
  };

  const statusColor = (s) => ({
    pending: "status-pending", accepted: "status-accepted",
    rejected: "status-rejected", completed: "status-completed",
  }[s] || "status-pending");

  if (loading) return (
    <div className="page-loader"><div className="spinner" /></div>
  );

  return (
    <div className="admin-page">
      <Navbar />
      <div className="admin-container">
        <div className="admin-head">
          <h1 className="admin-head__title">Admin Panel ⚙️</h1>
          <p className="admin-head__subtitle">Manage the AgriChain platform</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="admin-stats">
            {[
              { label: "Total Users", value: stats.total_users, icon: "👥" },
              { label: "Farmers", value: stats.total_farmers, icon: "👨‍🌾" },
              { label: "Buyers", value: stats.total_buyers, icon: "🏢" },
              { label: "Total Listings", value: stats.total_listings, icon: "🌾" },
              { label: "Total Contracts", value: stats.total_contracts, icon: "📋" },
              { label: "Pending Contracts", value: stats.pending_contracts, icon: "⏳" },
              { label: "Verified Farms", value: stats.verified_farms, icon: "✅" },
            ].map((s) => (
              <div key={s.label} className="admin-stat">
                <div className="admin-stat__icon">{s.icon}</div>
                <div className="admin-stat__value">{s.value}</div>
                <div className="admin-stat__label">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="admin-tabs">
          {["overview", "users", "listings", "contracts", "disputes", "broadcast"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`admin-tab ${tab === t ? "admin-tab--active" : ""}`}>
              {t}
              {t === "disputes" && openCount > 0 && (
                <span className="admin-tab__badge">{openCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Overview Tab — market price control */}
        {tab === "overview" && (
          <div className="admin-card">
            <div className="admin-card__head">
              <h2 className="admin-card__title">Market Prices 🌾</h2>
            </div>
            <div className="admin-market">
              <p className="admin-market__desc">
                National APMC mandi rates refresh automatically every day at 6 AM IST from the
                Govt. of India data.gov.in feed. If prices look stale or have fallen back to a
                simulated rate, trigger a live re-fetch now.
              </p>
              {scrapeLog && (
                <p className="admin-market__log">
                  Last sync: <strong>{scrapeLog.crops_updated} live</strong>
                  {" • "}{scrapeLog.fallback_used} simulated
                  {scrapeLog.scraped_at && ` • ${new Date(scrapeLog.scraped_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                </p>
              )}
              <button onClick={refreshMarketPrices} disabled={marketRefreshing}
                className="admin-btn admin-btn--green admin-btn--lg">
                {marketRefreshing ? "Refreshing… (~30s)" : "🔄 Refresh live prices now"}
              </button>
              {marketMsg && <p className="admin-market__msg">{marketMsg}</p>}
            </div>
          </div>
        )}

        {/* Users Tab */}
        {tab === "users" && (
          <div className="admin-card">
            <div className="admin-card__head">
              <h2 className="admin-card__title">All Users ({users.length})</h2>
            </div>
            <div className="admin-tablewrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    {["Name", "Email", "Role", "State", "Status", "Joined", "Action"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="admin-td--strong">{u.name}</td>
                      <td className="admin-td--muted">{u.email}</td>
                      <td>
                        <span className={`badge ${
                          u.role === "farmer" ? "admin-pill--farmer" : u.role === "buyer" ? "admin-pill--buyer" : "admin-pill--admin"
                        }`}>{u.role}</span>
                      </td>
                      <td className="admin-td--muted">{u.state || "-"}</td>
                      <td>
                        <span className={`badge ${u.is_active ? "admin-pill--active" : "admin-pill--suspended"}`}>
                          {u.is_active ? "Active" : "Suspended"}
                        </span>
                      </td>
                      <td className="admin-td--date">{new Date(u.created_at).toLocaleDateString("en-IN")}</td>
                      <td>
                        <button onClick={() => toggleUser(u.id)}
                          className={`admin-btn-sm ${u.is_active ? "admin-btn-sm--danger" : "admin-btn-sm--ok"}`}>
                          {u.is_active ? "Suspend" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Listings Tab */}
        {tab === "listings" && (
          <div className="admin-card">
            <div className="admin-card__head">
              <h2 className="admin-card__title">All Listings ({listings.length})</h2>
            </div>
            <div className="admin-tablewrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    {["Crop", "Farmer", "Location", "Land", "Verified", "Action"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => (
                    <tr key={l.id}>
                      <td className="admin-td--strong">{l.crop_name}</td>
                      <td className="admin-td--muted">{l.farmer_name}</td>
                      <td className="admin-td--muted">{l.district}, {l.state}</td>
                      <td className="admin-td--muted">{l.land_size} ac</td>
                      <td>
                        {l.farm_verified ? (
                          <span className="admin-flag--ok">✅ Verified</span>
                        ) : (
                          <span className="admin-flag--no">❌ Pending</span>
                        )}
                      </td>
                      <td>
                        {!l.farm_verified && (
                          <button onClick={() => verifyFarm(l.id)}
                            className="admin-btn-sm admin-btn-sm--ok">
                            Verify
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Contracts Tab */}
        {tab === "contracts" && (
          <div className="admin-card">
            <div className="admin-card__head">
              <h2 className="admin-card__title">All Contracts ({contracts.length})</h2>
            </div>
            <div className="admin-tablewrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    {["Crop", "Farmer", "Buyer", "Qty", "Price/Q", "Status", "Date"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id}>
                      <td className="admin-td--strong">{c.crop_name}</td>
                      <td className="admin-td--muted">{c.farmer_name}</td>
                      <td className="admin-td--muted">{c.buyer_name}</td>
                      <td className="admin-td--muted">{c.quantity}T</td>
                      <td className="admin-td--dark">₹{c.offered_price}</td>
                      <td>
                        <span className={`badge ${statusColor(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="admin-td--date">
                        {new Date(c.created_at).toLocaleDateString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Disputes Tab */}
        {tab === "disputes" && (
          <div>
            <div className="admin-filters">
              {["open", "resolved", "rejected"].map((f) => (
                <button key={f} onClick={() => changeDisputeFilter(f)}
                  className={`admin-filter ${disputeFilter === f ? "admin-filter--active" : ""}`}>
                  {f}{f === "open" && openCount > 0 ? ` (${openCount})` : ""}
                </button>
              ))}
            </div>

            {disputesLoading ? (
              <div className="admin-empty admin-empty--muted">
                Loading disputes…
              </div>
            ) : disputes.length === 0 ? (
              <div className="admin-empty">
                <p className="admin-empty__icon">{disputeFilter === "open" ? "✅" : "🗂️"}</p>
                <p className="admin-empty__title">No {disputeFilter} disputes</p>
                {disputeFilter === "open" && <p className="admin-empty__hint">All contracts are in good standing.</p>}
              </div>
            ) : (
              <div className="admin-disputes">
                {disputes.map((d) => (
                  <div key={d.id} className="admin-card">
                    <div className="admin-dispute__body">
                      <div className="admin-dispute__head">
                        <div>
                          <h2 className="admin-dispute__crop">{d.crop_name}</h2>
                          <p className="admin-dispute__parties">
                            Buyer <strong>{d.buyer_name}</strong> • Farmer <strong>{d.farmer_name}</strong>
                          </p>
                          <p className="admin-dispute__raised">
                            Raised by <strong>{d.raised_by_name || "—"}</strong>
                            {d.dispute_raised_at && ` • ${new Date(d.dispute_raised_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                          </p>
                        </div>
                        <span className={`admin-dstatus ${
                          d.dispute_status === "open" ? "admin-dstatus--open"
                            : d.dispute_status === "resolved" ? "admin-dstatus--resolved"
                            : "admin-dstatus--rejected"}`}>
                          {d.dispute_status.toUpperCase()}
                        </span>
                      </div>

                      <div className="admin-dispute__facts">
                        {[
                          { label: "Contract", value: d.status },
                          { label: "Quantity", value: `${d.quantity} t` },
                          { label: "Offered Price", value: `₹${d.offered_price}/Q` },
                          { label: "Total Value", value: `₹${(parseFloat(d.quantity) * parseFloat(d.offered_price) * 10).toLocaleString("en-IN")}` },
                        ].map((r) => (
                          <div key={r.label} className="admin-fact">
                            <p className="admin-fact__label">{r.label}</p>
                            <p className="admin-fact__value">{r.value}</p>
                          </div>
                        ))}
                      </div>

                      <div className="admin-reason">
                        <p className="admin-reason__label">Dispute Reason</p>
                        <p className="admin-reason__text">{d.dispute_reason}</p>
                      </div>

                      {d.dispute_status !== "open" && d.dispute_resolution && (
                        <div className="admin-resolution">
                          <p className="admin-resolution__label">
                            Admin Resolution
                            {d.dispute_resolved_at && ` • ${new Date(d.dispute_resolved_at).toLocaleDateString("en-IN")}`}
                          </p>
                          <p className="admin-resolution__text">{d.dispute_resolution}</p>
                        </div>
                      )}

                      {d.dispute_status === "open" && (
                        resolvingId === d.id ? (
                          <div className="admin-resolve">
                            <p className="admin-resolve__label">Resolution note (sent to both parties)</p>
                            <textarea rows={3} value={resolution}
                              onChange={(e) => setResolution(e.target.value)}
                              placeholder="Explain the decision — e.g. buyer to release balance, or dispute dismissed as unfounded…"
                              className="admin-resolve__input" />
                            <div className="admin-resolve__actions">
                              <button onClick={() => resolveDispute(d.id, "resolved")}
                                className="admin-btn admin-btn--green">
                                ✅ Mark Resolved
                              </button>
                              <button onClick={() => resolveDispute(d.id, "rejected")}
                                className="admin-btn admin-btn--gray">
                                Dismiss Dispute
                              </button>
                              <button onClick={() => { setResolvingId(null); setResolution(""); }}
                                className="admin-btn-plain">Cancel</button>
                            </div>
                            <p className="admin-resolve__hint">
                              Resolving lifts the fund freeze — the buyer can release milestones and settle again.
                            </p>
                          </div>
                        ) : (
                          <button onClick={() => { setResolvingId(d.id); setResolution(""); }}
                            className="admin-btn admin-btn--amber admin-btn--lg">
                            Review & Resolve
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Broadcast Tab */}
        {tab === "broadcast" && (
          <div className="admin-broadcast">
            <div className="admin-broadcast__card">
              <h2 className="admin-broadcast__title">Send Platform Notification</h2>
              {broadcastStatus && (
                <div className="admin-broadcast__status">
                  ✅ {broadcastStatus}
                </div>
              )}
              <form onSubmit={sendBroadcast} className="admin-form">
                <div>
                  <label className="admin-form__label">Target</label>
                  <select value={broadcast.target_role} onChange={(e) => setBroadcast({ ...broadcast, target_role: e.target.value })}
                    className="admin-form__control">
                    <option value="all">All Users</option>
                    <option value="farmer">Farmers Only</option>
                    <option value="buyer">Buyers Only</option>
                  </select>
                </div>
                <div>
                  <label className="admin-form__label">Title</label>
                  <input required value={broadcast.title} onChange={(e) => setBroadcast({ ...broadcast, title: e.target.value })}
                    className="admin-form__control"
                    placeholder="Notification title" />
                </div>
                <div>
                  <label className="admin-form__label">Message</label>
                  <textarea required value={broadcast.message} onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })}
                    rows={4} className="admin-form__control"
                    placeholder="Write your message..." />
                </div>
                <button type="submit" className="admin-form__submit">
                  Send Notification 🔔
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
