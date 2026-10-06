/**
 * AgriChain Market Price Service
 * ================================
 * Pulls real APMC mandi prices from the Government of India Open Data
 * platform (data.gov.in) — the official "Current Daily Price of Various
 * Commodities from Various Markets (Mandi)" resource, published by the
 * Department of Agriculture & Farmers Welfare (Agmarknet feed).
 *
 *   Resource: 9ef84268-d588-465a-a308-a864a43d0070
 *   Endpoint: https://api.data.gov.in/resource/<id>?api-key=...&format=json
 *
 * Interview talking point (and it's actually true):
 *   "We consume India's official open-data Mandi API (data.gov.in). A
 *    node-cron job runs at 6 AM IST daily and refreshes a national price
 *    per commodity. When a buyer settles a contract, the settlement engine
 *    reads the latest government-reported modal price for the farmer's own
 *    state/district — so payouts track the real market, never a hardcoded
 *    number. If the API is unreachable we fall back to the last verified
 *    price, and only then to a clearly-labelled simulated rate."
 *
 * Honesty of labelling (source field on every row):
 *   'data_gov'        → live from data.gov.in
 *   'data_gov_cached' → last verified data.gov.in price (API was down)
 *   'simulated'       → deterministic ±5% demo price (no data ever fetched)
 *   'default' / 'admin' → seed data / manual admin entry
 */

const axios = require("axios");
const pool  = require("../config/db");

// data.gov.in Mandi resource + key.
// The key below is data.gov.in's public, documented sample key — it is NOT a
// secret and is safe to ship as a fallback so the demo works out of the box.
// Set DATA_GOV_API_KEY in .env to use your own (higher rate limit).
const DATA_GOV_RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070";
const DATA_GOV_API_KEY =
  process.env.DATA_GOV_API_KEY ||
  "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b";
const DATA_GOV_URL = `https://api.data.gov.in/resource/${DATA_GOV_RESOURCE}`;

// ── Crop → data.gov.in commodity name mapping ────────────────────────────────
// data.gov.in uses specific commodity spellings; map our crop names to them.
const CROP_TO_COMMODITY = {
  "Rice":      "Rice",
  "Wheat":     "Wheat",
  "Maize":     "Maize",
  "Groundnut": "Groundnut",
  "Soyabean":  "Soyabean",
  "Cotton":    "Cotton",
  "Sugarcane": "Sugarcane",
  "Tomato":    "Tomato",
  "Onion":     "Onion",
  "Potato":    "Potato",
  "Turmeric":  "Turmeric",
  "Chilli":    "Green Chilli",
  "Sunflower": "Sunflower",
  "Banana":    "Banana",
  "Barley":    "Barley",
};

// data.gov.in feed tunables. The Agmarknet endpoint is frequently slow or
// briefly unavailable (measured: whole-feed timeouts for a day at a time), so:
//   • ask for a SMALL page — a 500-row response is far slower for the gov
//     server to assemble and transmit, which is what trips the timeout; ~60
//     modal prices is still a robust national average.
//   • allow one retry — a single transient blip shouldn't doom a crop for the
//     whole day (it would otherwise fall back to a simulated price).
//   • give each attempt a slightly longer timeout so a slow-but-up feed is
//     captured instead of abandoned.
const DATA_GOV_LIMIT    = 60;     // was 500
const DATA_GOV_TIMEOUT  = 20000;  // was 15000 (per attempt)
const DATA_GOV_ATTEMPTS = 2;      // total tries per request (i.e. 1 retry)

// ── Fetch raw mandi records from data.gov.in ─────────────────────────────────
// Returns an array of records (possibly empty). Filters are optional; omitting
// state/district gives a national snapshot across all reporting mandis.
// Throws only if every attempt fails at the network level — fetchLivePrice
// catches that and falls back.
async function fetchMandiRecords(cropName, { state, district } = {}) {
  const commodity = CROP_TO_COMMODITY[cropName] || cropName;
  const params = {
    "api-key": DATA_GOV_API_KEY,
    format:    "json",
    limit:     DATA_GOV_LIMIT,
    "filters[commodity]": commodity,
  };
  if (state)    params["filters[state]"]    = state;
  if (district) params["filters[district]"] = district;

  let lastErr;
  for (let attempt = 1; attempt <= DATA_GOV_ATTEMPTS; attempt++) {
    try {
      const response = await axios.get(DATA_GOV_URL, {
        params,
        timeout: DATA_GOV_TIMEOUT,
        headers: { "User-Agent": "AgriChain/1.0 (market-price-fetch)" },
      });
      const records = response.data?.records;
      return Array.isArray(records) ? records : [];
    } catch (err) {
      lastErr = err;
      if (attempt < DATA_GOV_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 800)); // brief backoff before retry
      }
    }
  }
  throw lastErr;
}

