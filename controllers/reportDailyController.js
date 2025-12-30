const db = require("../config/database");

// GET: real-time daily report (query param: date=YYYY-MM-DD)
exports.getDailyReport = async (req, res) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ success:false, message:"Parameter 'date' wajib diisi (YYYY-MM-DD)" });

    // ? saldo_awal: ambil saldo_dalam_laci dari report_daily hari sebelumnya (jika ada)
    const [prev] = await db.query(
      `SELECT saldo_dalam_laci FROM report_daily WHERE tanggal = DATE_SUB(?, INTERVAL 1 DAY) LIMIT 1`,
      [date]
    );
    const saldo_awal = prev.length ? Number(prev[0].saldo_dalam_laci) : 0;

    // Pembayaran Cash (payments: amount, paid_at, method)
    const [[pembayaranCash]] = await db.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE method='Cash' AND DATE(paid_at)=?`,
      [date]
    );

    // Pembayaran Online (BPD Kalbar, BRI, Dana)
    const [[pembayaranOnline]] = await db.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE method IN ('BPD Kalbar','BRI','Dana') AND DATE(paid_at)=?`,
      [date]
    );

    // Pemasukan lain Cash (incomes: tanggal, keterangan, total, via)
    const [[pemasukanLainCash]] = await db.query(
      `SELECT COALESCE(SUM(total),0) AS total FROM incomes WHERE DATE(tanggal)=? AND via='Cash'`,
      [date]
    );

    // Pemasukan lain Online
    const [[pemasukanLainOnline]] = await db.query(
      `SELECT COALESCE(SUM(total),0) AS total FROM incomes WHERE DATE(tanggal)=? AND via IN ('BPD Kalbar','BRI','Dana')`,
      [date]
    );

    // ? PERBAIKAN: Pengeluaran TANPA Pinjaman
    const [[pengeluaran]] = await db.query(
      `SELECT COALESCE(SUM(total),0) AS total 
       FROM expenses 
       WHERE DATE(tanggal)=? AND keterangan != 'Pinjaman'`,
      [date]
    );

    // ? PERBAIKAN: Jumlah Pinjaman (terpisah dari pengeluaran)
    const [[jumlahPinjaman]] = await db.query(
      `SELECT COALESCE(SUM(jumlah_pinjaman),0) AS total 
       FROM expenses 
       WHERE DATE(tanggal)=? AND keterangan = 'Pinjaman'`,
      [date]
    );

    const storCash = 0; // default; frontend bisa kirim override saat save

    // ? RUMUS BARU: Saldo Dalam Laci = Saldo Awal + Pemasukan Cash - Pengeluaran - Pinjaman - Stor Cash
    const saldoDalamLaci = 
      Number(saldo_awal) + 
      Number(pembayaranCash.total) + 
      Number(pemasukanLainCash.total) - 
      Number(pengeluaran.total) - 
      Number(jumlahPinjaman.total) -  // ? Dikurangi pinjaman
      storCash;

    res.json({
      success: true,
      data: {
        tanggal: date,
        saldo_awal: Number(saldo_awal),
        pembayaran_cash: Number(pembayaranCash.total),
        pembayaran_online: Number(pembayaranOnline.total),        // ?? Info saja
        pemasukan_lain_cash: Number(pemasukanLainCash.total),
        pemasukan_lain_online: Number(pemasukanLainOnline.total), // ?? Info saja
        pengeluaran: Number(pengeluaran.total),                   // ? Tanpa pinjaman
        jumlah_pinjaman: Number(jumlahPinjaman.total),            // ? Field baru
        stor_cash: Number(storCash),
        saldo_dalam_laci: Number(saldoDalamLaci)
      }
    });
  } catch (err) {
    console.error("Error getDailyReport:", err);
    res.status(500).json({ success:false, message:"Gagal ambil laporan harian", error: err.message });
  }
};

