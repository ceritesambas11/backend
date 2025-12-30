const express = require('express');
const router = express.Router();

// Import controller
const {
  calculateSalary,
  savePayroll,
  getPayrollHistory,
  getAllPayrolls,
  getMonthlyLoanSummary,
  calculateSalaryV2,         // ?? Import function baru
} = require('../controllers/payrollController');

// ===============================
// ?? ROUTES: PAYROLL MANAGEMENT
// ===============================

// ? EXISTING ROUTES (TIDAK BERUBAH)
// Hitung gaji otomatis (cara lama)
router.post('/calculate', calculateSalary);

// Simpan data gaji ke tabel payroll
router.post('/save', savePayroll);

// Ambil riwayat payroll berdasarkan user_id
router.get('/history/:user_id', getPayrollHistory);

// Ambil semua payroll (untuk Owner)
router.get('/', getAllPayrolls);

// Ambil ringkasan pinjaman bulanan
router.get('/loan-summary/:userId', getMonthlyLoanSummary);

// ===============================
// ?? NEW ROUTES (ENHANCEMENT)
// ===============================

// Hitung gaji dengan detail keterlambatan per menit
router.post('/calculate-v2', calculateSalaryV2);

// Alias untuk backward compatibility
router.post('/calculate-with-late-minutes', calculateSalaryV2);

// ===============================
// ?? Export router
// ===============================
module.exports = router;