require("dotenv").config();
console.log("DB_NAME =", process.env.DB_NAME);
console.log("DB_USER =", process.env.DB_USER);
console.log("EMAIL_USER =", process.env.EMAIL_USER);
console.log("EMAIL_PASS exists =", !!process.env.EMAIL_PASS);
console.log("EMAIL_PASS length =", process.env.EMAIL_PASS?.length);

const express = require("express");
const cors    = require("cors");
const pool    = require("./config/db");

const { apiLimiter } = require("./middleware/validationMiddleware");
const { startAllCrons, triggerMarketUpdate } = require("./services/cronJobs");
const { verifyEmailTransport } = require("./services/emailService");

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoutes         = require("./routes/authRoutes");
const listingRoutes      = require("./routes/listingRoutes");
const uploadRoutes       = require("./routes/uploadRoutes");
const locationRoutes     = require("./routes/locationRoutes");
const cropStageRoutes    = require("./routes/cropStageRoutes");
const updateRoutes       = require("./routes/updateRoutes");
const contractRoutes     = require("./routes/contractRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const adminRoutes        = require("./routes/adminRoutes");
const marketPriceRoutes  = require("./routes/marketPriceRoutes");
const watchlistRoutes    = require("./routes/watchlistRoutes");
const reviewRoutes       = require("./routes/reviewRoutes");
const escrowRoutes       = require("./routes/escrowRoutes");
const analyticsRoutes    = require("./routes/analyticsRoutes");
const profileRoutes      = require("./routes/profileRoutes");
const pdfRoutes          = require("./routes/pdfRoutes");

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Global rate limit on all /api routes
app.use("/api", apiLimiter);

// ── Mount routes ──────────────────────────────────────────────────────────────
app.use("/api/auth",          authRoutes);
app.use("/api/listings",      listingRoutes);
app.use("/api/location",      locationRoutes);
app.use("/api/upload",        uploadRoutes);
app.use("/api/stages",        cropStageRoutes);
app.use("/api/updates",       updateRoutes);
app.use("/api/contracts",     contractRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin",         adminRoutes);
app.use("/api/market-prices", marketPriceRoutes);
app.use("/api/watchlist",     watchlistRoutes);
app.use("/api/reviews",       reviewRoutes);
app.use("/api/escrow",        escrowRoutes);
app.use("/api/analytics",     analyticsRoutes);
app.use("/api/profile",       profileRoutes);
app.use("/api/pdf",           pdfRoutes);
app.use("/uploads",           express.static("uploads"));

app.get("/", (req, res) => res.send("AgriChain Backend ✅"));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

pool.connect()
  .then(() => {
    console.log("✅ PostgreSQL Connected");
    app.listen(PORT, () => {
      console.log(`🚀 AgriChain Backend running on http://localhost:${PORT}`);
      // Start cron jobs after server is up
      startAllCrons();

      // Verify Gmail SMTP auth at boot so a bad EMAIL_PASS fails loudly in the logs
      // (otherwise the first real send fails and the error gets caught + swallowed).
      verifyEmailTransport();

      // Self-heal on boot: the live fetch otherwise only runs from the 6 AM cron.
      // Skip ONLY if a genuine LIVE price exists for today (source data_gov or
      // data_gov_cached). If today has no live row — a fresh DB (seed only), or a
      // prior sync that fell back to 'simulated' because data.gov.in was slow/
      // throttled — re-run the fetch so a redeploy (or a free-tier cold start)
      // recovers live prices instead of staying stuck on the simulated fallback.
      // Fire-and-forget — never blocks app.listen; failures are logged, not fatal.
      (async () => {
        try {
          const { rows } = await pool.query(
            `SELECT 1 FROM market_prices
             WHERE recorded_date = CURRENT_DATE
               AND source IN ('data_gov', 'data_gov_cached') LIMIT 1`
          );
          if (rows.length > 0) {
            console.log("📈 Live market prices already present for today — skipping startup fetch");
            return;
          }
          console.log("📈 No live prices for today yet (seed/simulated only) — running startup market refresh…");
          const result = await triggerMarketUpdate();
          if (result.success) {
            console.log(`✅ Startup price refresh: ${result.updated} live, ${result.cached || 0} cached, ${result.fallback} simulated`);
          } else {
            console.warn(`⚠️  Startup price refresh skipped: ${result.message}`);
          }
        } catch (err) {
          console.error("❌ Startup market refresh failed:", err.message);
        }
      })();
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  });
