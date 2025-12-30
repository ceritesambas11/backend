const express = require("express");
const router = express.Router();
const { authenticate, authorizeRoles } = require("../middleware/auth");
const paymentController = require("../controllers/paymentController");

// Semua butuh login
router.use(authenticate);
router.use(authorizeRoles("admin", "owner"));

// STATISTIK PEMBAYARAN (harus di atas /:id)
router.get("/stats/today", paymentController.getPaymentStats);

// LIST SEMUA PEMBAYARAN
router.get("/", paymentController.listPayments);

// LIST PEMBAYARAN BERDASARKAN ORDER_ID (INVOICE_ID)
router.get("/order/:orderId", paymentController.getPaymentsByOrder);

// TAMBAH PEMBAYARAN
router.post("/", paymentController.createPayment);

// HAPUS PEMBAYARAN
router.delete("/:id", paymentController.deletePayment);

module.exports = router;