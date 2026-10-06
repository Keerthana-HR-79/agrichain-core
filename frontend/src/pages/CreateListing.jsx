import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { api, getUser } from "@/lib/api";
import { INDIA_STATES, getDistricts } from "@/data/indiaLocations";
import "./listing-form.css";

const CROPS = ["Wheat", "Rice", "Maize", "Groundnut", "Soyabean", "Sunflower", "Cotton", "Sugarcane", "Barley", "Tomato", "Onion", "Potato", "Turmeric", "Chilli", "Banana"];
const SEASONS = ["Monsoon", "Winter", "Summer", "Whole Year"];
const SOILS = ["Loamy", "Clay", "Sandy", "Silt", "Black Cotton", "Red Laterite", "Alluvial"];
const IRRIGATION = ["Drip", "Sprinkler", "Flood", "Canal", "Borewell", "Rainfed"];

export default function CreateListingPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    crop_name: "", land_size: "", rainfall: "", temperature: "",
    soil_type: "", irrigation_method: "", season: "", location: "",
    state: "", district: "", taluka: "", village: "", full_address: "",
    phone_number: "", latitude: "", longitude: "", farmer_expected_yield: "",
    harvest_date: "", status: "active",
  });
  const [cropImage, setCropImage] = useState(null);
  const [farmImage, setFarmImage] = useState(null);
  const [cropPreview, setCropPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "farmer") { navigate("/login"); return; }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setForm((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toString(),
          longitude: pos.coords.longitude.toString(),
        }));
      });
    }
  }, []);

  // Cascade: clearing/changing the state resets district & taluka below it.
  useEffect(() => {
    setForm((prev) => ({ ...prev, district: "", taluka: "" }));
  }, [form.state]);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleCropImage = (e) => {
    const file = e.target.files[0];
    setCropImage(file);
    if (file) setCropPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const formData = new FormData();
      Object.entries(form).forEach(([k, v]) => formData.append(k, v));
      if (cropImage) formData.append("image", cropImage);
      if (farmImage) formData.append("farm_registration_image", farmImage);

      const res = await api.post("/listings/create", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setAiResult({
        predicted_yield: res.data.listing.predicted_yield,
        farmer_expected_yield: res.data.listing.farmer_expected_yield,
        listing_id: res.data.listing.id,
      });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create listing");
    } finally {
      setLoading(false);
    }
  };

  if (aiResult) {
    return (
      <div className="lf-page">
        <Navbar />
        <div className="lf-container--success">
          <div className="lf-success">
            <div className="lf-success__emoji">🎉</div>
            <h2 className="lf-success__title">Listing Created!</h2>
            <p className="lf-success__text">Your crop listing is live on the marketplace.</p>
            <div className="lf-success__yield">
              <p className="lf-success__yield-label">🌾 Expected Yield</p>
              <p className="lf-success__yield-value">
                {parseFloat(aiResult.farmer_expected_yield) > 0
                  ? `${parseFloat(aiResult.farmer_expected_yield).toFixed(2)} tonnes`
                  : "—"}
              </p>
              <p className="lf-success__yield-sub">
                {parseFloat(aiResult.farmer_expected_yield) > 0
                  ? "Your own estimate for this crop"
                  : "No estimate provided"}
              </p>
            </div>
            <div className="lf-success__actions">
              <button onClick={() => navigate(`/listing/${aiResult.listing_id}`)}
                className="lf-btn--green">
                View Listing →
              </button>
              <button onClick={() => { setAiResult(null); setForm({ crop_name: "", land_size: "", rainfall: "", temperature: "", soil_type: "", irrigation_method: "", season: "", location: "", state: "", district: "", taluka: "", village: "", full_address: "", phone_number: "", latitude: "", longitude: "", farmer_expected_yield: "", harvest_date: "", status: "active" }); setCropImage(null); setCropPreview(null); }}
                className="lf-btn--gray">
                Add Another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lf-page">
      <Navbar />
      <div className="lf-container">
        <div className="lf-head">
          <h1 className="lf-title">Create New Listing 🌾</h1>
          <p className="lf-subtitle">Fill in your crop details to list your crop on the marketplace.</p>
        </div>

        {error && (
          <div className="lf-alert--err">❌ {error}</div>
        )}

        <form onSubmit={handleSubmit} className="lf-form">
          {/* Crop Info */}
          <div className="lf-panel">
            <h2 className="lf-panel__title">🌿 Crop Information</h2>
            <div className="lf-grid">
              <div>
                <label className="lf-label">Crop Name *</label>
                <select name="crop_name" required value={form.crop_name} onChange={handle} className="lf-control">
                  <option value="">Select crop</option>
                  {CROPS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="lf-label">Season *</label>
                <select name="season" required value={form.season} onChange={handle} className="lf-control">
                  <option value="">Select season</option>
                  {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="lf-label">Land Size (acres) *</label>
                <input name="land_size" type="number" step="0.1" required value={form.land_size} onChange={handle}
                  placeholder="e.g. 5.5" className="lf-control" />
              </div>
              <div>
                <label className="lf-label">Expected Harvest Date</label>
                <input name="harvest_date" type="date" value={form.harvest_date} onChange={handle}
                  className="lf-control" />
              </div>
              <div>
                <label className="lf-label">Farmer Expected Yield (tons)</label>
                <input name="farmer_expected_yield" type="number" step="0.1" value={form.farmer_expected_yield} onChange={handle}
                  placeholder="Your estimate" className="lf-control" />
              </div>
              <div>
                <label className="lf-label">Phone Number</label>
                <input name="phone_number" type="tel" value={form.phone_number} onChange={handle}
                  placeholder="+91 9876543210" className="lf-control" />
              </div>
            </div>
          </div>

          {/* Soil & Climate */}
          <div className="lf-panel">
            <h2 className="lf-panel__title">🌡️ Soil & Climate</h2>
            <div className="lf-grid">
              <div>
                <label className="lf-label">Soil Type *</label>
                <select name="soil_type" required value={form.soil_type} onChange={handle} className="lf-control">
                  <option value="">Select soil type</option>
                  {SOILS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="lf-label">Irrigation Method *</label>
                <select name="irrigation_method" required value={form.irrigation_method} onChange={handle} className="lf-control">
                  <option value="">Select method</option>
                  {IRRIGATION.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="lf-label">Annual Rainfall (mm)</label>
                <input name="rainfall" type="number" value={form.rainfall} onChange={handle}
                  placeholder="e.g. 800" className="lf-control" />
              </div>
              <div>
                <label className="lf-label">Average Temperature (°C)</label>
                <input name="temperature" type="number" value={form.temperature} onChange={handle}
                  placeholder="e.g. 28" className="lf-control" />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="lf-panel">
            <h2 className="lf-panel__title">📍 Location</h2>
            <div className="lf-grid">
              <div>
                <label className="lf-label">State *</label>
                <select name="state" required value={form.state} onChange={handle} className="lf-control">
                  <option value="">Select state</option>
                  {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="lf-label">District *</label>
                <select name="district" required value={form.district} onChange={handle} disabled={!form.state}
                  className="lf-control">
                  <option value="">{form.state ? "Select district" : "Select a state first"}</option>
                  {getDistricts(form.state).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="lf-label">Taluka / Tehsil</label>
                <input name="taluka" value={form.taluka} onChange={handle}
                  placeholder="Taluka / Tehsil" className="lf-control" />
              </div>
              <div>
                <label className="lf-label">Village</label>
                <input name="village" value={form.village} onChange={handle}
                  placeholder="Village name" className="lf-control" />
              </div>
              <div className="lf-col-span2">
                <label className="lf-label">Full Address</label>
                <textarea name="full_address" value={form.full_address} onChange={handle}
                  rows={2} placeholder="Complete farm address..." className="lf-control" />
              </div>
              {form.latitude && (
                <div className="lf-col-span2 lf-gps">
                  <p className="lf-gps__title">📍 GPS Location Captured</p>
                  <p className="lf-gps__coord">Lat: {parseFloat(form.latitude).toFixed(6)}, Lng: {parseFloat(form.longitude).toFixed(6)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Images */}
          <div className="lf-panel">
            <h2 className="lf-panel__title">📸 Images</h2>
            <div className="lf-grid--wide">
              <div>
                <label className="lf-label">Crop Photo</label>
                <div className="lf-drop">
                  {cropPreview ? (
                    <img src={cropPreview} alt="preview" className="lf-drop__preview" />
                  ) : (
                    <div className="lf-drop__ph">
                      <p className="lf-drop__ph-icon">📷</p>
                      <p>Click to upload crop photo</p>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleCropImage} className="lf-hidden" id="crop-img" />
                  <label htmlFor="crop-img" className="lf-upload">
                    {cropPreview ? "Change photo" : "Upload photo"}
                  </label>
                </div>
              </div>
              <div>
                <label className="lf-label">Farm Registration Photo (GPS)</label>
                <div className="lf-drop lf-drop--blue">
                  <div className="lf-drop__ph">
                    <p className="lf-drop__ph-icon">🗺️</p>
                    <p>GPS-tagged farm registration image</p>
                    <p className="lf-drop__ph-note">Used for farm verification</p>
                  </div>
                  <input type="file" accept="image/*" onChange={(e) => setFarmImage(e.target.files[0])} className="lf-hidden" id="farm-img" />
                  <label htmlFor="farm-img" className="lf-upload--blue">
                    {farmImage ? farmImage.name : "Upload GPS photo"}
                  </label>
                </div>
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading} className="lf-submit">
            {loading ? (
              <div className="lf-submit__loading">
                <div className="lf-spinner" />
                Creating listing...
              </div>
            ) : "🚀 Create Listing"}
          </button>
        </form>
      </div>
    </div>
  );
}
