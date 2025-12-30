const express = require("express");
const router = express.Router();
const { authenticate, authorizeRoles } = require("../middleware/auth");
const db = require("../config/database");

router.use(authenticate);
router.use(authorizeRoles("owner"));

// ?? 1. Tampil semua kehadiran (global)
router.get("/all", async (req, res) => {
  try {
    const { name, date, shift, role } = req.query;
    let query = `
      SELECT 
        a.id,
        a.user_id,
        u.full_name,
        u.role,
        a.date,
        a.shift,
        a.status,
        a.clock_in,
        a.clock_out,
        a.location,
        a.location_out,
        a.photo,
        a.photo_out,
        a.work_duration,
        a.notes
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (name) {
      query += " AND u.full_name LIKE ?";
      params.push(`%${name}%`);
    }
    if (date) {
      query += " AND DATE(a.date) = ?";
      params.push(date);
    }
    if (shift) {
      query += " AND a.shift = ?";
      params.push(shift);
    }
    if (role) {
      query += " AND u.role = ?";
      params.push(role);
    }

    query += " ORDER BY a.date DESC, a.clock_in DESC";
    const [rows] = await db.query(query, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error("Error (Owner All):", error);
    res.status(500).json({ success: false, message: "Server error fetching attendance" });
  }
});

// ?? 2. Detail per karyawan
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const [rows] = await db.query(
      `SELECT a.*, u.full_name, u.role
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.user_id = ?
       ORDER BY a.date DESC LIMIT 100`,
      [userId]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error (Owner Detail):", error);
    res.status(500).json({ success: false, message: "Server error fetching user attendance" });
  }
});

// ?? 3. Edit record kehadiran
router.put("/:attendanceId", async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { status, notes } = req.body;
    const [result] = await db.query(
      "UPDATE attendance SET status = ?, notes = ? WHERE id = ?",
      [status, notes, attendanceId]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, message: "Attendance updated" });
  } catch (error) {
    console.error("Error (Owner Update):", error);
    res.status(500).json({ success: false, message: "Server error updating attendance" });
  }
});

// ?? 4. Hapus record
router.delete("/:attendanceId", async (req, res) => {
  try {
    const { attendanceId } = req.params;
    await db.query("DELETE FROM attendance WHERE id = ?", [attendanceId]);
    res.json({ success: true, message: "Attendance deleted successfully" });
  } catch (error) {
    console.error("Error (Owner Delete):", error);
    res.status(500).json({ success: false, message: "Server error deleting attendance" });
  }
});

// ?? 5. Ringkasan harian/bulanan
router.get("/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const end = endDate || new Date().toISOString().split("T")[0];

    const [summary] = await db.query(
      `SELECT 
        COUNT(DISTINCT user_id) AS total_employees,
        COUNT(*) AS total_records,
        SUM(status='on_time') AS on_time,
        SUM(status='late') AS late,
        SUM(status='absent') AS absent,
        AVG(work_duration) AS avg_work_duration
      FROM attendance
      WHERE DATE(date) BETWEEN ? AND ?`,
      [start, end]
    );
    res.json({ success: true, period: { start, end }, data: summary[0] });
  } catch (error) {
    console.error("Error (Owner Summary):", error);
    res.status(500).json({ success: false, message: "Server error fetching summary" });
  }
});

module.exports = router;