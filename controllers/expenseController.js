const db = require("../config/database");
const { logSuccess, logError, logInfo } = require("../utils/logger");

// ======================================================================
// TAMBAH DATA PENGELUARAN
// ======================================================================
const addExpense = async (req, res) => {
  try {
    const {
      tanggal,
      keterangan,
      jenis_pengeluaran,
      qty,
      harga_satuan,
      jumlah_pinjaman,
      user_id,
      via,
      sumber_dana,
    } = req.body;

    const safeUserId = user_id || null;

    // INSERT KE TABEL EXPENSES
    await db.query(
      `INSERT INTO expenses 
        (tanggal, keterangan, jenis_pengeluaran, qty, harga_satuan, jumlah_pinjaman, user_id, via, sumber_dana)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tanggal,
        keterangan,
        jenis_pengeluaran,
        qty,
        harga_satuan,
        jumlah_pinjaman,
        safeUserId,
        via,
        sumber_dana,
      ]
    );

    console.log("?? PAYLOAD DITERIMA BACKEND:", {
      tanggal,
      keterangan,
      jenis_pengeluaran,
      jumlah_pinjaman,
      user_id,
    });

    // ======================================================================
    // AUTO INSERT PINJAMAN KE TABEL LOANS
    // ======================================================================

    // Jika keterangan = "Pinjaman", maka bikin loan otomatis
    if (keterangan === "Pinjaman" && jumlah_pinjaman && safeUserId) {
      try {
        await db.query(
          `INSERT INTO loans (user_id, amount, loan_date, status)
           VALUES (?, ?, ?, 'active')`,
          [safeUserId, jumlah_pinjaman, tanggal]
        );

        logSuccess(
          `? Pinjaman otomatis tersimpan ke tabel LOANS untuk user ID: ${safeUserId}`
        );
      } catch (err) {
        logError("? Gagal menambahkan ke tabel loans:", err.message);
      }
    } else if (keterangan === "Pinjaman" && !safeUserId) {
      logInfo(
        "? Pinjaman tidak dibuat ke loans karena user_id kosong. Frontend harus mengirim user_id."
      );
    }

    // ======================================================================

    logSuccess(`? Expense added successfully for ${keterangan}`);
    res.status(201).json({
      success: true,
      message: "Data pengeluaran berhasil disimpan",
    });
  } catch (error) {
    logError("? Error saving expense:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal menyimpan pengeluaran",
      error: error.message,
    });
  }
};

// ======================================================================
// AMBIL SEMUA DATA PENGELUARAN
// ======================================================================
const getAllExpenses = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
        e.id,
        DATE_FORMAT(e.tanggal, '%d %b %Y') AS tanggal,
        e.keterangan,
        e.jenis_pengeluaran,
        e.qty,
        e.harga_satuan,
        e.jumlah_pinjaman,
        u.full_name AS nama_karyawan,
        e.via,
        e.sumber_dana,
        FORMAT(e.total, 0, 'id_ID') AS total,
        DATE_FORMAT(e.created_at, '%d %b %Y %H:%i') AS created_at
      FROM expenses e
      LEFT JOIN users u ON e.user_id = u.id
      ORDER BY e.tanggal DESC`
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    logError("? Error fetching expenses:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data pengeluaran",
      error: error.message,
    });
  }
};

// ======================================================================
// HAPUS DATA PENGELUARAN
// ======================================================================
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM expenses WHERE id = ?`, [id]);
    logSuccess(`?? Expense deleted with ID: ${id}`);

    res.json({
      success: true,
      message: "Data pengeluaran berhasil dihapus",
    });
  } catch (error) {
    logError("? Error deleting expense:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus data pengeluaran",
      error: error.message,
    });
  }
};

module.exports = {
  addExpense,
  getAllExpenses,
  deleteExpense,
};