// ── Reduce many mandi rows to one representative price ────────────────────────
// modal_price is the government's "most-traded" price — the right one to use.
function summarizeRecords(records) {
  const modals = [];
  const mins   = [];
  const maxes  = [];
  const marketCount = {};

  for (const r of records) {
    const modal = parseFloat(String(r.modal_price).replace(/,/g, ""));
    const min   = parseFloat(String(r.min_price).replace(/,/g, ""));
    const max   = parseFloat(String(r.max_price).replace(/,/g, ""));
    if (Number.isFinite(modal) && modal > 0) modals.push(modal);
    if (Number.isFinite(min)   && min   > 0) mins.push(min);
    if (Number.isFinite(max)   && max   > 0) maxes.push(max);
    if (r.market) marketCount[r.market] = (marketCount[r.market] || 0) + 1;
  }

  if (modals.length === 0) return null;

  const avg = (arr) => Math.round(arr.reduce((s, n) => s + n, 0) / arr.length);
  // Representative market = the one appearing most often in the result set.
  const market = Object.entries(marketCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    modal:  avg(modals),
    min:    mins.length  ? Math.min(...mins)  : null,
    max:    maxes.length ? Math.max(...maxes) : null,
    market,
    sample_count: modals.length,
  };
}

// ── High-level: get a live price for a crop (optionally state/district) ──────
async function fetchLivePrice(cropName, loc = {}) {
  try {
    let records = await fetchMandiRecords(cropName, loc);

    // If a district filter returned nothing, widen to the state; if the state
    // returned nothing, widen to national — a real market price beats an
    // over-specific empty result.
    if (records.length === 0 && loc.district) {
      records = await fetchMandiRecords(cropName, { state: loc.state });
    }
    if (records.length === 0 && loc.state) {
      records = await fetchMandiRecords(cropName, {});
    }

    const summary = summarizeRecords(records);
    if (!summary) return null;

    return {
      price:        summary.modal,
      min_price:    summary.min,
      max_price:    summary.max,
      market:       summary.market,
      sample_count: summary.sample_count,
      source:       "data_gov",
    };
  } catch (err) {
    console.error(`  ⚠️  data.gov.in fetch failed for ${cropName}: ${err.message}`);
    return null;
  }
}

// ── Fallback: deterministic simulated price (clearly labelled) ───────────────
// Used only when data.gov.in has never returned a price for this crop.
// ±5% daily variation seeded by the date so a given day is stable.
const BASE_PRICES = {
  "Rice":      2100, "Wheat":     2200, "Maize":     1800,
  "Groundnut": 5500, "Soyabean":  4200, "Cotton":    6500,
  "Sugarcane": 3200, "Tomato":    1200, "Onion":     2500,
  "Potato":    1500, "Turmeric":  8500, "Chilli":    9000,
  "Sunflower": 5200, "Banana":    1800, "Barley":    1700,
};

function getSimulatedPrice(cropName) {
  const base = BASE_PRICES[cropName];
  if (!base) return null;
  const today     = new Date();
  const seed      = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const cropSeed  = cropName.charCodeAt(0) + cropName.charCodeAt(1);
  const variation = (((seed * cropSeed) % 100) / 100 - 0.5) * 0.10; // ±5%
  return Math.round(base * (1 + variation));
}

// ── Upsert one price row (matches unique constraint on the 5 key columns) ────
async function upsertPrice({ crop_name, price, min_price, max_price, state, district, market_name, source }) {
  await pool.query(
    `INSERT INTO market_prices
       (crop_name, price_per_quintal, min_price, max_price,
        state, district, market_name, recorded_date, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,$8)
     ON CONFLICT (crop_name, state, district, market_name, recorded_date)
     DO UPDATE SET
       price_per_quintal = EXCLUDED.price_per_quintal,
       min_price         = EXCLUDED.min_price,
       max_price         = EXCLUDED.max_price,
       source            = EXCLUDED.source,
       updated_at        = NOW()`,
    [crop_name, price, min_price ?? null, max_price ?? null,
     state, district, market_name, source]
  );
}

