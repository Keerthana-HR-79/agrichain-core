import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import "./stage.css";

export default function AddUpdatePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [notes, setNotes] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState(null);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "farmer") { navigate("/login"); return; }

    api.get(`/stages/stage-details/${id}`)
      .then((res) => setStage(res.data.stage))
      .catch(() => {});
  }, [id]);

  const handleImage = (e) => {
    const file = e.target.files[0];
    setImage(file);
    if (file) setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!notes.trim()) return setError("Please add some notes");
    setError("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("stage_id", id);
      formData.append("notes", notes);
      if (image) formData.append("image", image);

      await api.post("/updates/create", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      navigate(`/stage/${id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add update");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stage">
      <Navbar />

      <div className="stage-form__inner">
        <div className="stage-head">
          <Link to={`/stage/${id}`} className="stage-back">
            ← Back to Stage
          </Link>
          <h1 className="stage-title">Add Update 📸</h1>
          {stage && (
            <p className="stage-subtitle">For: <strong>{stage.stage_name}</strong> stage</p>
          )}
        </div>

        {error && (
          <div className="stage-error">❌ {error}</div>
        )}

        <div className="stage-panel">
          <form onSubmit={handleSubmit} className="stage-form">
            {/* Notes */}
            <div>
              <label className="stage-form__label">Update Notes *</label>
              <textarea required value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
                placeholder="Describe current crop condition, weather, observations..."
                className="stage-form__textarea" />
            </div>

            {/* Image */}
            <div>
              <label className="stage-form__label">Crop Photo (GPS-tagged)</label>
              <p className="stage-form__hint">
                Upload a photo taken from your GPS camera app. The location embedded in the image will be used to verify the update is from your farm.
              </p>

              <div className="stage-drop">
                {imagePreview ? (
                  <div className="stage-drop__preview">
                    <img src={imagePreview} alt="preview" className="stage-drop__preview-img" />
                    <button type="button" onClick={() => { setImage(null); setImagePreview(null); }}
                      className="stage-drop__remove">
                      ×
                    </button>
                  </div>
                ) : (
                  <label htmlFor="update-img" className="stage-drop__label">
                    <span className="stage-drop__icon">📷</span>
                    <p className="stage-drop__title">Click to upload GPS-tagged photo</p>
                    <p className="stage-drop__sub">JPG, PNG up to 10MB</p>
                  </label>
                )}
                <input type="file" accept="image/*" onChange={handleImage} className="stage-hidden-input" id="update-img" />
              </div>

              {!imagePreview && (
                <div className="stage-tip">
                  <p className="stage-tip__title">💡 GPS Verification Tip</p>
                  <p className="stage-tip__text">
                    Use apps like &quot;GPS Camera&quot; or &quot;Timestamp Camera&quot; to take photos that embed your GPS coordinates into the image automatically.
                  </p>
                </div>
              )}
            </div>

            <button type="submit" disabled={loading} className="stage-submit">
              {loading ? (
                <div className="stage-submit__loading">
                  <div className="stage-submit__spinner" />
                  Uploading update...
                </div>
              ) : "Submit Update ✅"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
