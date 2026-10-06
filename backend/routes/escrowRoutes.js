const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const role    = require("../middleware/roleMiddleware");
const {
  releaseAdvance,
  releaseMilestone,
  settleEscrow,
  getEscrowByContract,
  getMyEscrows,
} = require("../controllers/escrowController");

router.get("/my",                    auth, getMyEscrows);
router.get("/contract/:contract_id", auth, getEscrowByContract);
router.put("/contract/:contract_id/release-advance", auth, role("buyer"), releaseAdvance);
router.put("/contract/:contract_id/milestone/:milestone_id/release", auth, role("buyer"), releaseMilestone);
router.put("/contract/:contract_id/settle",          auth, role("buyer"), settleEscrow);

module.exports = router;
