import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import "./auth.css";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep]   = useState("email"); // email | reset | done
  const [email, setEmail] = useState("");
  const [otp, setOtp]     = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword]   = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [info, setInfo]       = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  // ── Step 1: request a reset code ──────────────────────────────────────────
  const handleRequest = async (e) => {
    e.preventDefault();
    setError(""); setInfo("");
    setLoading(true);
    try {
      const res = await api.post("/auth/forgot-password", { email });
      setInfo(res.data.message || "If an account exists, a reset code has been sent.");
      setStep("reset");
      startResendTimer();
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: verify code + set new password ────────────────────────────────
  const handleReset = async (e) => {
    e.preventDefault();
    setError(""); setInfo("");
    const otpCode = otp.join("");
    if (otpCode.length !== 6) return setError("Please enter all 6 digits");
    if (newPassword.length < 6) return setError("Password must be at least 6 characters");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { email, otp: otpCode, new_password: newPassword });
      setStep("done");
    } catch (err) {
      setError(err.response?.data?.message || "Could not reset password");
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

  const resendCode = async () => {
    if (resendTimer > 0) return;
    setError("");
    try {
      await api.post("/auth/forgot-password", { email });
      startResendTimer();
    } catch { setError("Failed to resend code"); }
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
            {step === "done" ? "All set" : "Reset your password"}
          </p>
        </div>

        <div className="auth-card">
          <div className="auth-progress">
            <div className={`auth-progress__bar ${step === "email" ? "auth-progress__bar--half" : "auth-progress__bar--full"}`}/>
          </div>

          <div className="auth-body">
            {step === "email" && (
              <>
                <h1 className="auth-title">Forgot password?</h1>
                <p className="auth-otp-sub" style={{ textAlign: "left", marginTop: 0, marginBottom: "1.25rem" }}>
                  Enter your account email and we&apos;ll send you a 6-digit reset code.
                </p>

                {error && <div className="auth-error">❌ {error}</div>}

                <form onSubmit={handleRequest} className="auth-form">
                  <div className="auth-field">
                    <label className="auth-label">Email</label>
                    <input type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="auth-input"/>
                  </div>

                  <button type="submit" disabled={loading} className="auth-btn">
                    {loading ? (
                      <div className="auth-btn-loading">
                        <div className="auth-spinner"/>
                        Sending code...
                      </div>
                    ) : "Send reset code →"}
                  </button>
                </form>

                <div className="auth-foot">
                  <p className="auth-foot__text">
                    Remembered it?{" "}
                    <Link to="/login" className="auth-link">Back to login</Link>
                  </p>
                </div>
              </>
            )}

            {step === "reset" && (
              <>
                <div className="auth-otp-head">
                  <div className="auth-otp-icon">🔑</div>
                  <h1 className="auth-title" style={{ marginBottom: 0 }}>Enter reset code</h1>
                  <p className="auth-otp-sub">
                    We sent a 6-digit code to<br/>
                    <strong>{email}</strong>
                  </p>
                </div>

                {info  && <div className="auth-success">✅ {info}</div>}
                {error && <div className="auth-error auth-error--center">❌ {error}</div>}

                <form onSubmit={handleReset}>
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

                  <div className="auth-field" style={{ marginBottom: "1.25rem" }}>
                    <label className="auth-label">New password</label>
                    <div className="auth-input-wrap">
                      <input type={showPassword ? "text" : "password"} required
                        value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="auth-input auth-input--pw"/>
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="auth-pw-toggle">
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={loading || otp.join("").length !== 6}
                    className="auth-btn">
                    {loading ? (
                      <div className="auth-btn-loading">
                        <div className="auth-spinner"/>
                        Resetting...
                      </div>
                    ) : "Reset password ✅"}
                  </button>
                </form>

                <div className="auth-otp-foot">
                  <p className="auth-otp-foot__row">
                    Didn&apos;t receive it?{" "}
                    <button onClick={resendCode} disabled={resendTimer > 0} className="auth-linkbtn">
                      {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend code"}
                    </button>
                  </p>
                  <button onClick={() => { setStep("email"); setOtp(["","","","","",""]); setError(""); setInfo(""); }}
                    className="auth-backbtn">
                    ← Use a different email
                  </button>
                </div>
              </>
            )}

            {step === "done" && (
              <div className="auth-otp-head" style={{ marginBottom: 0 }}>
                <div className="auth-otp-icon">✅</div>
                <h1 className="auth-title" style={{ marginBottom: 0 }}>Password reset</h1>
                <p className="auth-otp-sub">
                  Your password has been updated. You can now log in with your new password.
                </p>
                <button onClick={() => navigate("/login")} className="auth-btn" style={{ marginTop: "1.5rem" }}>
                  Go to login →
                </button>
              </div>
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
