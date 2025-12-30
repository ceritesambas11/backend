//backend/controllers/productsController.js//
const db = require('../config/database');

// =====================================================
// ? GET: Semua Produk (Bahan Baku, Cetak, Barang Jadi)
// =====================================================
exports.getAllProducts = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, name, unit, price, kategori, type, stock
      FROM products
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error('Error getAllProducts:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data produk',
      error: err.message,
    });
  }
};

// =====================================================
// ? POST: Tambah Produk Baru
// =====================================================
exports.createProduct = async (req, res) => {
  const { name, kategori, type, unit, price, stock } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO products (name, kategori, type, unit, price, stock)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, kategori, type, unit, price, stock]
    );
    res.json({ success: true, message: 'Produk berhasil ditambahkan', id: result.insertId });
  } catch (err) {
    console.error('Error createProduct:', err);
    res.status(500).json({ success: false, message: 'Gagal menambah produk' });
  }
};

// =====================================================
// ?? PUT: Edit Produk
// =====================================================
exports.updateProduct = async (req, res) => {
  const { id } = req.params;
  const { name, kategori, type, unit, price, stock } = req.body;
  try {
    await db.query(
      `UPDATE products SET name=?, kategori=?, type=?, unit=?, price=?, stock=? WHERE id=?`,
      [name, kategori, type, unit, price, stock, id]
    );
    res.json({ success: true, message: 'Produk berhasil diperbarui' });
  } catch (err) {
    console.error('Error updateProduct:', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui produk' });
  }
};

// =====================================================
// ? DELETE: Hapus Produk
// =====================================================
exports.deleteProduct = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(`DELETE FROM products WHERE id=?`, [id]);
    res.json({ success: true, message: 'Produk berhasil dihapus' });
  } catch (err) {
    console.error('Error deleteProduct:', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus produk' });
  }
};

// =====================================================
// ?? GET: Resep Produk
// =====================================================
exports.getRecipeByProduct = async (req, res) => {
  const { product_id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT pr.id, pr.bahan_id, pr.qty, p.name AS bahan_name, p.unit
       FROM product_recipes pr
       JOIN products p ON pr.bahan_id = p.id
       WHERE pr.product_id = ?`,
      [product_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error getRecipeByProduct:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil resep' });
  }
};

// =====================================================
// ?? POST: Simpan Resep
// =====================================================
exports.saveRecipe = async (req, res) => {
  const { product_id, recipe } = req.body; // recipe = [{bahan_id, qty}, ...]
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM product_recipes WHERE product_id=?`, [product_id]);
    for (const item of recipe) {
      await conn.query(
        `INSERT INTO product_recipes (product_id, bahan_id, qty) VALUES (?, ?, ?)`,
        [product_id, item.bahan_id, item.qty]
      );
    }
    await conn.commit();
    res.json({ success: true, message: 'Resep berhasil disimpan' });
  } catch (err) {
    await conn.rollback();
    console.error('Error saveRecipe:', err);
    res.status(500).json({ success: false, message: 'Gagal menyimpan resep' });
  } finally {
    conn.release();
  }
};
// =====================================================
// ? GET: Produk Bahan Baku saja (untuk Operator)
// =====================================================
exports.getRawMaterials = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, name, unit, price, stock
      FROM products
      WHERE type = 'Bahan Baku'
      ORDER BY name ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error getRawMaterials:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil bahan baku' });
  }
};

// =====================================================
// ? POST: Tambah Stok (Stok Masuk)
// =====================================================
exports.addStock = async (req, res) => {
  const { id } = req.params;
  const { qty, keterangan } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    // Update stok produk
    await conn.query(`UPDATE products SET stock = stock + ? WHERE id = ?`, [qty, id]);
    
    // Catat ke stock_movements
    await conn.query(
      `INSERT INTO stock_movements (product_id, type, qty, keterangan) VALUES (?, 'masuk', ?, ?)`,
      [id, qty, keterangan]
    );
    
    await conn.commit();
    res.json({ success: true, message: 'Stok berhasil ditambahkan' });
  } catch (err) {
    await conn.rollback();
    console.error('Error addStock:', err);
    res.status(500).json({ success: false, message: 'Gagal menambah stok' });
  } finally {
    conn.release();
  }
};

// =====================================================
// ? POST: Kurangi Stok (Stok Keluar)
// =====================================================
exports.reduceStock = async (req, res) => {
  const { id } = req.params;
  const { qty, keterangan } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    
    // Cek stok tersedia
    const [product] = await conn.query(`SELECT stock FROM products WHERE id = ?`, [id]);
    if (!product.length || product[0].stock < qty) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Stok tidak mencukupi' });
    }
    
    // Update stok produk
    await conn.query(`UPDATE products SET stock = stock - ? WHERE id = ?`, [qty, id]);
    
    // Catat ke stock_movements
    await conn.query(
      `INSERT INTO stock_movements (product_id, type, qty, keterangan) VALUES (?, 'keluar', ?, ?)`,
      [id, qty, keterangan]
    );
    
    await conn.commit();
    res.json({ success: true, message: 'Stok berhasil dikurangi' });
  } catch (err) {
    await conn.rollback();
    console.error('Error reduceStock:', err);
    res.status(500).json({ success: false, message: 'Gagal mengurangi stok' });
  } finally {
    conn.release();
  }
};

// =====================================================
// ? GET: Riwayat Pergerakan Stok
// =====================================================
exports.getStockHistory = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT id, type, qty, keterangan, created_at 
       FROM stock_movements 
       WHERE product_id = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error getStockHistory:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil riwayat stok' });
  }
};