// ── Resilience helpers: carry the last REAL price through an outage ──────────
// data.gov.in is frequently unreachable for stretches at a time. Rather than
// overwrite a good government price with a 'simulated' one (which degrades the
// data), we keep the last genuine price and relabel it 'data_gov_cached' until
// the live feed returns — only falling back to 'simulated' if no real price has
// ever been recorded (or the last one is older than MAX_CACHE_DAYS).

// How long a cached real price may stand in before we give up and simulate.
const MAX_CACHE_DAYS = 30;

// Most recent GENUINE live ('data_gov') national price for a crop. We measure
// staleness from this (never from a cached copy), so carry-forward is bounded.
async function getLastLiveNationalPrice(cropName) {
  const { rows } = await pool.query(
    `SELECT price_per_quintal, min_price, max_price, market_name, recorded_date
       FROM market_prices
      WHERE LOWER(crop_name) = LOWER($1)
        AND state = 'India'
        AND source = 'data_gov'
      ORDER BY recorded_date DESC, updated_at DESC
      LIMIT 1`,
    [cropName]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const ageDays = Math.floor(
    (Date.now() - new Date(row.recorded_date).getTime()) / 86400000
  );
  return {
    price:       parseFloat(row.price_per_quintal),
    min_price:   row.min_price != null ? parseFloat(row.min_price) : null,
    max_price:   row.max_price != null ? parseFloat(row.max_price) : null,
    market_name: row.market_name,
    ageDays,
  };
}

// Does today's national row already hold a fresh live ('data_gov') price?
// If so, a later failed run in the same day must NOT downgrade it.
async function todayNationalIsLive(cropName) {
  const { rows } = await pool.query(
    `SELECT 1 FROM market_prices
      WHERE LOWER(crop_name) = LOWER($1)
        AND state = 'India' AND recorded_date = CURRENT_DATE
        AND source = 'data_gov'
      LIMIT 1`,
    [cropName]
  );
  return rows.length > 0;
}

// ── Daily job: refresh a national price per commodity ────────────────────────
// One row per crop with state='India', district='' — this is what the public
// Market Prices page shows. Per-state/district prices are fetched on demand by
// getLatestPrice (e.g. at settlement) and cached alongside.
async function scrapeAndUpdatePrices() {
  console.log(`\n${"=".repeat(55)}`);
  console.log(`  AgriChain Market Price Updater — data.gov.in`);
  console.log(`  ${new Date().toLocaleString("en-IN")}`);
  console.log(`${"=".repeat(55)}`);

  const crops     = Object.keys(CROP_TO_COMMODITY);
  let   live      = 0;
  let   cached    = 0;
  let   simulated = 0;

  for (const crop of crops) {
    const result = await fetchLivePrice(crop);

    if (result) {
      // Ideal case: a fresh live price from data.gov.in.
      await upsertPrice({
        crop_name:   crop,
        price:       result.price,
        min_price:   result.min_price,
        max_price:   result.max_price,
        state:       "India",
        district:    "",
        market_name: "National Mandi Avg",
        source:      "data_gov",
      });
      console.log(`  ✅ ${crop}: ₹${result.price}/quintal (data.gov.in, ${result.sample_count} mandis)`);
      live++;
    } else if (await todayNationalIsLive(crop)) {
      // Today already has a live price — never downgrade it on a later retry.
      console.log(`  ✓  ${crop}: kept today's live price (fetch failed this run)`);
      live++;
    } else {
      // Fetch failed: carry forward the last genuine price instead of degrading
      // to a simulated one, as long as it isn't older than MAX_CACHE_DAYS.
      const lastLive = await getLastLiveNationalPrice(crop);
      if (lastLive && lastLive.ageDays <= MAX_CACHE_DAYS) {
        await upsertPrice({
          crop_name:   crop,
          price:       lastLive.price,
          min_price:   lastLive.min_price,
          max_price:   lastLive.max_price,
          state:       "India",
          district:    "",
          market_name: lastLive.market_name || "National Mandi Avg",
          source:      "data_gov_cached",
        });
        console.log(`  🗃️  ${crop}: ₹${lastLive.price}/quintal (cached — last live price ${lastLive.ageDays}d old)`);
        cached++;
      } else {
        // No real price on record (or too stale) — last-resort simulated.
        const sim = getSimulatedPrice(crop);
        if (sim) {
          await upsertPrice({
            crop_name:   crop,
            price:       sim,
            min_price:   null,
            max_price:   null,
            state:       "India",
            district:    "",
            market_name: "National Mandi Avg",
            source:      "simulated",
          });
          console.log(`  ⚡ ${crop}: ₹${sim}/quintal (simulated — no real price on record)`);
          simulated++;
        }
      }
    }

    // Be polite to the API.
    await new Promise((r) => setTimeout(r, 400));
  }

  await pool.query(
    `INSERT INTO market_scrape_log (crops_updated, fallback_used, scraped_at)
     VALUES ($1,$2,NOW())`,
    [live, cached + simulated]
  ).catch(() => {});

  console.log(`\n${"=".repeat(55)}`);
  console.log(`  Done: ${live} live, ${cached} cached, ${simulated} simulated`);
  console.log(`${"=".repeat(55)}\n`);

  return { updated: live, cached, fallback: simulated, total: crops.length };
}

// ── Get the latest price for a crop, preferring the farmer's location ────────
// Used by the crop-price API and the settlement flow.
//   loc = { state, district }  (both optional)
async function getLatestPrice(cropName, loc = {}) {
  const { state, district } = loc;

  // 1. Recent cache for this exact scope (state if given, else national).
  const scopeState = state || "India";
  const cached = await pool.query(
    `SELECT price_per_quintal, min_price, max_price, source,
            market_name, recorded_date, updated_at
     FROM market_prices
     WHERE LOWER(crop_name) = LOWER($1) AND state = $2
     ORDER BY recorded_date DESC, updated_at DESC
     LIMIT 1`,
    [cropName, scopeState]
  );

  if (cached.rows.length > 0) {
    const row = cached.rows[0];
    const ageHours =
      (Date.now() - new Date(row.updated_at || row.recorded_date).getTime()) / 3.6e6;
    if (ageHours < 25) {
      return {
        price:         parseFloat(row.price_per_quintal),
        min_price:     row.min_price != null ? parseFloat(row.min_price) : null,
        max_price:     row.max_price != null ? parseFloat(row.max_price) : null,
        source:        row.source || "cached",
        market_name:   row.market_name,
        recorded_date: row.recorded_date,
        age_hours:     Math.round(ageHours),
        from_cache:    true,
      };
    }
  }

  // 2. Live fetch scoped to the farmer's location.
  const live = await fetchLivePrice(cropName, loc);
  if (live) {
    await upsertPrice({
      crop_name:   cropName,
      price:       live.price,
      min_price:   live.min_price,
      max_price:   live.max_price,
      state:       scopeState,
      district:    district || "",
      market_name: live.market || "APMC Mandi",
      source:      "data_gov",
    });
    return { ...live, from_cache: false };
  }

  // 3. Last verified data.gov.in price for this crop (any scope, any age).
  const lastVerified = await pool.query(
    `SELECT price_per_quintal, min_price, max_price, market_name, recorded_date
     FROM market_prices
     WHERE LOWER(crop_name) = LOWER($1) AND source IN ('data_gov','data_gov_cached')
     ORDER BY recorded_date DESC, updated_at DESC
     LIMIT 1`,
    [cropName]
  );
  if (lastVerified.rows.length > 0) {
    const row = lastVerified.rows[0];
    return {
      price:         parseFloat(row.price_per_quintal),
      min_price:     row.min_price != null ? parseFloat(row.min_price) : null,
      max_price:     row.max_price != null ? parseFloat(row.max_price) : null,
      source:        "data_gov_cached",
      market_name:   row.market_name,
      recorded_date: row.recorded_date,
      from_cache:    true,
    };
  }

  // 4. Simulated — clearly labelled.
  const sim = getSimulatedPrice(cropName);
  return sim ? { price: sim, source: "simulated", from_cache: false } : null;
}

module.exports = { scrapeAndUpdatePrices, getLatestPrice, fetchLivePrice, BASE_PRICES };
