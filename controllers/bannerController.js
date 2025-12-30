const fs = require("fs");
const path = require("path");
const db = require("../config/database");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "banners");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ===============================
// ?? Ambil semua banner
// ===============================
exports.getAllBanners = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM banners ORDER BY order_index ASC, id DESC"
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal mengambil data banner", error: err.message });
  }
};

// ===============================
// ?? Upload banner baru
// ===============================
exports.uploadBanner = async (req, res) => {
  try {
    const { title, description } = req.body;

    // ?? Batas maksimum 5 banner aktif
    const [[count]] = await db.query("SELECT COUNT(*) AS total FROM banners WHERE is_active = 1");
    if (count.total >= 5) {
      return res.status(400).json({
        success: false,
        message: "Maksimum 5 banner aktif diizinkan. Nonaktifkan salah satu untuk menambah baru."
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada file yang diupload" });
    }

    for (const file of req.files) {
      const filePath = `uploads/banners/${file.filename}`;
      await db.query(
        `INSERT INTO banners (title, description, image_url, is_active, order_index)
         VALUES (?, ?, ?, 1, 0)`,
        [title || "-", description || "-", filePath]
      );
    }

    res.status(201).json({ success: true, message: "Banner berhasil diupload" });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ success: false, message: "Gagal upload banner" });
  }
};

// ===============================
// ??? Hapus banner
// ===============================
exports.deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const [[banner]] = await db.query("SELECT * FROM banners WHERE id=?", [id]);
    if (!banner) return res.status(404).json({ success: false, message: "Banner tidak ditemukan" });

    const filePath = path.join(__dirname, "..", banner.image_url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await db.query("DELETE FROM banners WHERE id=?", [id]);
    res.json({ success: true, message: "Banner berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal menghapus banner" });
  }
};

// ===============================
// ?? Update status aktif / urutan
// ===============================
exports.updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, order_index } = req.body;

    // Jika ingin mengaktifkan, pastikan tidak lebih dari 5 aktif
    if (is_active === 1) {
      const [[count]] = await db.query("SELECT COUNT(*) AS total FROM banners WHERE is_active = 1");
      if (count.total >= 5) {
        return res.status(400).json({
          success: false,
          message: "Hanya maksimal 5 banner yang boleh aktif."
        });
      }
    }

    await db.query(
      `UPDATE banners SET 
        is_active = COALESCE(?, is_active),
        order_index = COALESCE(?, order_index)
       WHERE id = ?`,
      [is_active, order_index, id]
    );

    res.json({ success: true, message: "Banner berhasil diperbarui" });
  } catch (err) {
    console.error("Error updateBanner:", err);
    res.status(500).json({ success: false, message: "Gagal memperbarui banner" });
  }
};
