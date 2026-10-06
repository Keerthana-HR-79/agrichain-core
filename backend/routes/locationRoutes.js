const express = require("express");
const router = express.Router();
const locationService = require("../services/locationService");

router.get("/states", async (req, res) => {
  try {
    const data = await locationService.getStates();
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch states" });
  }
});

router.get("/districts/:stateCode", async (req, res) => {
  try {
    const data = await locationService.getDistricts(req.params.stateCode);
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/talukas/:districtCode", async (req, res) => {
  try {
    const data = await locationService.getTalukas(req.params.districtCode);
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
