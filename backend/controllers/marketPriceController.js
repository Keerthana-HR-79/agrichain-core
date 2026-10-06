const pool = require("../config/db");
const { getLatestPrice, BASE_PRICES } = require("../services/marketScraper");
const { triggerMarketUpdate } = require("../services/cronJobs");

// Human-readable note per source label.
function sourceNote(source) {
  switch (source) {
    case "data_gov":        return "Live price from data.gov.in (Govt. of India Mandi data)";
    case "data_gov_cached": return "Last verified data.gov.in price — live API was unavailable";
    case "simulated":       return "Live price unavailable — showing simulated market rate (±5% variation)";
    case "admin":           return "Manually set by admin";
    case "default":         return "Seed reference price";
    default:                return "Cached price";
  }
}

// ── GET all current market prices (national view; ?state= to scope) ──────────
const getAllMarketPrices = async (req, res) => {
  try {
    const state = req.query.state || "India";

    const result = await pool.query(
      `SELECT DISTINCT ON (crop_name)
         crop_name, price_per_quintal, min_price, max_price, state,
         market_name, recorded_date, source, updated_at
       FROM market_prices
       WHERE state = $1
       ORDER BY crop_name, recorded_date DESC, updated_at DESC`,
      [state]
    );

    // If no prices in DB yet, return base reference prices.
    if (result.rows.length === 0) {
      const fallback = Object.entries(BASE_PRICES).map(([crop, price]) => ({
        crop_name:         crop,
        price_per_quintal: price,
        state:             state,
        market_name:       "National Mandi Avg",
        recorded_date:     new Date().toISOString().split("T")[0],
        source:            "default",
      }));
      return res.status(200).json({ success: true, prices: fallback, from_default: true, state });
    }

    res.status(200).json({ success: true, prices: result.rows, state });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching market prices" });
  }
};

// ── GET price for a specific crop (live fetch, scoped to location) ───────────
const getCropPrice = async (req, res) => {
  try {
    const { crop_name } = req.params;
    const { state, district } = req.query;

    const result = await getLatestPrice(crop_name, { state, district });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: `No price data found for ${crop_name}`,
      });
    }

    res.status(200).json({
      success:           true,
      crop_name,
      price_per_quintal: result.price,
      min_price:         result.min_price ?? null,
      max_price:         result.max_price ?? null,
      market_name:       result.market_name || result.market || null,
      source:            result.source,
      recorded_date:     result.recorded_date,
      age_hours:         result.age_hours,
      from_cache:        result.from_cache,
      note:              sourceNote(result.source),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching crop price" });
  }
};

// ── GET price history for a crop (last 30 days; ?state= to scope) ────────────
const getCropPriceHistory = async (req, res) => {
  try {
    const { crop_name } = req.params;
    const state = req.query.state || "India";

    const result = await pool.query(
      `SELECT price_per_quintal, min_price, max_price, recorded_date, source, market_name
       FROM market_prices
       WHERE LOWER(crop_name) = LOWER($1) AND state = $2
       ORDER BY recorded_date DESC
       LIMIT 30`,
      [crop_name, state]
    );

    const prices = result.rows.map((r) => parseFloat(r.price_per_quintal));
    let trend = "stable";
    if (prices.length >= 2) {
      const change = ((prices[0] - prices[prices.length - 1]) / prices[prices.length - 1]) * 100;
      trend = change > 3 ? "rising" : change < -3 ? "falling" : "stable";
    }

    res.status(200).json({
      success: true,
      crop_name,
      state,
      history: result.rows,
      trend,
      current_price: prices[0] || null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching price history" });
  }
};

// ── ADMIN: manually update price ──────────────────────────────────────────────
const adminUpdatePrice = async (req, res) => {
  try {
    const { crop_name, price_per_quintal, market_name, state, district } = req.body;

    if (!crop_name || !price_per_quintal) {
      return res.status(400).json({ message: "crop_name and price_per_quintal are required" });
    }

    await pool.query(
      `INSERT INTO market_prices
         (crop_name, price_per_quintal, state, district, market_name, recorded_date, source)
       VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,'admin')
       ON CONFLICT (crop_name, state, district, market_name, recorded_date)
       DO UPDATE SET
         price_per_quintal = EXCLUDED.price_per_quintal,
         source = 'admin',
         updated_at = NOW()`,
      [crop_name, price_per_quintal, state || "India", district || "", market_name || "Manual Entry"]
    );

    res.status(200).json({ success: true, message: "Price updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error updating price" });
  }
};

// ── ADMIN: trigger manual refresh ─────────────────────────────────────────────
const adminTriggerScrape = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: "Price update started in background. Check back in ~30 seconds.",
    });

    triggerMarketUpdate().then((result) => {
      console.log("Manual price refresh result:", result);
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to trigger refresh" });
  }
};

// ── GET scrape log ────────────────────────────────────────────────────────────
const getScrapeLog = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM market_scrape_log ORDER BY scraped_at DESC LIMIT 10`
    ).catch(() => ({ rows: [] }));

    res.status(200).json({ success: true, logs: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching logs" });
  }
};

module.exports = {
  getAllMarketPrices,
  getCropPrice,
  getCropPriceHistory,
  adminUpdatePrice,
  adminTriggerScrape,
  getScrapeLog,
};
