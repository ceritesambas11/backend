const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

// Protect all routes
router.use(authenticate);

// ==================== HELPER: Save Base64 Photo to File ====================
const savePhotoToFile = (base64Data, prefix = 'attendance') => {
  console.log('\n?? === savePhotoToFile START ===');
  console.log('?? Prefix:', prefix);
  console.log('?? Data exists:', !!base64Data);
  console.log('?? Data type:', typeof base64Data);
  
  if (!base64Data) {
    console.log('?? No base64Data provided - returning null');
    console.log('?? === savePhotoToFile END ===\n');
    return null;
  }
  
  console.log('?? Data length:', base64Data.length);
  console.log('?? First 100 chars:', base64Data.substring(0, 100));
  
  try {
    // Cek apakah sudah dalam format path (bukan base64)
    if (!base64Data.startsWith('data:image')) {
      console.log('? Already a path (not base64):', base64Data);
      console.log('?? === savePhotoToFile END ===\n');
      return base64Data;
    }
    
    console.log('?? Parsing base64 data...');
    
    // Extract base64 data
    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      console.error('? Invalid base64 format - regex no match');
      console.error('? Data sample:', base64Data.substring(0, 200));
      console.log('?? === savePhotoToFile END ===\n');
      return null;
    }
    
    const ext = matches[1];
    const data = matches[2];
    
    console.log('? Image extension:', ext);
    console.log('? Base64 data length:', data.length);
    
    const buffer = Buffer.from(data, 'base64');
    console.log('? Buffer size:', buffer.length, 'bytes');
    
    // Generate unique filename
    const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
    console.log('? Generated filename:', filename);
    
    // Ensure directory exists
    const uploadDir = path.join(__dirname, '..', 'uploads', 'attendance');
    console.log('?? Target directory:', uploadDir);
    console.log('?? Directory exists:', fs.existsSync(uploadDir));
    
    if (!fs.existsSync(uploadDir)) {
      console.log('?? Creating directory...');
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('? Directory created');
    }
    
    // Save file
    const filepath = path.join(uploadDir, filename);
    console.log('?? Full filepath:', filepath);
    console.log('?? Attempting to write file...');
    
    fs.writeFileSync(filepath, buffer);
    
    console.log('? File written successfully!');
    
    // Verify file was created
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      console.log('? File verified! Size:', stats.size, 'bytes');
    } else {
      console.error('? File was not created!');
    }
    
    // Return relative path for database
    const relativePath = `/uploads/attendance/${filename}`;
    console.log('? Returning relative path:', relativePath);
    console.log('?? === savePhotoToFile END ===\n');
    
    return relativePath;
  } catch (error) {
    console.error('? ERROR in savePhotoToFile:');
    console.error('? Error name:', error.name);
    console.error('? Error message:', error.message);
    console.error('? Error stack:', error.stack);
    console.log('?? === savePhotoToFile END (ERROR) ===\n');
    return null;
  }
};

