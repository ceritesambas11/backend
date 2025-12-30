const express = require("express");
const router = express.Router();
const { addIncome, getAllIncomes, deleteIncome } = require("../controllers/incomeController");

router.post("/", addIncome);          // Tambah pemasukan
router.get("/", getAllIncomes);       // Ambil semua pemasukan
router.delete("/:id", deleteIncome);  // Hapus pemasukan

module.exports = router;