// POST: simpan arsip laporan harian
exports.saveDailyReport = async (req, res) => {
  try {
    const {
      tanggal,
      saldo_awal = 0,
      pembayaran_cash = 0,
      pembayaran_online = 0,
      pemasukan_lain_cash = 0,
      pemasukan_lain_online = 0,
      pengeluaran = 0,
      jumlah_pinjaman = 0,  // ? Field baru
      stor_cash = 0,
      catatan = "",
      created_by
    } = req.body;

    // ? RUMUS BARU: Saldo Dalam Laci = Saldo Awal + Pemasukan Cash - Pengeluaran - Pinjaman - Stor Cash
    const saldo_dalam_laci = 
      Number(saldo_awal) + 
      Number(pembayaran_cash) + 
      Number(pemasukan_lain_cash) - 
      Number(pengeluaran) - 
      Number(jumlah_pinjaman) -  // ? Dikurangi pinjaman
      Number(stor_cash);

    // Upsert: jika sudah ada laporan untuk tanggal tersebut, update; jika belum, insert
    const [exist] = await db.query(`SELECT id FROM report_daily WHERE tanggal = ? LIMIT 1`, [tanggal]);
    
    if (exist.length) {
      // ? UPDATE: Tambahkan field jumlah_pinjaman
      await db.query(
        `UPDATE report_daily SET
           saldo_awal=?, pembayaran_cash=?, pembayaran_online=?, 
           pemasukan_lain_cash=?, pemasukan_lain_online=?, pengeluaran=?,
           jumlah_pinjaman=?, stor_cash=?, saldo_dalam_laci=?, catatan=?, created_by=?, created_at=NOW()
         WHERE tanggal=?`,
        [
          saldo_awal, pembayaran_cash, pembayaran_online,
          pemasukan_lain_cash, pemasukan_lain_online, pengeluaran,
          jumlah_pinjaman, stor_cash, saldo_dalam_laci, catatan, created_by, tanggal
        ]
      );
      return res.json({ 
        success:true, 
        message:"Laporan harian diupdate", 
        saldo_dalam_laci 
      });
    }

    // ? INSERT: Tambahkan field jumlah_pinjaman
    await db.query(
      `INSERT INTO report_daily
       (tanggal, saldo_awal, pembayaran_cash, pembayaran_online,
        pemasukan_lain_cash, pemasukan_lain_online, pengeluaran, 
        jumlah_pinjaman, stor_cash, saldo_dalam_laci, catatan, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        tanggal, saldo_awal, pembayaran_cash, pembayaran_online,
        pemasukan_lain_cash, pemasukan_lain_online, pengeluaran, 
        jumlah_pinjaman, stor_cash, saldo_dalam_laci, catatan, created_by
      ]
    );

    res.json({ 
      success:true, 
      message:"Laporan harian tersimpan", 
      saldo_dalam_laci 
    });
  } catch (err) {
    console.error("Error saveDailyReport:", err);
    res.status(500).json({ success:false, message:"Gagal simpan laporan harian", error: err.message });
  }
};

// ============ ENDPOINT BARU UNTUK HISTORI ============

// GET: histori laporan harian dengan filter rentang tanggal
exports.getDailyReportHistory = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    let query = `SELECT * FROM report_daily`;
    let params = [];
    
    if (start_date && end_date) {
      query += ` WHERE tanggal BETWEEN ? AND ?`;
      params = [start_date, end_date];
    } else if (start_date) {
      query += ` WHERE tanggal >= ?`;
      params = [start_date];
    } else if (end_date) {
      query += ` WHERE tanggal <= ?`;
      params = [end_date];
    }
    
    query += ` ORDER BY tanggal ASC`; // Terbaru di bawah
    
    const [rows] = await db.query(query, params);
    
    res.json({
      success: true,
      data: rows.map(row => ({
        id: row.id,
        tanggal: row.tanggal,
        saldo_awal: Number(row.saldo_awal),
        pembayaran_cash: Number(row.pembayaran_cash),
        pembayaran_online: Number(row.pembayaran_online),
        pemasukan_lain_cash: Number(row.pemasukan_lain_cash),
        pemasukan_lain_online: Number(row.pemasukan_lain_online),
        pengeluaran: Number(row.pengeluaran),
        jumlah_pinjaman: Number(row.jumlah_pinjaman),
        stor_cash: Number(row.stor_cash),
        saldo_dalam_laci: Number(row.saldo_dalam_laci),
        catatan: row.catatan,
        created_by: row.created_by,
        created_at: row.created_at
      }))
    });
  } catch (err) {
    console.error("Error getDailyReportHistory:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal ambil histori laporan", 
      error: err.message 
    });
  }
};

// DELETE: hapus laporan harian berdasarkan ID
exports.deleteDailyReport = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.query(`DELETE FROM report_daily WHERE id = ?`, [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Data tidak ditemukan" 
      });
    }
    
    res.json({ 
      success: true, 
      message: "Laporan berhasil dihapus" 
    });
  } catch (err) {
    console.error("Error deleteDailyReport:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal hapus laporan", 
      error: err.message 
    });
  }
};

// GET: ambil satu laporan berdasarkan ID (untuk edit)
exports.getDailyReportById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await db.query(`SELECT * FROM report_daily WHERE id = ? LIMIT 1`, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Data tidak ditemukan" 
      });
    }
    
    const row = rows[0];
    res.json({
      success: true,
      data: {
        id: row.id,
        tanggal: row.tanggal,
        saldo_awal: Number(row.saldo_awal),
        pembayaran_cash: Number(row.pembayaran_cash),
        pembayaran_online: Number(row.pembayaran_online),
        pemasukan_lain_cash: Number(row.pemasukan_lain_cash),
        pemasukan_lain_online: Number(row.pemasukan_lain_online),
        pengeluaran: Number(row.pengeluaran),
        jumlah_pinjaman: Number(row.jumlah_pinjaman),
        stor_cash: Number(row.stor_cash),
        saldo_dalam_laci: Number(row.saldo_dalam_laci),
        catatan: row.catatan
      }
    });
  } catch (err) {
    console.error("Error getDailyReportById:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal ambil data laporan", 
      error: err.message 
    });
  }
};