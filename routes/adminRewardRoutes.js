// backend/routes/adminRewardRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  getCoinRules,
  updateCoinRules,
  getAllVouchers,
  getVoucherById,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  giveVoucherToClient,
  getRewardStats,
} = require("../controllers/AdminRewardController");

// All routes require authentication and admin/owner role
router.use(authenticate);
router.use(authorizeRoles("admin", "owner"));

// ======================================================
// ?? COIN RULES ROUTES
// ======================================================

// Get current coin rules
router.get("/coin-rules", getCoinRules);

// Update coin rules
router.put("/coin-rules", updateCoinRules);

// ======================================================
// ?? VOUCHER ROUTES
// ======================================================

// Get all vouchers
router.get("/vouchers", getAllVouchers);

// Get voucher by ID
router.get("/vouchers/:id", getVoucherById);

// Create new voucher
router.post("/vouchers", createVoucher);

// Update voucher
router.put("/vouchers/:id", updateVoucher);

// Delete voucher
router.delete("/vouchers/:id", deleteVoucher);

// Give voucher to specific client
router.post("/give-voucher", giveVoucherToClient);

// ======================================================
// ?? STATISTICS ROUTE
// ======================================================

// Get reward statistics
router.get("/stats", getRewardStats);

module.exports = router;