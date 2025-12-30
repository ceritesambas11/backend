const db = require("../config/database");
const { logSuccess, logError } = require("../utils/logger");

// ========================== Tambah Pemasukan ==========================
const addIncome = async (req, res) => {
  try {
    const { tanggal, keterangan, detail, via, total } = req.body;

    await db.query(
      `INSERT INTO incomes (tanggal, keterangan, detail, via, total)
       VALUES (?, ?, ?, ?, ?)`,
      [tanggal, keterangan, detail, via, total]
    );

    logSuccess(`Income added successfully for ${keterangan}`);
    res.status(201).json({ success: true, message: "Data pemasukan berhasil disimpan" });
  } catch (error) {
    logError("Error saving income:", error.message);
    res.status(500).json({ success: false, message: "Gagal menyimpan pemasukan", error: error.message });
  }
};

// ========================== Ambil Semua Data ==========================
const getAllIncomes = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
         id,
         DATE_FORMAT(tanggal, '%d %b %Y') AS tanggal,
         keterangan,
         detail,
         via,
         FORMAT(total, 0, 'id_ID') AS total,
         DATE_FORMAT(created_at, '%d %b %Y %H:%i') AS created_at
       FROM incomes
       ORDER BY tanggal DESC`
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    logError("Error fetching incomes:", error.message);
    res.status(500).json({ success: false, message: "Gagal mengambil data pemasukan", error: error.message });
  }
};

// ========================== Hapus Data ==========================
const deleteIncome = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM incomes WHERE id = ?`, [id]);
    res.json({ success: true, message: "Data pemasukan berhasil dihapus" });
  } catch (error) {
    logError("Error deleting income:", error.message);
    res.status(500).json({ success: false, message: "Gagal menghapus data pemasukan" });
  }
};

module.exports = { addIncome, getAllIncomes, deleteIncome };
