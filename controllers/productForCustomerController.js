// controllers/productForCustomerController.js
const db = require("../config/database");
const fs = require("fs");
const path = require("path");

// ====================================================
// GET ALL PRODUCTS (KATALOG)
// ====================================================
exports.getAllProducts = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        pfc.*,
        p.kategori
      FROM product_forcostumer pfc
      LEFT JOIN products p ON pfc.product_id = p.id
      ORDER BY pfc.is_primary DESC, pfc.created_at DESC
    `);

    res.json({
      success: true,
      data: rows,
      total: rows.length
    });
  } catch (err) {
    console.error("Error getAllProducts:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data produk",
      error: err.message
    });
  }
};

// ====================================================
// GET PRODUCT BY ID
// ====================================================
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(`
      SELECT 
        pfc.*,
        p.kategori
      FROM product_forcostumer pfc
      LEFT JOIN products p ON pfc.product_id = p.id
      WHERE pfc.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan"
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    console.error("Error getProductById:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil detail produk",
      error: err.message
    });
  }
};

// ====================================================
// CREATE PRODUCT (KATALOG)
// ====================================================
exports.createProduct = async (req, res) => {
  try {
    const {
      product_id,
      nama_file,
      P,
      L,
      price,
      description,
      is_primary = 0
    } = req.body;

    // Validation
    if (!product_id) {
      return res.status(400).json({
        success: false,
        message: "product_id harus diisi"
      });
    }

    if (!nama_file || nama_file.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "nama_file harus diisi"
      });
    }

    // Ambil product_name dan unit dari tabel products
    const [productRows] = await db.query(
      "SELECT name, unit FROM products WHERE id = ? AND type IN ('Cetak', 'Barang Jadi')",
      [product_id]
    );

    if (productRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Produk tidak ditemukan atau bukan tipe Cetak/Barang Jadi"
      });
    }

    const product_name = productRows[0].name;
    const unit = productRows[0].unit;

    // Handle uploaded images dari multer
    let imagesArray = [];
    if (req.files && req.files.length > 0) {
      imagesArray = req.files.map(file => `uploads/products/${file.filename}`);
    }
    const imagesJson = JSON.stringify(imagesArray);

    const [result] = await db.query(`
      INSERT INTO product_forcostumer 
        (product_id, product_name, nama_file, p, l, unit, price, image, description, is_primary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      product_id,
      product_name,
      nama_file,
      P || null,
      L || null,
      unit || null,
      price || null,
      imagesJson,
      description || null,
      is_primary
    ]);

    res.status(201).json({
      success: true,
      message: "Produk berhasil ditambahkan",
      data: {
        id: result.insertId,
        product_id,
        product_name,
        nama_file,
        unit,
        images: imagesArray
      }
    });
  } catch (err) {
    console.error("Error createProduct:", err);
    res.status(500).json({
      success: false,
      message: "Gagal menambahkan produk",
      error: err.message
    });
  }
};

// ====================================================
// UPDATE PRODUCT (KATALOG)
// ====================================================
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      product_id,
      nama_file,
      P,
      L,
      price,
      description,
      is_primary
    } = req.body;

    // Cek apakah produk ada
    const [existing] = await db.query(
      "SELECT * FROM product_forcostumer WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan"
      });
    }

    // Handle images: gabungkan existing + new uploads
    let imagesArray = [];
    
    // Parse existing images
    if (existing[0].image) {
      try {
        imagesArray = JSON.parse(existing[0].image);
      } catch {
        // Jika bukan JSON (legacy single image), convert ke array
        if (existing[0].image) {
          imagesArray = [existing[0].image];
        }
      }
    }

    // Tambah new uploads
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => `uploads/products/${file.filename}`);
      imagesArray = [...imagesArray, ...newImages];
    }

    const imagesJson = JSON.stringify(imagesArray);

    // Build dynamic update
    const updates = [];
    const values = [];

    // Jika product_id berubah, update product_name dan unit otomatis
    if (product_id !== undefined && product_id !== existing[0].product_id) {
      const [productRows] = await db.query(
        "SELECT name, unit FROM products WHERE id = ? AND type IN ('Cetak', 'Barang Jadi')",
        [product_id]
      );

      if (productRows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Produk tidak ditemukan atau bukan tipe Cetak/Barang Jadi"
        });
      }

      updates.push("product_id = ?");
      values.push(product_id);
      updates.push("product_name = ?");
      values.push(productRows[0].name);
      updates.push("unit = ?");
      values.push(productRows[0].unit);
    }

   	if (nama_file !== undefined) { updates.push("nama_file = ?"); values.push(nama_file); }
	if (P !== undefined) { updates.push("p = ?"); values.push(P || null); }
	if (L !== undefined) { updates.push("l = ?"); values.push(L || null); }
	if (price !== undefined) { updates.push("price = ?"); values.push(price || null); }
	if (description !== undefined) { updates.push("description = ?"); values.push(description); }
	if (is_primary !== undefined) { updates.push("is_primary = ?"); values.push(is_primary); }    
    // Always update images if there are new uploads
    updates.push("image = ?");
    values.push(imagesJson);

    values.push(id);

    await db.query(
      `UPDATE product_forcostumer SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    res.json({
      success: true,
      message: "Produk berhasil diupdate",
      data: { images: imagesArray }
    });
  } catch (err) {
    console.error("Error updateProduct:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengupdate produk",
      error: err.message
    });
  }
};

// ====================================================
// DELETE PRODUCT
// ====================================================
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Get existing untuk hapus file
    const [existing] = await db.query(
      "SELECT image FROM product_forcostumer WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan"
      });
    }

    // Hapus file images dari disk
    if (existing[0].image) {
      try {
        const images = JSON.parse(existing[0].image);
        images.forEach(imgPath => {
          const fullPath = path.join(__dirname, "..", imgPath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        });
      } catch (e) {
        console.error("Error deleting image files:", e);
      }
    }

    // Hapus dari database
    await db.query("DELETE FROM product_forcostumer WHERE id = ?", [id]);

    res.json({
      success: true,
      message: "Produk berhasil dihapus"
    });
  } catch (err) {
    console.error("Error deleteProduct:", err);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus produk",
      error: err.message
    });
  }
};

// ====================================================
// DELETE SINGLE IMAGE
// ====================================================
exports.deleteImageById = async (req, res) => {
  try {
    const { productId, imageIndex } = req.params;

    const [existing] = await db.query(
      "SELECT image FROM product_forcostumer WHERE id = ?",
      [productId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan"
      });
    }

    let images = [];
    try {
      images = JSON.parse(existing[0].image || "[]");
    } catch {
      images = [];
    }

    const idx = parseInt(imageIndex);
    if (idx < 0 || idx >= images.length) {
      return res.status(400).json({
        success: false,
        message: "Index gambar tidak valid"
      });
    }

    // Hapus file dari disk
    const imgPath = images[idx];
    const fullPath = path.join(__dirname, "..", imgPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    // Remove from array
    images.splice(idx, 1);

    // Update database
    await db.query(
      "UPDATE product_forcostumer SET image = ? WHERE id = ?",
      [JSON.stringify(images), productId]
    );

    res.json({
      success: true,
      message: "Gambar berhasil dihapus",
      data: { images }
    });
  } catch (err) {
    console.error("Error deleteImageById:", err);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus gambar",
      error: err.message
    });
  }
};