// ==================== HELPER: Check if role matches shift ====================
const checkRoleMatchesShift = (userRole, shiftRoles) => {
  if (!shiftRoles) return false;
  
  try {
    // Parse JSON jika masih string
    let rolesArray = shiftRoles;
    if (typeof shiftRoles === 'string') {
      rolesArray = JSON.parse(shiftRoles);
    }
    
    // Cek apakah "all" atau role user ada di array
    if (rolesArray.includes('all')) return true;
    if (rolesArray.includes(userRole)) return true;
    
    // Handle variasi penulisan role
    const roleVariants = {
      'desainer': ['desainer', 'designer', 'desain', 'design'],
      'designer': ['desainer', 'designer', 'desain', 'design'],
      'operator': ['operator', 'op'],
      'admin': ['admin', 'administrator'],
      'owner': ['owner', 'pemilik']
    };
    
    // Cek dengan variasi
    const userVariants = roleVariants[userRole.toLowerCase()] || [userRole.toLowerCase()];
    for (const variant of userVariants) {
      if (rolesArray.map(r => r.toLowerCase()).includes(variant)) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error parsing roles:', error);
    return false;
  }
};

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

// ==================== CLOCK IN ====================
router.post('/clock-in', async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { latitude, longitude, photo } = req.body;

    console.log('\n?? === CLOCK-IN REQUEST START ===');
    console.log('?? User ID:', userId);
    console.log('?? User Role:', userRole);
    console.log('?? Location:', { latitude, longitude });
    console.log('?? Photo received:', !!photo);

    // Gunakan waktu WIB (Asia/Jakarta)
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const today = now.toISOString().split('T')[0];
    console.log("?? Current Time (WIB):", now.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));

    // Cek apakah sudah clock-in hari ini
    const [existing] = await db.query(
      'SELECT * FROM attendance WHERE user_id = ? AND DATE(date) = ?',
      [userId, today]
    );

    if (existing.length > 0) {
      console.log('?? User already clocked in today');
      console.log('?? === CLOCK-IN REQUEST END ===\n');
      return res.status(400).json({
        success: false,
        message: 'Anda sudah melakukan clock-in hari ini'
      });
    }

    // Tentukan day category
    const dayIndex = now.getDay(); // 0 = Sunday, 6 = Saturday
    let dayCategory = 'weekday';
    if (dayIndex === 6) dayCategory = 'saturday';
    else if (dayIndex === 0) dayCategory = 'sunday';
    
    console.log("?? Day category:", dayCategory, "| Day index:", dayIndex);

    // Cari shift yang sesuai dengan pengecekan JSON roles
    const [allShifts] = await db.query(`
      SELECT * FROM shift_settings 
      WHERE is_active = 1 
      AND (day_of_week = ? OR day_of_week = 'all')
      ORDER BY 
        CASE WHEN day_of_week = ? THEN 1 ELSE 2 END,
        clock_in_time ASC
    `, [dayCategory, dayCategory]);

    console.log("?? Found", allShifts.length, "potential shift(s)");

    // Filter shift berdasarkan role
    let shiftConfig = null;
    for (const shift of allShifts) {
      console.log("?? Checking shift:", shift.shift_name, "| Roles:", shift.roles);
      if (checkRoleMatchesShift(userRole, shift.roles)) {
        shiftConfig = shift;
        console.log("? Matched shift:", shift.shift_name);
        break;
      }
    }

    if (!shiftConfig) {
      console.log("? No matching shift found for role:", userRole);
      console.log('?? === CLOCK-IN REQUEST END ===\n');
      return res.status(400).json({
        success: false,
        message: `Tidak ada shift aktif untuk role "${userRole}" pada hari ini. Silakan hubungi admin.`
      });
    }

    // ? FIXED: Hitung keterlambatan dalam MENIT
    const [hours, minutes] = shiftConfig.clock_in_time.split(':').map(Number);
    const expectedMinutes = hours * 60 + minutes;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const tolerance = shiftConfig.late_tolerance_minutes || 0;

    let status = 'on_time';
    let lateMinutes = 0; // ? ADDED: Variable untuk menyimpan menit keterlambatan

    if (currentMinutes > (expectedMinutes + tolerance)) {
      status = 'late';
      lateMinutes = currentMinutes - (expectedMinutes + tolerance); // ? ADDED: Hitung keterlambatan
    }

    console.log("? Expected:", expectedMinutes, "min | Current:", currentMinutes, "min | Tolerance:", tolerance, "min");
    console.log("?? Status:", status);
    console.log("?? Late Minutes:", lateMinutes); // ? ADDED: Log keterlambatan

    // Simpan foto ke file
    console.log('\n?? Calling savePhotoToFile...');
    const photoPath = savePhotoToFile(photo, 'clockin');
    console.log('?? Result from savePhotoToFile:', photoPath);
    
    if (!photoPath && photo) {
      console.error('?? WARNING: Photo data exists but savePhotoToFile returned null!');
      console.error('?? This means photo saving FAILED');
    } else if (photoPath) {
      console.log('? Photo saved successfully to:', photoPath);
    } else {
      console.log('?? No photo provided by user (this is OK)');
    }

    // ? FIXED: Simpan ke database dengan kolom late_minutes
    console.log('\n?? Saving to database...');
    const [result] = await db.query(
      `INSERT INTO attendance 
       (user_id, date, clock_in, shift, location, photo, status, late_minutes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, 
        today, 
        now, 
        shiftConfig.shift_name,
        JSON.stringify({ latitude, longitude }),
        photoPath,
        status,
        lateMinutes // ? ADDED: Simpan menit keterlambatan
      ]
    );

    console.log('? Database insert successful! ID:', result.insertId);
    console.log('? Status:', status);
    console.log('? Late minutes saved:', lateMinutes); // ? ADDED
    console.log('? Photo path:', photoPath);
    console.log('?? === CLOCK-IN REQUEST END ===\n');

    res.json({
      success: true,
      message: 'Clock-in berhasil',
      data: {
        id: result.insertId,
        status: status,
        clock_in: now,
        shift: shiftConfig.shift_name,
        expected_time: shiftConfig.clock_in_time,
        tolerance_minutes: tolerance,
        late_minutes: lateMinutes, // ? ADDED: Return ke frontend
        photo: photoPath
      }
    });
  } catch (error) {
    console.error('? ERROR in clock-in:');
    console.error('? Error:', error.message);
    console.error('? Stack:', error.stack);
    console.log('?? === CLOCK-IN REQUEST END (ERROR) ===\n');
    res.status(500).json({
      success: false,
      message: 'Server error during clock in: ' + error.message
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

    console.log('\n?? === CLOCK-OUT REQUEST START ===');
    console.log('?? User ID:', userId);
    console.log('?? Location:', { latitude, longitude });
    console.log('?? Photo received:', !!photo);
    console.log("?? Current Time (WIB):", now.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));

    // Ambil record hari ini
    const [records] = await db.query(
      'SELECT * FROM attendance WHERE user_id = ? AND DATE(date) = ?',
      [userId, today]
    );

    if (records.length === 0) {
      console.log('? No clock-in record found today');
      console.log('?? === CLOCK-OUT REQUEST END ===\n');
      return res.status(400).json({
        success: false,
        message: 'Tidak ada record clock-in hari ini. Silakan clock-in terlebih dahulu.'
      });
    }

    const record = records[0];
    if (record.clock_out) {
      console.log('?? User already clocked out today');
      console.log('?? === CLOCK-OUT REQUEST END ===\n');
      return res.status(400).json({
        success: false,
        message: 'Anda sudah melakukan clock-out hari ini'
      });
    }

    // Hitung durasi kerja
    const clockIn = new Date(record.clock_in);
    const diffMs = now - clockIn;
    const durationHours = diffMs / (1000 * 60 * 60);

    console.log('? Clock-in time:', clockIn.toLocaleString("id-ID"));
    console.log('?? Work duration:', durationHours.toFixed(2), 'hours');

    // Simpan foto ke file
    console.log('\n?? Calling savePhotoToFile for clock-out...');
    const photoOutPath = savePhotoToFile(photo, 'clockout');
    console.log('?? Result from savePhotoToFile:', photoOutPath);
    
    if (!photoOutPath && photo) {
      console.error('?? WARNING: Photo data exists but savePhotoToFile returned null!');
    } else if (photoOutPath) {
      console.log('? Photo saved successfully to:', photoOutPath);
    } else {
      console.log('?? No photo provided by user (this is OK)');
    }

    // Update clock-out
    console.log('\n?? Updating database...');
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
        photoOutPath,
        durationHours.toFixed(2), 
        record.id
      ]
    );

    console.log('? Clock-out successful! Record ID:', record.id);
    console.log('? Photo_out path:', photoOutPath);
    console.log('?? === CLOCK-OUT REQUEST END ===\n');

    res.json({
      success: true,
      message: 'Clock-out berhasil',
      data: {
        clock_out: now,
        work_duration: durationHours.toFixed(2),
        photo_out: photoOutPath
      }
    });
  } catch (error) {
    console.error('? ERROR in clock-out:');
    console.error('? Error:', error.message);
    console.error('? Stack:', error.stack);
    console.log('?? === CLOCK-OUT REQUEST END (ERROR) ===\n');
    res.status(500).json({
      success: false,
      message: 'Server error during clock out: ' + error.message
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

// Get attendance statistics (Admin)
router.get('/statistics', async (req, res) => {
  try {
    if (!['admin', 'owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { month, year } = req.query;
    const currentDate = new Date();
    const targetMonth = month || (currentDate.getMonth() + 1);
    const targetYear = year || currentDate.getFullYear();

    // Total attendance
    const [totalCount] = await db.query(
      `SELECT COUNT(*) as count FROM attendance 
       WHERE MONTH(date) = ? AND YEAR(date) = ?`,
      [targetMonth, targetYear]
    );

    // On time vs Late
    const [statusCount] = await db.query(
      `SELECT status, COUNT(*) as count FROM attendance 
       WHERE MONTH(date) = ? AND YEAR(date) = ?
       GROUP BY status`,
      [targetMonth, targetYear]
    );

    // Average late minutes
    const [avgLate] = await db.query(
      `SELECT AVG(late_minutes) as avg_late FROM attendance 
       WHERE MONTH(date) = ? AND YEAR(date) = ? AND status = 'late'`,
      [targetMonth, targetYear]
    );

    // By user
    const [byUser] = await db.query(
      `SELECT u.full_name, u.role,
              COUNT(*) as total_days,
              SUM(CASE WHEN a.status = 'on_time' THEN 1 ELSE 0 END) as on_time_count,
              SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as late_count,
              AVG(CASE WHEN a.status = 'late' THEN a.late_minutes ELSE 0 END) as avg_late_minutes
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE MONTH(a.date) = ? AND YEAR(a.date) = ?
       GROUP BY a.user_id, u.full_name, u.role
       ORDER BY late_count DESC`,
      [targetMonth, targetYear]
    );

    res.json({
      success: true,
      data: {
        period: { month: targetMonth, year: targetYear },
        total_attendance: totalCount[0].count,
        by_status: statusCount,
        average_late_minutes: avgLate[0].avg_late || 0,
        by_user: byUser
      }
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching statistics'
    });
  }
});

// ==================== GET ATTENDANCE BY USER ID (untuk Payroll) ====================
router.get('/user/:userId', async (req, res) => {
  try {
    // Cek akses: Owner/Admin bisa lihat semua, user biasa hanya bisa lihat miliknya
    const requesterId = req.user.id;
    const requesterRole = req.user.role;
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    // Authorization check
    if (!['admin', 'owner'].includes(requesterRole) && requesterId !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own attendance.'
      });
    }

    console.log('\n?? === GET USER ATTENDANCE ===');
    console.log('?? User ID:', userId);
    console.log('?? Date Range:', startDate, 'to', endDate);

    // Build query
    let query = `
      SELECT 
        a.id,
        a.user_id,
        a.date,
        a.shift,
        a.status,
        a.late_minutes,
        a.clock_in,
        a.clock_out,
        a.work_duration,
        a.location,
        a.location_out,
        a.photo,
        a.photo_out,
        a.notes
      FROM attendance a
      WHERE a.user_id = ?
    `;
    const params = [userId];

    // Add date filters if provided
    if (startDate && endDate) {
      query += ' AND a.date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ' AND a.date >= ?';
      params.push(startDate);
    } else if (endDate) {
      query += ' AND a.date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY a.date DESC';

    console.log('?? Executing query with params:', params);

    const [records] = await db.query(query, params);

    console.log('? Found', records.length, 'attendance records');
    
    // Log sample untuk debug
    if (records.length > 0) {
      const lateRecords = records.filter(r => r.status === 'late');
      if (lateRecords.length > 0) {
        console.log('? Sample late record:', {
          date: lateRecords[0].date,
          status: lateRecords[0].status,
          late_minutes: lateRecords[0].late_minutes
        });
      }
    }

    res.json({
      success: true,
      data: records
    });

  } catch (error) {
    console.error('? Error fetching user attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user attendance: ' + error.message
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
    const { status, notes, late_minutes } = req.body;

    const [result] = await db.query(
      'UPDATE attendance SET status = ?, notes = ?, late_minutes = ? WHERE id = ?',
      [status, notes, late_minutes || 0, attendanceId]
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

    // Get photo paths before delete (for cleanup)
    const [record] = await db.query(
      'SELECT photo, photo_out FROM attendance WHERE id = ?',
      [attendanceId]
    );

    if (record.length > 0) {
      // Delete photos if exist
      const photoPath = record[0].photo;
      const photoOutPath = record[0].photo_out;

      if (photoPath) {
        const fullPath = path.join(__dirname, '..', photoPath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          console.log('??? Deleted photo:', photoPath);
        }
      }

      if (photoOutPath) {
        const fullPath = path.join(__dirname, '..', photoOutPath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          console.log('??? Deleted photo_out:', photoOutPath);
        }
      }
    }

    // Delete record
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