const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");

router.post("/", upload.single("image"), (req, res) => {
  res.json({ message: "Image uploaded successfully", file: req.file });
});

module.exports = router;
