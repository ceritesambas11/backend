const express = require("express");
const router = express.Router();
const { authenticate, authorizeRoles } = require("../middleware/auth");
const db = require("../config/database");

router.use(authenticate);
router.use(authorizeRoles("owner"));

// GET /api/payroll/owner/all
router.get("/all", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        p.id,
        p.user_id,
        u.full_name AS name, 
        u.role, 
        p.period, 
        p.base_salary, 
        p.bonus, 
        p.deduction, 
        p.status, 
        p.created_at AS payment_date
      FROM payroll p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error fetching owner payroll:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE /api/payroll/owner/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM payroll WHERE id = ?", [id]);
    res.json({ success: true, message: "Payroll deleted successfully" });
  } catch (err) {
    console.error("Error deleting payroll:", err);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
});

module.exports = router;