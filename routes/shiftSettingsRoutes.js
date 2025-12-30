const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const db = require('../config/database');

// Protect routes
router.use(authenticate);

// ==================== GET ALL SHIFTS ====================
router.get('/', async (req, res) => {
  try {
    const [shifts] = await db.query(`
      SELECT * FROM shift_settings 
      WHERE is_active = 1 
      ORDER BY 
        CASE day_of_week 
          WHEN 'weekday' THEN 1
          WHEN 'saturday' THEN 2
          WHEN 'sunday' THEN 3
          WHEN 'all' THEN 4
        END,
        clock_in_time ASC
    `);

    res.json({
      success: true,
      data: shifts
    });
  } catch (error) {
    console.error('Error fetching shifts:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching shifts'
    });
  }
});

// ==================== CREATE SHIFT (SUPPORT MULTIPLE ROLES) ====================
router.post('/', authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const { shift_name, roles, day_of_week, clock_in_time, clock_out_time, late_tolerance_minutes } = req.body;

    // Validasi
    if (!shift_name || !roles || !clock_in_time || !clock_out_time) {
      return res.status(400).json({
        success: false,
        message: 'Shift name, roles, clock_in_time, dan clock_out_time wajib diisi'
      });
    }

    // Parse roles - terima array atau string JSON
    let rolesJson;
    if (Array.isArray(roles)) {
      rolesJson = JSON.stringify(roles);
    } else if (typeof roles === 'string') {
      try {
        // Coba parse jika sudah JSON string
        const parsed = JSON.parse(roles);
        rolesJson = JSON.stringify(parsed);
      } catch {
        // Jika bukan JSON, anggap single role
        rolesJson = JSON.stringify([roles]);
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Format roles tidak valid'
      });
    }

    console.log('? Creating shift with roles:', rolesJson);

    const [result] = await db.query(
      `INSERT INTO shift_settings 
       (shift_name, roles, day_of_week, clock_in_time, clock_out_time, late_tolerance_minutes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [shift_name, rolesJson, day_of_week || 'all', clock_in_time, clock_out_time, late_tolerance_minutes || 15]
    );

    res.json({
      success: true,
      message: 'Shift berhasil dibuat',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Error creating shift:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating shift: ' + error.message
    });
  }
});

// ==================== UPDATE SHIFT ====================
router.put('/:id', authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { shift_name, roles, day_of_week, clock_in_time, clock_out_time, late_tolerance_minutes } = req.body;

    // Parse roles
    let rolesJson;
    if (Array.isArray(roles)) {
      rolesJson = JSON.stringify(roles);
    } else if (typeof roles === 'string') {
      try {
        const parsed = JSON.parse(roles);
        rolesJson = JSON.stringify(parsed);
      } catch {
        rolesJson = JSON.stringify([roles]);
      }
    }

    console.log('? Updating shift', id, 'with roles:', rolesJson);

    const [result] = await db.query(
      `UPDATE shift_settings 
       SET shift_name = ?, roles = ?, day_of_week = ?, 
           clock_in_time = ?, clock_out_time = ?, late_tolerance_minutes = ?
       WHERE id = ?`,
      [shift_name, rolesJson, day_of_week, clock_in_time, clock_out_time, late_tolerance_minutes, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shift tidak ditemukan'
      });
    }

    res.json({
      success: true,
      message: 'Shift berhasil diupdate'
    });
  } catch (error) {
    console.error('Error updating shift:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating shift: ' + error.message
    });
  }
});

// ==================== DELETE SHIFT ====================
router.delete('/:id', authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      'DELETE FROM shift_settings WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shift tidak ditemukan'
      });
    }

    res.json({
      success: true,
      message: 'Shift berhasil dihapus'
    });
  } catch (error) {
    console.error('Error deleting shift:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting shift'
    });
  }
});

// ==================== TOGGLE ACTIVE STATUS ====================
router.patch('/:id/toggle', authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      'UPDATE shift_settings SET is_active = NOT is_active WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Status shift berhasil diubah'
    });
  } catch (error) {
    console.error('Error toggling shift:', error);
    res.status(500).json({
      success: false,
      message: 'Server error toggling shift status'
    });
  }
});

module.exports = router;