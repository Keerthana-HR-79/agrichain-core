import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import WatchlistButton from "@/components/WatchlistButton";

import StageMap from "@/components/StageMap";
import { formatYield } from "@/lib/yield";
import "./listing-detail.css";

const STAGE_ICONS = { Sowing: "🌱", "Early Growth": "🌿", "Vegetative Growth": "🌾", Flowering: "🌸", "Pre Harvest": "🌻" };
const STAGE_ORDER = ["Sowing", "Early Growth", "Vegetative Growth", "Flowering", "Pre Harvest"];

export default function ListingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [stages, setStages] = useState([]);
  const [predHistory, setPredHistory] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contractForm, setContractForm] = useState({
    quantity: "", offered_price: "", message: "", expected_delivery_date: "", buffer_pct: 10,
  });
  const [submittingContract, setSubmittingContract] = useState(false);
  const [contractSuccess, setContractSuccess] = useState(false);
  const [contractError, setContractError] = useState("");

  useEffect(() => {
    setUser(getUser());
    fetchData();
  }, [id]);

  const fetchData = async () => {
    if (!id || id === "undefined") {
      setLoading(false);
      return; // listing stays null → "Listing not found" UI
    }
    try {
      const [listRes, stagesRes] = await Promise.all([
        api.get(`/listings/${id}`),
        api.get(`/stages/${id}`),
      ]);
      setListing(listRes.data.listing);
      setPredHistory(listRes.data.prediction_history || []);
      setStages(stagesRes.data.stages || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStage = async (stageId) => {
    if (!window.confirm("Delete this stage and all updates?")) return;
    try {
      await api.delete(`/stages/${stageId}`);
      setStages((prev) => prev.filter((s) => s.id !== stageId));
    } catch (e) { alert("Failed to delete stage"); }
  };

  const handleContractSubmit = async (e) => {
    e.preventDefault();
    setContractError("");
    setSubmittingContract(true);
    try {
      await api.post("/contracts", { listing_id: parseInt(id), ...contractForm });
      setContractSuccess(true);
    } catch (err) {
      setContractError(err.response?.data?.message || "Failed to send contract request");
    } finally {
      setSubmittingContract(false);
    }
  };

  if (loading) return (
    <div className="page-loader"><div className="spinner" /></div>
  );

  if (!listing) return (
    <div className="page-loader">
      <p className="page-loader__text">Listing not found.</p>
    </div>
  );

  const isFarmer = user?.role === "farmer" && user?.id === listing.farmer_id;
  const isBuyer = user?.role === "buyer";
  const completedStages = STAGE_ORDER.filter((s) => stages.some((st) => st.stage_name === s)).length;
  const progress = Math.round((completedStages / 5) * 100);

  return (
    <div className="ld-page">
      <Navbar />
      <div className="ld-container">

        {/* Header */}
        <div className="ld-header">
          {/* Left: Image + Basic Info */}
          <div className="ld-header__left">
            {listing.image_url ? (
              <img src={listing.image_url} alt={listing.crop_name} className="ld-img" />
            ) : (
              <div className="ld-img-ph">
                <span className="ld-img-ph__icon">🌿</span>
              </div>
            )}

            <div className="ld-badges">
              {listing.farm_verified ? (
                <span className="ld-badge ld-badge--verified">✅ Verified Farm</span>
              ) : (
                <span className="ld-badge ld-badge--pending">⏳ Verification Pending</span>
              )}
              <span className="ld-badge ld-badge--season">{listing.season}</span>
              <span className="ld-badge ld-badge--soil">{listing.soil_type}</span>
            </div>

            <h1 className="ld-title">
              {listing.crop_name}
              {isBuyer && (
                <span className="ld-watch">
                  <WatchlistButton listingId={listing.id} />
                </span>
              )}
            </h1>
            <p className="ld-loc">
              📍 {[listing.village, listing.taluka, listing.district, listing.state].filter(Boolean).join(", ")}
            </p>
            {listing.farmer_name && (
              <Link to={`/profile/${listing.farmer_id}`} className="ld-farmer">
                👨‍🌾 Listed by <strong>{listing.farmer_name}</strong>
              </Link>
            )}
          </div>

          {/* Right: Key Numbers */}
          <div className="ld-header__right">
            <div className="ld-yield">
              <p className="ld-yield__label">🌾 Expected Yield</p>
              <p className="ld-yield__value">{formatYield(listing)}</p>
              <p className="ld-yield__sub">
                {parseFloat(listing.farmer_expected_yield) > 0
                  ? "Farmer's own estimate for this crop"
                  : "No yield estimate provided yet"}
              </p>
            </div>

            <div className="ld-facts">
              {[
                { label: "Land Size", value: `${listing.land_size} acres` },
                { label: "Rainfall", value: `${listing.rainfall || "—"} mm` },
                { label: "Temperature", value: `${listing.temperature || "—"} °C` },
                { label: "Irrigation", value: listing.irrigation_method || "—" },
                { label: "Harvest Date", value: listing.harvest_date ? new Date(listing.harvest_date).toLocaleDateString("en-IN") : "—" },
              ].map((r) => (
                <div key={r.label} className="ld-fact">
                  <span className="ld-fact__label">{r.label}</span>
                  <span className="ld-fact__value">{r.value}</span>
                </div>
              ))}
            </div>

            {listing.phone_number && (
              <div className="ld-contact">
                <p className="ld-contact__label">📞 Contact</p>
                <p className="ld-contact__value">{listing.phone_number}</p>
              </div>
            )}
          </div>
        </div>

        {/* Crop Growth Progress */}
        <div className="ld-card">
          <div className="ld-card__head">
            <h2 className="ld-card__title">🌱 Crop Growth Progress</h2>
            {isFarmer && (
              <Link to={`/listing/${id}/add-stage`} className="ld-addstage">
                + Add Stage
              </Link>
            )}
          </div>

          {/* Progress bar */}
          <div className="ld-progress">
            <div className="ld-progress__meta">
              <span>Progress</span>
              <span>{completedStages}/5 stages • {progress}%</span>
            </div>
            <div className="ld-progress__track">
              <div className="ld-progress__fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Stage timeline */}
          <div className="ld-timeline">
            {STAGE_ORDER.map((stageName) => {
              const stage = stages.find((s) => s.stage_name === stageName);
              const done = !!stage;
              return (
                <div key={stageName} className={`ld-stage ${done ? "ld-stage--done" : ""}`}>
                  <div className="ld-stage__icon">{STAGE_ICONS[stageName]}</div>
                  <p className="ld-stage__label">{stageName}</p>
                  {done && stage ? (
                    <div className="ld-stage__meta">
                      <div className={`ld-gps ${stage.gps_verified ? "ld-gps--ok" : "ld-gps--warn"}`}>
                        {stage.gps_verified ? "✅ GPS" : "⚠️ GPS"}
                      </div>
                      <Link to={`/stage/${stage.id}`} className="ld-stage__view">View →</Link>
                      {isFarmer && (
                        <button onClick={() => handleDeleteStage(stage.id)} className="ld-stage__del">Delete</button>
                      )}
                    </div>
                  ) : (
                    <p className="ld-stage__pending">Pending</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Farm GPS Map */}
          {listing.farm_latitude && listing.farm_longitude && stages[0]?.image_latitude && (
            <div className="ld-map">
              <h3 className="ld-map__title">🗺️ Farm Location Verification</h3>
              <StageMap
                farmLat={listing.farm_latitude} farmLng={listing.farm_longitude}
                imageLat={stages[0].image_latitude} imageLng={stages[0].image_longitude}
              />
            </div>
          )}
        </div>

        {/* Contract Form (Buyer Only) */}
        {isBuyer && (
          <div className="ld-card">
            <h2 className="ld-form-head__title">📋 Send Contract Request</h2>
            <p className="ld-form-head__subtitle">Submit your offer to the farmer. They will review and respond.</p>

            {contractSuccess ? (
              <div className="ld-csuccess">
                <p className="ld-csuccess__icon">✅</p>
                <p className="ld-csuccess__title">Contract Request Sent!</p>
                <p className="ld-csuccess__text">The farmer will be notified and will review your request.</p>
              </div>
            ) : (
              <form onSubmit={handleContractSubmit} className="ld-form">
                {contractError && (
                  <div className="ld-form-err">❌ {contractError}</div>
                )}
                <div className="ld-form-grid">
                  <div>
                    <label className="ld-label">Quantity (tonnes) *</label>
                    <input type="number" step="0.1" required
                      value={contractForm.quantity}
                      onChange={(e) => setContractForm({ ...contractForm, quantity: e.target.value })}
                      placeholder="e.g. 10" className="ld-control" />
                  </div>
                  <div>
                    <label className="ld-label">Offered Price (₹/quintal) *</label>
                    <input type="number" required
                      value={contractForm.offered_price}
                      onChange={(e) => setContractForm({ ...contractForm, offered_price: e.target.value })}
                      placeholder="e.g. 2200" className="ld-control" />
                  </div>
                  <div>
                    <label className="ld-label">Expected Delivery Date</label>
                    <input type="date"
                      value={contractForm.expected_delivery_date}
                      onChange={(e) => setContractForm({ ...contractForm, expected_delivery_date: e.target.value })}
                      className="ld-control" />
                  </div>
                  <div>
                    <label className="ld-label">Estimated Value</label>
                    <div className="ld-estimate">
                      ₹{contractForm.quantity && contractForm.offered_price
                        ? (parseFloat(contractForm.quantity) * parseFloat(contractForm.offered_price) * 10).toLocaleString("en-IN")
                        : "—"}
                    </div>
                  </div>
                </div>
                {/* Configurable escrow buffer */}
                <div>
                  <label className="ld-label">
                    Escrow Buffer
                    <span className="ld-label__hint"> — safety margin locked on top of contract value</span>
                  </label>
                  <div className="ld-buffers">
                    {[5, 10, 15, 20].map((b) => (
                      <button key={b} type="button"
                        onClick={() => setContractForm({ ...contractForm, buffer_pct: b })}
                        className={`ld-buffer ${Number(contractForm.buffer_pct) === b ? "ld-buffer--active" : ""}`}>
                        {b}%
                      </button>
                    ))}
                  </div>
                  <p className="ld-buffer-hint">
                    {contractForm.quantity && contractForm.offered_price ? (
                      <>You lock{" "}
                        <strong>
                          ₹{(parseFloat(contractForm.quantity) * parseFloat(contractForm.offered_price) * 10 * (1 + Number(contractForm.buffer_pct) / 100)).toLocaleString("en-IN")}
                        </strong>{" "}
                        ({100 + Number(contractForm.buffer_pct)}% of value). Unused buffer is refunded at settlement.
                      </>
                    ) : (
                      "Covers market-price upside at harvest. Unused buffer is refunded to you."
                    )}
                  </p>
                </div>

                <div>
                  <label className="ld-label">Message to Farmer</label>
                  <textarea rows={3}
                    value={contractForm.message}
                    onChange={(e) => setContractForm({ ...contractForm, message: e.target.value })}
                    placeholder="Introduce yourself and explain your requirements..."
                    className="ld-control" />
                </div>
                <button type="submit" disabled={submittingContract} className="ld-submit">
                  {submittingContract ? "Sending..." : "Send Contract Request 📋"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
