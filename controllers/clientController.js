const db = require("../config/database");
const bcrypt = require("bcryptjs");

// ======================================================
// GET /api/clients ? Ambil semua pelanggan
// ======================================================
exports.getAllClients = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        id, full_name, username, email, phone, address, level, status, role, created_at 
      FROM client
      WHERE deleted_at IS NULL 
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("? Error getAllClients:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data pelanggan",
      error: err.message,
    });
  }
};

// ======================================================
// POST /api/clients ? Tambah pelanggan baru
// ======================================================
exports.createClient = async (req, res) => {
  try {
    const { full_name, email, phone, address, password, level } = req.body;

    // ? PERUBAHAN: Validasi tanpa username
    if (!full_name || !phone || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Nama lengkap, nomor HP, email, dan password wajib diisi",
      });
    }

    // ? PERUBAHAN: Generate username dari phone
    const username = phone.replace(/\D/g, ''); // Hanya ambil angka

    // Cek username / email / phone duplikat
    const [check] = await db.query(
      "SELECT id FROM client WHERE username = ? OR email = ? OR phone = ? LIMIT 1",
      [username, email, phone]
    );
    if (check.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Nomor HP atau email sudah digunakan",
      });
    }

    // Enkripsi password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Simpan data pelanggan baru
    await db.query(
      `INSERT INTO client 
        (full_name, username, email, phone, address, level, password, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'client', 'active', NOW())`,
      [
        full_name,
        username,  // ? username dari phone
        email,
        phone || null,
        address || null,
        level || "Topas",
        hashedPassword,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Pelanggan berhasil ditambahkan",
    });
  } catch (err) {
    console.error("? Error createClient:", err);
    res.status(500).json({
      success: false,
      message: "Gagal menambah pelanggan",
      error: err.message,
    });
  }
};
// ======================================================
// PUT /api/clients/:id ? Edit data pelanggan
// ======================================================
exports.updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    let { full_name, email, phone, address, password, level } = req.body;

    // Pastikan level dikirim dengan benar
    level = (level || "").trim();
    if (!["Topas", "Shapire", "Rubby"].includes(level)) {
      level = "Topas";
    }

    const [exist] = await db.query("SELECT id FROM client WHERE id = ?", [id]);
    if (exist.length === 0) {
      return res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }

    const query = `
      UPDATE client 
      SET full_name = ?, 
          email = ?, 
          phone = ?, 
          address = ?, 
          level = ?, 
          updated_at = NOW()
      WHERE id = ?
    `;
    const values = [full_name, email, phone, address, level, id];

    await db.query(query, values);

    res.json({
      success: true,
      message: `Pelanggan berhasil diperbarui (level: ${level})`,
    });
  } catch (err) {
    console.error("? Error updateClient:", err);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui data pelanggan",
      error: err.message,
    });
  }
};

// ======================================================
// DELETE /api/clients/:id ? Hapus pelanggan
// ======================================================
exports.deleteClient = async (req, res) => {
  try {
    const { id } = req.params;

    const [exist] = await db.query("SELECT id FROM client WHERE id=?", [id]);
    if (exist.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pelanggan tidak ditemukan",
      });
    }

    await db.query("DELETE FROM client WHERE id=?", [id]);

    res.json({
      success: true,
      message: "Pelanggan berhasil dihapus",
    });
  } catch (err) {
    console.error("? Error deleteClient:", err);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus pelanggan",
      error: err.message,
    });
  }
};

// ======================================================
// GET /api/clients/:id/transactions ? Riwayat transaksi pelanggan
// ======================================================
exports.getClientTransactions = async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;

    // Cek apakah client ada
    const [[client]] = await db.query(
      "SELECT id, full_name, phone, email, address, level FROM client WHERE id = ?",
      [id]
    );

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Pelanggan tidak ditemukan",
      });
    }

    // Build query dengan filter tanggal opsional
    let query = `
      SELECT 
        o.id,
        o.invoice_code AS order_code,
        o.invoice_code,
        DATE_FORMAT(o.order_date, '%d/%m/%Y') AS tanggal,
        DATE_FORMAT(o.order_date, '%H:%i:%s') AS jam,
        o.status,
        o.payment_status,
        o.total,
        o.via,
        (
          SELECT COUNT(*) 
          FROM order_items oi 
          WHERE oi.invoice_id = o.id
        ) AS total_items,
        (
          SELECT GROUP_CONCAT(
            CONCAT(oi.product_name, ' (', oi.qty, ')')
            SEPARATOR ', '
          )
          FROM order_items oi
          WHERE oi.invoice_id = o.id
        ) AS items_summary
      FROM orders o
      WHERE o.client_id = ?
    `;

    const params = [id];

    // Tambah filter tanggal jika ada
    if (start_date) {
      query += ` AND DATE(o.order_date) >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND DATE(o.order_date) <= ?`;
      params.push(end_date);
    }

    query += ` ORDER BY o.order_date DESC`;

    const [transactions] = await db.query(query, params);

    // Hitung total transaksi dan total nominal
    const totalTransaksi = transactions.length;
    const totalNominal = transactions.reduce((sum, t) => sum + parseFloat(t.total || 0), 0);

    res.json({
      success: true,
      data: {
        client,
        transactions,
        summary: {
          total_transaksi: totalTransaksi,
          total_nominal: totalNominal,
        },
      },
    });
  } catch (err) {
    console.error("? Error getClientTransactions:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil riwayat transaksi",
      error: err.message,
    });
  }
};