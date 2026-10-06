const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const { getFarmerAnalytics, getBuyerAnalytics, getPlatformAnalytics } =
  require("../controllers/analyticsController");

router.get("/farmer", authMiddleware, roleMiddleware("farmer"), getFarmerAnalytics);
router.get("/buyer", authMiddleware, roleMiddleware("buyer"), getBuyerAnalytics);
router.get("/platform", authMiddleware, roleMiddleware("admin"), getPlatformAnalytics);

module.exports = router;
