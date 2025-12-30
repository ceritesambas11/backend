const db = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require("fs");
const path = require("path");

const JWT_SECRET = process.env.JWT_SECRET || "indiego_art_secret_key_2025_very_secure_change_in_production";
const JWT_EXPIRE = process.env.JWT_EXPIRE || "7d";

// ======================================================
// ? LOGIN (FIXED: Support login dengan username, email, ATAU phone)
// ======================================================
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });

    // ? FIXED: Tambah pengecekan phone untuk login
    const [users] = await db.query(
      'SELECT * FROM users WHERE username = ? OR email = ? OR phone = ? LIMIT 1',
      [username, username, username]
    );

    if (users.length === 0)
      return res.status(401).json({ success: false, message: 'Username atau password salah' });

    const user = users[0];
    if (!user.status || user.status !== 'active')
      return res.status(403).json({ success: false, message: 'Akun tidak aktif' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Username atau password salah' });

    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRE }
    );

    delete user.password;
    res.json({ success: true, message: 'Login berhasil', data: { user, token } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  }
};

// ======================================================
// ? REGISTER (FIXED: Username dari input manual, bukan dari phone)
// ======================================================
const register = async (req, res) => {
  try {
    // ? FIXED: username sekarang dari input manual
    const { username, email, password, full_name, phone, role } = req.body;
    
    // Validasi field wajib
    if (!username || !email || !password || !full_name)
      return res.status(400).json({ success: false, message: 'Username, email, password, dan nama lengkap wajib diisi' });

    // Cek apakah username/phone/email sudah digunakan
    const [exists] = await db.query(
      'SELECT id FROM users WHERE username = ? OR phone = ? OR email = ? LIMIT 1',
      [username, phone, email]
    );
    if (exists.length > 0)
      return res.status(400).json({ success: false, message: 'Username, nomor HP, atau email sudah terdaftar' });

    const hashed = await bcrypt.hash(password, 10);
    const [insert] = await db.query(
      `INSERT INTO users (username, password, full_name, email, phone, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [username, hashed, full_name, email, phone || null, role || 'admin']
    );

    const [user] = await db.query(
      `SELECT id, username, full_name, email, role, phone, address, status
       FROM users WHERE id = ?`,
      [insert.insertId]
    );

    const token = jwt.sign(
      { id: user[0].id, username: user[0].username, email: user[0].email, role: user[0].role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRE }
    );

    res.status(201).json({
      success: true,
      message: 'User berhasil didaftarkan',
      data: { user: user[0], token },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error saat registrasi' });
  }
};

// ======================================================
// ? GET PROFILE
// ======================================================
const getProfile = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
      return res.status(401).json({ success: false, message: "Token tidak ditemukan" });

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    const [users] = await db.query(
      `SELECT 
        id, username, email, full_name, role, phone, address, 
        status, last_login, created_at, updated_at, avatar,
        salary_type, salary_amount, rating, rating_total, rating_count
       FROM users WHERE id = ?`,
      [decoded.id]
    );

    if (users.length === 0)
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

    res.json({ success: true, data: users[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching profile' });
  }
};

// ======================================================
// ? UPDATE PROFILE (FIXED: Username dari input, bukan auto-generate)
// ======================================================
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    // ? FIXED: Ambil username dari req.body
    const { full_name, username, email, phone, address, password } = req.body;
    
    // ? FIXED: Validasi termasuk username
    if (!full_name || !username || !email)
      return res.status(400).json({ success: false, message: 'Nama, username, dan email wajib diisi' });

    // Cek konflik username/phone/email dengan user lain
    const [conflict] = await db.query(
      `SELECT id FROM users WHERE (username = ? OR phone = ? OR email = ?) AND id != ? LIMIT 1`,
      [username, phone, email, userId]
    );
    if (conflict.length > 0)
      return res.status(400).json({ success: false, message: 'Username, nomor HP, atau email sudah digunakan akun lain' });

    let passwordHashed = null;
    if (password && String(password).trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      passwordHashed = await bcrypt.hash(password, salt);
    }

    const fields = [
      { key: 'full_name', val: full_name },
      { key: 'username', val: username }, // ? FIXED: Username dari input
      { key: 'email', val: email },
      { key: 'phone', val: phone || null },
      { key: 'address', val: address || null },
    ];
    if (passwordHashed) fields.push({ key: 'password', val: passwordHashed });

    const setClause = fields.map(f => `${f.key} = ?`).join(', ');
    const values = fields.map(f => f.val);
    values.push(userId);

    await db.query(`UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = ?`, values);

    const [rows] = await db.query(
      `SELECT id, username, email, full_name, role, phone, address, status, avatar, updated_at
       FROM users WHERE id = ?`,
      [userId]
    );

    res.json({ success: true, message: 'Profile updated successfully', data: rows[0] });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating profile' });
  }
};

// ======================================================
// ? UPLOAD AVATAR
// ======================================================
const uploadAvatar = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ success: false, message: "No file uploaded" });

    const userId = req.user.id;
    const newAvatarPath = `/uploads/avatars/${req.file.filename}`;
    const [users] = await db.query("SELECT avatar FROM users WHERE id = ?", [userId]);
    const oldAvatar = users[0]?.avatar;

    await db.query("UPDATE users SET avatar = ? WHERE id = ?", [newAvatarPath, userId]);

    if (oldAvatar) {
      const oldFilePath = path.join(__dirname, "..", oldAvatar);
      fs.unlink(oldFilePath, (err) => {
        if (!err) console.log("Avatar lama dihapus:", oldFilePath);
      });
    }

    res.json({ success: true, message: "Avatar uploaded successfully", data: { avatar: newAvatarPath } });
  } catch (error) {
    console.error("Upload avatar error:", error);
    res.status(500).json({ success: false, message: "Server error while uploading avatar" });
  }
};

module.exports = {
  login,
  register,
  getProfile,
  updateProfile,
  uploadAvatar,
};