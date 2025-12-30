// routes/internalRoutes.js
// Internal API untuk komunikasi antar backend (5000 ? 5002)

const express = require("express");
const router = express.Router();
const { notifyNewOrder } = require("../utils/notifications");

/**
 * POST /api/internal/notify-new-order
 * Endpoint untuk backend customer (5002) kirim notifikasi ke admin
 * Body: { order_id, order_code, client_name }
 */
router.post("/notify-new-order", async (req, res) => {
  try {
    const { order_id, order_code, client_name } = req.body;
    
    // Validasi input
    if (!order_id || !order_code || !client_name) {
      return res.status(400).json({
        success: false,
        message: "order_id, order_code, dan client_name wajib diisi"
      });
    }

    console.log(`?? Internal request: New order ${order_code} from customer backend`);

    // Ambil Socket.IO instance
    const io = req.app.get("io");
    
    if (!io) {
      console.error("? Socket.IO instance tidak ditemukan");
      return res.status(500).json({
        success: false,
        message: "Socket.IO tidak tersedia"
      });
    }

    // Kirim notifikasi ke Admin & Owner
    await notifyNewOrder(io, order_id, order_code, client_name);
    
    console.log(`? Notifikasi order ${order_code} berhasil dikirim`);

    res.json({
      success: true,
      message: "Notifikasi berhasil dikirim ke Admin & Owner"
    });

  } catch (error) {
    console.error("? Error notify-new-order:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal mengirim notifikasi",
      error: error.message
    });
  }
});

/**
 * POST /api/internal/notify-status-change
 * (Optional) Endpoint untuk notifikasi perubahan status dari backend lain
 * Body: { order_id, order_code, new_status, old_status }
 */
router.post("/notify-status-change", async (req, res) => {
  try {
    const { order_id, order_code, new_status, old_status } = req.body;
    
    if (!order_id || !order_code || !new_status) {
      return res.status(400).json({
        success: false,
        message: "order_id, order_code, dan new_status wajib diisi"
      });
    }

    const io = req.app.get("io");
    if (!io) {
      return res.status(500).json({
        success: false,
        message: "Socket.IO tidak tersedia"
      });
    }

    const { notifyOrderStatusChange } = require("../utils/notifications");
    await notifyOrderStatusChange(io, order_id, order_code, new_status, old_status);
    
    res.json({
      success: true,
      message: "Notifikasi status berhasil dikirim"
    });

  } catch (error) {
    console.error("? Error notify-status-change:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal mengirim notifikasi",
      error: error.message
    });
  }
});

/**
 * GET /api/internal/health
 * Health check untuk internal endpoint
 */
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Internal API is running",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;