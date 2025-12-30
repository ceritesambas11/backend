const express = require("express");
const router = express.Router();
const { authenticate, authorizeRoles } = require("../middleware/auth");
const designController = require("../controllers/designController");

// Ambil semua desain aktif
router.get("/", authenticate, authorizeRoles("owner", "desainer", "admin"), designController.getAllDesigns);

// Kerjakan order
router.post("/kerjakan", authenticate, authorizeRoles("owner", "desainer"), designController.startDesign);

// Kirim ke admin
router.delete("/kirim/:item_id", authenticate, authorizeRoles("owner", "desainer"), designController.finishDesign);

// Batalkan desain (FIX: Ubah dari :item_id jadi :order_id agar sesuai dengan controller)
router.delete("/batal/:order_id", authenticate, authorizeRoles("owner", "desainer"), designController.cancelDesign);

module.exports = router;