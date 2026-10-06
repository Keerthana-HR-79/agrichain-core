const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const role    = require("../middleware/roleMiddleware");
const {
  getAllMarketPrices,
  getCropPrice,
  getCropPriceHistory,
  adminUpdatePrice,
  adminTriggerScrape,
  getScrapeLog,
} = require("../controllers/marketPriceController");

// Public — anyone can see prices
router.get("/",                        getAllMarketPrices);
router.get("/crop/:crop_name",         getCropPrice);
router.get("/history/:crop_name",      getCropPriceHistory);

// Admin only
router.post("/update",                 auth, role("admin"), adminUpdatePrice);
router.post("/scrape",                 auth, role("admin"), adminTriggerScrape);
router.get("/scrape-log",              auth, role("admin"), getScrapeLog);

module.exports = router;
