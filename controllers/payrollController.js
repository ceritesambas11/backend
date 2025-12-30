const db = require("../config/database");
const { logSuccess, logError, logInfo } = require("../utils/logger");

// ======================================================================
// Hitung gaji karyawan (calculateSalary) - EXISTING (TIDAK DIUBAH)
// ======================================================================
const calculateSalary = async (req, res) => {
  try {
    const {
      user_id,
      start_date,
      end_date,
      bonus = 0,
      deduction = 0,
      overtime = 0,
    } = req.body;

    logInfo(`Calculating salary for user ID: ${user_id}`);

    if (!user_id || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: user_id, start_date, end_date",
      });
    }

    const [users] = await db.query(
      `SELECT id, username, full_name, role, salary_type, salary_amount 
       FROM users WHERE id = ?`,
      [user_id]
    );

    if (users.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const user = users[0];

    const [attendanceRecords] = await db.query(
      `SELECT date, status, shift 
       FROM attendance 
       WHERE user_id = ? AND date BETWEEN ? AND ?`,
      [user_id, start_date, end_date]
    );

    const totalDays = attendanceRecords.length;
    const baseSalary =
      user.salary_type === "daily"
        ? user.salary_amount * totalDays
        : user.salary_amount;

    const [loans] = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total_loan 
       FROM loans WHERE user_id = ? AND status = 'active'`,
      [user_id]
    );

    const totalLoan = loans[0].total_loan || 0;
    const totalSalary =
      baseSalary + Number(bonus) + Number(overtime) - Number(deduction) - totalLoan;

    res.json({
      success: true,
      message: "Salary calculated successfully",
      data: {
        user: user.full_name,
        period: { start_date, end_date },
        attendance: totalDays,
        totalLoan,
        baseSalary,
        totalSalary,
      },
    });
  } catch (error) {
    logError("Error calculating salary:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ======================================================================
// ?? NEW: Hitung gaji dengan detail keterlambatan per menit
// ======================================================================
const calculateSalaryV2 = async (req, res) => {
  try {
    const {
      user_id,
      start_date,
      end_date,
      bonus = 0,
      deduction = 0,
      overtime = 0,
    } = req.body;

    logInfo(`[V2] Calculating salary with late minutes for user ID: ${user_id}`);

    if (!user_id || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: user_id, start_date, end_date",
      });
    }

    // 1. Get user data
    const [users] = await db.query(
      `SELECT id, username, full_name, role, salary_type, salary_amount 
       FROM users WHERE id = ?`,
      [user_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = users[0];

    // 2. Get attendance WITH late calculation (? FIXED: JOIN by shift name)
    const [attendanceRecords] = await db.query(
      `SELECT 
         a.id,
         a.date,
         a.clock_in,
         a.check_out as clock_out,
         a.status,
         a.shift,
         a.late_minutes,
         s.shift_name,
         s.clock_in_time,
         s.clock_out_time,
         s.late_tolerance_minutes,
         DAYOFWEEK(a.date) = 1 as is_sunday,
         ADDTIME(s.clock_in_time, SEC_TO_TIME(COALESCE(s.late_tolerance_minutes, 15) * 60)) as safe_until_time
       FROM attendance a
       LEFT JOIN shift_settings s ON LOWER(TRIM(a.shift)) = LOWER(TRIM(s.shift_name)) AND s.is_active = 1
       WHERE a.user_id = ? 
         AND a.date BETWEEN ? AND ?
       ORDER BY a.date DESC`,
      [user_id, start_date, end_date]
    );

    // 3. Calculate statistics
    const jumlahMasuk = attendanceRecords.filter(r => r.status !== 'absent' && r.status !== 'leave' && r.status !== 'sick').length;
    const jumlahTelat = attendanceRecords.filter(r => (r.late_minutes || 0) > 0).length;
    const totalMenitTelat = attendanceRecords.reduce((sum, r) => sum + (r.late_minutes || 0), 0);
    const rataTelat = jumlahTelat > 0 ? Math.round(totalMenitTelat / jumlahTelat) : 0;
    const masukMinggu = attendanceRecords.filter(r => r.is_sunday && r.status !== 'absent' && r.status !== 'leave' && r.status !== 'sick').length;
    const totalDays = attendanceRecords.length;

    // 4. Calculate base salary
    const baseSalary = user.salary_type === 'daily' 
      ? user.salary_amount * jumlahMasuk 
      : user.salary_amount;

    // 5. Get loans
    const [loans] = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total_loan 
       FROM loans WHERE user_id = ? AND status = 'active'`,
      [user_id]
    );

    const totalLoan = loans[0].total_loan || 0;

    // 6. Calculate total salary
    const totalSalary = baseSalary + Number(bonus) + Number(overtime) - Number(deduction) - totalLoan;

    // 7. Get detail telat (hanya yang telat)
    const detailTelat = attendanceRecords
      .filter(r => (r.late_minutes || 0) > 0)
      .map(r => ({
        date: r.date,
        check_in: r.clock_in,
        late_minutes: r.late_minutes,
        shift_name: r.shift_name || r.shift,
        clock_in_time: r.clock_in_time,
        tolerance: r.late_tolerance_minutes || 15,
        safe_until: r.safe_until_time
      }));

    // 8. Response
    res.json({
      success: true,
      message: "Salary calculated successfully (V2 with late minutes)",
      version: "2.0",
      data: {
        user: {
          id: user.id,
          username: user.username,
          name: user.full_name,
          role: user.role,
          salary_type: user.salary_type,
          salary_amount: user.salary_amount
        },
        period: {
          start_date,
          end_date
        },
        attendance: {
          jumlah_masuk: jumlahMasuk,
          jumlah_telat: jumlahTelat,
          total_menit_telat: totalMenitTelat,
          rata_telat: rataTelat,
          masuk_minggu: masukMinggu,
          total_days: totalDays,
          detail_telat: detailTelat
        },
        salary: {
          base: baseSalary,
          bonus: Number(bonus),
          overtime: Number(overtime),
          deduction: Number(deduction),
          loan: totalLoan,
          total: totalSalary
        }
      }
    });

  } catch (error) {
    logError("Error calculating salary V2:", error.message);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ======================================================================
// Simpan gaji ke database (savePayroll) - EXISTING (TIDAK DIUBAH)
// ======================================================================
const savePayroll = async (req, res) => {
  try {
    const {
      user_id,
      period_start,
      base_salary = 0,
      bonus = 0,
      overtime = 0,
      deduction = 0,
      loan_deduction = 0,
    } = req.body;

    if (!user_id) {
      return res
        .status(400)
        .json({ success: false, message: "user_id wajib diisi" });
    }

    const period = period_start
      ? period_start.slice(0, 7)
      : new Date().toISOString().slice(0, 7);

    const [result] = await db.query(
      `INSERT INTO payroll 
       (user_id, period, base_salary, bonus, deduction, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'paid', NOW(), NOW())`,
      [
        user_id,
        period,
        Number(base_salary),
        Number(bonus) + Number(overtime),
        Number(deduction) + Number(loan_deduction),
      ]
    );

    logSuccess(`Payroll saved successfully (ID: ${result.insertId})`);
    res.status(201).json({
      success: true,
      message: "Payroll berhasil disimpan ke tabel 'payroll'",
      id: result.insertId,
    });
  } catch (error) {
    logError("Error saving payroll:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal menyimpan payroll",
      error: error.message,
    });
  }
};

