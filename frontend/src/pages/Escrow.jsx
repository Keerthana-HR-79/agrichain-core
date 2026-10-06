import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import "./escrow.css";

export default function EscrowPage() {
  const navigate = useNavigate();
  const [user, setUser]     = useState(null);
  const [escrows, setEscrows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(null);
  const [releasingMs, setReleasingMs] = useState(null);
  const [settling, setSettling]   = useState(null);
  const [marketPrice, setMarketPrice] = useState("");
  const [priceInfo, setPriceInfo] = useState(null);   // { source, note } from autofill
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [error, setError]   = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u) { navigate("/login"); return; }
    setUser(u);
    fetchEscrows();
  }, []);

  const fetchEscrows = async () => {
    try {
      const res = await api.get("/escrow/my");
      setEscrows(res.data.escrows || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const releaseAdvance = async (contractId) => {
    if (!window.confirm("Release the 15% advance payment to the farmer? This cannot be undone.")) return;
    setReleasing(contractId);
    setError("");
    try {
      const res = await api.put(
        `/escrow/contract/${contractId}/release-advance`,
        {},
        { headers: { "X-Idempotency-Key": `advance-${contractId}-${user.id}-${Date.now()}` } }
      );
      if (res.data.success) fetchEscrows();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to release advance");
    } finally { setReleasing(null); }
  };

  const releaseMilestone = async (contractId, m) => {
    if (!window.confirm(
      `Release ₹${parseFloat(m.amount).toLocaleString("en-IN")} to the farmer for "${m.label}"? ` +
      `This mock payment cannot be undone.`
    )) return;
    setReleasingMs(m.id);
    setError("");
    try {
      const res = await api.put(
        `/escrow/contract/${contractId}/milestone/${m.id}/release`,
        {},
        { headers: { "X-Idempotency-Key": `ms-${m.id}-${user.id}-${Date.now()}` } }
      );
      if (res.data.success) fetchEscrows();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to release stage payment");
    } finally { setReleasingMs(null); }
  };

  // Autofill the market price from live Agmarknet/data.gov.in data for this
  // crop. The buyer can still override the value manually before settling.
  const autofillPrice = async (e) => {
    setError("");
    setFetchingPrice(true);
    setPriceInfo(null);
    try {
      const res = await api.get(`/market-prices/crop/${encodeURIComponent(e.crop_name)}`, {
        params: { state: e.state, district: e.district },
      });
      if (res.data?.price_per_quintal) {
        setMarketPrice(String(Math.round(parseFloat(res.data.price_per_quintal))));
        setPriceInfo({ source: res.data.source, note: res.data.note });
      } else {
        setError("No live price found — enter it manually");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't fetch live price — enter it manually");
    } finally {
      setFetchingPrice(false);
    }
  };

  const settle = async (contractId) => {
    if (!marketPrice || isNaN(marketPrice)) return setError("Enter a valid market price");
    if (!window.confirm(`Settle at ₹${marketPrice}/quintal? This will complete the contract.`)) return;
    setSettling(contractId);
    setError("");
    try {
      const res = await api.put(
        `/escrow/contract/${contractId}/settle`,
        { market_price_per_quintal: parseFloat(marketPrice) },
        { headers: { "X-Idempotency-Key": `settle-${contractId}-${user.id}-${Date.now()}` } }
      );
      if (res.data.success) { fetchEscrows(); setMarketPrice(""); setSettling(null); }
    } catch (err) {
      setError(err.response?.data?.message || "Settlement failed");
    } finally { setSettling(null); }
  };

  const statusBadge = (s) => ({
    pending:          "esc-badge--pending",
    advance_released: "esc-badge--advance",
    in_progress:      "esc-badge--progress",
    completed:        "esc-badge--completed",
  }[s] || "esc-badge--default");

  const statusLabel = (s) => ({
    pending:          "⏳ Awaiting Advance",
    advance_released: "💸 Advance Released",
    in_progress:      "🌾 Releasing by Stage",
    completed:        "✅ Fully Settled",
  }[s] || s);

  if (loading) return (
    <div className="page-loader"><div className="spinner" /></div>
  );

  const totalLocked  = escrows.filter(e => e.status !== "completed")
    .reduce((s, e) => s + parseFloat(e.total_locked || e.final_amount || 0), 0);
  const totalReleased = escrows
    .reduce((s, e) => s + parseFloat(e.released_to_farmer || 0), 0);

  return (
    <div className="esc-page">
      <Navbar/>
      <div className="esc-container">
        <div className="esc-head">
          <h1 className="esc-title">Escrow & Payments 🔒</h1>
          <p className="esc-subtitle">
            {user?.role === "buyer"
              ? "110% buffer locks your funds — excess is refunded at settlement"
              : "Track advance payments and final settlements"}
          </p>
        </div>

        {error && (
          <div className="esc-error">
            ❌ {error}
            <button onClick={() => setError("")} className="esc-error__x">×</button>
          </div>
        )}

        {/* Summary cards */}
        <div className="esc-summary">
          <div className="esc-sumcard esc-sumcard--yellow">
            <p className="esc-sumcard__label">🔒 Total Locked in Escrow</p>
            <p className="esc-sumcard__value">₹{totalLocked.toLocaleString("en-IN")}</p>
            <p className="esc-sumcard__note">110% buffer — excess refunded at settlement</p>
          </div>
          <div className="esc-sumcard esc-sumcard--blue">
            <p className="esc-sumcard__label">💸 Total Released to Farmers</p>
            <p className="esc-sumcard__value">₹{totalReleased.toLocaleString("en-IN")}</p>
            <p className="esc-sumcard__note">Advance + stage-wise payments paid out</p>
          </div>
        </div>

        {/* 110% buffer explainer */}
        <div className="esc-explain">
          <h3 className="esc-explain__title">ℹ️ How Stage-Based Escrow Works</h3>
          <div className="esc-explain__grid">
            <div className="esc-explain__box esc-explain__box--gray">
              <p className="esc-explain__box-title">🔒 At Contract Accept</p>
              <p className="esc-explain__box-text">Buyer's 110% buffer is locked. Covers contract value + 10% market price headroom.</p>
            </div>
            <div className="esc-explain__box esc-explain__box--green">
              <p className="esc-explain__box-title">🌾 Stage-wise Releases</p>
              <p className="esc-explain__box-text">15% advance funds cultivation, then payments unlock as the farmer proves each GPS-verified crop stage.</p>
            </div>
            <div className="esc-explain__box esc-explain__box--blue">
              <p className="esc-explain__box-title">⚖️ Market Settlement</p>
              <p className="esc-explain__box-text">At harvest the farmer gets the higher of offered vs market price. Buffer excess refunded to buyer.</p>
            </div>
          </div>
        </div>

        {escrows.length === 0 ? (
          <div className="esc-empty">
            <p className="esc-empty__icon">🔒</p>
            <p className="esc-empty__text">No escrow records yet</p>
            <p className="esc-subtitle" style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
              Escrow is created automatically when a farmer accepts a contract.
            </p>
          </div>
        ) : (
          <div className="esc-list">
            {escrows.map((e) => {
              // True contracted value = qty(t) × offered_price(₹/Q) × 10, matching
              // createEscrowOnAccept. NOT e.final_amount — settleEscrow overwrites
              // final_amount with the settled payout, so using it here would show a
              // settled contract's payout in place of its contracted base.
              // buffer_pct is stored as the LOCKED percentage (e.g. 110 for a
              // 10% buffer). Derive the buffer margin (pct − 100) for labels.
              const lockedPct   = parseFloat(e.buffer_pct) || 110;
              const bufferMargin = Math.max(0, lockedPct - 100);
              const contractVal = parseFloat(e.quantity || 0) * parseFloat(e.offered_price || 0) * 10
                                  || parseFloat(e.total_locked || 0) / (lockedPct / 100);
              const totalLocked = parseFloat(e.total_locked || contractVal);
              const advance     = parseFloat(e.advance_amount || 0);
              const buffer      = parseFloat(e.buffer_amount || contractVal * (bufferMargin / 100));
              const released    = parseFloat(e.released_to_farmer || 0);
              const progress    = e.status === "completed"
                ? 100
                : contractVal > 0 ? Math.min(100, Math.round((released / contractVal) * 100)) : 0;
              const milestones  = e.milestones || [];
              const nextLocked  = milestones.find((m) => m.status === "locked");

              return (
                <div key={e.id} className="esc-card">
                  <div className="esc-card__body">
                    {/* Header */}
                    <div className="esc-cardhead">
                      <div>
                        <h2 className="esc-crop">{e.crop_name}</h2>
                        <p className="esc-party">
                          {user?.role === "buyer" ? `Farmer: ${e.farmer_name}` : `Buyer: ${e.buyer_name}`}
                        </p>
                      </div>
                      <span className={`esc-badge ${statusBadge(e.status)}`}>
                        {statusLabel(e.status)}
                      </span>
                    </div>

                    {/* Financial breakdown */}
                    <div className="esc-facts">
                      {[
                        { label: "Contract Value",  value: `₹${contractVal.toLocaleString("en-IN")}`,       cls: "esc-fact--gray" },
                        { label: `${bufferMargin.toFixed(0)}% Buffer`, value: `₹${buffer.toLocaleString("en-IN")}`, cls: "esc-fact--yellow" },
                        { label: `Total Locked (${lockedPct.toFixed(0)}%)`, value: `₹${totalLocked.toLocaleString("en-IN")}`, cls: "esc-fact--orange" },
                        { label: "Advance (15%)",    value: `₹${advance.toLocaleString("en-IN")}`,           cls: "esc-fact--blue" },
                      ].map((r) => (
                        <div key={r.label} className={`esc-fact ${r.cls}`}>
                          <p className="esc-fact__label">{r.label}</p>
                          <p className="esc-fact__value">{r.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Payment progress bar */}
                    <div className="esc-progress">
                      <div className="esc-progress__meta">
                        <span>Payment Progress</span>
                        <span>₹{released.toLocaleString("en-IN")} released · {progress}%</span>
                      </div>
                      <div className="esc-progress__track">
                        <div className="esc-progress__fill" style={{ width: `${progress}%` }}/>
                      </div>
                      <div className="esc-progress__foot">
                        <span>Locked</span>
                        <span>Stage-wise releases</span>
                        <span>Settled</span>
                      </div>
                    </div>

                    {/* Stage-wise release schedule */}
                    {milestones.length > 0 && (
                      <div className="esc-miles">
                        <p className="esc-miles__label">📆 Stage-wise Release Schedule</p>
                        <div className="esc-miles__list">
                          {milestones.map((m) => {
                            const done   = m.status === "released";
                            const isNext = !done && nextLocked && m.id === nextLocked.id;
                            const amt    = parseFloat(m.amount || 0);
                            const desc = done
                              ? `Paid${m.payment_ref ? ` · ${m.payment_ref}` : " · settled at harvest"}`
                              : m.kind === "advance"
                                ? "Release via the Advance button below"
                                : m.stage_ready
                                  ? `Ready — farmer uploaded "${m.stage_name}"`
                                  : `Awaiting farmer's "${m.stage_name}" photo`;
                            return (
                              <div key={m.id}
                                className={`esc-mile ${done ? "esc-mile--done" : isNext ? "esc-mile--next" : "esc-mile--todo"}`}>
                                <span className="esc-mile__icon">
                                  {done ? "✅" : isNext ? "🔓" : "🔒"}
                                </span>
                                <div className="esc-mile__body">
                                  <p className="esc-mile__title">
                                    {m.label}
                                    <span className="esc-mile__pct"> · {parseFloat(m.release_pct)}%</span>
                                  </p>
                                  <p className="esc-mile__desc">{desc}</p>
                                </div>
                                <div className="esc-mile__right">
                                  <p className="esc-mile__amt">₹{amt.toLocaleString("en-IN")}</p>
                                  {user?.role === "buyer" && isNext && m.kind === "progress" && (
                                    m.stage_ready ? (
                                      <button onClick={() => releaseMilestone(e.contract_id, m)}
                                        disabled={releasingMs === m.id}
                                        className="esc-mile__release">
                                        {releasingMs === m.id ? "Releasing…" : "Release 💸"}
                                      </button>
                                    ) : (
                                      <span className="esc-mile__waiting">⏳ Waiting</span>
                                    )
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Settled details */}
                    {e.status === "completed" && (
                      <div className="esc-settled">
                        <p className="esc-settled__label">✅ Settlement Complete</p>
                        <div className="esc-settled__grid">
                          <div>
                            <p className="esc-settled__k">Effective Price</p>
                            <p className="esc-settled__v">₹{parseFloat(e.market_price_used || 0).toLocaleString("en-IN")}/Q</p>
                          </div>
                          <div>
                            <p className="esc-settled__k">Farmer Received</p>
                            <p className="esc-settled__v esc-settled__v--green">₹{parseFloat(e.released_to_farmer || 0).toLocaleString("en-IN")}</p>
                          </div>
                          {parseFloat(e.refunded_to_buyer || 0) > 0 && (
                            <div>
                              <p className="esc-settled__k">Buffer Refunded to Buyer</p>
                              <p className="esc-settled__v esc-settled__v--blue">₹{parseFloat(e.refunded_to_buyer).toLocaleString("en-IN")}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="esc-actions">
                      <Link to={`/listing/${e.listing_id || ""}`} className="esc-link">
                        View Crop →
                      </Link>

                      {/* Release advance (buyer only, pending status) */}
                      {user?.role === "buyer" && !e.advance_released && e.contract_status === "accepted" && (
                        <button onClick={() => releaseAdvance(e.contract_id)}
                          disabled={releasing === e.contract_id}
                          className="esc-btn--advance">
                          {releasing === e.contract_id ? "Releasing..." : "💸 Release Advance"}
                        </button>
                      )}

                      {/* Settle (buyer only, advance released) */}
                      {user?.role === "buyer" && e.advance_released && e.contract_status === "accepted" && e.status !== "completed" && (
                        settling === e.contract_id ? (
                          <div className="esc-settle">
                            <div className="esc-settle__row">
                              <input type="number" value={marketPrice}
                                onChange={(ev) => setMarketPrice(ev.target.value)}
                                placeholder="Market price ₹/quintal"
                                className="esc-settle__input"/>
                              <button onClick={() => autofillPrice(e)} disabled={fetchingPrice}
                                className="esc-settle__autofill">
                                {fetchingPrice ? "Fetching…" : "📈 Autofill live price"}
                              </button>
                              <button onClick={() => settle(e.contract_id)} className="esc-settle__confirm">
                                Confirm
                              </button>
                              <button onClick={() => { setSettling(null); setMarketPrice(""); setPriceInfo(null); }}
                                className="esc-cancel">Cancel</button>
                            </div>
                            {priceInfo && (
                              <p className="esc-settle__price">
                                {priceInfo.source === "data_gov" ? "🟢" : priceInfo.source === "simulated" ? "🟡" : "🔵"} {priceInfo.note} · you can edit before settling
                              </p>
                            )}
                          </div>
                        ) : (
                          <button onClick={() => { setSettling(e.contract_id); setMarketPrice(""); setPriceInfo(null); }}
                            className="esc-btn--settle">
                            ⚖️ Settle at Market Price
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
