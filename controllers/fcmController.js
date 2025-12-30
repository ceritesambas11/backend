const db = require("../config/database");

/**
 * POST /api/fcm/register
 * Register FCM token dari Android app
 */
exports.registerToken = async (req, res) => {
  try {
    const { token, device_info } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "FCM token wajib diisi"
      });
    }

    if (!userId || !userRole) {
      return res.status(401).json({
        success: false,
        message: "User tidak terautentikasi"
      });
    }

    // Cek apakah token sudah ada
    const [existing] = await db.query(
      "SELECT id FROM fcm_tokens WHERE token = ?",
      [token]
    );

    if (existing.length > 0) {
      // Update user_id dan role jika token sudah ada
      await db.query(
        "UPDATE fcm_tokens SET user_id = ?, role = ?, device_info = ?, updated_at = NOW() WHERE token = ?",
        [userId, userRole, device_info, token]
      );

      return res.json({
        success: true,
        message: "FCM token berhasil diupdate"
      });
    }

    // Insert token baru
    await db.query(
      "INSERT INTO fcm_tokens (user_id, role, token, device_info) VALUES (?, ?, ?, ?)",
      [userId, userRole, token, device_info]
    );

    res.json({
      success: true,
      message: "FCM token berhasil didaftarkan"
    });
  } catch (err) {
    console.error("❌ Gagal register FCM token:", err.message);
    res.status(500).json({
      success: false,
      message: "Gagal register FCM token",
      error: err.message
    });
  }
};

/**
 * DELETE /api/fcm/unregister
 * Hapus FCM token (saat user logout)
 */
exports.unregisterToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "FCM token wajib diisi"
      });
    }

    const [result] = await db.query(
      "DELETE FROM fcm_tokens WHERE token = ?",
      [token]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Token tidak ditemukan"
      });
    }

    res.json({
      success: true,
      message: "FCM token berhasil dihapus"
    });
  } catch (err) {
    console.error("❌ Gagal unregister FCM token:", err.message);
    res.status(500).json({
      success: false,
      message: "Gagal unregister FCM token",
      error: err.message
    });
  }
};
