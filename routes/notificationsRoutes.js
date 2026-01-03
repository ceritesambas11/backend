// routes/notificationsRoutes.js
const express = require("express");
const router = express.Router();
const { 
  getNotifications, 
  markAsRead, 
  markAllAsRead,
  deleteNotification,
  createNotification
} = require("../controllers/notificationsController");
const { authenticate } = require("../middleware/auth");

// ======================================================
// INTERNAL API ENDPOINTS (Untuk Backend-to-Backend)
// ======================================================

/**
 * Middleware: Validate Internal API Key
 * Untuk request dari backend-customer ke backend-admin
 */
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.INTERNAL_API_KEY || 'rahasia-indiego-2026';

  console.log(`🔑 [INTERNAL API] Received key: ${apiKey ? '***' : 'NONE'}`);

  if (!apiKey || apiKey !== expectedKey) {
    console.error('❌ [INTERNAL API] Invalid or missing API key');
    return res.status(401).json({
      success: false,
      message: 'Unauthorized - Invalid API key'
    });
  }

  console.log('✅ [INTERNAL API] Valid API key');
  next();
};

/**
 * POST /api/notifications/customer-checkout
 * Endpoint untuk menerima notifikasi checkout dari backend-customer
 * Header: x-api-key (internal API key)
 */
router.post("/customer-checkout", validateApiKey, async (req, res) => {
  try {
    const { 
      order_id, 
      order_code, 
      customer_name, 
      total_amount, 
      items_count,
      additional_data 
    } = req.body;

    console.log(`📥 [CUSTOMER CHECKOUT] Received:`, {
      order_code,
      customer_name,
      total_amount
    });

    // Validasi required fields
    if (!order_code || !customer_name) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: order_code, customer_name'
      });
    }

    const title = `🛒 Pesanan Baru: ${order_code}`;
    const message = `${customer_name} melakukan checkout. Total: Rp ${(total_amount || 0).toLocaleString('id-ID')}${items_count ? ` (${items_count} item)` : ''}`;

    // ✅ Kirim FCM push notification ke semua admin
    let fcmSent = false;
    try {
      const fcmService = require("../services/fcmService");
      const fcmResult = await fcmService.sendNotificationToRole(
        'admin',
        title,
        message,
        {
          type: 'customer_checkout',
          order_id: order_id?.toString() || '',
          order_code: order_code,
          customer_name: customer_name,
          total_amount: total_amount?.toString() || '0',
          ...additional_data
        }
      );
      
      fcmSent = fcmResult?.success || false;
      console.log(`✅ [CUSTOMER CHECKOUT] FCM sent to admins:`, fcmResult);
    } catch (fcmError) {
      console.error(`⚠️ [CUSTOMER CHECKOUT] FCM failed:`, fcmError.message);
    }

    // ✅ Simpan ke database notifications
    try {
      const db = require("../config/database");
      await db.query(
        `INSERT INTO notifications 
         (order_id, type, title, message, target_role, is_read, created_at)
         VALUES (?, ?, ?, ?, 'admin', 0, NOW())`,
        [order_id || null, 'customer_checkout', title, message]
      );
      console.log(`✅ [CUSTOMER CHECKOUT] Saved to database`);
    } catch (dbError) {
      console.error(`⚠️ [CUSTOMER CHECKOUT] DB save failed:`, dbError.message);
    }

    // ✅ Emit via Socket.IO (jika ada)
    try {
      const io = req.app.get('io'); // Ambil Socket.IO instance
      if (io) {
        io.to('role_admin').emit('new_notification', {
          type: 'customer_checkout',
          title,
          message,
          order_code,
          order_id,
          created_at: new Date().toISOString()
        });
        console.log(`✅ [CUSTOMER CHECKOUT] Socket.IO emitted to role_admin`);
      }
    } catch (socketError) {
      console.error(`⚠️ [CUSTOMER CHECKOUT] Socket.IO failed:`, socketError.message);
    }

    res.json({
      success: true,
      message: 'Admin notified successfully',
      fcm_sent: fcmSent
    });

  } catch (error) {
    console.error('❌ [CUSTOMER CHECKOUT] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to notify admin',
      error: error.message
    });
  }
});

// ======================================================
// TEST ENDPOINT (Tanpa Authentication)
// ======================================================

/**
 * POST /api/notifications/test-push
 * Test endpoint untuk kirim push notification
 * Tidak perlu authentication - untuk testing saja
 */
router.post("/test-push", async (req, res) => {
  try {
    const fcmService = require("../services/fcmService");
    
    // Test kirim ke admin
    const result = await fcmService.sendNotificationToRole(
      "admin", 
      "?? Test Push Notification", 
      "Notifikasi berhasil dikirim dari backend!",
      { 
        test: "true",
        order_code: "TEST-001",
        timestamp: new Date().toISOString()
      }
    );
    
    res.json({ 
      success: true, 
      message: "Push notification sent to admin role",
      result 
    });
  } catch (error) {
    console.error("? Test push error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/notifications/test-push/:role
 * Test endpoint untuk kirim push notification ke role tertentu
 * Params: role (admin, operator, desainer, owner)
 */
router.post("/test-push", async (req, res) => {
  try {
    const fcmService = require("../services/fcmService");
    
    // Test kirim ke admin
    const result = await fcmService.sendNotificationToRole(
      "admin", 
      "🔔 Test Push Notification", 
      "Notifikasi berhasil dikirim dari backend!",
      { 
        test: "true",
        order_code: "TEST-001",
        timestamp: new Date().toISOString()
      }
    );
    
    res.json({ 
      success: true, 
      message: "Push notification sent to admin role",
      result 
    });
  } catch (error) {
    console.error("❌ Test push error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/notifications/test-push/:role
 * Test endpoint untuk kirim push notification ke role tertentu
 * Params: role (admin, operator, desainer, owner)
 */
router.post("/test-push/:role", async (req, res) => {
  try {
    const { role } = req.params;
    const fcmService = require("../services/fcmService");
    
    // Validasi role
    const validRoles = ["admin", "operator", "desainer", "owner"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${validRoles.join(", ")}`
      });
    }
    
    const result = await fcmService.sendNotificationToRole(
      role, 
      `🔔 Test untuk ${role.toUpperCase()}`, 
      `Notifikasi test berhasil dikirim ke role ${role}!`,
      { 
        test: "true",
        target_role: role,
        timestamp: new Date().toISOString()
      }
    );
    
    res.json({ 
      success: true, 
      message: `Push notification sent to ${role} role`,
      result 
    });
  } catch (error) {
    console.error("❌ Test push error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});


// ======================================================
// NOTIFICATION ROUTES (Protected dengan JWT)
// ======================================================

/**
 * GET /api/notifications
 * Ambil notifikasi berdasarkan role user yang login
 * Query params: ?unread=true&limit=20
 */
router.get("/", authenticate, getNotifications);

/**
 * PUT /api/notifications/:id/read
 * Tandai single notification sebagai sudah dibaca
 */
router.put("/:id/read", authenticate, markAsRead);

/**
 * PUT /api/notifications/read-all
 * Tandai semua notifikasi sebagai sudah dibaca
 */
router.put("/read-all", authenticate, markAllAsRead);

/**
 * DELETE /api/notifications/:id
 * Hapus notifikasi
 */
router.delete("/:id", authenticate, deleteNotification);

/**
 * POST /api/notifications/send
 * Kirim notifikasi baru (simpan ke DB + kirim push notification)
 * Body: { order_id, type, title, message, target_role }
 */
router.post("/send", authenticate, createNotification);

module.exports = router;