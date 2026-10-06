// cropStageRoutes.js
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const { createStage, getStagesByListing, getStageById, deleteStage } = require("../controllers/cropStageController");
const { validateIdParam } = require("../middleware/validationMiddleware");

router.post("/create", authMiddleware, upload.single("image"), createStage);
router.get("/stage-details/:id", validateIdParam("id"), getStageById);
router.get("/:listingId", validateIdParam("listingId"), getStagesByListing);
router.delete("/:id", validateIdParam("id"), authMiddleware, deleteStage);

module.exports = router;
