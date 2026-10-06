import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { INDIA_STATES, getDistricts } from "@/data/indiaLocations";
import "./listing-form.css";

const CROPS = ["Wheat","Rice","Maize","Groundnut","Soyabean","Sunflower","Cotton","Sugarcane",
  "Barley","Tomato","Onion","Potato","Turmeric","Chilli","Banana"];
const SEASONS    = ["Monsoon","Winter","Summer","Whole Year"];
const SOILS      = ["Loamy","Clay","Sandy","Silt","Black Cotton","Red Laterite","Alluvial"];
const IRRIGATION = ["Drip","Sprinkler","Canal","Borewell","Flood","Rainfed"];

export default function EditListingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "farmer") { navigate("/login"); return; }
    fetchListing();
  }, [id]);

  const fetchListing = async () => {
    if (!id || id === "undefined") {
      setError("Invalid listing ID.");
      setLoading(false);
      return;
    }
    try {
      const res = await api.get(`/listings/${id}`);
      const l   = res.data.listing;
      setForm({
        crop_name:              l.crop_name || "",
        land_size:              l.land_size || "",
        rainfall:               l.rainfall || "",
        temperature:            l.temperature || "",
        soil_type:              l.soil_type || "",
        irrigation_method:      l.irrigation_method || "",
        season:                 l.season || "",
        location:               l.location || "",
        state:                  l.state || "",
        district:               l.district || "",
        taluka:                 l.taluka || "",
        village:                l.village || "",
        full_address:           l.full_address || "",
        phone_number:           l.phone_number || "",
        farmer_expected_yield:  l.farmer_expected_yield || "",
        harvest_date:           l.harvest_date ? l.harvest_date.split("T")[0] : "",
        status:                 l.status || "active",
      });
    } catch (e) {
      setError("Listing not found or you don't have access.");
    } finally {
      setLoading(false);
    }
  };

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // Changing the state invalidates the district & taluka chosen under the old
  // state. This is wired to the dropdown's onChange (not a useEffect on
  // form.state) so it never fires during initial hydration and wipes the
  // listing's already-saved district.
  const handleStateChange = (e) =>
    setForm({ ...form, state: e.target.value, district: "", taluka: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.put(`/listings/${id}`, form);
      setSuccess(true);
      setTimeout(() => navigate(`/listing/${id}`), 1200);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update listing");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="page-loader"><div className="spinner" /></div>
  );

  if (!form) return (
    <div className="page-loader">
      <p className="page-loader__text">{error || "Listing not found"}</p>
    </div>
  );

  return (
    <div className="lf-page">
      <Navbar/>
      <div className="lf-container">
        <div className="lf-head">
          <button onClick={() => navigate(-1)} className="lf-back">
            ← Back to Listing
          </button>
          <h1 className="lf-title">Edit Listing ✏️</h1>
          <p className="lf-subtitle">Update your crop listing details</p>
        </div>

        {success && (
          <div className="lf-alert--ok">
            ✅ Listing updated successfully!
          </div>
        )}
        {error && (
          <div className="lf-alert--err">
            ❌ {error}
          </div>
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
                  className="lf-control"/>
              </div>
              <div>
                <label className="lf-label">Expected Yield (tonnes)</label>
                <input name="farmer_expected_yield" type="number" step="0.1" value={form.farmer_expected_yield} onChange={handle}
                  className="lf-control"/>
              </div>
              <div>
                <label className="lf-label">Harvest Date</label>
                <input name="harvest_date" type="date" value={form.harvest_date} onChange={handle}
                  className="lf-control"/>
              </div>
              <div>
                <label className="lf-label">Status</label>
                <select name="status" value={form.status} onChange={handle} className="lf-control">
                  <option value="active">Active</option>
                  <option value="sold">Sold</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          {/* Soil & Climate */}
          <div className="lf-panel">
            <h2 className="lf-panel__title">🌡️ Soil & Climate</h2>
            <div className="lf-grid">
              <div>
                <label className="lf-label">Soil Type</label>
                <select name="soil_type" value={form.soil_type} onChange={handle} className="lf-control">
                  <option value="">Select</option>
                  {SOILS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="lf-label">Irrigation Method</label>
                <select name="irrigation_method" value={form.irrigation_method} onChange={handle} className="lf-control">
                  <option value="">Select</option>
                  {IRRIGATION.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="lf-label">Annual Rainfall (mm)</label>
                <input name="rainfall" type="number" value={form.rainfall} onChange={handle}
                  className="lf-control"/>
              </div>
              <div>
                <label className="lf-label">Avg Temperature (°C)</label>
                <input name="temperature" type="number" value={form.temperature} onChange={handle}
                  className="lf-control"/>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="lf-panel">
            <h2 className="lf-panel__title">📍 Location</h2>
            <div className="lf-grid">
              <div>
                <label className="lf-label">State</label>
                <select name="state" value={form.state} onChange={handleStateChange} className="lf-control">
                  <option value="">Select state</option>
                  {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="lf-label">District</label>
                <select name="district" value={form.district} onChange={handle} disabled={!form.state}
                  className="lf-control">
                  <option value="">{form.state ? "Select district" : "Select a state first"}</option>
                  {getDistricts(form.state).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="lf-label">Taluka / Tehsil</label>
                <input name="taluka" value={form.taluka} onChange={handle}
                  placeholder="Taluka / Tehsil" className="lf-control"/>
              </div>
              <div>
                <label className="lf-label">Village</label>
                <input name="village" value={form.village} onChange={handle} className="lf-control"/>
              </div>
              <div>
                <label className="lf-label">Phone Number</label>
                <input name="phone_number" value={form.phone_number} onChange={handle} className="lf-control"/>
              </div>
              <div className="lf-col-span2">
                <label className="lf-label">Full Address</label>
                <textarea name="full_address" rows={2} value={form.full_address} onChange={handle} className="lf-control"/>
              </div>
            </div>
          </div>

          <button type="submit" disabled={saving} className="lf-submit">
            {saving ? "Saving changes..." : "Save Changes ✅"}
          </button>
        </form>
      </div>
    </div>
  );
}
