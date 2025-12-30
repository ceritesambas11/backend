const express = require("express");
const router = express.Router();
const db = require("../config/database"); // ? Path yang benar ke config/database.js
const { authenticate, authorizeRoles } = require("../middleware/auth");

// pastikan hanya OWNER
function onlyOwner(req, res, next) {
    if (req.user.role !== "owner") {
        return res.status(403).json({ message: "Owner only access" });
    }
    next();
}

// ========================
//  GET ALL TABLES
// ========================
router.get("/tables", authenticate, onlyOwner, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT table_name 
             FROM information_schema.tables 
             WHERE table_schema = DATABASE()
             ORDER BY table_name`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
//  GET TABLE DATA + COLUMNS
// ========================
router.get("/tables/:name", authenticate, onlyOwner, async (req, res) => {
    const table = req.params.name;

    try {
        const [columns] = await db.query(`DESCRIBE \`${table}\``);
        const [data] = await db.query(`SELECT * FROM \`${table}\``);

        res.json({
            columns,
            data,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
//  UPDATE ONE CELL
// ========================
router.patch("/tables/:name/:id", authenticate, onlyOwner, async (req, res) => {
    const table = req.params.name;
    const id = req.params.id;
    const { column, value } = req.body;

    try {
        await db.query(
            `UPDATE \`${table}\` SET \`${column}\` = ? WHERE id = ?`,
            [value, id]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================
//  DELETE ROW
// ========================
router.delete("/tables/:name/:id", authenticate, onlyOwner, async (req, res) => {
    const table = req.params.name;
    const id = req.params.id;

    try {
        await db.query(`DELETE FROM \`${table}\` WHERE id = ?`, [id]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;