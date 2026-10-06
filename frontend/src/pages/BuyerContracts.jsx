import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import ReviewModal from "@/components/ReviewModal";
import "./contracts.css";

export default function BuyerContractsPage() {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [settlingId, setSettlingId] = useState(null);
  const [marketPrice, setMarketPrice] = useState("");
  const [reviewTarget, setReviewTarget] = useState(null);
  const [disputingId, setDisputingId] = useState(null);
  const [disputeReason, setDisputeReason] = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "buyer") { navigate("/login"); return; }
    fetchContracts();
  }, []);

  const fetchContracts = async () => {
    try {
      const res = await api.get("/contracts/buyer");
      setContracts(res.data.contracts || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const settle = async (id) => {
    if (!marketPrice) return alert("Enter market price");
    try {
      await api.put(`/contracts/${id}/settle`, { market_price_per_quintal: parseFloat(marketPrice) });
      alert("Contract settled successfully!");
      setSettlingId(null);
      fetchContracts();
    } catch { alert("Failed to settle"); }
  };

  const raiseDispute = async (id) => {
    if (!disputeReason.trim()) return alert("Please describe the issue");
    try {
      await api.put(`/contracts/${id}/dispute`, { reason: disputeReason.trim() });
      alert("Dispute raised. An admin will review it.");
      setDisputingId(null);
      setDisputeReason("");
      fetchContracts();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to raise dispute");
    }
  };

  const filtered = filter === "all" ? contracts : contracts.filter((c) => c.status === filter);

  const badgeClass = (s) => ({
    pending: "ct-badge--pending",
    accepted: "ct-badge--accepted",
    rejected: "ct-badge--rejected",
    completed: "ct-badge--completed",
  }[s] || "ct-badge--default");

  if (loading) return (
    <div className="page-loader"><div className="spinner" /></div>
  );

  return (
    <div className="ct-page">
      <Navbar />
      <div className="ct-container">
        <div className="ct-head">
          <h1 className="ct-title">My Contracts 📋</h1>
          <p className="ct-subtitle">Track all your crop purchase contracts</p>
        </div>

        <div className="ct-filters">
          {["all", "pending", "accepted", "rejected", "completed"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`ct-filter ${filter === f ? "ct-filter--active" : ""}`}>
              {f} ({f === "all" ? contracts.length : contracts.filter((c) => c.status === f).length})
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="ct-empty">
            <p className="ct-empty__icon">📋</p>
            <p className="ct-empty__text">No {filter !== "all" ? filter : ""} contracts</p>
            {filter === "all" && (
              <Link to="/marketplace" className="ct-empty__link">
                Browse marketplace to create contracts →
              </Link>
            )}
          </div>
        ) : (
          <div className="ct-list">
            {filtered.map((c) => (
              <div key={c.id} className="ct-card">
                <div className="ct-card__body">
                  <div className="ct-cardhead">
                    {c.image_url ? (
                      <img src={c.image_url} alt={c.crop_name} className="ct-thumb" />
                    ) : (
                      <div className="ct-thumb-ph">🌿</div>
                    )}
                    <div className="ct-cardhead__main">
                      <div className="ct-cardhead__row">
                        <div>
                          <h2 className="ct-crop">{c.crop_name}</h2>
                          <p className="ct-party">Farmer: <strong>{c.farmer_name}</strong></p>
                          {c.state && <p className="ct-place">{c.district}, {c.state}</p>}
                        </div>
                        <span className={`ct-badge ${badgeClass(c.status)}`}>
                          {c.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="ct-facts">
                    {[
                      { label: "Quantity", value: `${c.quantity} tonnes` },
                      { label: "Offered Price", value: `₹${c.offered_price}/Q` },
                      { label: "Total Value", value: `₹${(parseFloat(c.quantity) * parseFloat(c.offered_price) * 10).toLocaleString("en-IN")}` },
                      { label: "Delivery", value: c.expected_delivery_date ? new Date(c.expected_delivery_date).toLocaleDateString("en-IN") : "—" },
                    ].map((r) => (
                      <div key={r.label} className="ct-fact">
                        <p className="ct-fact__label">{r.label}</p>
                        <p className="ct-fact__value">{r.value}</p>
                      </div>
                    ))}
                  </div>

                  {c.farmer_response_message && (
                    <div className="ct-note ct-note--green">
                      <p className="ct-note__label ct-note__label--green">Farmer&apos;s Response</p>
                      <p className="ct-note__text">{c.farmer_response_message}</p>
                    </div>
                  )}

                  {c.final_amount > 0 && (
                    <div className="ct-note ct-note--blue2">
                      <p className="ct-note__label ct-note__label--blue2">Settlement Details</p>
                      <p className="ct-note__text">Market Price: ₹{c.market_price_at_settlement}/Q</p>
                      <p className="ct-note__amount">Final Amount: ₹{parseFloat(c.final_amount).toLocaleString("en-IN")}</p>
                    </div>
                  )}

                  {/* Dispute banner */}
                  {c.dispute_status && c.dispute_status !== "none" && (
                    <div className={`ct-dispute ${c.dispute_status === "open" ? "ct-dispute--open" : "ct-dispute--closed"}`}>
                      <p className={`ct-dispute__label ${c.dispute_status === "open" ? "ct-dispute__label--open" : "ct-dispute__label--closed"}`}>
                        {c.dispute_status === "open" ? "⚠️ Dispute Open — under admin review"
                          : c.dispute_status === "resolved" ? "✅ Dispute Resolved"
                          : "Dispute Closed"}
                      </p>
                      <p className="ct-note__text">{c.dispute_reason}</p>
                      {c.dispute_resolution && (
                        <p className="ct-dispute__admin"><strong>Admin:</strong> {c.dispute_resolution}</p>
                      )}
                    </div>
                  )}

                  {/* Dispute form */}
                  {disputingId === c.id && (
                    <div className="ct-dform">
                      <p className="ct-dform__label">Describe the issue</p>
                      <textarea rows={3} value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                        placeholder="e.g. Delivered quantity was short, or crop quality didn't match…"
                        className="ct-dform__input" />
                      <div className="ct-dform__actions">
                        <button onClick={() => raiseDispute(c.id)} className="ct-btn--amber">
                          Submit Dispute
                        </button>
                        <button onClick={() => { setDisputingId(null); setDisputeReason(""); }}
                          className="ct-cancel ct-cancel--pad">Cancel</button>
                      </div>
                    </div>
                  )}

                  <div className="ct-actions">
                    <Link to={`/listing/${c.listing_id}`} className="ct-link">
                      View Crop Progress →
                    </Link>
                    {(c.status === "accepted" || c.status === "completed") && (
                      <Link to="/escrow" className="ct-link ct-link--blue">
                        View Escrow →
                      </Link>
                    )}
                    {/* Raise a dispute (either live state, if none open yet) */}
                    {(c.status === "accepted" || c.status === "completed")
                      && (!c.dispute_status || c.dispute_status === "none" || c.dispute_status === "rejected")
                      && disputingId !== c.id && (
                      <button onClick={() => { setDisputingId(c.id); setDisputeReason(""); }}
                        className="ct-link ct-link--amber">
                        ⚠️ Raise Dispute
                      </button>
                    )}
                    {c.status === "completed" && (
                      <button onClick={() => setReviewTarget({ contractId: c.id, name: c.farmer_name })}
                        className="ct-btn--rate">
                        ⭐ Rate Farmer
                      </button>
                    )}
                    {c.status === "accepted" && (
                      settlingId === c.id ? (
                        <div className="ct-settle">
                          <input type="number" value={marketPrice}
                            onChange={(e) => setMarketPrice(e.target.value)}
                            placeholder="Market price ₹/Q"
                            className="ct-settle__input" />
                          <button onClick={() => settle(c.id)} className="ct-btn--blue">
                            Settle
                          </button>
                          <button onClick={() => setSettlingId(null)} className="ct-cancel">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setSettlingId(c.id)} className="ct-btn--blueSoft">
                          💰 Mark Delivered & Settle
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {reviewTarget && (
        <ReviewModal
          contractId={reviewTarget.contractId}
          revieweeName={reviewTarget.name}
          onClose={() => setReviewTarget(null)}
          onSuccess={() => { setReviewTarget(null); fetchContracts(); }}
        />
      )}
    </div>
  );
}
