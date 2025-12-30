const db = require("../config/database");
const { notifyOrderStatusChange } = require("../utils/notifications");

// ====================================================
// UPDATE ITEM STATUS (untuk tombol di dashboard)
// ====================================================
exports.updateItemStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validasi status yang dibolehkan
    const allowedStatuses = ['Admin', 'Di Desain', 'Proses Desain', 'Operator', 'Proses Cetak', 'Acc Admin', 'Selesai', 'Dikirim', 'Sudah Diambil', 'Batal'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status tidak valid. Harus salah satu dari: ${allowedStatuses.join(', ')}`
      });
    }

    // Ambil item dan invoice_id
    const [[item]] = await db.query(
      "SELECT invoice_id, order_code, status FROM order_items WHERE id = ?", 
      [id]
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item tidak ditemukan"
      });
    }

    const oldStatus = item.status;

    // Update status item
    await db.query(
      "UPDATE order_items SET status = ? WHERE id = ?",
      [status, id]
    );

    // Simpan ke riwayat order
    await db.query(
      `INSERT INTO order_history (order_id, status, deskripsi, tanggal)
       VALUES (?,?,?,NOW())`,
      [
        item.invoice_id,
        status,
        `Status order ${item.order_code} diubah dari "${oldStatus}" ke "${status}"`
      ]
    );

    // Cek apakah semua item dalam invoice punya status yang sama
    const [[statusCheck]] = await db.query(
      `SELECT COUNT(DISTINCT status) as unique_count,
              (SELECT status FROM order_items WHERE invoice_id = ? LIMIT 1) as sample_status
       FROM order_items 
       WHERE invoice_id = ?`,
      [item.invoice_id, item.invoice_id]
    );

    // Jika semua item punya status yang sama, update status invoice
    if (statusCheck.unique_count === 1) {
      const [[invoice]] = await db.query(
        `SELECT status, invoice_code FROM orders WHERE id = ?`,
        [item.invoice_id]
      );

      if (invoice && invoice.status !== statusCheck.sample_status) {
        await db.query(
          "UPDATE orders SET status = ? WHERE id = ?",
          [statusCheck.sample_status, item.invoice_id]
        );

        await db.query(
          `INSERT INTO order_history (order_id, status, deskripsi, tanggal)
           VALUES (?,?,?,NOW())`,
          [
            item.invoice_id,
            statusCheck.sample_status,
            `Status invoice ${invoice.invoice_code} otomatis diubah ke "${statusCheck.sample_status}" (semua order selesai)`
          ]
        );

        // Notifikasi
        try {
          const io = req.app?.get?.("io");
          if (io) {
            await notifyOrderStatusChange(
              io,
              item.invoice_id,
              invoice.invoice_code,
              statusCheck.sample_status,
              invoice.status
            );
          }
        } catch (e) {
          console.error("Notification error:", e);
        }
      }
    }

    res.json({
      success: true,
      message: "Status item berhasil diperbarui"
    });

  } catch (err) {
    console.error("updateItemStatus ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Gagal update status item"
    });
  }
};

// ====================================================
// GET ITEM BY ID
// ====================================================
exports.getItemById = async (req, res) => {
  try {
    const { id } = req.params;

    const [[item]] = await db.query(`
      SELECT 
        oi.id,
        oi.invoice_id,
        oi.order_code,
        oi.product_id,
        oi.product_name,
        oi.unit,
        oi.price,
        oi.p AS panjang,
        oi.l AS lebar,
        oi.qty,
        oi.finishing,
        oi.nama_file,
        oi.keterangan,
        oi.subtotal,
        oi.status,
        oi.desainer,
        desainer_user.full_name AS desainer_full_name,
        oi.operator,
        operator_user.full_name AS operator_full_name,
        oi.admin,
        admin_user.full_name AS admin_full_name,
        oi.created_at
      FROM order_items oi
      LEFT JOIN users desainer_user ON oi.desainer = desainer_user.id
      LEFT JOIN users operator_user ON oi.operator = operator_user.id
      LEFT JOIN users admin_user ON oi.admin = admin_user.id
      WHERE oi.id = ?
    `, [id]);

    if (!item) {
      return res.status(404).json({ 
        success: false, 
        message: "Item tidak ditemukan" 
      });
    }

    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error("Error getItemById:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil detail item",
      error: error.message
    });
  }
};

// ====================================================
// UPDATE ITEM (semua field)
// ====================================================
exports.updateItem = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;
    const { 
      operator, 
      status, 
      qty, 
      panjang, 
      lebar, 
      finishing, 
      nama_file, 
      keterangan, 
      subtotal 
    } = req.body;

    const user_name = req.user?.full_name || req.user?.username || 'System';

    // Ambil data item sebelumnya
    const [[prevItem]] = await conn.query(
      `SELECT 
        oi.invoice_id, 
        oi.order_code,
        oi.operator, 
        oi.status, 
        oi.qty, 
        oi.p, 
        oi.l, 
        oi.finishing, 
        oi.nama_file, 
        oi.keterangan, 
        oi.subtotal,
        operator_user.full_name AS operator_full_name
       FROM order_items oi
       LEFT JOIN users operator_user ON oi.operator = operator_user.id
       WHERE oi.id = ?`,
      [id]
    );

    if (!prevItem) {
      return res.status(404).json({ 
        success: false, 
        message: "Item tidak ditemukan" 
      });
    }

    await conn.beginTransaction();

    // Update item (operator adalah user_id INT, bukan username)
    await conn.query(
      `UPDATE order_items 
       SET operator = COALESCE(?, operator),
           status = COALESCE(?, status),
           qty = COALESCE(?, qty),
           p = COALESCE(?, p),
           l = COALESCE(?, l),
           finishing = COALESCE(?, finishing),
           nama_file = COALESCE(?, nama_file),
           keterangan = COALESCE(?, keterangan),
           subtotal = COALESCE(?, subtotal)
       WHERE id = ?`,
      [operator, status, qty, panjang, lebar, finishing, nama_file, keterangan, subtotal, id]
    );

    // Log perubahan operator
    if (operator && operator !== prevItem.operator) {
      // operator sekarang adalah user_id (INT), bukan username
      const [[newOperator]] = await conn.query(
        `SELECT full_name FROM users WHERE id = ?`,
        [operator]
      );
      const newOperatorName = newOperator?.full_name || 'Unknown';
      const prevOperatorName = prevItem.operator_full_name || 'Belum ditugaskan';

      await conn.query(
        `INSERT INTO order_history (order_id, status, deskripsi, tanggal)
         VALUES (?, ?, ?, NOW())`,
        [
          prevItem.invoice_id,
          "Operator",
          `Operator order ${prevItem.order_code} ${prevItem.operator ? `diubah dari "${prevOperatorName}" ke` : 'ditugaskan:'} "${newOperatorName}" oleh ${user_name}`
        ]
      );
    }

    // Log perubahan status
    if (status && status !== prevItem.status) {
      await conn.query(
        `INSERT INTO order_history (order_id, status, deskripsi, tanggal)
         VALUES (?, ?, ?, NOW())`,
        [
          prevItem.invoice_id,
          status,
          `Status order ${prevItem.order_code} diubah dari "${prevItem.status}" ke "${status}" oleh ${user_name}`
        ]
      );
    }

    await conn.commit();

    res.json({
      success: true,
      message: "Item berhasil diperbarui"
    });
  } catch (error) {
    await conn.rollback();
    console.error("Error updateItem:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengupdate item",
      error: error.message
    });
  } finally {
    conn.release();
  }
};

// ====================================================
// DELETE ITEM
// ====================================================
exports.deleteItem = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;
    const user_name = req.user?.full_name || req.user?.username || 'System';

    const [[item]] = await conn.query(
      `SELECT invoice_id, order_code, product_name FROM order_items WHERE id = ?`,
      [id]
    );

    if (!item) {
      return res.status(404).json({ 
        success: false, 
        message: "Item tidak ditemukan" 
      });
    }

    await conn.beginTransaction();

    await conn.query(`DELETE FROM order_items WHERE id = ?`, [id]);

    await conn.query(
      `INSERT INTO order_history (order_id, status, deskripsi, tanggal)
       VALUES (?, ?, ?, NOW())`,
      [
        item.invoice_id,
        "Hapus Item",
        `Order "${item.product_name}" (${item.order_code}) dihapus oleh ${user_name}`
      ]
    );

    // Cek apakah masih ada item lain
    const [[itemCount]] = await conn.query(
      `SELECT COUNT(*) as total FROM order_items WHERE invoice_id = ?`,
      [item.invoice_id]
    );

    if (itemCount.total === 0) {
      // Jika tidak ada item lagi, hapus invoice
      await conn.query(`DELETE FROM orders WHERE id = ?`, [item.invoice_id]);
      await conn.query(`DELETE FROM order_history WHERE order_id = ?`, [item.invoice_id]);
      
      await conn.commit();
      return res.json({
        success: true,
        message: "Item terakhir dihapus, invoice juga dihapus"
      });
    }

    // Recalculate total invoice
    const [[orderTotal]] = await conn.query(
      `SELECT SUM(subtotal) as new_total FROM order_items WHERE invoice_id = ?`,
      [item.invoice_id]
    );

    await conn.query(
      `UPDATE orders SET total = ? WHERE id = ?`,
      [orderTotal.new_total || 0, item.invoice_id]
    );

    await conn.commit();

    res.json({
      success: true,
      message: "Item berhasil dihapus"
    });
  } catch (error) {
    await conn.rollback();
    console.error("Error deleteItem:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus item",
      error: error.message
    });
  } finally {
    conn.release();
  }
};

// ====================================================
// GET ITEMS BY ORDER ID (INVOICE ID)
// ====================================================
exports.getItemsByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;

    const [items] = await db.query(`
      SELECT 
        oi.id,
        oi.invoice_id,
        oi.order_code,
        oi.product_id,
        oi.product_name,
        oi.unit,
        oi.price,
        oi.p AS panjang,
        oi.l AS lebar,
        oi.qty,
        oi.finishing,
        oi.nama_file,
        oi.keterangan,
        oi.subtotal,
        oi.status,
        oi.desainer,
        desainer_user.full_name AS desainer_full_name,
        oi.operator,
        operator_user.full_name AS operator_full_name,
        oi.admin,
        admin_user.full_name AS admin_full_name,
        oi.created_at
      FROM order_items oi
      LEFT JOIN users desainer_user ON oi.desainer = desainer_user.id
      LEFT JOIN users operator_user ON oi.operator = operator_user.id
      LEFT JOIN users admin_user ON oi.admin = admin_user.id
      WHERE oi.invoice_id = ?
      ORDER BY oi.id ASC
    `, [orderId]);

    res.json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error("Error getItemsByOrderId:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil items",
      error: error.message
    });
  }
};

module.exports = exports;