const express = require("express");
const router = express.Router();
const { addExpense, getAllExpenses, deleteExpense } = require("../controllers/expenseController");

router.post("/", addExpense);          // Tambah pengeluaran
router.get("/", getAllExpenses);       // Ambil semua pengeluaran
router.delete("/:id", deleteExpense);  // Hapus pengeluaran

module.exports = router;
