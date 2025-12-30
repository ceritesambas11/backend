const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

// Protect all routes
router.use(authenticate);

// ==================== EMPLOYEE ENDPOINTS ====================

// Get today's attendance for current user
router.get('/today', async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }))
      .toISOString()
      .split('T')[0];

    const [records] = await db.query(
      `SELECT a.*, u.full_name, u.username 
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.user_id = ? AND DATE(a.date) = ? 
       LIMIT 1`,
      [userId, today]
    );

    res.json({
      success: true,
      data: records[0] || null
    });
  } catch (error) {
    console.error('Error fetching today attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching today attendance'
    });
  }
});

// Get attendance history for current user
router.get('/my-history', async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 30;

    const [records] = await db.query(
      `SELECT a.*, u.full_name, u.username 
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.user_id = ? 
       ORDER BY a.date DESC 
       LIMIT ?`,
      [userId, limit]
    );

    res.json({
      success: true,
      data: records
    });
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching attendance history'
    });
  }
});

// ==================== CLOCK IN (DYNAMIC SHIFT) ====================
router.post('/clock-in', async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { latitude, longitude, photo } = req.body;

    // Gunakan waktu WIB (Asia/Jakarta)
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const today = now.toISOString().split('T')[0];
    console.log("DEBUG: Current Time =>", now.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));

    // Cek apakah sudah clock-in hari ini
    const [existing] = await db.query(
      'SELECT * FROM attendance WHERE user_id = ? AND DATE(date) = ?',
      [userId, today]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You have already clocked in today'
      });
    }

    // Tentukan day category
    const dayName = now.toLocaleDateString('en-US', { weekday: 'lowercase' });
    let dayCategory = 'weekday';
    if (dayName === 'saturday') dayCategory = 'saturday';
    else if (dayName === 'sunday') dayCategory = 'sunday';

    // Cari shift yang sesuai dari database
    const [[shiftConfig]] = await db.query(`
      SELECT * FROM shift_settings 
      WHERE is_active = 1 
      AND (role = ? OR role = 'all')
      AND (day_of_week = ? OR day_of_week = 'all')
      ORDER BY 
        CASE WHEN role = ? THEN 1 ELSE 2 END,
        CASE WHEN day_of_week = ? THEN 1 ELSE 2 END
      LIMIT 1
    `, [userRole, dayCategory, userRole, dayCategory]);

    if (!shiftConfig) {
      return res.status(400).json({
        success: false,
        message: `Tidak ada shift aktif untuk role ${userRole} pada hari ${dayName}. Silakan hubungi admin.`
      });
    }

    // Hitung status (on_time atau late) berdasarkan shift config
    const clockInTime = new Date(`1970-01-01T${shiftConfig.clock_in_time}`);
    const expectedMinutes = clockInTime.getHours() * 60 + clockInTime.getMinutes();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const tolerance = shiftConfig.late_tolerance_minutes || 0;

    let status = 'on_time';
    if (currentMinutes > (expectedMinutes + tolerance)) {
      status = 'late';
    }

    // Simpan ke database
    const [result] = await db.query(
      `INSERT INTO attendance 
       (user_id, date, clock_in, shift, location, photo, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, 
        today, 
        now, 
        shiftConfig.shift_name,
        JSON.stringify({ latitude, longitude }),
        photo, 
        status
      ]
    );

    res.json({
      success: true,
      message: 'Clock in successful',
      data: {
        id: result.insertId,
        status: status,
        clock_in: now,
        shift: shiftConfig.shift_name,
        expected_time: shiftConfig.clock_in_time,
        tolerance_minutes: tolerance
      }
    });
  } catch (error) {
    console.error('Error clock in:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during clock in'
    });
  }
});

// ==================== CLOCK OUT ====================
router.post('/clock-out', async (req, res) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude, photo } = req.body;
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const today = now.toISOString().split('T')[0];

    // Ambil record hari ini
    const [records] = await db.query(
      'SELECT * FROM attendance WHERE user_id = ? AND DATE(date) = ?',
      [userId, today]
    );

    if (records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No clock in record found for today. Please clock in first.'
      });
    }

    const record = records[0];
    if (record.clock_out) {
      return res.status(400).json({
        success: false,
        message: 'You have already clocked out today'
      });
    }

    // Hitung durasi kerja
    const clockIn = new Date(record.clock_in);
    const diffMs = now - clockIn;
    const durationHours = diffMs / (1000 * 60 * 60);

    // Update clock-out
    await db.query(
      `UPDATE attendance 
       SET clock_out = ?, 
           location_out = ?,
           photo_out = ?,
           work_duration = ?
       WHERE id = ?`,
      [
        now, 
        JSON.stringify({ latitude, longitude }),
        photo, 
        durationHours.toFixed(2), 
        record.id
      ]
    );

    res.json({
      success: true,
      message: 'Clock out successful',
      data: {
        clock_out: now,
        work_duration: durationHours.toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error clock out:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during clock out'
    });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// Get all attendance records (Admin only)
router.get('/all', async (req, res) => {
  try {
    if (!['admin', 'owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { date, user_id, status, limit = 100 } = req.query;
    let query = `
      SELECT a.*, u.full_name, u.username, u.role 
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (date) {
      query += ' AND DATE(a.date) = ?';
      params.push(date);
    }
    if (user_id) {
      query += ' AND a.user_id = ?';
      params.push(user_id);
    }
    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    query += ' ORDER BY a.date DESC, a.clock_in DESC LIMIT ?';
    params.push(parseInt(limit));

    const [records] = await db.query(query, params);

    res.json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error('Error fetching all attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching attendance records'
    });
  }
});

// Update attendance (Admin)
router.put('/:attendanceId', async (req, res) => {
  try {
    if (!['admin', 'owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { attendanceId } = req.params;
    const { status, notes } = req.body;

    const [result] = await db.query(
      'UPDATE attendance SET status = ?, notes = ? WHERE id = ?',
      [status, notes, attendanceId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    res.json({
      success: true,
      message: 'Attendance record updated successfully'
    });
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating attendance'
    });
  }
});

// Delete attendance (Admin)
router.delete('/:attendanceId', async (req, res) => {
  try {
    if (!['admin', 'owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { attendanceId } = req.params;

    const [result] = await db.query(
      'DELETE FROM attendance WHERE id = ?',
      [attendanceId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    res.json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting attendance'
    });
  }
});

module.exports = router;
