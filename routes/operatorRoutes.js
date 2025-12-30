const express = require("express");
const router = express.Router();
const { authenticate, authorizeRoles } = require("../middleware/auth");
const operatorController = require("../controllers/operatorController");

router.use(authenticate);

// Ambil daftar data operator
router.get(
  ["/", "/jobs"], // 
  authorizeRoles("operator", "owner"),
  operatorController.getAllOperators
);
// Mulai proses cetak
router.post(
  "/kerjakan",
  authorizeRoles("operator", "owner", "admin"),
  operatorController.startJob
);

// Selesaikan cetak
router.post(
  "/kirim/:item_id",
  authorizeRoles("operator", "owner", "admin"),
  operatorController.finishJob
);

// Batalkan pekerjaan
router.delete(
  "/batal/:item_id",
  authorizeRoles("operator", "owner", "admin"),
  operatorController.cancelJob
);

// Tambah bahan tambahan (single)
router.post(
  "/:item_id/materials",
  authorizeRoles("operator", "owner", "admin"),
  operatorController.addSingleMaterial
);

// Ambil daftar bahan tambahan
router.get(
  "/:item_id/materials",
  authorizeRoles("operator", "owner", "admin"),
  operatorController.getMaterials
);

module.exports = router;