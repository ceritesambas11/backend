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
      `?? Test untuk ${role.toUpperCase()}`, 
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
    console.error("? Test push error:", error);
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