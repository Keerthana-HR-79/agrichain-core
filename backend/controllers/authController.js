const pool   = require("../config/db");
const bcrypt = require("bcrypt");
const jwt    = require("jsonwebtoken");
const crypto = require("crypto");
const { sendOTPEmail } = require("../services/emailService");

// ── Generate 6-digit OTP ──────────────────────────────────────────────────────
const makeOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── STEP 1: SIGNUP — save user, send OTP ─────────────────────────────────────
const signup = async (req, res) => {
  try {
    const { name, email, password, role, phone_number } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Name, email, password and role are required" });
    }
    if (!["farmer", "buyer"].includes(role)) {
      return res.status(400).json({ message: "Role must be farmer or buyer" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Check duplicate
  let existing;

try {
  console.log("Checking existing user:", email);

  existing = await pool.query(
    "SELECT id, is_verified FROM public.users WHERE email = $1",
    [email]
  );

  console.log("Existing user query succeeded.");
} catch (err) {
  console.error("Existing user query failed:");
  console.error(err);
  throw err;
}
    if (existing.rows.length > 0) {
      if (existing.rows[0].is_verified) {
        return res.status(409).json({ message: "An account with this email already exists. Please log in." });
      }
      // Account exists but not verified — resend OTP
      const otp     = makeOTP();
      const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      await pool.query(
        `UPDATE users SET otp_code = $1, otp_expires = $2 WHERE email = $3`,
        [otp, expires, email]
      );
      await sendOTPEmail({ name: existing.rows[0].name || name, email, otp, type: "signup" });
      return res.status(200).json({
        message: "OTP resent to your email. Please verify to complete signup.",
        email,
        step: "verify_otp",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp     = makeOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await pool.query(
      `INSERT INTO users
         (name, email, password, role, phone_number, is_verified, otp_code, otp_expires)
       VALUES ($1,$2,$3,$4,$5, false,$6,$7)`,
      [name, email, hashedPassword, role, phone_number || null, otp, expires]
    );

    // Send OTP email
    try {
      await sendOTPEmail({ name, email, otp, type: "signup" });
    } catch (emailErr) {
      console.error("⚠️  OTP email failed:", emailErr.message);
    }

    res.status(201).json({
      message: `OTP sent to ${email}. Please enter it to complete your registration.`,
      email,
      step: "verify_otp",
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ── STEP 2: VERIFY OTP (signup) ───────────────────────────────────────────────
const verifySignupOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const result = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ message: "Email already verified. Please log in." });
    }

    if (!user.otp_code || user.otp_code !== otp.trim()) {
      return res.status(400).json({ message: "Invalid OTP. Please check and try again." });
    }

    if (new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({
        message: "OTP has expired. Please request a new one.",
        expired: true,
        email,
      });
    }

    // Mark verified, clear OTP
    await pool.query(
      `UPDATE users SET is_verified = true, otp_code = NULL, otp_expires = NULL WHERE id = $1`,
      [user.id]
    );

    // Welcome notification
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type) VALUES ($1,$2,$3,'system')`,
      [
        user.id,
        "Welcome to AgriChain! 🌾",
        `Hi ${user.name}! Your account is ready. ${
          user.role === "farmer"
            ? "Start by creating your first crop listing."
            : "Browse the marketplace to find quality crops."
        }`,
      ]
    );

    // Auto-login after verification
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { password: _, otp_code: __, ...safeUser } = user;
    safeUser.is_verified = true;

    res.status(200).json({
      message: "Email verified successfully! Welcome to AgriChain.",
      token,
      user: safeUser,
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ── LOGIN: password-only, with OPTIONAL two-factor (OTP) ─────────────────────
// Default flow is password-only: verify credentials → return JWT immediately.
// A user who has opted into 2FA (users.two_factor_enabled = true) still gets an
// email OTP as a second step, handled by verifyLoginOTP. Email verification at
// signup proves ownership of the address once; the password is the login factor
// thereafter, and forgot-password re-uses email for recovery.
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND is_active = true",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    // If not verified yet — send signup OTP again (email ownership still unproven)
    if (!user.is_verified) {
      const otp     = makeOTP();
      const expires = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query(
        `UPDATE users SET otp_code = $1, otp_expires = $2 WHERE id = $3`,
        [otp, expires, user.id]
      );
      try {
        await sendOTPEmail({ name: user.name, email, otp, type: "signup" });
      } catch (e) { console.error("OTP email failed:", e.message); }

      return res.status(403).json({
        message: "Your email is not verified. We've sent a new OTP to verify your account.",
        not_verified: true,
        email,
        step: "verify_otp",
      });
    }

    // Opt-in 2FA → send a login OTP and ask the client to verify it
    if (user.two_factor_enabled) {
      const otp     = makeOTP();
      const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      await pool.query(
        `UPDATE users SET otp_code = $1, otp_expires = $2 WHERE id = $3`,
        [otp, expires, user.id]
      );
      try {
        await sendOTPEmail({ name: user.name, email, otp, type: "login" });
      } catch (e) {
        console.error("Login OTP email failed:", e.message);
      }
      return res.status(200).json({
        message: `Two-factor is on. OTP sent to ${email}. Enter it to complete login.`,
        email,
        two_factor: true,
        step: "verify_otp",
      });
    }

    // Default: password-only → issue JWT immediately
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { password: _, otp_code: __, otp_expires: ___, ...safeUser } = user;

    res.status(200).json({
      message: "Login successful",
      token,
      user: safeUser,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ── LOGIN STEP 2: Verify OTP, return JWT ─────────────────────────────────────
const verifyLoginOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND is_active = true",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];

    if (!user.otp_code || user.otp_code !== otp.trim()) {
      return res.status(400).json({ message: "Invalid OTP. Please check and try again." });
    }

    if (new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({
        message: "OTP has expired. Please log in again to get a new OTP.",
        expired: true,
      });
    }

    // Clear OTP
    await pool.query(
      `UPDATE users SET otp_code = NULL, otp_expires = NULL WHERE id = $1`,
      [user.id]
    );

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { password: _, otp_code: __, otp_expires: ___, ...safeUser } = user;

    res.status(200).json({
      message: "Login successful",
      token,
      user: safeUser,
    });
  } catch (error) {
    console.error("Verify login OTP error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ── RESEND OTP ────────────────────────────────────────────────────────────────
const resendOTP = async (req, res) => {
  try {
    const { email, type = "login" } = req.body;

    if (!email) return res.status(400).json({ message: "Email is required" });

    const result = await pool.query("SELECT id, name FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      return res.status(200).json({ message: "If that email exists, an OTP has been sent." });
    }

    const user    = result.rows[0];
    const otp     = makeOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `UPDATE users SET otp_code = $1, otp_expires = $2 WHERE id = $3`,
      [otp, expires, user.id]
    );

    try {
      await sendOTPEmail({ name: user.name, email, otp, type });
    } catch (e) { console.error("Resend OTP failed:", e.message); }

    res.status(200).json({ message: "New OTP sent to your email." });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ── FORGOT PASSWORD STEP 1: request a reset OTP ──────────────────────────────
// Always responds 200 with the same message whether or not the email exists,
// so the endpoint can't be used to discover which emails are registered.
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const result = await pool.query(
      "SELECT id, name FROM users WHERE email = $1 AND is_active = true",
      [email]
    );

    // Only send if the account exists — but the response is identical either way.
    let emailSent = null; // null = no matching account (never revealed in production)
    if (result.rows.length > 0) {
      const user    = result.rows[0];
      const otp     = makeOTP();
      const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      await pool.query(
        `UPDATE users SET otp_code = $1, otp_expires = $2 WHERE id = $3`,
        [otp, expires, user.id]
      );
      try {
        await sendOTPEmail({ name: user.name, email, otp, type: "reset" });
        emailSent = true;
      } catch (e) {
        emailSent = false;
        console.error("❌ Reset OTP email FAILED for", email, "—", e.message);
      }
    }

    const payload = {
      message: "If an account exists for that email, a reset code has been sent.",
      email,
      step: "reset_otp",
    };
    // Dev-only visibility. NOT exposed in production: it would reveal whether an
    // account exists (breaking the anti-enumeration guarantee documented above).
    if (process.env.NODE_ENV !== "production") payload.email_sent = emailSent;

    res.status(200).json(payload);
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ── FORGOT PASSWORD STEP 2: verify OTP + set new password ────────────────────
const resetPassword = async (req, res) => {
  try {
    const { email, otp, new_password } = req.body;

    if (!email || !otp || !new_password) {
      return res.status(400).json({ message: "Email, OTP and new password are required" });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND is_active = true",
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    const user = result.rows[0];

    if (!user.otp_code || user.otp_code !== otp.trim()) {
      return res.status(400).json({ message: "Invalid reset code. Please check and try again." });
    }
    if (new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({
        message: "Reset code has expired. Please request a new one.",
        expired: true,
        email,
      });
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query(
      `UPDATE users SET password = $1, otp_code = NULL, otp_expires = NULL WHERE id = $2`,
      [hashed, user.id]
    );

    res.status(200).json({ message: "Password reset successfully. You can now log in." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ── TOGGLE TWO-FACTOR (OTP-on-login) — authenticated ─────────────────────────
const toggleTwoFactor = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { enabled } = req.body;

    const result = await pool.query(
      `UPDATE users SET two_factor_enabled = $1 WHERE id = $2
       RETURNING two_factor_enabled`,
      [enabled === true, user_id]
    );

    res.status(200).json({
      success: true,
      two_factor_enabled: result.rows[0].two_factor_enabled,
      message: result.rows[0].two_factor_enabled
        ? "Two-factor login enabled. You'll get an OTP each time you log in."
        : "Two-factor login disabled. You'll log in with your password only.",
    });
  } catch (error) {
    console.error("Toggle 2FA error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ── GET PROFILE ───────────────────────────────────────────────────────────────
const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, phone_number, state, district,
              profile_image, bio, address, avg_rating, total_reviews,
              is_verified, two_factor_enabled, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  signup,
  verifySignupOTP,
  login,
  verifyLoginOTP,
  resendOTP,
  forgotPassword,
  resetPassword,
  toggleTwoFactor,
  getProfile,
};
