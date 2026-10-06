import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import "./listing-form.css";

const STAGES = ["Sowing", "Early Growth", "Vegetative Growth", "Flowering", "Pre Harvest"];
const STAGE_ICONS = { Sowing: "🌱", "Early Growth": "🌿", "Vegetative Growth": "🌾", Flowering: "🌸", "Pre Harvest": "🌻" };

export default function AddStagePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    stage_name: "", notes: "", updated_yield: "", yield_update_reason: "",
    latitude: "", longitude: "",
  });
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [existingStages, setExistingStages] = useState([]);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "farmer") { navigate("/login"); return; }

    // Get GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setForm((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toString(),
          longitude: pos.coords.longitude.toString(),
        }));
      });
    }

    // Get existing stages
    api.get(`/stages/${id}`).then((res) => {
      setExistingStages(res.data.stages?.map((s) => s.stage_name) || []);
    }).catch(() => {});
  }, [id]);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleImage = (e) => {
    const file = e.target.files[0];
    setImage(file);
    if (file) setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("listing_id", id);
      Object.entries(form).forEach(([k, v]) => v && formData.append(k, v));
      if (image) formData.append("image", image);

      await api.post("/stages/create", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      navigate(`/listing/${id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add stage");
    } finally {
      setLoading(false);
    }
  };

  const availableStages = STAGES.filter((s) => !existingStages.includes(s));

  return (
    <div className="lf-page">
      <Navbar />
      <div className="lf-container lf-container--narrow">
        <div className="lf-head">
          <Link to={`/listing/${id}`} className="lf-back">
            ← Back to Listing
          </Link>
          <h1 className="lf-title">Add Crop Stage 🌱</h1>
          <p className="lf-subtitle">Upload a GPS-tagged photo to verify this crop update</p>
        </div>

        {/* Existing stages */}
        {existingStages.length > 0 && (
          <div className="lf-donecard">
            <p className="lf-donecard__label">Completed Stages:</p>
            <div className="lf-chips">
              {STAGES.map((s) => (
                <span key={s} className={`lf-chip ${existingStages.includes(s) ? "lf-chip--done" : "lf-chip--todo"}`}>
                  {STAGE_ICONS[s]} {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="lf-alert--err">❌ {error}</div>
        )}

        <form onSubmit={handleSubmit} className="lf-form--tight">
          {/* Stage Select */}
          <div className="lf-panel">
            <label className="lf-label--strong">Select Stage *</label>
            {availableStages.length === 0 ? (
              <div className="lf-alldone">
                <p className="lf-alldone__title">🎉 All 5 stages completed!</p>
                <Link to={`/listing/${id}`} className="lf-alldone__link">
                  View your listing →
                </Link>
              </div>
            ) : (
              <div className="lf-stagegrid">
                {availableStages.map((s) => (
                  <button key={s} type="button"
                    onClick={() => setForm({ ...form, stage_name: s })}
                    className={`lf-stage ${form.stage_name === s ? "lf-stage--active" : ""}`}>
                    <div className="lf-stage__icon">{STAGE_ICONS[s]}</div>
                    <div className="lf-stage__label">{s}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {availableStages.length > 0 && (
            <>
              {/* Notes */}
              <div className="lf-panel">
                <label className="lf-label--strong">Observation Notes</label>
                <textarea name="notes" value={form.notes} onChange={handle} rows={3}
                  placeholder="Describe the crop condition, growth status, weather conditions..."
                  className="lf-control lf-control--sm" />
              </div>

              {/* Yield Update */}
              <div className="lf-panel">
                <h3 className="lf-panel__title--sm">Update Expected Yield (Optional)</h3>
                <div className="lf-grid">
                  <div>
                    <label className="lf-label--sm">Revised Yield (tonnes)</label>
                    <input name="updated_yield" type="number" step="0.1" value={form.updated_yield} onChange={handle}
                      placeholder="Your estimate" className="lf-control lf-control--sm" />
                  </div>
                  <div>
                    <label className="lf-label--sm">Reason for change</label>
                    <input name="yield_update_reason" value={form.yield_update_reason} onChange={handle}
                      placeholder="e.g. Better rainfall this week" className="lf-control lf-control--sm" />
                  </div>
                </div>
              </div>

              {/* Image Upload */}
              <div className="lf-panel">
                <h3 className="lf-panel__title--sm">📸 GPS-Tagged Crop Photo</h3>
                <p className="lf-drop__label-note" style={{ marginBottom: "1rem" }}>
                  Take a photo with a GPS camera app that embeds location data in the image.
                  This verifies the crop update is from your registered farm location.
                </p>

                <div className="lf-drop--flush">
                  {imagePreview ? (
                    <div className="lf-drop__preview-wrap">
                      <img src={imagePreview} alt="preview" className="lf-drop__preview-img" />
                      <button type="button" onClick={() => { setImage(null); setImagePreview(null); }}
                        className="lf-drop__remove">
                        ×
                      </button>
                    </div>
                  ) : (
                    <label htmlFor="stage-img" className="lf-drop__label">
                      <span className="lf-drop__label-icon">📷</span>
                      <p className="lf-drop__label-title">Click to upload GPS-tagged photo</p>
                      <p className="lf-drop__label-note">JPG, PNG up to 10MB</p>
                    </label>
                  )}
                  <input type="file" accept="image/*" onChange={handleImage} className="lf-hidden" id="stage-img" />
                </div>

                {form.latitude && (
                  <div className="lf-gps lf-gps--blue">
                    <p className="lf-gps__title">📍 Your current GPS location captured</p>
                    <p className="lf-gps__coord">
                      Lat: {parseFloat(form.latitude).toFixed(6)}, Lng: {parseFloat(form.longitude).toFixed(6)}
                    </p>
                  </div>
                )}
              </div>

              <button type="submit" disabled={loading || !form.stage_name} className="lf-submit">
                {loading ? (
                  <div className="lf-submit__loading">
                    <div className="lf-spinner" />
                    Uploading stage...
                  </div>
                ) : "Add Stage ✅"}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
