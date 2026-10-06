import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import StageMap from "@/components/StageMap";
import "./stage.css";

export default function StageDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [stage, setStage] = useState(null);
  const [listing, setListing] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getUser());
    fetchData();
  }, [id]);

  const fetchData = async () => {
    if (!id || id === "undefined") {
      setLoading(false);
      return; // stage stays null → "Stage not found" UI
    }
    try {
      const stageRes = await api.get(`/stages/stage-details/${id}`);
      const stg = stageRes.data.stage;
      setStage(stg);
      if (!stg) {
        setLoading(false);
        return;
      }

      // Only fetch the parent listing when the stage actually carries a
      // listing_id — otherwise we'd request /listings/undefined and crash.
      const requests = [api.get(`/updates/${id}`)];
      if (stg.listing_id) requests.push(api.get(`/listings/${stg.listing_id}`));

      const [updatesRes, listingRes] = await Promise.all(requests);
      setUpdates(updatesRes.data.updates || []);
      if (listingRes) setListing(listingRes.data.listing);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="page-loader">
      <div className="spinner" />
    </div>
  );

  if (!stage) return (
    <div className="page-loader">
      <p className="page-loader__text">Stage not found.</p>
    </div>
  );

  const isFarmer = user?.role === "farmer";

  return (
    <div className="stage">
      <Navbar />
      <div className="stage__inner">
        {/* Header */}
        <div className="stage-head">
          {listing && (
            <Link to={`/listing/${stage.listing_id}`} className="stage-back">
              ← Back to {listing.crop_name}
            </Link>
          )}
          <div className="stage-head__row">
            <div>
              <h1 className="stage-title">{stage.stage_name} Stage 🌱</h1>
              <p className="stage-subtitle">
                {new Date(stage.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            {isFarmer && (
              <Link to={`/stage/${id}/add-update`} className="stage-add-btn">
                + Add Update
              </Link>
            )}
          </div>
        </div>

        {/* Stage Summary Card */}
        <div className="stage-card">
          <div className="stage-grid">
            {/* Stage image */}
            <div>
              {stage.image_url ? (
                <img src={stage.image_url} alt={stage.stage_name} className="stage-img" />
              ) : (
                <div className="stage-img-ph">
                  <span className="stage-img-ph__icon">🌿</span>
                </div>
              )}
            </div>

            {/* GPS and details */}
            <div className="stage-details">
              {/* GPS Status */}
              <div className={`stage-gps ${
                !stage.image_latitude
                  ? "stage-gps--warn"
                  : stage.gps_verified
                  ? "stage-gps--ok"
                  : "stage-gps--bad"
              }`}>
                <p className={`stage-gps__title ${
                  !stage.image_latitude ? "stage-gps__title--warn" : stage.gps_verified ? "stage-gps__title--ok" : "stage-gps__title--bad"
                }`}>
                  {!stage.image_latitude ? "⚠️ No GPS Data" : stage.gps_verified ? "🟢 GPS Verified" : "🔴 GPS Mismatch"}
                </p>
                {stage.image_latitude && (
                  <p className="stage-gps__coords">
                    Photo: {parseFloat(stage.image_latitude).toFixed(5)}, {parseFloat(stage.image_longitude).toFixed(5)}
                  </p>
                )}
                {stage.distance_from_farm !== null && stage.distance_from_farm !== undefined && (
                  <p className="stage-gps__dist">
                    📏 {Math.round(stage.distance_from_farm)} meters from registered farm
                  </p>
                )}
              </div>

              {/* Notes */}
              {stage.notes && (
                <div className="stage-notes">
                  <p className="stage-notes__label">Farmer Notes</p>
                  <p className="stage-notes__text">{stage.notes}</p>
                </div>
              )}

              {/* Yield update */}
              {stage.updated_yield && (
                <div className="stage-yield">
                  <p className="stage-yield__label">Yield Update</p>
                  <p className="stage-yield__value">{stage.updated_yield} tonnes</p>
                  {stage.yield_update_reason && (
                    <p className="stage-yield__reason">Reason: {stage.yield_update_reason}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* GPS Map */}
          {listing?.farm_latitude && stage.image_latitude && (
            <div className="stage-map">
              <h3 className="stage-map__title">🗺️ Farm Location vs Photo Location</h3>
              <StageMap
                farmLat={listing.farm_latitude}
                farmLng={listing.farm_longitude}
                imageLat={stage.image_latitude}
                imageLng={stage.image_longitude}
              />
            </div>
          )}
        </div>

        {/* Updates */}
        <div className="stage-updates">
          <div className="stage-updates__head">
            <h2 className="stage-updates__title">
              📝 Progress Updates ({updates.length})
            </h2>
          </div>

          {updates.length === 0 ? (
            <div className="stage-updates__empty">
              <p className="stage-updates__empty-icon">📸</p>
              <p className="stage-updates__empty-text">No updates yet for this stage</p>
              {isFarmer && (
                <Link to={`/stage/${id}/add-update`} className="stage-updates__empty-link">
                  Add first update →
                </Link>
              )}
            </div>
          ) : (
            <div className="stage-update-list">
              {updates.map((update) => (
                <div key={update.id} className="stage-update">
                  <div className="stage-update__top">
                    <p className="stage-update__date">
                      📅 {new Date(update.created_at).toLocaleDateString("en-IN", {
                        day: "numeric", month: "long", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                    <span className={`stage-update__badge ${
                      !update.image_latitude
                        ? "stage-update__badge--warn"
                        : update.gps_verified
                        ? "stage-update__badge--ok"
                        : "stage-update__badge--bad"
                    }`}>
                      {!update.image_latitude ? "⚠️ No GPS" : update.gps_verified ? "✅ GPS OK" : "🔴 GPS Fail"}
                    </span>
                  </div>

                  {update.notes && (
                    <p className="stage-update__notes">{update.notes}</p>
                  )}

                  {update.distance_from_farm !== null && update.distance_from_farm !== undefined && (
                    <p className="stage-update__dist">
                      📏 {Math.round(update.distance_from_farm)} meters from farm
                    </p>
                  )}

                  {update.image_url && (
                    <img src={update.image_url} alt="crop update" className="stage-update__img" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
