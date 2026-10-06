import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import "./auth.css";

export default function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep]   = useState("form"); // form | otp
  const [form, setForm]   = useState({ name: "", email: "", password: "", role: "", phone_number: "" });
  const [otp,  setOtp]    = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // ── Step 1: Submit signup form ──────────────────────────────────────────────
  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.role) return setError("Please select a role");
    setLoading(true);
    try {
      await api.post("/auth/signup", form);
      setStep("otp");
      startResendTimer();
    } catch (err) {
      setError(err.response?.data?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Submit OTP ──────────────────────────────────────────────────────
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError("");
    const otpCode = otp.join("");
    if (otpCode.length !== 6) return setError("Please enter all 6 digits");
    setLoading(true);
    try {
      const res = await api.post("/auth/signup/verify-otp", { email: form.email, otp: otpCode });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      navigate(res.data.user.role === "farmer" ? "/farmer-dashboard" : "/buyer-dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid OTP");
      setOtp(["", "", "", "", "", ""]);
    } finally {
      setLoading(false);
    }
  };

  // ── OTP input handling ──────────────────────────────────────────────────────
  const handleOTPChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleOTPKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const handleOTPPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      const newOtp = [...otp];
      pasted.split("").forEach((d, i) => { if (i < 6) newOtp[i] = d; });
      setOtp(newOtp);
      document.getElementById(`otp-${Math.min(pasted.length, 5)}`)?.focus();
    }
  };

  const startResendTimer = () => {
    setResendTimer(30);
    const interval = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) { clearInterval(interval); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const resendOTP = async () => {
    if (resendTimer > 0) return;
    try {
      await api.post("/auth/resend-otp", { email: form.email, type: "signup" });
      setError("");
      startResendTimer();
    } catch (err) {
      setError("Failed to resend OTP");
    }
  };

  return (
    <div className="auth-page auth-page--pad">
      <div className="auth-wrap">
        {/* Logo */}
        <div className="auth-logo">
          <Link to="/" className="auth-logo__link">
            <span className="auth-logo__icon">🌾</span>
            <span className="auth-logo__brand">AgriChain</span>
          </Link>
          <p className="auth-logo__tagline">
            {step === "form" ? "Create your free account" : "Verify your email"}
          </p>
        </div>

        <div className="auth-card">
          {/* Progress bar */}
          <div className="auth-progress">
            <div className={`auth-progress__bar ${step === "form" ? "auth-progress__bar--half" : "auth-progress__bar--full"}`}/>
          </div>

          <div className="auth-body">
            {step === "form" ? (
              <>
                <h1 className="auth-title">Get Started</h1>

                {error && <div className="auth-error">❌ {error}</div>}

                <form onSubmit={handleSignup} className="auth-form auth-form--tight">
                  <div className="auth-field">
                    <label className="auth-label">Full Name</label>
                    <input name="name" required value={form.name} onChange={handle}
                      placeholder="Your full name"
                      className="auth-input"/>
                  </div>
                  <div className="auth-field">
                    <label className="auth-label">Email</label>
                    <input name="email" type="email" required value={form.email} onChange={handle}
                      placeholder="your@email.com"
                      className="auth-input"/>
                  </div>
                  <div className="auth-field">
                    <label className="auth-label">Phone Number</label>
                    <input name="phone_number" type="tel" value={form.phone_number} onChange={handle}
                      placeholder="+91 9876543210"
                      className="auth-input"/>
                  </div>
                  <div className="auth-field">
                    <label className="auth-label">Password</label>
                    <input name="password" type="password" required value={form.password} onChange={handle}
                      placeholder="Minimum 6 characters"
                      className="auth-input"/>
                  </div>

                  <div className="auth-field">
                    <label className="auth-label" style={{ marginBottom: "0.5rem" }}>I am a...</label>
                    <div className="auth-role-grid">
                      {[
                        { value: "farmer", icon: "👨‍🌾", label: "Farmer", desc: "List & sell crops" },
                        { value: "buyer",  icon: "🏢", label: "Buyer",  desc: "Source & invest" },
                      ].map((r) => (
                        <button key={r.value} type="button"
                          onClick={() => setForm({ ...form, role: r.value })}
                          className={`auth-role ${form.role === r.value ? "auth-role--active" : ""}`}>
                          <div className="auth-role__icon">{r.icon}</div>
                          <div className="auth-role__label">{r.label}</div>
                          <div className="auth-role__desc">{r.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button type="submit" disabled={loading} className="auth-btn auth-btn--mt">
                    {loading ? (
                      <div className="auth-btn-loading">
                        <div className="auth-spinner"/>
                        Sending OTP...
                      </div>
                    ) : "Continue →"}
                  </button>
                </form>

                <div className="auth-foot">
                  <p className="auth-foot__text">
                    Already have an account?{" "}
                    <Link to="/login" className="auth-link">Sign in</Link>
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* OTP Step */}
                <div className="auth-otp-head">
                  <div className="auth-otp-icon">📧</div>
                  <h1 className="auth-title" style={{ marginBottom: 0 }}>Check your email</h1>
                  <p className="auth-otp-sub">
                    We sent a 6-digit OTP to<br/>
                    <strong>{form.email}</strong>
                  </p>
                </div>

                {error && <div className="auth-error auth-error--center">❌ {error}</div>}

                <form onSubmit={handleVerifyOTP}>
                  {/* OTP boxes */}
                  <div className="auth-otp-boxes" onPaste={handleOTPPaste}>
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        id={`otp-${i}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOTPChange(i, e.target.value)}
                        onKeyDown={(e) => handleOTPKeyDown(i, e)}
                        className={`auth-otp-box ${digit ? "auth-otp-box--filled" : ""}`}
                      />
                    ))}
                  </div>

                  <button type="submit" disabled={loading || otp.join("").length !== 6}
                    className="auth-btn">
                    {loading ? (
                      <div className="auth-btn-loading">
                        <div className="auth-spinner"/>
                        Verifying...
                      </div>
                    ) : "Verify & Create Account ✅"}
                  </button>
                </form>

                <div className="auth-otp-foot">
                  <p className="auth-otp-foot__row">Didn&apos;t receive it?{" "}
                    <button onClick={resendOTP} disabled={resendTimer > 0} className="auth-linkbtn">
                      {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
                    </button>
                  </p>
                  <button onClick={() => { setStep("form"); setOtp(["","","","","",""]); setError(""); }}
                    className="auth-backbtn">
                    ← Change email address
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
