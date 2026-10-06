const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const { getProfile, updateProfile, changePassword } = require("../controllers/profileController");

router.get("/:user_id", getProfile);
router.put("/me/update", authMiddleware, upload.single("profile_image"), updateProfile);
router.put("/me/password", authMiddleware, changePassword);

module.exports = router;
