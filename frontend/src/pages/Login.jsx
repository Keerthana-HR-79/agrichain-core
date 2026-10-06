import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import "./auth.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep]     = useState("form"); // form | otp  (otp only when 2FA is on)
  const [email, setEmail]   = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp]       = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  // ── Log the user in and route to their dashboard ──────────────────────────
  const finishLogin = (res) => {
    localStorage.setItem("token", res.data.token);
    localStorage.setItem("user", JSON.stringify(res.data.user));
    const role = res.data.user.role;
    if (role === "farmer") navigate("/farmer-dashboard");
    else if (role === "buyer") navigate("/buyer-dashboard");
    else if (role === "admin") navigate("/admin-dashboard");
  };

  // ── Step 1: Submit credentials (password-only unless 2FA is enabled) ──────
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      // Default path: server returns a token immediately (no 2FA).
      if (res.data.token) {
        finishLogin(res);
        return;
      }
      // 2FA path: server asks for an emailed OTP.
      if (res.data.two_factor || res.data.step === "verify_otp") {
        setStep("otp");
        startResendTimer();
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.not_verified) {
        setError("Your email is not verified. A new OTP has been sent.");
        setStep("otp");
        startResendTimer();
      } else {
        setError(data?.message || "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP (only reached when 2FA / unverified) ───────────────
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError("");
    const otpCode = otp.join("");
    if (otpCode.length !== 6) return setError("Please enter all 6 digits");
    setLoading(true);
    try {
      const res = await api.post("/auth/login/verify-otp", { email, otp: otpCode });
      finishLogin(res);
    } catch (err) {
      setError(err.response?.data?.message || "Invalid OTP");
      setOtp(["", "", "", "", "", ""]);
      document.getElementById("otp-0")?.focus();
    } finally {
      setLoading(false);
    }
  };

  // ── OTP helpers ───────────────────────────────────────────────────────────
  const handleOTPChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) document.getElementById(`otp-${index + 1}`)?.focus();
  };

  const handleOTPKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0)
      document.getElementById(`otp-${index - 1}`)?.focus();
  };

  const handleOTPPaste = (e) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    const next = [...otp];
    digits.split("").forEach((d, i) => { if (i < 6) next[i] = d; });
    setOtp(next);
    document.getElementById(`otp-${Math.min(digits.length, 5)}`)?.focus();
  };

  const startResendTimer = () => {
    setResendTimer(30);
    const iv = setInterval(() => {
      setResendTimer((t) => { if (t <= 1) { clearInterval(iv); return 0; } return t - 1; });
    }, 1000);
  };

  const resendOTP = async () => {
    if (resendTimer > 0) return;
    try {
      await api.post("/auth/resend-otp", { email, type: "login" });
      setError("");
      startResendTimer();
    } catch { setError("Failed to resend OTP"); }
  };

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        {/* Logo */}
        <div className="auth-logo">
          <Link to="/" className="auth-logo__link">
            <span className="auth-logo__icon">🌾</span>
            <span className="auth-logo__brand">AgriChain</span>
          </Link>
          <p className="auth-logo__tagline">
            {step === "form" ? "Sign in to your account" : "Verify your identity"}
          </p>
        </div>

        <div className="auth-card">
          {/* Progress */}
          <div className="auth-progress">
            <div className={`auth-progress__bar ${step === "form" ? "auth-progress__bar--half" : "auth-progress__bar--full"}`}/>
          </div>

          <div className="auth-body">
            {step === "form" ? (
              <>
                <h1 className="auth-title">Welcome back</h1>

                {error && <div className="auth-error">❌ {error}</div>}

                <form onSubmit={handleLogin} className="auth-form">
                  <div className="auth-field">
                    <label className="auth-label">Email</label>
                    <input type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="auth-input"/>
                  </div>

                  <div className="auth-field">
                    <label className="auth-label">Password</label>
                    <div className="auth-input-wrap">
                      <input type={showPassword ? "text" : "password"} required
                        value={password} onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="auth-input auth-input--pw"/>
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="auth-pw-toggle">
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  <div className="auth-inline-right">
                    <Link to="/forgot-password" className="auth-link" style={{ fontSize: "0.8125rem" }}>
                      Forgot password?
                    </Link>
                  </div>

                  <button type="submit" disabled={loading} className="auth-btn">
                    {loading ? (
                      <div className="auth-btn-loading">
                        <div className="auth-spinner"/>
                        Signing in...
                      </div>
                    ) : "Sign in →"}
                  </button>
                </form>

                <div className="auth-foot">
                  <p className="auth-foot__text">
                    Don&apos;t have an account?{" "}
                    <Link to="/signup" className="auth-link">Create account</Link>
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* OTP Step (2FA / unverified only) */}
                <div className="auth-otp-head">
                  <div className="auth-otp-icon">🔐</div>
                  <h1 className="auth-title" style={{ marginBottom: 0 }}>Enter OTP</h1>
                  <p className="auth-otp-sub">
                    We sent a 6-digit code to<br/>
                    <strong>{email}</strong>
                  </p>
                </div>

                {error && <div className="auth-error auth-error--center">❌ {error}</div>}

                <form onSubmit={handleVerifyOTP}>
                  <div className="auth-otp-boxes" onPaste={handleOTPPaste}>
                    {otp.map((digit, i) => (
                      <input key={i} id={`otp-${i}`}
                        type="text" inputMode="numeric" maxLength={1}
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
                    ) : "Verify & Login ✅"}
                  </button>
                </form>

                <div className="auth-otp-foot">
                  <p className="auth-otp-foot__row">
                    Didn&apos;t receive it?{" "}
                    <button onClick={resendOTP} disabled={resendTimer > 0} className="auth-linkbtn">
                      {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
                    </button>
                  </p>
                  <button onClick={() => { setStep("form"); setOtp(["","","","","",""]); setError(""); }}
                    className="auth-backbtn">
                    ← Back to login
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <p className="auth-caption">
          AgriChain — Agricultural Marketplace 🌾
        </p>
      </div>
    </div>
  );
}
