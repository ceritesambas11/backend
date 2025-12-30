const db = require("../config/database");
const { notifyOrderStatusChange, notifyOrderCanceled } = require("../utils/notifications");

/* ===========================================================
   GET: Semua Order untuk Operator
   =========================================================== */
exports.getAllOperators = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        oi.id AS item_id,
        oi.order_code,
        o.id AS invoice_id,
        o.invoice_code,
        COALESCE(o.client_name, c.full_name, 'Unknown Client') AS client_name,
        COALESCE(c.phone, '-') AS customer_phone,
        COALESCE(c.full_name, o.client_name, 'Unknown') AS customer_full_name,
        DATE_FORMAT(COALESCE(o.created_at, NOW()), '%d/%m/%Y') AS tanggal,
        p.name AS product_name,
        oi.p,
        oi.l,
        CONCAT(oi.p, 'x', oi.l, ' m') AS ukuran,
        oi.qty,
        COALESCE(oi.finishing, '-') AS finishing,
        COALESCE(oi.nama_file, '-') AS nama_file,
        oi.desainer,
        COALESCE(d.full_name, '-') AS designer_full_name,
        oi.operator,
        COALESCE(op.full_name, '-') AS operator_full_name,
        COALESCE(oi.keterangan, '-') AS keterangan,
        oi.status
      FROM order_items oi
      JOIN orders o ON oi.invoice_id = o.id
      LEFT JOIN client c ON o.client_id = c.id
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN users d ON oi.desainer = d.id
      LEFT JOIN users op ON oi.operator = op.id
      WHERE oi.status IN ('Operator', 'Proses Cetak', 'Acc Admin')
      ORDER BY oi.id DESC
    `);
    
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error getAllOperators:", err.message);
    res.status(500).json({ 
      success: false, 
      message: "Gagal memuat data operator",
      error: err.message 
    });
  }
};

/* ===========================================================
   POST: Mulai Proses Cetak (Ubah Status + Isi Operator)
   =========================================================== */
exports.startJob = async (req, res) => {
  try {
    const { item_id } = req.body;
    const operatorId = req.user.id; // ? Pakai ID, bukan username

    if (!item_id) {
      return res.status(400).json({ success: false, message: "item_id wajib dikirim" });
    }

    console.log(`?? startJob: item_id=${item_id}, operator=${operatorId}`);

    // 1. Ambil item dan invoice_id dulu
    const [[item]] = await db.query(
      `SELECT id, invoice_id, order_code FROM order_items WHERE id = ?`,
      [item_id]
    );
    
    if (!item) {
      return res.status(404).json({ success: false, message: "Item tidak ditemukan" });
    }

    // 2. Update status dan operator (isi dengan ID)
    await db.query(
      `UPDATE order_items SET status='Proses Cetak', operator=? WHERE id=?`,
      [operatorId, item_id]
    );

    // 3. Ambil data terbaru termasuk full_name operator
    const [[updatedItem]] = await db.query(`
      SELECT 
        oi.id AS item_id,
        oi.order_code,
        oi.operator,
        COALESCE(u.full_name, '-') AS operator_full_name,
        oi.status
      FROM order_items oi
      LEFT JOIN users u ON oi.operator = u.id
      WHERE oi.id = ?
    `, [item_id]);

    // 4. Insert history
    await db.query(
      `INSERT INTO order_history (order_id, status, deskripsi, tanggal)
       VALUES (?, ?, ?, NOW())`,
      [item.invoice_id, 'Proses Cetak', `Order ${item.order_code} dikerjakan oleh ${updatedItem.operator_full_name}`]
    );

    // 5. Cek apakah semua item dalam invoice sudah proses cetak
    const [[remaining]] = await db.query(
      `SELECT COUNT(*) as sisa 
       FROM order_items 
       WHERE invoice_id=? AND status NOT IN ('Proses Cetak', 'Selesai')`,
      [item.invoice_id]
    );

    // Jika semua item sudah proses cetak, update status invoice
    if (remaining.sisa === 0) {
      await db.query(
        `UPDATE orders 
         SET status='Proses Cetak' 
         WHERE id=?`,
        [item.invoice_id]
      );
    }

    console.log(`? Order ${updatedItem.order_code} mulai dikerjakan oleh operator ID ${operatorId} (${updatedItem?.operator_full_name})`);
    
    res.json({ 
      success: true, 
      message: `Order ${updatedItem.order_code} mulai dikerjakan`,
      data: updatedItem
    });
  } catch (err) {
    console.error("? startJob ERROR:", err);
    res.status(500).json({ success: false, message: "Gagal memulai pekerjaan operator" });
  }
};

/* ===========================================================
   POST: Kirim ke Admin (Ubah Status ? Selesai)
   =========================================================== */
exports.finishJob = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { item_id } = req.params;

    await conn.beginTransaction();

    // Ambil data item dan invoice_id
    const [[item]] = await conn.query(
      `SELECT oi.product_id, oi.qty, oi.invoice_id, oi.order_code, p.name AS product_name, p.type
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.id = ?`,
      [item_id]
    );

    if (!item) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Item tidak ditemukan" });
    }

    // Jika produk bertipe Cetak, kurangi stok bahan baku
    if (item.type === 'Cetak') {
      const [recipe] = await conn.query(
        `SELECT pr.bahan_id, pr.qty AS qty_per_unit, p.name AS bahan_name, p.stock
         FROM product_recipes pr
         JOIN products p ON pr.bahan_id = p.id
         WHERE pr.product_id = ?`,
        [item.product_id]
      );

      if (recipe.length > 0) {
        for (const bahan of recipe) {
          const totalQtyNeeded = bahan.qty_per_unit * item.qty;

          if (bahan.stock < totalQtyNeeded) {
            await conn.rollback();
            return res.status(400).json({
              success: false,
              message: `Stok ${bahan.bahan_name} tidak mencukupi! Tersedia: ${bahan.stock}, Dibutuhkan: ${totalQtyNeeded}`
            });
          }

          await conn.query(
            `UPDATE products SET stock = stock - ? WHERE id = ?`,
            [totalQtyNeeded, bahan.bahan_id]
          );

          await conn.query(
            `INSERT INTO stock_movements (product_id, type, qty, keterangan, created_at)
             VALUES (?, 'keluar', ?, ?, NOW())`,
            [
              bahan.bahan_id,
              totalQtyNeeded,
              `Digunakan untuk produksi ${item.product_name} (${item.qty} unit) - Order ${item.order_code}`
            ]
          );
        }
      }
    }

    // Update status item menjadi Selesai
    await conn.query(
      `UPDATE order_items SET status='Selesai' WHERE id=?`,
      [item_id]
    );

    // Cek apakah semua item dalam invoice sudah selesai
    const [[remaining]] = await conn.query(
      `SELECT COUNT(*) AS sisa 
       FROM order_items 
       WHERE invoice_id=? AND status NOT IN ('Selesai', 'Batal')`,
      [item.invoice_id]
    );

    // Jika semua item sudah selesai, update status invoice
    if (remaining.sisa === 0) {
      const [[invoiceData]] = await conn.query(
        `SELECT id, invoice_code, status FROM orders WHERE id=?`,
        [item.invoice_id]
      );

      const oldStatus = invoiceData?.status;

      await conn.query(
        `UPDATE orders SET status='Selesai' WHERE id=?`,
        [item.invoice_id]
      );

      try {
        const io = req.app.get("io");
        if (io && invoiceData) {
          await notifyOrderStatusChange(
            io,
            invoiceData.id,
            invoiceData.invoice_code,
            "Selesai",
            oldStatus
          );
        }
      } catch (notifError) {
        console.error("Gagal kirim notifikasi:", notifError.message);
      }
    }

    await conn.commit();
    res.json({ 
      success: true, 
      message: `Order ${item.order_code} selesai dicetak dan bahan baku berkurang` 
    });
  } catch (err) {
    await conn.rollback();
    console.error("Error finishJob:", err);
    res.status(500).json({ success: false, message: "Gagal menyelesaikan pekerjaan" });
  } finally {
    conn.release();
  }
};

/* ===========================================================
   DELETE: Batalkan Pekerjaan
   =========================================================== */
exports.cancelJob = async (req, res) => {
  try {
    const { item_id } = req.params;

    // Ambil data item dan invoice
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

    // Update status item jadi Batal
    await db.query(
      `UPDATE order_items SET status='Batal' WHERE id=?`,
      [item_id]
    );

    // Cek apakah ada item lain yang masih aktif
    const [[activeItems]] = await db.query(
      `SELECT COUNT(*) as total 
       FROM order_items 
       WHERE invoice_id=? AND status NOT IN ('Batal')`,
      [item.invoice_id]
    );

    // Jika semua item dibatalkan, update status invoice
    if (activeItems.total === 0) {
      const [[invoiceData]] = await db.query(
        `SELECT id, invoice_code FROM orders WHERE id=?`,
        [item.invoice_id]
      );

      await db.query(
        `UPDATE orders SET status='Batal' WHERE id=?`,
        [item.invoice_id]
      );

      // ?? KIRIM NOTIFIKASI KE OWNER
      try {
        const io = req.app.get("io");
        if (io && invoiceData) {
          const userName = req.user.full_name || req.user.username || 'Operator';
          await notifyOrderCanceled(
            io,
            invoiceData.id,
            invoiceData.invoice_code,
            userName,
            'Operator'
          );
          console.log(`?? Notifikasi pembatalan dikirim ke Owner: ${invoiceData.invoice_code}`);
        }
      } catch (notifError) {
        console.error("?? Gagal kirim notifikasi:", notifError.message);
      }
    }

    res.json({
      success: true,
      message: `Item #${item_id} dibatalkan`,
    });
  } catch (err) {
    console.error("Error cancelJob:", err);
    res.status(500).json({ success: false, message: "Gagal membatalkan pekerjaan" });
  }
};

