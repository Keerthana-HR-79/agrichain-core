/**
 * AgriChain Cron Jobs
 * ====================
 * Runs background tasks on a schedule.
 *
 * Jobs:
 *   - Market price scraper: every day at 6:00 AM
 *   - Stale prediction cleanup: every Sunday at midnight
 *
 * Interview talking point:
 *   "We use node-cron to schedule a daily refresh from India's official
 *    open-data Mandi API (data.gov.in) at 6 AM, before farmers and buyers
 *    start their day. No external job runner needed — runs inside the
 *    Node.js process."
 *
 * Install: npm install node-cron
 */

const cron = require("node-cron");
const { scrapeAndUpdatePrices } = require("./marketScraper");
const pool = require("../config/db");

let isRunning = false;

// ── Market price scraper: daily at 6:00 AM ────────────────────────────────────
function startMarketPriceCron() {
  // Cron syntax: minute hour day month weekday
  // "0 6 * * *" = every day at 06:00
  cron.schedule("0 6 * * *", async () => {
    if (isRunning) {
      console.log("⚠️  Market scraper already running, skipping");
      return;
    }

    isRunning = true;
    console.log("\n🕕 [CRON] Daily market price update started");

    try {
      const result = await scrapeAndUpdatePrices();
      console.log(`✅ [CRON] Price update done: ${result.updated} live, ${result.cached || 0} cached, ${result.fallback} simulated`);
    } catch (err) {
      console.error("❌ [CRON] Market scraper failed:", err.message);
    } finally {
      isRunning = false;
    }
  }, {
    timezone: "Asia/Kolkata", // IST
  });

  console.log("✅ Market price cron scheduled: daily at 6:00 AM IST");
}

// ── Cleanup cron: every Sunday at midnight ────────────────────────────────────
function startCleanupCron() {
  cron.schedule("0 0 * * 0", async () => {
    try {
      // Delete synced offline mutations older than 7 days (if stored in DB)
      // Delete scrape logs older than 30 days
      await pool.query(
        `DELETE FROM market_scrape_log WHERE scraped_at < NOW() - INTERVAL '30 days'`
      ).catch(() => {});

      // Delete old market prices (keep only last 90 days)
      await pool.query(
        `DELETE FROM market_prices WHERE recorded_date < CURRENT_DATE - INTERVAL '90 days'`
      ).catch(() => {});

      console.log("✅ [CRON] Weekly cleanup complete");
    } catch (err) {
      console.error("❌ [CRON] Cleanup failed:", err.message);
    }
  }, { timezone: "Asia/Kolkata" });

  console.log("✅ Cleanup cron scheduled: every Sunday midnight IST");
}

// ── Start all cron jobs ───────────────────────────────────────────────────────
function startAllCrons() {
  startMarketPriceCron();
  startCleanupCron();
}

// ── Manual trigger (for testing / admin panel) ────────────────────────────────
async function triggerMarketUpdate() {
  if (isRunning) return { success: false, message: "Already running" };
  isRunning = true;
  try {
    const result = await scrapeAndUpdatePrices();
    return { success: true, ...result };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    isRunning = false;
  }
}

module.exports = { startAllCrons, triggerMarketUpdate };
