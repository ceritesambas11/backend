// controllers/paymentController.js
const db = require("../config/database");

// ====================================================
// LIST SEMUA PEMBAYARAN
// ====================================================
exports.listPayments = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        p.id,
        p.invoice_code,
        p.amount,
        p.method,
        p.paid_at,
        p.updated_at,
        p.admin AS admin_id,
        u.full_name AS admin_name,
        o.client_name,
        o.phone AS client_phone,
        o.status AS order_status,
        o.payment_status,
        o.total,
        DATE_FORMAT(o.tanggal, '%d/%m/%Y') AS order_date
      FROM payments p
      LEFT JOIN orders o ON o.invoice_code = p.invoice_code
      LEFT JOIN users u ON u.id = p.admin
      ORDER BY p.created_at DESC
    `);

    res.json({ success: true, data: rows });

  } catch (err) {
    console.error("? Error listPayments:", err);
    res.status(500).json({ success: false, message: "Gagal ambil data pembayaran" });
  }
};


// ====================================================
// AMBIL PEMBAYARAN BERDASARKAN ORDER ID (INVOICE ID)
// ====================================================
exports.getPaymentsByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Ambil invoice_code dari orders
    const [[invoice]] = await db.query(
      `SELECT invoice_code FROM orders WHERE id = ?`,
      [orderId]
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice tidak ditemukan"
      });
    }

    // Ambil pembayaran berdasarkan invoice_code
    const [rows] = await db.query(`
      SELECT
        p.id,
        p.invoice_code,
        p.amount,
        p.method AS payment_method,
        p.paid_at,
        p.created_at,
        p.updated_at,
        p.admin AS admin_id,
        u.full_name AS admin_name
      FROM payments p
      LEFT JOIN users u ON u.id = p.admin
      WHERE p.invoice_code = ?
      ORDER BY p.created_at ASC
    `, [invoice.invoice_code]);

    res.json({ success: true, data: rows });

  } catch (err) {
    console.error("? Error getPaymentsByOrder:", err);
    res.status(500).json({
      success: false,
      message: "Gagal ambil data pembayaran per order"
    });
  }
};


// ====================================================
// CREATE PAYMENT (pakai order_id/invoice_id)
// ====================================================
exports.createPayment = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { order_id, amount, method } = req.body;
    const admin = req.user.id;

    if (!order_id || !amount || !method) {
      return res.status(400).json({
        success: false,
        message: "order_id, amount, method wajib diisi",
      });
    }

    // Ambil order berdasarkan id (invoice_id)
    const [[order]] = await conn.query(
      `SELECT id, invoice_code, total 
       FROM orders WHERE id = ?`,
      [order_id]
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Invoice tidak ditemukan"
      });
    }

    await conn.beginTransaction();

    // Insert pembayaran baru
    await conn.query(
      `INSERT INTO payments 
         (invoice_code, amount, method, admin, paid_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [order.invoice_code, amount, method, admin]
    );

    // Hitung total pembayaran
    const [[totalPaid]] = await conn.query(
      `SELECT SUM(amount) as total_paid FROM payments WHERE invoice_code = ?`,
      [order.invoice_code]
    );

    const paid = totalPaid.total_paid || 0;
    
    // Update status pembayaran
    let paymentStatus = 'Belum Lunas';
    if (paid >= order.total) {
      paymentStatus = 'Lunas';
    } else if (paid > 0) {
      paymentStatus = 'DP';
    }

    await conn.query(
      `UPDATE orders
       SET payment_status = ?, updated_at = NOW()
       WHERE id = ?`,
      [paymentStatus, order_id]
    );

    // Insert history
    await conn.query(
      `INSERT INTO order_history (order_id, status, deskripsi, tanggal)
       VALUES (?, ?, ?, NOW())`,
      [order_id, 'Pembayaran', `Pembayaran ${method} sebesar Rp ${amount.toLocaleString('id-ID')}`]
    );

    await conn.commit();

    res.json({ success: true, message: "Pembayaran berhasil disimpan" });

  } catch (err) {
    await conn.rollback();
    console.error("? Error createPayment:", err);
    res.status(500).json({
      success: false,
      message: "Gagal menambah pembayaran",
      error: err.message,
    });
  } finally {
    conn.release();
  }
};


// ====================================================
// HAPUS PEMBAYARAN
// ====================================================
exports.deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM payments WHERE id = ?`, [id]);
    res.json({ success: true, message: "Pembayaran dihapus" });
  } catch (err) {
    console.error("? Error deletePayment:", err);
    res.status(500).json({
      success: false,
      message: "Gagal hapus pembayaran",
    });
  }
};


// ====================================================
// STATISTIK PEMBAYARAN HARI INI
// ====================================================
exports.getPaymentStats = async (req, res) => {
  try {
    const [[data]] = await db.query(`
      SELECT
        COUNT(*) AS total_transaksi,
        SUM(amount) AS total_pembayaran,
        COUNT(DISTINCT invoice_code) AS invoice_terbayar
      FROM payments
      WHERE DATE(updated_at) = CURDATE()
    `);

    res.json({ success: true, data });

  } catch (err) {
    console.error("? Error getPaymentStats:", err);
    res.status(500).json({
      success: false,
      message: "Gagal ambil statistik pembayaran"
    });
  }
};