const db = require("../config/database");
const bcrypt = require("bcryptjs");
const PROTECTED_USER_ID = 39;

// ======================================================
// ? GET: Semua User (Admin, Kasir, Operator, Desainer, Owner)
// ======================================================
exports.getAllUsers = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        id,
        full_name,
        username,
        email,
        phone,
        address,
        role,
        status,
        salary_type,
        salary_amount,
        rating,
        rating_total,
        rating_count,
        created_at
      FROM users
      WHERE id != ?
      ORDER BY created_at DESC
    `, [PROTECTED_USER_ID]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("? Error getAllUsers:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data users",
      error: err.message,
    });
  }
};

// ======================================================
// ? GET /api/clients (Ambil semua pelanggan dari tabel client)
// ======================================================
exports.getAllClients = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        id, full_name, username, email, phone, address, level, status, role, created_at 
      FROM client
      ORDER BY created_at DESC
    `);
    res.json({ success: true, data: rows });
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
// ? GET USER BY ID
// ======================================================
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [id]);
    if (!rows.length)
      return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil user",
      error: err.message,
    });
  }
};

// ======================================================
// ? CREATE USER (FIXED: Added phone, address, salary_type, salary_amount)
// ======================================================
exports.createUser = async (req, res) => {
  try {
    const { 
      full_name, 
      username, 
      email, 
      password, 
      role,
      phone,
      address,
      salary_type,
      salary_amount 
    } = req.body;

    if (!full_name || !username || !email || !password)
      return res.status(400).json({ success: false, message: "Data wajib diisi" });

    // Check duplicate username or email
    const [existing] = await db.query(
      "SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1",
      [username, email]
    );
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Username atau email sudah digunakan",
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    await db.query(
      `INSERT INTO users (
        full_name, 
        username, 
        email, 
        password, 
        role, 
        phone,
        address,
        salary_type,
        salary_amount,
        status, 
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [
        full_name, 
        username, 
        email, 
        hashed, 
        role || "admin",
        phone || null,
        address || null,
        salary_type || null,
        salary_amount || 0
      ]
    );

    res.json({ success: true, message: "User berhasil ditambahkan" });
  } catch (err) {
    console.error("? Error createUser:", err);
    res.status(500).json({
      success: false,
      message: "Gagal menambah user",
      error: err.message,
    });
  }
};

// ======================================================
// ? UPDATE USER (FIXED: Added role, salary_type, salary_amount)
// ======================================================
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (parseInt(id) === PROTECTED_USER_ID) {
      return res.status(403).json({
        success: false,
        message: "User Owner tidak dapat diubah"
      });
    }

    const { 
      full_name, 
      email, 
      phone, 
      address, 
      status,
      role,
      salary_type,
      salary_amount 
    } = req.body;

    await db.query(
      `UPDATE users 
       SET full_name=?, 
           email=?, 
           phone=?, 
           address=?, 
           status=?,
           role=?,
           salary_type=?,
           salary_amount=?,
           updated_at=NOW() 
       WHERE id=?`,
      [
        full_name, 
        email, 
        phone, 
        address, 
        status,
        role,
        salary_type || null,
        salary_amount || 0,
        id
      ]
    );

    res.json({ success: true, message: "User berhasil diperbarui" });
  } catch (err) {
    console.error("? Error updateUser:", err);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui user",
      error: err.message,
    });
  }
};

// ======================================================
// ? DELETE USER
// ======================================================
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (parseInt(id) === PROTECTED_USER_ID) {
      return res.status(403).json({
        success: false,
        message: "User Owner tidak dapat dihapus"
      });
    }

    await db.query("DELETE FROM users WHERE id = ?", [id]);
    res.json({ success: true, message: "User berhasil dihapus" });
  } catch (err) {
    console.error("? Error deleteUser:", err);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus user",
      error: err.message,
    });
  }
};

// ======================================================
// ? CREATE CLIENT (Masukkan ke tabel client, bukan users)
// ======================================================
exports.createClient = async (req, res) => {
  try {
    const { full_name, username, email, phone, address, password, level } = req.body;

    if (!full_name || !username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Nama lengkap, username, email, dan password wajib diisi",
      });
    }

    const [check] = await db.query(
      "SELECT id FROM client WHERE username = ? OR email = ? LIMIT 1",
      [username, email]
    );
    if (check.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Username atau email sudah digunakan",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      `INSERT INTO client 
       (full_name, username, email, phone, address, level, password, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'client', 'active', NOW())`,
      [
        full_name,
        username,
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
// ? UPDATE CLIENT
// ======================================================
exports.updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    let { full_name, email, phone, address, level } = req.body;

    level = (level || "").trim();
    if (!["Topas", "Shapire", "Rubby"].includes(level)) {
      level = "Topas";
    }

    const [exist] = await db.query(
      "SELECT id FROM client WHERE id = ?",
      [id]
    );
    if (exist.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Data tidak ditemukan",
      });
    }

    await db.query(
      `UPDATE client 
       SET full_name=?, email=?, phone=?, address=?, level=?, updated_at=NOW()
       WHERE id=?`,
      [full_name, email, phone, address, level, id]
    );

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
// ? DELETE CLIENT
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
    res.json({ success: true, message: "Pelanggan berhasil dihapus" });
  } catch (err) {
    console.error("? Error deleteClient:", err);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus pelanggan",
      error: err.message,
    });
  }
};