// ======================================================================
// Ambil riwayat payroll per karyawan - EXISTING (TIDAK DIUBAH)
// ======================================================================
const getPayrollHistory = async (req, res) => {
  try {
    const { user_id } = req.params;
    logInfo(`Fetching payroll history for user ID: ${user_id}`);
    
    await db.query("SET lc_time_names = 'id_ID'");
    
    const [payroll] = await db.query(
      `SELECT 
         p.id,
         DATE_FORMAT(STR_TO_DATE(CONCAT(p.period, '-01'), '%Y-%m-%d'), '%b %Y') AS period_name,
         DATE_FORMAT(p.created_at, '%d %b %Y') AS payment_date,
         CONCAT(p.work_days, ' Hari') AS work_days,
         FORMAT(p.base_salary, 0, 'id_ID') AS base_salary,
         FORMAT(p.bonus, 0, 'id_ID') AS bonus,
         FORMAT(p.overtime, 0, 'id_ID') AS overtime,
         FORMAT(p.late_hours, 1, 'id_ID') AS late_hours,
         FORMAT(p.deduction, 0, 'id_ID') AS deduction,
         FORMAT(p.loan, 0, 'id_ID') AS loan,
         FORMAT(p.total, 0, 'id_ID') AS total,
         p.status
       FROM payroll p
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [user_id]
    );

    res.json({
      success: true,
      message: "Payroll history retrieved successfully",
      data: payroll,
    });
  } catch (error) {
    logError("Error fetching payroll history:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payroll history",
      error: error.message,
    });
  }
};

// ======================================================================
// Ambil semua data payroll - EXISTING (TIDAK DIUBAH)
// ======================================================================
const getAllPayrolls = async (req, res) => {
  try {
    const [payroll] = await db.query(
      `SELECT p.*, u.full_name AS employee_name, u.role AS employee_role
       FROM payroll p
       LEFT JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC`
    );

    res.json({ success: true, data: payroll });
  } catch (error) {
    logError("Error fetching payroll records:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch payroll records" });
  }
};

// ======================================================================
// Ambil total pinjaman bulanan - EXISTING (TIDAK DIUBAH)
// ======================================================================
const getMonthlyLoanSummary = async (req, res) => {
  try {
    const { userId } = req.params;
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId wajib diisi",
      });
    }

    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const [rows] = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_loan
       FROM loans
       WHERE user_id = ? 
         AND status = 'active'
         AND loan_date BETWEEN ? AND ?`,
      [userId, startDate, endDate]
    );

    const totalLoan = rows[0].total_loan || 0;
    
    console.log(`?? Loan Summary: userId=${userId}, month=${month}, totalLoan=${totalLoan}`);

    res.json({
      success: true,
      month,
      totalLoan,
    });
  } catch (error) {
    logError("?? Error fetching monthly loan summary:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil total pinjaman bulanan",
      error: error.message,
    });
  }
};

module.exports = {
  calculateSalary,        // ? EXISTING
  savePayroll,            // ? EXISTING
  getPayrollHistory,      // ? EXISTING
  getAllPayrolls,         // ? EXISTING
  getMonthlyLoanSummary,  // ? EXISTING
  calculateSalaryV2,      // ?? NEW
};