const db = require("../database");

// ?? GET /api/attendance/owner/all
exports.getAllAttendance = async (req, res) => {
  try {
    const { date, role, status, search } = req.query;
    let query = `
      SELECT a.*, u.full_name, u.role
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (date) {
      query += " AND DATE(a.date) = ?";
      params.push(date);
    }
    if (role) {
      query += " AND u.role = ?";
      params.push(role);
    }
    if (status) {
      query += " AND a.status = ?";
      params.push(status);
    }
    if (search) {
      query += " AND u.full_name LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY a.date DESC";
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ?? GET /api/attendance/owner/:id
exports.getAttendanceById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.*, u.full_name, u.role 
       FROM attendance a 
       JOIN users u ON a.user_id = u.id 
       WHERE a.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ?? PUT /api/attendance/owner/:id
exports.updateAttendance = async (req, res) => {
  try {
    const { clock_in_time, clock_out_time, status, note } = req.body;
    await db.query(
      `UPDATE attendance SET clock_in_time=?, clock_out_time=?, status=?, note=? WHERE id=?`,
      [clock_in_time, clock_out_time, status, note, req.params.id]
    );
    res.json({ message: "Attendance updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ?? DELETE /api/attendance/owner/:id
exports.deleteAttendance = async (req, res) => {
  try {
    await db.query(`DELETE FROM attendance WHERE id=?`, [req.params.id]);
    res.json({ message: "Attendance deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ?? GET /api/attendance/owner/summary/daily
exports.getDailySummary = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        DATE(date) as date,
        COUNT(*) as total,
        SUM(status='present') as hadir,
        SUM(status='late') as telat,
        SUM(status='absent') as tidak_hadir
      FROM attendance
      GROUP BY DATE(date)
      ORDER BY DATE(date) DESC
      LIMIT 30
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ?? GET /api/attendance/owner/summary/monthly
exports.getMonthlySummary = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        DATE_FORMAT(date, '%Y-%m') as bulan,
        COUNT(*) as total,
        SUM(status='present') as hadir,
        SUM(status='late') as telat,
        SUM(status='absent') as tidak_hadir
      FROM attendance
      GROUP BY DATE_FORMAT(date, '%Y-%m')
      ORDER BY bulan DESC
      LIMIT 12
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
