import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getUser } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { INDIA_STATES, getDistricts } from "@/data/indiaLocations";
import "./profile.css";

export default function EditProfilePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", phone_number: "", state: "", district: "", bio: "", address: "" });
  const [profileImg, setProfileImg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [twoFactor, setTwoFactor] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorMsg, setTwoFactorMsg] = useState("");

  useEffect(() => {
    const u = getUser();
    if (!u) { navigate("/login"); return; }
    // Load fresh profile (includes two_factor_enabled) rather than the cached
    // localStorage copy, so the toggle reflects the server's real state.
    api.get(`/auth/profile`).then((res) => {
      if (typeof res.data.user?.two_factor_enabled === "boolean") {
        setTwoFactor(res.data.user.two_factor_enabled);
      }
    }).catch(() => {});
    api.get(`/profile/${u.id}`).then((res) => {
      const user = res.data.user;
      setForm({
        name: user.name || "", phone_number: user.phone_number || "",
        state: user.state || "", district: user.district || "",
        bio: user.bio || "", address: user.address || "",
      });
      setPreview(user.profile_image);
    }).catch(() => {});
  }, []);

  const handleToggle2FA = async () => {
    const next = !twoFactor;
    setTwoFactorLoading(true);
    setTwoFactorMsg("");
    try {
      const res = await api.post("/auth/two-factor", { enabled: next });
      setTwoFactor(res.data.two_factor_enabled);
      setTwoFactorMsg(res.data.message || "Updated");
    } catch (err) {
      setTwoFactorMsg(err.response?.data?.message || "Failed to update two-factor setting");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleImg = (e) => {
    const file = e.target.files[0];
    setProfileImg(file);
    if (file) setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setLoading(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([k, v]) => formData.append(k, v));
      if (profileImg) formData.append("profile_image", profileImg);

      const res = await api.put("/profile/me/update", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // Update localStorage user
      const currentUser = getUser();
      localStorage.setItem("user", JSON.stringify({ ...currentUser, ...res.data.user }));

      setMsg("success");
      setTimeout(() => navigate(`/profile/${currentUser.id}`), 1200);
    } catch (err) {
      setMsg(err.response?.data?.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwMsg("");
    if (pwForm.new_password !== pwForm.confirm) {
      setPwMsg("New passwords don't match");
      return;
    }
    setPwLoading(true);
    try {
      await api.put("/profile/me/password", {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      setPwMsg("success");
      setPwForm({ current_password: "", new_password: "", confirm: "" });
    } catch (err) {
      setPwMsg(err.response?.data?.message || "Failed to change password");
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="prof">
      <Navbar />
      <div className="prof-edit__inner">
        <h1 className="prof-edit__title">Edit Profile ✏️</h1>

        {/* Profile form */}
        <div className="prof-edit-card prof-edit-card--mb">
          {msg === "success" && (
            <div className="prof-msg prof-msg--success">
              ✅ Profile updated successfully!
            </div>
          )}
          {msg && msg !== "success" && (
            <div className="prof-msg prof-msg--error">❌ {msg}</div>
          )}

          <form onSubmit={handleSubmit} className="prof-form">
            {/* Profile image */}
            <div className="prof-img-row">
              <div className="prof-img">
                {preview ? (
                  <img src={preview} alt="preview" className="prof-img__preview" />
                ) : (
                  <span className="prof-img__placeholder">👤</span>
                )}
              </div>
              <div>
                <input type="file" accept="image/*" onChange={handleImg} className="prof-hidden-input" id="profile-img" />
                <label htmlFor="profile-img" className="prof-img-label">
                  Change Photo
                </label>
              </div>
            </div>

            <div>
              <label className="prof-label">Full Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="prof-input" />
            </div>

            <div>
              <label className="prof-label">Phone Number</label>
              <input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                className="prof-input" />
            </div>

            <div className="prof-grid-2">
              <div>
                <label className="prof-label">State</label>
                <select value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value, district: "" })}
                  className="prof-input">
                  <option value="">Select state</option>
                  {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="prof-label">District</label>
                <select value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} disabled={!form.state}
                  className="prof-input">
                  <option value="">{form.state ? "Select" : "Select a state first"}</option>
                  {getDistricts(form.state).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="prof-label">Bio</label>
              <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3}
                placeholder="Tell others about yourself..."
                className="prof-input" />
            </div>

            <div>
              <label className="prof-label">Address</label>
              <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2}
                className="prof-input" />
            </div>

            <button type="submit" disabled={loading} className="prof-submit">
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>

        {/* Password change */}
        <div className="prof-edit-card">
          <h2 className="prof-edit-card__title">🔒 Change Password</h2>

          {pwMsg === "success" && (
            <div className="prof-msg prof-msg--success">
              ✅ Password changed successfully!
            </div>
          )}
          {pwMsg && pwMsg !== "success" && (
            <div className="prof-msg prof-msg--error">❌ {pwMsg}</div>
          )}

          <form onSubmit={handlePasswordChange} className="prof-form">
            <input type="password" required value={pwForm.current_password}
              onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
              placeholder="Current password"
              className="prof-input" />
            <input type="password" required value={pwForm.new_password}
              onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
              placeholder="New password"
              className="prof-input" />
            <input type="password" required value={pwForm.confirm}
              onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              placeholder="Confirm new password"
              className="prof-input" />
            <button type="submit" disabled={pwLoading} className="prof-submit prof-submit--dark">
              {pwLoading ? "Updating..." : "Change Password"}
            </button>
          </form>
        </div>

        {/* Two-factor authentication */}
        <div className="prof-edit-card prof-edit-card--mt">
          <h2 className="prof-2fa__title">🔐 Two-Factor Login</h2>
          <p className="prof-2fa__desc">
            When on, we email you a 6-digit code at each login for an extra layer of security.
            When off, your password alone signs you in.
          </p>

          {twoFactorMsg && (
            <div className="prof-msg prof-msg--info">
              {twoFactorMsg}
            </div>
          )}

          <div className="prof-2fa__row">
            <span className="prof-2fa__state">
              {twoFactor ? "Enabled" : "Disabled"}
            </span>
            <button type="button" onClick={handleToggle2FA} disabled={twoFactorLoading}
              role="switch" aria-checked={twoFactor}
              className={`prof-toggle ${twoFactor ? "prof-toggle--on" : "prof-toggle--off"}`}>
              <span className={`prof-toggle__knob ${twoFactor ? "prof-toggle__knob--on" : "prof-toggle__knob--off"}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
