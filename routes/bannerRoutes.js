const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { authenticate, authorizeRoles } = require("../middleware/auth");
const bannerController = require("../controllers/bannerController");

// ?? Konfigurasi Multer (upload)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "..", "uploads", "banners"));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `banner-${unique}${ext}`);
  },
});

const upload = multer({ storage });

// ======================================================
// ROUTES
// ======================================================

// ?? Semua butuh login admin/owner
router.get("/", authenticate, authorizeRoles("admin", "owner"), bannerController.getAllBanners);
router.post("/", authenticate, authorizeRoles("admin", "owner"), upload.array("banners"), bannerController.uploadBanner);
router.put("/:id", authenticate, authorizeRoles("admin", "owner"), bannerController.updateBanner);
router.delete("/:id", authenticate, authorizeRoles("admin", "owner"), bannerController.deleteBanner);

module.exports = router;
