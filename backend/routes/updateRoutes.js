const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");
const { createUpdate, getUpdatesByStage } = require("../controllers/updateController");

router.post("/create", upload.single("image"), createUpdate);
router.get("/:stageId", getUpdatesByStage);

module.exports = router;
