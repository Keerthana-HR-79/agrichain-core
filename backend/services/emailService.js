/**
 * AgriChain Email Service — OTP
 * =============================
 * Two transports, chosen automatically at send time:
 *
 *   • SendGrid HTTPS API (port 443) — used whenever SENDGRID_API_KEY is set.
 *     Required on Render, whose free tier BLOCKS outbound SMTP (25/465/587).
 *
 *   • Gmail SMTP via nodemailer — LOCAL fallback, used when there is no
 *     SendGrid key but EMAIL_USER + EMAIL_PASS (a Gmail App Password) are set.
 *     A dev laptop isn't SMTP-blocked, so OTP email "just works" locally with
 *     no SendGrid account needed.
 *
 * SendGrid one-time setup (for deploy): create a free account, verify EMAIL_USER
 * as a Single Sender, make a "Mail Send" API key (starts with "SG."), and set
 * SENDGRID_API_KEY in Render → agrichain-backend → Environment.
 *
 * Gmail SMTP setup (for local): on the Google account for EMAIL_USER, enable
 * 2-Step Verification, create an App Password, and put it in EMAIL_PASS.
 *
 * Public interface unchanged: sendOTPEmail(), verifyEmailTransport().
 */

const sgMail     = require("@sendgrid/mail");
const nodemailer = require("nodemailer");

const sgKey     = () => (process.env.SENDGRID_API_KEY || "").trim();
const emailUser = () => (process.env.EMAIL_USER || "").trim();
// Gmail App Passwords are displayed as "abcd efgh ijkl mnop" — the spaces are
// cosmetic and must be stripped before authenticating.
const emailPass = () => (process.env.EMAIL_PASS || "").replace(/\s+/g, "");

const useSendGrid = () => !!sgKey();
const useSmtp     = () => !useSendGrid() && !!emailUser() && !!emailPass();

let _sgReady = false;
let _smtp = null;

function configureSendGrid() {
  if (_sgReady) return true;
  const key = sgKey();
  if (!key) return false;
  sgMail.setApiKey(key);
  _sgReady = true;
  return true;
}

function getSmtpTransport() {
  if (_smtp) return _smtp;
  if (!emailUser() || !emailPass()) return null;
  _smtp = nodemailer.createTransport({
    service: "gmail",
    auth: { user: emailUser(), pass: emailPass() },
  });
  return _smtp;
}

// Called once at boot so a bad/missing config fails LOUDLY in the logs instead
// of silently at the first send. For SMTP we do a real verify() round-trip
// (checks the Gmail credentials); SendGrid has no free verify, so we just
// confirm the key + sender are present.
async function verifyEmailTransport() {
  if (useSendGrid()) {
    configureSendGrid();
    console.log(`✅ Email ready — SendGrid HTTPS API (sender: ${emailUser() || "UNSET"}).`);
    console.log("   Reminder: that sender must be a SendGrid-verified Single Sender, or sends 403.");
    return true;
  }

  if (useSmtp()) {
    try {
      await getSmtpTransport().verify();
      console.log(`✅ Email ready — Gmail SMTP via nodemailer (as ${emailUser()}).`);
      console.log("   (Local dev transport; Render uses SendGrid because it blocks SMTP.)");
      return true;
    } catch (err) {
      console.warn(`⚠️  Gmail SMTP auth FAILED for ${emailUser()}: ${err.message}`);
      console.warn("   → EMAIL_PASS must be a valid Gmail App Password (2-Step Verification ON).");
      return false;
    }
  }

  console.warn(
    "⚠️  Email NOT configured — OTP emails will fail. Set SENDGRID_API_KEY " +
    "(recommended for deploy) OR EMAIL_USER + EMAIL_PASS (Gmail App Password) for local."
  );
  return false;
}

