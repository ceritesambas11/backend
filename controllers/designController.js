const db = require("../config/database");
const { notifyOrderStatusChange, notifyOrderCanceled } = require("../utils/notifications");

// =====================================================
// GET /api/designs   Ambil data dari order_items
// =====================================================
exports.getAllDesigns = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        oi.id AS item_id,
        oi.order_code,
        o.id AS invoice_id,
        o.invoice_code,
        COALESCE(o.client_name, c.full_name, 'Unknown Client') AS customer_name,
        COALESCE(c.phone, '-') AS customer_phone,
        DATE_FORMAT(COALESCE(o.created_at, NOW()), '%d/%m/%Y') AS tanggal,
        p.name AS product_name,
        oi.p,
        oi.l,
        CONCAT(oi.p, 'x', oi.l, ' m') AS ukuran,
        oi.qty,
        COALESCE(oi.finishing, '-') AS finishing,
        COALESCE(oi.nama_file, '-') AS nama_file,
        COALESCE(desainer_user.full_name, '-') AS designer_name,
        COALESCE(oi.keterangan, '-') AS keterangan,
        oi.status
      FROM order_items oi
      JOIN orders o ON oi.invoice_id = o.id
      LEFT JOIN client c ON o.client_id = c.id
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN users desainer_user ON oi.desainer = desainer_user.id
      WHERE oi.status IN ('Di Desain', 'Proses Desain')
      ORDER BY oi.id DESC
    `);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error getAllDesigns:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data desain",
      error: error.message,
    });
  }
};

// =====================================================
// POST /api/designs/kerjakan   Desainer mulai mengerjakan
// =====================================================
exports.startDesign = async (req, res) => {
  try {
    const { item_id, order_id } = req.body; 
    const itemId = item_id || order_id; // Support both for backward compatibility
    
    if (!itemId) {
      return res.status(400).json({ 
        success: false, 
        message: "item_id atau order_id harus diisi" 
      });
    }
    
    const designerId = req.user.id; 

    if (!designerId) {
       return res
        .status(401)
        .json({ success: false, message: "User tidak terotentikasi" });
    }

    const [[designer]] = await db.query(
      `SELECT full_name, username FROM users WHERE id = ?`,
      [designerId]
    );

    if (!designer) {
      return res
        .status(404)
        .json({ success: false, message: "Data desainer tidak ditemukan" });
    }

    const designerName = designer.full_name || designer.username;

    // Ambil item dan invoice_id
    const [[item]] = await db.query(
      `SELECT id, invoice_id, order_code FROM order_items WHERE id = ?`,
      [itemId]
    );
    
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Item tidak ditemukan" });
    }

    // Update item berdasarkan item_id - ISI DENGAN ID (bukan name)
    await db.query(
      `UPDATE order_items 
       SET status='Proses Desain', desainer=? 
       WHERE id=?`,
      [designerId, itemId]  // ? Pakai designerId (INT), bukan designerName
    );

    // Cek apakah semua item dalam invoice sudah dikerjakan
    const [[remaining]] = await db.query(
      `SELECT COUNT(*) as sisa 
       FROM order_items 
       WHERE invoice_id=? AND status='Di Desain'`,
      [item.invoice_id]
    );

    // Jika semua item sudah mulai dikerjakan, update status invoice
    if (remaining.sisa === 0) {
      await db.query(
        `UPDATE orders 
         SET status='Proses Desain' 
         WHERE id=?`,
        [item.invoice_id]
      );
    }

    // Insert history
    await db.query(
      `INSERT INTO order_history (order_id, status, deskripsi, tanggal)
       VALUES (?, ?, ?, NOW())`,
      [item.invoice_id, 'Proses Desain', `Order ${item.order_code} dikerjakan oleh ${designerName}`]
    );

    res.json({
      success: true,
      message: `Order ${item.order_code} sedang dikerjakan oleh kamu`,
    });
  } catch (error) {
    console.error("Error startDesign:", error);
    res.status(500).json({
      success: false,
      message: "Gagal memulai desain",
      error: error.message,
    });
  }
};

// =====================================================
// DELETE /api/designs/kirim/:item_id   Kirim ke Admin per item
// =====================================================
exports.finishDesign = async (req, res) => {
  try {
    const { item_id } = req.params;

    const [result] = await db.query(
      `UPDATE order_items 
       SET status='Acc Admin' 
       WHERE id=? AND status='Proses Desain'`,
      [item_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Item tidak ditemukan atau belum dalam status 'Proses Desain'",
      });
    }

    // Ambil invoice_id dari item
    const [[item]] = await db.query(
      `SELECT invoice_id, order_code FROM order_items WHERE id=?`,
      [item_id]
    );
    
    if (item && item.invoice_id) {
      // Cek apakah masih ada item yang belum selesai
      const [[remaining]] = await db.query(
        `SELECT COUNT(*) AS sisa 
         FROM order_items 
         WHERE invoice_id=? AND status IN ('Di Desain','Proses Desain')`,
        [item.invoice_id]
      );

      // Jika semua item sudah selesai, update status invoice
      if (remaining.sisa === 0) {
        const [[invoiceData]] = await db.query(
          `SELECT id, invoice_code, status FROM orders WHERE id=?`,
          [item.invoice_id]
        );

        const oldStatus = invoiceData?.status;

        await db.query(
          `UPDATE orders SET status='Acc Admin' WHERE id=?`,
          [item.invoice_id]
        );

        try {
          const io = req.app.get("io");
          if (io && invoiceData) {
            await notifyOrderStatusChange(
              io,
              invoiceData.id,
              invoiceData.invoice_code,
              "Acc Admin",
              oldStatus
            );
          }
        } catch (notifError) {
          console.error("Gagal kirim notifikasi:", notifError.message);
        }
      }
    }

    res.json({
      success: true,
      message: `Desain order ${item.order_code} dikirim ke admin (status: Acc Admin)`,
    });
  } catch (error) {
    console.error("Error finishDesign:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengirim desain",
      error: error.message,
    });
  }
};

// =====================================================
// DELETE /api/designs/batal/:item_id   Batalkan Desain per Item
// =====================================================
exports.cancelDesign = async (req, res) => {
  try {
    const { item_id } = req.params;

    // Ambil item dan invoice_id
    const [[item]] = await db.query(
      `SELECT invoice_id, order_code FROM order_items WHERE id=?`,
      [item_id]
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item tidak ditemukan"
      });
    }

    // Update item berdasarkan item_id
    await db.query(
      `UPDATE order_items 
       SET status='Batal' 
       WHERE id=? AND status IN ('Di Desain','Proses Desain')`,
      [item_id]
    );

    // Cek apakah ada item lain yang masih aktif
    const [[activeItems]] = await db.query(
      `SELECT COUNT(*) as total 
       FROM order_items 
       WHERE invoice_id=? AND status NOT IN ('Batal')`,
      [item.invoice_id]
    );

    // Jika semua item dibatalkan, update status invoice jadi Batal
    if (activeItems.total === 0) {
      const [[invoiceData]] = await db.query(
        `SELECT id, invoice_code FROM orders WHERE id=?`,
        [item.invoice_id]
      );

      await db.query(
        `UPDATE orders 
         SET status='Batal' 
         WHERE id=?`,
        [item.invoice_id]
      );

      // ?? KIRIM NOTIFIKASI KE OWNER
      try {
        const io = req.app.get("io");
        if (io && invoiceData) {
          const userName = req.user.full_name || req.user.username || 'Desainer';
          await notifyOrderCanceled(
            io,
            invoiceData.id,
            invoiceData.invoice_code,
            userName,
            'Desainer'
          );
          console.log(`?? Notifikasi pembatalan dikirim ke Owner: ${invoiceData.invoice_code}`);
        }
      } catch (notifError) {
        console.error("?? Gagal kirim notifikasi:", notifError.message);
      }
    }

    res.json({
      success: true,
      message: `Order ${item.order_code} dibatalkan`,
    });
  } catch (error) {
    console.error("Error cancelDesign:", error);
    res.status(500).json({
      success: false,
      message: "Gagal membatalkan desain",
      error: error.message,
    });
  }
};