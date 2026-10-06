const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/validationMiddleware");
const {
  signup, verifySignupOTP,
  login,  verifyLoginOTP,
  resendOTP, forgotPassword, resetPassword,
  toggleTwoFactor, getProfile,
} = require("../controllers/authController");

router.post("/signup",             authLimiter, signup);
router.post("/signup/verify-otp",  authLimiter, verifySignupOTP);
router.post("/login",              authLimiter, login);
router.post("/login/verify-otp",   authLimiter, verifyLoginOTP);
router.post("/resend-otp",         authLimiter, resendOTP);
router.post("/forgot-password",    authLimiter, forgotPassword);
router.post("/reset-password",     authLimiter, resetPassword);
router.post("/two-factor",         auth,        toggleTwoFactor);
router.get("/profile",             auth,        getProfile);

module.exports = router;