function template(content) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#f0fdf4;font-family:Arial,sans-serif;padding:40px 20px}
  .card{max-width:480px;margin:0 auto;background:#fff;border-radius:20px;
        overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)}
  .hdr{background:linear-gradient(135deg,#166534,#16a34a);padding:28px;text-align:center;color:#fff}
  .hdr .icon{font-size:40px;display:block;margin-bottom:6px}
  .hdr .brand{font-size:24px;font-weight:700}
  .body{padding:32px}
  .otp-box{background:#f0fdf4;border:2px dashed #16a34a;border-radius:14px;
           padding:24px;text-align:center;margin:24px 0}
  .otp{font-size:42px;font-weight:900;letter-spacing:12px;color:#166534;
       font-family:monospace}
  .otp-label{font-size:13px;color:#6b7280;margin-top:8px}
  .p{font-size:15px;color:#374151;line-height:1.6;margin-bottom:12px}
  .warn{background:#fef9c3;border:1px solid #fde047;border-radius:10px;
        padding:12px 16px;font-size:13px;color:#713f12;margin-top:16px}
  .footer{background:#f9fafb;padding:18px;text-align:center;
          font-size:12px;color:#9ca3af;border-top:1px solid #f0f0f0}
</style></head><body>
<div class="card">
  <div class="hdr"><span class="icon">🌾</span><div class="brand">AgriChain</div></div>
  <div class="body">${content}</div>
  <div class="footer">AgriChain — Crop Marketplace · Do not reply to this email</div>
</div></body></html>`;
}

const sendOTPEmail = async ({ name, email, otp, type }) => {
  // type: "signup" | "login" | "reset"
  const copy = {
    signup: { subject: "Your AgriChain signup OTP",      action: "complete your registration", page: "signup" },
    login:  { subject: "Your AgriChain login OTP",        action: "log in to your account",     page: "login" },
    reset:  { subject: "Reset your AgriChain password",   action: "reset your password",        page: "password reset" },
  }[type] || { subject: "Your AgriChain OTP", action: "continue", page: "verification" };

  const html = template(`
    <p class="p">Hi <strong>${name}</strong>,</p>
    <p class="p">Use the OTP below to ${copy.action}:</p>
    <div class="otp-box">
      <div class="otp">${otp}</div>
      <div class="otp-label">⏰ Valid for 10 minutes only</div>
    </div>
    <p class="p">Enter this code on the AgriChain ${copy.page} page to continue.</p>
    <div class="warn">
      🔒 Never share this OTP with anyone. AgriChain will never ask for your OTP.
      If you did not request this, please ignore this email.
    </div>
  `);

  // Prefer SendGrid when configured (works on Render); else Gmail SMTP (local).
  if (useSendGrid()) {
    configureSendGrid();
    try {
      await sgMail.send({
        to: email,
        from: { email: emailUser(), name: "AgriChain 🌾" }, // must be a verified sender
        subject: copy.subject,
        html,
      });
      console.log(`✅ OTP email sent to ${email} (${type}) via SendGrid`);
      return;
    } catch (err) {
      const detail = err.response?.body?.errors
        ? JSON.stringify(err.response.body.errors)
        : err.message;
      console.error(`❌ SendGrid send FAILED for ${email} (${type}): ${detail}`);
      throw err;
    }
  }

  const smtp = getSmtpTransport();
  if (smtp) {
    try {
      await smtp.sendMail({
        from: `"AgriChain 🌾" <${emailUser()}>`,
        to: email,
        subject: copy.subject,
        html,
      });
      console.log(`✅ OTP email sent to ${email} (${type}) via Gmail SMTP`);
      return;
    } catch (err) {
      console.error(`❌ Gmail SMTP send FAILED for ${email} (${type}): ${err.message}`);
      throw err;
    }
  }

  throw new Error("No email transport configured — set SENDGRID_API_KEY or EMAIL_USER + EMAIL_PASS");
};

module.exports = { sendOTPEmail, verifyEmailTransport };
