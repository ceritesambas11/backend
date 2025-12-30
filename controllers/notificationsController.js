// controllers/notificationsController.js
const db = require("../config/database");
const { sendNotificationToRole } = require("../services/fcmService");

/**
 * GET /api/notifications
 * Ambil notifikasi berdasarkan role user yang login
 * Query params:
 * - unread: "true" untuk hanya ambil yang belum dibaca
 * - limit: jumlah notifikasi (default 50)
 */
exports.getNotifications = async (req, res) => {
  try {
    const { unread, limit = 50 } = req.query;
    
    // ? Ambil role dari token JWT (req.user sudah di-set oleh middleware auth)
    const userRole = req.user?.role;

    if (!userRole) {
      return res.status(400).json({ 
        success: false, 
        message: "Role tidak ditemukan. Login terlebih dahulu." 
      });
    }

    let query = `
      SELECT 
        n.id,
        n.order_id,
        n.type,
        n.title,
        n.message,
        n.target_role,
        n.is_read,
        n.created_at,
        o.invoice_code,
        o.client_name,
        o.status AS order_status,
        GROUP_CONCAT(DISTINCT oi.order_code ORDER BY oi.order_code SEPARATOR ', ') AS order_codes
      FROM notifications n
      LEFT JOIN orders o ON n.order_id = o.id
      LEFT JOIN order_items oi ON o.id = oi.invoice_id
      WHERE n.target_role = ?
    `;
    
    const params = [userRole];

    // Filter hanya yang belum dibaca
    if (unread === "true") {
      query += " AND n.is_read = 0";
    }

    query += " GROUP BY n.id ORDER BY n.created_at DESC LIMIT ?";
    params.push(parseInt(limit));

    const [rows] = await db.query(query, params);

    // Hitung total unread
    const [[{ unread_count }]] = await db.query(
      `SELECT COUNT(*) as unread_count 
       FROM notifications 
       WHERE target_role = ? AND is_read = 0`,
      [userRole]
    );

    res.json({
      success: true,
      data: rows,
      unread_count,
      total: rows.length
    });
  } catch (err) {
    console.error("? Gagal ambil notifikasi:", err.message);
    res.status(500).json({ 
      success: false, 
      message: "Gagal ambil notifikasi",
      error: err.message 
    });
  }
};

/**
 * PUT /api/notifications/:id/read
 * Tandai notifikasi sebagai sudah dibaca
 */
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.query(
      "UPDATE notifications SET is_read = 1 WHERE id = ?", 
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Notifikasi tidak ditemukan" 
      });
    }

    res.json({ 
      success: true,
      message: "Notifikasi berhasil ditandai sebagai dibaca"
    });
  } catch (err) {
    console.error("? Gagal update notifikasi:", err.message);
    res.status(500).json({ 
      success: false, 
      message: "Gagal update notifikasi",
      error: err.message 
    });
  }
};

/**
 * PUT /api/notifications/read-all
 * Tandai semua notifikasi sebagai sudah dibaca (berdasarkan role user)
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const userRole = req.user?.role;

    if (!userRole) {
      return res.status(400).json({ 
        success: false, 
        message: "Role tidak ditemukan" 
      });
    }

    const [result] = await db.query(
      "UPDATE notifications SET is_read = 1 WHERE target_role = ? AND is_read = 0",
      [userRole]
    );

    res.json({ 
      success: true,
      message: `${result.affectedRows} notifikasi berhasil ditandai sebagai dibaca`
    });
  } catch (err) {
    console.error("? Gagal update semua notifikasi:", err.message);
    res.status(500).json({ 
      success: false, 
      message: "Gagal update notifikasi",
      error: err.message 
    });
  }
};

/**
 * DELETE /api/notifications/:id
 * Hapus notifikasi (optional, jika perlu)
 */
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.query(
      "DELETE FROM notifications WHERE id = ?", 
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Notifikasi tidak ditemukan" 
      });
    }

    res.json({ 
      success: true,
      message: "Notifikasi berhasil dihapus"
    });
  } catch (err) {
    console.error("? Gagal hapus notifikasi:", err.message);
    res.status(500).json({ 
      success: false, 
      message: "Gagal hapus notifikasi",
      error: err.message 
    });
  }
};
/**
 * POST /api/notifications/send
 * Kirim notifikasi baru (simpan ke DB + kirim push notification)
 * Body: { order_id, type, title, message, target_role }
 */
exports.createNotification = async (req, res) => {
  try {
    const { order_id, type, title, message, target_role } = req.body;

    // Validasi
    if (!title || !message || !target_role) {
      return res.status(400).json({
        success: false,
        message: "Title, message, dan target_role wajib diisi"
      });
    }

    // 1. Simpan ke database
    const [result] = await db.query(
      `INSERT INTO notifications (order_id, type, title, message, target_role) 
       VALUES (?, ?, ?, ?, ?)`,
      [order_id, type, title, message, target_role]
    );

    // 2. Kirim push notification via FCM
    try {
      await sendNotificationToRole(target_role, title, message, {
        notification_id: result.insertId.toString(),
        order_id: order_id ? order_id.toString() : "",
        type: type || ""
      });
    } catch (fcmError) {
      console.error("?? Push notification gagal, tapi notif DB sudah tersimpan:", fcmError.message);
    }

    res.json({
      success: true,
      message: "Notifikasi berhasil dikirim",
      notification_id: result.insertId
    });
  } catch (err) {
    console.error("? Gagal create notifikasi:", err.message);
    res.status(500).json({
      success: false,
      message: "Gagal create notifikasi",
      error: err.message
    });
  }
};