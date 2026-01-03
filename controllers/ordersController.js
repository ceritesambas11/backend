// controllers/ordersController.js

const db = require('../config/database');
const { notifyNewOrder, notifyOrderStatusChange } = require("../utils/notifications");
const { sendCustomerNotification } = require('../utils/notifications');
// ====================================================
// CREATE ORDER (Buat Order Baru) - NEW INVOICE STRUCTURE
// ====================================================
exports.createOrder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { client_id, items, status, payment_status, total } = req.body;
    const admin = req.user.id;

    if (!client_id || !Array.isArray(items) || items.length === 0)
      return res.status(400).json({ success: false, message: "client_id & items wajib diisi" });

    const [[client]] = await conn.query(
      `SELECT id, full_name, phone FROM client WHERE id = ?`,
      [client_id]
    );

    if (!client)
      return res.status(404).json({ success: false, message: "Client tidak ditemukan" });

    const [[lastInvoice]] = await conn.query(`SELECT id FROM orders ORDER BY id DESC LIMIT 1`);
    const nextInvoice = (lastInvoice?.id || 0) + 1;
    const invoiceCode = `IA-ORD-${String(nextInvoice).padStart(4, '0')}`;

    await conn.beginTransaction();

    const [invoiceResult] = await conn.query(
      `INSERT INTO orders 
        (invoice_code, client_id, client_name, phone, status, payment_status, total, admin, via)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceCode,
        client.id,
        client.full_name,
        client.phone,
        status || "Admin",
        payment_status || "Belum Lunas",
        Number(total) || 0,
        admin,
        req.body.via || "Cash",
      ]
    );

    const invoiceId = invoiceResult.insertId;

    const [[newInvoice]] = await conn.query(
      `SELECT id, tanggal, jam FROM orders WHERE id = ?`,
      [invoiceId]
    );

    const [[lastOrder]] = await conn.query(
      `SELECT order_code FROM order_items ORDER BY id DESC LIMIT 1`
    );
    
    let orderCounter = 1;
    if (lastOrder && lastOrder.order_code) {
      const match = lastOrder.order_code.match(/ORD-(\d+)/);
      if (match) {
        orderCounter = parseInt(match[1]) + 1;
      }
    }

    for (const it of items) {
      const productId = it.product_id || it.productId;

      const [[p]] = await conn.query(
        `SELECT id, name, unit, price FROM products WHERE id = ?`,
        [productId]
      );

      const orderCode = `ORD-${String(orderCounter).padStart(3, '0')}`;

      await conn.query(
        `INSERT INTO order_items
         (invoice_id, order_code, tanggal, jam, product_id, product_name, unit, price, p, l, qty, finishing, nama_file, keterangan, subtotal, status, admin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          orderCode,
          newInvoice.tanggal,
          newInvoice.jam,
          p.id,
          p.name,
          p.unit,
          p.price,
          it.panjang || 0,
          it.lebar || 0,
          it.qty || 1,
          it.finishing || null,
          it.namaFile || it.nama_file || null,
          it.keterangan || null,
          Number(it.subtotal) || 0,
          status || "Admin",
          admin,
        ]
      );

      orderCounter++;
    }

    await conn.query(
      `INSERT INTO order_history (order_id, status, deskripsi, tanggal)
       VALUES (?, ?, ?, NOW())`,
      [ invoiceId, status || "Admin", `Invoice dibuat (${invoiceCode}) dengan ${items.length} order` ]
    );

    await conn.commit();

    try {
      const io = req.app.get("io");
      if (io) {
        await notifyNewOrder(io, invoiceId, invoiceCode, client.full_name);
      }
    } catch (e) {
      console.error("Notification error:", e);
    }

    res.status(201).json({
      success: true,
      message: "Invoice berhasil dibuat",
      data: {
        invoice_id: invoiceId,
        invoice_code: invoiceCode,
        order_count: items.length
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error("CREATE ORDER ERROR:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
};

// ====================================================
// LIST ORDERS (LIST INVOICES)
// ====================================================
exports.listOrders = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        o.id,
        o.id AS invoice_id,
        o.invoice_code,
        o.client_name,
        o.phone AS client_phone,
        o.status,
        o.payment_status,
        COALESCE(o.total, 0) AS total,
        o.via,
        o.admin,
        admin_user.full_name AS admin_name,
        
        (SELECT COUNT(*) FROM order_items WHERE invoice_id = o.id) AS order_count,
        
        (
          SELECT GROUP_CONCAT(DISTINCT u.full_name SEPARATOR ', ')
          FROM order_items oi
          LEFT JOIN users u ON u.id = oi.operator
          WHERE oi.invoice_id = o.id
           AND oi.operator IS NOT NULL
        ) AS operator_full_name,

        (
          SELECT GROUP_CONCAT(DISTINCT u.full_name SEPARATOR ', ')
          FROM order_items oi
          LEFT JOIN users u ON u.id = oi.desainer
          WHERE oi.invoice_id = o.id
           AND oi.desainer IS NOT NULL
        ) AS desainer,

        DATE_FORMAT(o.tanggal, '%d/%m/%Y') AS tanggal,
        DATE_FORMAT(o.jam, '%H:%i:%s') AS jam,
        o.created_at,

        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', i.id,
            'order_code', i.order_code,
            'nama', i.product_name,
            'unit', i.unit,
            'p', i.p,
            'l', i.l,
            'qty', i.qty,
            'subtotal', COALESCE(i.subtotal, 0),
            'finishing', i.finishing,
            'nama_file', i.nama_file,
            'operator', i.operator,
            'desainer', i.desainer,
            'status', i.status
          )
        ) AS detailProduk

      FROM orders o
      LEFT JOIN users admin_user ON admin_user.id = o.admin
      LEFT JOIN order_items i ON i.invoice_id = o.id

      GROUP BY 
        o.id, o.invoice_code, o.client_name, o.phone, o.status,
        o.payment_status, o.total, o.via, o.admin,
        admin_user.full_name, o.tanggal, o.jam, o.created_at

      ORDER BY o.created_at DESC
    `);

    res.json({ success: true, data: rows });

  } catch (err) {
    console.error("listOrders ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil list orders",
      error: err.message,
    });
  }
};

// ====================================================
// GET ORDER BY ID (GET INVOICE BY ID)
// ====================================================
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const [[invoice]] = await db.query(`
      SELECT 
        o.id AS invoice_id,
        o.id AS id,
        o.invoice_code,
        o.invoice_code AS order_code,
        o.client_id,
        c.full_name AS client_name,
        c.phone AS client_phone,
        c.address AS client_address,
        o.status,
        o.payment_status,
        COALESCE(o.total, 0) AS total,
        o.via,
        o.admin,
        admin_user.full_name AS admin_name,
        admin_user.full_name AS admin_full_name,
        DATE_FORMAT(o.tanggal, '%d/%m/%Y') AS tanggal,
        DATE_FORMAT(o.jam, '%H:%i:%s') AS jam,
        o.created_at,
        o.updated_at
      FROM orders o
      LEFT JOIN client c ON o.client_id = c.id
      LEFT JOIN users admin_user ON admin_user.id = o.admin
      WHERE o.id = ?
    `, [id]);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice tidak ditemukan"
      });
    }

    const [items] = await db.query(`
      SELECT 
        oi.id,
        oi.order_code,
        oi.product_id,
        oi.product_name AS nama,
        oi.unit,
        oi.p AS panjang,
        oi.l AS lebar,
        oi.qty,
        oi.finishing,
        oi.nama_file,
        oi.keterangan,
        COALESCE(oi.subtotal, 0) AS subtotal,
        oi.status,
        oi.desainer,
        desainer_user.full_name AS desainer_full_name,
        oi.operator,
        operator_user.full_name AS operator_full_name,
        DATE_FORMAT(oi.tanggal, '%d/%m/%Y') AS tanggal,
        DATE_FORMAT(oi.jam, '%H:%i:%s') AS jam
      FROM order_items oi
      LEFT JOIN users desainer_user ON desainer_user.id = oi.desainer
      LEFT JOIN users operator_user ON operator_user.id = oi.operator
      WHERE oi.invoice_id = ?
      ORDER BY oi.id ASC
    `, [id]);

    const [logs] = await db.query(`
      SELECT 
        id,
        status,
        deskripsi,
        DATE_FORMAT(tanggal, '%d/%m/%Y') AS tanggal,
        DATE_FORMAT(tanggal, '%H:%i:%s') AS jam
      FROM order_history
      WHERE order_id = ?
      ORDER BY tanggal ASC
    `, [id]);

    res.json({
      success: true,
      data: {
        order: invoice,
        items,
        detailProduk: items,
        riwayat: logs
      }
    });

  } catch (err) {
    console.error("getOrderById ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Gagal ambil detail order",
      error: err.message
    });
  }
};

// ====================================================
// UPDATE ORDER
// ====================================================
exports.updateOrder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;
    const {
      client_id,
      status,
      payment_status,
      items,
      via,
      total,
    } = req.body;

    const [[prev]] = await conn.query(
      `SELECT status, payment_status, invoice_code, client_id, tanggal, jam FROM orders WHERE id = ?`,
      [id]
    );

    if (!prev) {
      return res.status(404).json({
        success: false,
        message: "Invoice tidak ditemukan"
      });
    }

    const oldStatus = prev.status;
    const prevPayment = prev.payment_status;
    const invoiceCode = prev.invoice_code;

    await conn.beginTransaction();

    let updateFields = [];
    let updateValues = [];

    if (status) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }
    if (payment_status) {
      updateFields.push('payment_status = ?');
      updateValues.push(payment_status);
    }
    if (via) {
      updateFields.push('via = ?');
      updateValues.push(via);
    }
    if (total !== undefined) {
      updateFields.push('total = ?');
      updateValues.push(Number(total) || 0);
    }

    if (client_id && client_id !== prev.client_id) {
      const [[client]] = await conn.query(
        `SELECT full_name, phone FROM client WHERE id = ?`,
        [client_id]
      );

      if (client) {
        updateFields.push('client_id = ?', 'client_name = ?', 'phone = ?');
        updateValues.push(client_id, client.full_name, client.phone);
      }
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    if (updateFields.length > 0) {
      await conn.query(
        `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    if (items && Array.isArray(items) && items.length > 0) {

      await conn.query(`DELETE FROM order_items WHERE invoice_id = ?`, [id]);

      const [[lastOrder]] = await conn.query(
        `SELECT order_code FROM order_items ORDER BY id DESC LIMIT 1`
      );
      
      let orderCounter = 1;
      if (lastOrder && lastOrder.order_code) {
        const match = lastOrder.order_code.match(/ORD-(\d+)/);
        if (match) {
          orderCounter = parseInt(match[1]) + 1;
        }
      }

      for (const it of items) {
        const productId = it.product_id || it.productId;

        const [[p]] = await conn.query(
          `SELECT id, name, unit, price FROM products WHERE id = ?`,
          [productId]
        );

        const orderCode = `ORD-${String(orderCounter).padStart(3, '0')}`;

        await conn.query(
          `INSERT INTO order_items 
           (invoice_id, order_code, tanggal, jam, product_id, product_name, unit, price, p, l, qty, finishing, nama_file, keterangan, subtotal, status, admin)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            orderCode,
            prev.tanggal,
            prev.jam,
            p.id,
            p.name,
            p.unit,
            p.price,
            it.panjang || it.p || 0,
            it.lebar || it.l || 0,
            it.qty || 1,
            it.finishing || null,
            it.namaFile || it.nama_file || null,
            it.keterangan || null,
            Number(it.subtotal) || 0,
            it.status || oldStatus || 'Admin',
            req.user.id
          ]
        );

        orderCounter++;
      }

      await conn.query(
        `INSERT INTO order_history (order_id, status, deskripsi, tanggal)
         VALUES (?, ?, ?, NOW())`,
        [id, "Update", `Invoice diperbarui dengan ${items.length} order`]
      );
    }

    // ✅ BAGIAN YANG DIUBAH: Status change notification
    if (status && status !== oldStatus) {
      await conn.query(
        `INSERT INTO order_history (order_id, status, deskripsi, tanggal)
         VALUES (?, ?, ?, NOW())`,
        [id, status, `Status diubah dari ${oldStatus} ke ${status}`]
      );

      // 🔔 Kirim notifikasi ke role internal (Socket.IO)
      try {
        const io = req.app.get("io");
        if (io) {
          await notifyOrderStatusChange(io, id, invoiceCode, status, oldStatus);
        }
      } catch (e) {
        console.error("🔔 Notification error (internal):", e);
      }

      // ✅ TAMBAHAN BARU: Kirim notifikasi ke CUSTOMER (FCM via Backend Customer)
      try {
        await sendCustomerNotification(id, invoiceCode, status, oldStatus);
      } catch (e) {
        console.error("❌ Customer notification error:", e);
      }
    }

    if (payment_status && payment_status !== prevPayment) {
      await conn.query(
        `INSERT INTO order_history (order_id, status, deskripsi, tanggal)
         VALUES (?, ?, ?, NOW())`,
        [id, "Pembayaran", `Status pembayaran diubah dari ${prevPayment} ke ${payment_status}`]
      );
    }

    await conn.commit();

    res.json({
      success: true,
      message: "Invoice berhasil diperbarui"
    });

  } catch (err) {
    await conn.rollback();
    console.error("updateOrder ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Gagal update order",
      error: err.message
    });
  } finally {
    conn.release();
  }
};

// ====================================================
// GET DASHBOARD STATS
// ====================================================
exports.getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    const todayStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} 00:00:00`;
    const todayEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} 23:59:59`;
    
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    const [[revenueResult]] = await db.query(`
      SELECT COALESCE(SUM(amount), 0) AS todayRevenue
      FROM payments
      WHERE created_at >= ? AND created_at <= ?
    `, [todayStart, todayEnd]);

    const [[todayOrdersResult]] = await db.query(`
      SELECT COUNT(*) AS todayOrders
      FROM orders
      WHERE DATE(created_at) = CURDATE()
    `);

    const [[monthOrdersResult]] = await db.query(`
      SELECT COUNT(*) AS monthOrders
      FROM orders
      WHERE MONTH(created_at) = ? AND YEAR(created_at) = ?
    `, [currentMonth, currentYear]);

    const [[newClientsResult]] = await db.query(`
      SELECT COUNT(*) AS newClients
      FROM client
      WHERE MONTH(created_at) = ? AND YEAR(created_at) = ?
    `, [currentMonth, currentYear]);

    res.json({
      success: true,
      data: {
        todayRevenue: Number(revenueResult.todayRevenue) || 0,
        todayOrders: Number(todayOrdersResult.todayOrders) || 0,
        monthOrders: Number(monthOrdersResult.monthOrders) || 0,
        newClients: Number(newClientsResult.newClients) || 0
      }
    });

  } catch (err) {
    console.error("getDashboardStats ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil statistik dashboard",
      error: err.message
    });
  }
};

// ====================================================
// GET ORDER TIMELINE (GROUPED BY ORDER_CODE)
// ====================================================
exports.getOrderTimeline = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [history] = await db.query(`
      SELECT 
        oh.id,
        oh.order_id,
        oh.status,
        oh.deskripsi,
        oh.tanggal,
        CASE 
          WHEN oh.deskripsi LIKE '%Order ORD-%' 
          THEN SUBSTRING_INDEX(SUBSTRING_INDEX(oh.deskripsi, 'Order ', -1), ' ', 1)
          ELSE NULL
        END AS order_code
      FROM order_history oh
      WHERE oh.order_id = ?
        AND oh.status IN ('Di Desain', 'Proses Desain', 'Proses Cetak', 'Selesai', 'Dikirim', 'Sudah Diambil')
        AND oh.deskripsi LIKE '%Order ORD-%'
      ORDER BY oh.tanggal ASC
    `, [id]);
    
    const [items] = await db.query(`
      SELECT 
        oi.order_code,
        oi.product_name,
        oi.desainer,
        desainer_user.full_name AS desainer_name,
        oi.operator,
        operator_user.full_name AS operator_name
      FROM order_items oi
      LEFT JOIN users desainer_user ON oi.desainer = desainer_user.id
      LEFT JOIN users operator_user ON oi.operator = operator_user.id
      WHERE oi.invoice_id = ?
    `, [id]);
    
    const itemsMap = {};
    items.forEach(item => {
      itemsMap[item.order_code] = item;
    });
    
    const grouped = history.reduce((acc, row) => {
      const code = row.order_code || 'UNKNOWN';
      
      if (!acc[code]) {
        const itemData = itemsMap[code] || {};
        acc[code] = {
          order_code: code,
          product_name: itemData.product_name || 'Unknown Product',
          timeline: []
        };
      }
      
      const itemData = itemsMap[code] || {};
      let pic = null;
      if (row.status === 'Di Desain' || row.status === 'Proses Desain') {
        pic = itemData.desainer_name || itemData.desainer;
      } else if (row.status === 'Proses Cetak') {
        pic = itemData.operator_name || itemData.operator;
      }
      
      let statusDisplay = row.status;
      if (row.status === 'Proses Desain') {
        statusDisplay = 'Di Desain';
      }
      
      acc[code].timeline.push({
        status: statusDisplay,
        deskripsi: row.deskripsi,
        tanggal: row.tanggal,
        pic: pic
      });
      
      return acc;
    }, {});
    
    res.json({ success: true, data: grouped });
    
  } catch (err) {
    console.error('Error getOrderTimeline:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Gagal ambil timeline order' 
    });
  }
};

module.exports = exports;