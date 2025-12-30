// routes/clientRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorizeRoles } = require("../middleware/auth");
const {
  getAllClients,
  createClient,
  updateClient,
  deleteClient,
  getClientTransactions
} = require("../controllers/clientController");

// ======================================================
// ROUTE: /api/clients
// ======================================================

// ?? Ambil semua pelanggan
router.get(
  "/",
  authenticate,                 // pastikan user login
  authorizeRoles("owner", "admin"), // hanya owner/admin yang bisa lihat
  getAllClients
);

// ?? Tambah pelanggan baru
router.post(
  "/",
  authenticate,
  authorizeRoles("owner", "admin"),
  createClient
);

// ?? Ambil riwayat transaksi pelanggan (harus sebelum /:id)
router.get(
  "/:id/transactions",
  authenticate,
  authorizeRoles("owner", "admin"),
  getClientTransactions
);

// ?? Edit data pelanggan
router.put(
  "/:id",
  authenticate,
  authorizeRoles("owner", "admin"),
  updateClient
);

// ?? Hapus pelanggan
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("owner", "admin"),
  deleteClient
);

module.exports = router;