/* ===========================================================
   POST: Tambah Bahan Tambahan (Single Item)
   =========================================================== */
exports.addSingleMaterial = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { item_id } = req.params;
    const { bahan_id, qty } = req.body;
    const operatorId = req.user.id;

    if (!bahan_id || !qty) {
      return res.status(400).json({ success: false, message: "bahan_id dan qty wajib dikirim" });
    }

    await conn.beginTransaction();

    const [[bahan]] = await conn.query(`SELECT name, stock FROM products WHERE id = ?`, [bahan_id]);
    if (!bahan) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Bahan tidak ditemukan" });
    }
    if (bahan.stock < qty) {
      await conn.rollback();
      return res.status(400).json({ 
        success: false, 
        message: `Stok ${bahan.name} tidak mencukupi! Tersedia: ${bahan.stock}, Dibutuhkan: ${qty}` 
      });
    }

    await conn.query(`UPDATE products SET stock = stock - ? WHERE id = ?`, [qty, bahan_id]);

    await conn.query(
      `INSERT INTO stock_movements (product_id, type, qty, keterangan, created_at) 
       VALUES (?, 'keluar', ?, ?, NOW())`,
      [bahan_id, qty, `Digunakan untuk produksi Item #${item_id} (operator tambah manual)`]
    );

    await conn.query(
      `INSERT INTO production_materials (order_item_id, bahan_id, operator_id, qty, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [item_id, bahan_id, operatorId, qty]
    );

    await conn.commit();
    res.json({ success: true, message: "Bahan berhasil ditambahkan dan stok berkurang" });
  } catch (err) {
    await conn.rollback();
    console.error("Error addSingleMaterial:", err);
    res.status(500).json({ success: false, message: "Gagal menambahkan bahan" });
  } finally {
    conn.release();
  }
};

/* ===========================================================
   GET: Lihat Daftar Bahan Tambahan
   =========================================================== */
exports.getMaterials = async (req, res) => {
  try {
    const { item_id } = req.params;
    
    const [rows] = await db.query(`
      SELECT 
        pm.id, 
        p.name AS bahan_name, 
        pm.qty, 
        u.full_name AS operator_name,
        pm.created_at
      FROM production_materials pm
      JOIN products p ON pm.bahan_id = p.id
      LEFT JOIN users u ON pm.operator_id = u.id
      WHERE pm.order_item_id = ?
      ORDER BY pm.created_at DESC
    `, [item_id]);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error getMaterials:", err);
    res.status(500).json({ success: false, message: "Gagal mengambil data bahan" });
  }
};