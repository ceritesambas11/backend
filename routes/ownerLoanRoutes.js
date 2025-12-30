const express = require("express");
const router = express.Router();
const { authenticate, authorizeRoles } = require("../middleware/auth");
const db = require("../config/database");

router.use(authenticate);
router.use(authorizeRoles("owner"));

// ? Versi final sesuai struktur tabel "loans"
router.get("/all", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        l.id,
        l.user_id,
        u.full_name AS name,
        u.role,
        l.amount,
        l.monthly_installment,
        l.status,
        l.loan_date
      FROM loans l
      JOIN users u ON l.user_id = u.id
      ORDER BY l.loan_date DESC
    `);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching owner loans:", error);
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  }
});

// DELETE /api/loans/owner/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM loans WHERE id = ?", [id]);
    res.json({ success: true, message: "Loan deleted successfully" });
  } catch (err) {
    console.error("Error deleting loan:", err);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
});

module.exports = router;