const db = require("../config/database");

// =====================================================
// GET: Laporan Owner Real-time (Level 2 - Detail)
// =====================================================
exports.getOwnerReport = async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end)
      return res.status(400).json({ success: false, message: "Periode awal dan akhir wajib diisi" });

    // ========================================
    // A. PENDAPATAN
    // ========================================

    // 1. Pendapatan Produk (dari payments - Lunas & DP)
    const [[pendapatanProduk]] = await db.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM payments 
       WHERE payment_status IN ('Lunas', 'DP') 
       AND DATE(paid_at) BETWEEN ? AND ?`,
      [start, end]
    );

    // Breakdown per Kategori Produk (dari order_items yang sudah dibayar)
    const [perKategori] = await db.query(
      `SELECT 
        COALESCE(p.kategori, 'Tanpa Kategori') as kategori,
        COUNT(DISTINCT oi.id) as jumlah_item,
        SUM(oi.qty) as total_qty,
        COALESCE(SUM(oi.subtotal), 0) as total
       FROM order_items oi
       JOIN orders o ON oi.invoice_id = o.id
       JOIN payments pay ON o.invoice_code = pay.invoice_code
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE pay.payment_status IN ('Lunas', 'DP')
       AND DATE(pay.paid_at) BETWEEN ? AND ?
       GROUP BY p.kategori
       ORDER BY total DESC`,
      [start, end]
    );

    // Detail per Kategori ? per Produk
    const [detailPerKategori] = await db.query(
      `SELECT 
        COALESCE(p.kategori, 'Tanpa Kategori') as kategori,
        oi.product_name as nama_produk,
        COUNT(DISTINCT oi.id) as jumlah_transaksi,
        SUM(oi.qty) as total_qty,
        COALESCE(SUM(oi.subtotal), 0) as total
       FROM order_items oi
       JOIN orders o ON oi.invoice_id = o.id
       JOIN payments pay ON o.invoice_code = pay.invoice_code
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE pay.payment_status IN ('Lunas', 'DP')
       AND DATE(pay.paid_at) BETWEEN ? AND ?
       GROUP BY p.kategori, oi.product_name
       ORDER BY p.kategori, total DESC`,
      [start, end]
    );

    // Breakdown per Metode Pembayaran
    const [perMetode] = await db.query(
      `SELECT 
        method as metode,
        COALESCE(SUM(amount), 0) as total
       FROM payments 
       WHERE payment_status IN ('Lunas', 'DP')
       AND DATE(paid_at) BETWEEN ? AND ?
       GROUP BY method`,
      [start, end]
    );

    // 2. Pendapatan Lain-lain (dari incomes - termasuk Desain)
    const [[pendapatanLain]] = await db.query(
      `SELECT COALESCE(SUM(total),0) AS total FROM incomes 
       WHERE DATE(tanggal) BETWEEN ? AND ?`,
      [start, end]
    );

    // Breakdown Pendapatan Lain per Keterangan
    const [lainPerKeterangan] = await db.query(
      `SELECT 
        keterangan,
        COALESCE(SUM(total), 0) as total
       FROM incomes 
       WHERE DATE(tanggal) BETWEEN ? AND ?
       GROUP BY keterangan`,
      [start, end]
    );

    const totalPendapatan = Number(pendapatanProduk.total) + Number(pendapatanLain.total);

    // ========================================
    // B. BIAYA
    // ========================================

    // 1. Biaya Bahan Baku
    const [[bahanBaku]] = await db.query(
      `SELECT COALESCE(SUM(total),0) AS total FROM expenses 
       WHERE keterangan='Bahan Baku' 
       AND DATE(tanggal) BETWEEN ? AND ?`,
      [start, end]
    );

    // Breakdown Bahan Baku per Jenis
    const [bahanBakuDetail] = await db.query(
      `SELECT 
        jenis_pengeluaran,
        COALESCE(SUM(total), 0) as total
       FROM expenses 
       WHERE keterangan='Bahan Baku'
       AND DATE(tanggal) BETWEEN ? AND ?
       GROUP BY jenis_pengeluaran`,
      [start, end]
    );

    // 2. Biaya Sewa
    const [[biayaSewa]] = await db.query(
      `SELECT COALESCE(SUM(total),0) AS total FROM expenses 
       WHERE keterangan='Sewa' 
       AND DATE(tanggal) BETWEEN ? AND ?`,
      [start, end]
    );

    // Breakdown Sewa per Jenis
    const [sewaDetail] = await db.query(
      `SELECT 
        jenis_pengeluaran,
        COALESCE(SUM(total), 0) as total
       FROM expenses 
       WHERE keterangan='Sewa'
       AND DATE(tanggal) BETWEEN ? AND ?
       GROUP BY jenis_pengeluaran`,
      [start, end]
    );

    // 3. Gaji Karyawan (payroll + expenses Gaji + expenses Pinjaman)
    const [[gajiPayroll]] = await db.query(
      `SELECT COALESCE(SUM(total),0) AS total FROM payroll 
       WHERE period BETWEEN DATE_FORMAT(?, '%Y-%m') AND DATE_FORMAT(?, '%Y-%m')
       AND status = 'paid'`,
      [start, end]
    );

    const [[gajiExpenses]] = await db.query(
      `SELECT COALESCE(SUM(total),0) AS total FROM expenses 
       WHERE keterangan='Gaji' 
       AND DATE(tanggal) BETWEEN ? AND ?`,
      [start, end]
    );

    const [[pinjamanExpenses]] = await db.query(
      `SELECT COALESCE(SUM(total),0) AS total FROM expenses 
       WHERE keterangan='Pinjaman' 
       AND DATE(tanggal) BETWEEN ? AND ?`,
      [start, end]
    );

    const totalGaji = Number(gajiPayroll.total) + Number(gajiExpenses.total) + Number(pinjamanExpenses.total);

    // Breakdown Gaji per Role (dari payroll)
    const [gajiPerRole] = await db.query(
      `SELECT 
        u.role,
        COUNT(DISTINCT p.user_id) as jumlah_karyawan,
        COALESCE(SUM(p.total), 0) as total
       FROM payroll p
       JOIN users u ON p.user_id = u.id
       WHERE p.period BETWEEN DATE_FORMAT(?, '%Y-%m') AND DATE_FORMAT(?, '%Y-%m')
       AND p.status = 'paid'
       GROUP BY u.role`,
      [start, end]
    );

    // 4. Biaya Operasional Lain
    const [[operasional]] = await db.query(
      `SELECT COALESCE(SUM(total),0) AS total FROM expenses 
       WHERE keterangan NOT IN ('Bahan Baku', 'Sewa', 'Gaji', 'Pinjaman')
       AND DATE(tanggal) BETWEEN ? AND ?`,
      [start, end]
    );

    // Breakdown Operasional per Keterangan
    const [operasionalDetail] = await db.query(
      `SELECT 
        keterangan,
        COALESCE(SUM(total), 0) as total
       FROM expenses 
       WHERE keterangan NOT IN ('Bahan Baku', 'Sewa', 'Gaji', 'Pinjaman')
       AND DATE(tanggal) BETWEEN ? AND ?
       GROUP BY keterangan`,
      [start, end]
    );

    const totalBiaya = Number(bahanBaku.total) + Number(biayaSewa.total) + totalGaji + Number(operasional.total);

    // ========================================
    // C. HASIL
    // ========================================
    const labaBersih = totalPendapatan - totalBiaya;
    const profitMargin = totalPendapatan > 0 ? ((labaBersih / totalPendapatan) * 100) : 0;

    // ========================================
    // D. STATISTIK
    // ========================================

    // Total Order & Item
    const [[statsOrder]] = await db.query(
      `SELECT 
        COUNT(DISTINCT invoice_id) as total_orders,
        COUNT(*) as total_items,
        COALESCE(SUM(subtotal), 0) as total_penjualan_order
       FROM order_items
       WHERE DATE(tanggal) BETWEEN ? AND ?`,
      [start, end]
    );

    const rataRataPerOrder = statsOrder.total_orders > 0 
      ? (Number(statsOrder.total_penjualan_order) / statsOrder.total_orders) 
      : 0;

    // Produk Terlaris (Top 5)
    const [produkTerlaris] = await db.query(
      `SELECT 
        product_name as nama,
        SUM(qty) as qty,
        COALESCE(SUM(subtotal), 0) as pendapatan
       FROM order_items
       WHERE DATE(tanggal) BETWEEN ? AND ?
       GROUP BY product_name
       ORDER BY pendapatan DESC
       LIMIT 5`,
      [start, end]
    );

    // Designer Terbanyak (Top 5)
    const [designerTerbanyak] = await db.query(
  `SELECT 
    u.full_name as nama,
    COUNT(*) as jumlah
   FROM order_items oi
   JOIN users u ON oi.desainer = u.id
   WHERE DATE(oi.tanggal) BETWEEN ? AND ?
   AND oi.desainer IS NOT NULL
   GROUP BY u.full_name
   ORDER BY jumlah DESC
   LIMIT 5`,
  [start, end]
);

    // Operator Terbanyak (Top 5)
    const [operatorTerbanyak] = await db.query(
      `SELECT 
        u.full_name as nama,
        COUNT(*) as jumlah
       FROM order_items oi
       JOIN users u ON oi.operator = u.id
       WHERE DATE(oi.tanggal) BETWEEN ? AND ?
       AND oi.operator IS NOT NULL
       GROUP BY u.full_name
       ORDER BY jumlah DESC
       LIMIT 5`,
      [start, end]
    );

    // ========================================
    // E. FORMAT RESPONSE
    // ========================================

    // Convert array ke object untuk breakdown
    // Per Kategori dengan detail
    const kategoriArr = perKategori.map(k => ({
      kategori: k.kategori,
      jumlah_item: k.jumlah_item,
      total_qty: k.total_qty,
      total: Number(k.total),
      persentase: Number(pendapatanProduk.total) > 0 
        ? Number(((k.total / pendapatanProduk.total) * 100).toFixed(2)) 
        : 0
    }));

    // Detail produk per kategori
    const detailKategoriObj = {};
    detailPerKategori.forEach(d => {
      if (!detailKategoriObj[d.kategori]) {
        detailKategoriObj[d.kategori] = [];
      }
      detailKategoriObj[d.kategori].push({
        nama_produk: d.nama_produk,
        jumlah_transaksi: d.jumlah_transaksi,
        total_qty: d.total_qty,
        total: Number(d.total)
      });
    });

    const metodeObj = {};
    perMetode.forEach(m => {
      metodeObj[m.metode] = Number(m.total);
    });

    const lainObj = {};
    lainPerKeterangan.forEach(l => {
      lainObj[l.keterangan] = Number(l.total);
    });

    const bahanObj = {};
    bahanBakuDetail.forEach(b => {
      bahanObj[b.jenis_pengeluaran || 'Lainnya'] = Number(b.total);
    });

    const sewaObj = {};
    sewaDetail.forEach(s => {
      sewaObj[s.jenis_pengeluaran || 'Sewa Tempat'] = Number(s.total);
    });

    const gajiObj = {
      payroll: Number(gajiPayroll.total),
      expenses_gaji: Number(gajiExpenses.total),
      pinjaman: Number(pinjamanExpenses.total)
    };

    const gajiRoleObj = {};
    gajiPerRole.forEach(g => {
      gajiRoleObj[g.role] = {
        jumlah_karyawan: g.jumlah_karyawan,
        total: Number(g.total)
      };
    });

    const operasionalObj = {};
    operasionalDetail.forEach(o => {
      operasionalObj[o.keterangan] = Number(o.total);
    });

    res.json({
      success: true,
      data: {
        periode: { start, end },
        
        // Summary
        pendapatan_produk: Number(pendapatanProduk.total),
        pendapatan_lain: Number(pendapatanLain.total),
        total_pendapatan: totalPendapatan,
        
        biaya_bahan_baku: Number(bahanBaku.total),
        biaya_sewa: Number(biayaSewa.total),
        gaji_karyawan: totalGaji,
        biaya_operasional_lain: Number(operasional.total),
        total_biaya: totalBiaya,
        
        laba_bersih: labaBersih,
        profit_margin: Number(profitMargin.toFixed(2)),
        
        // Breakdown
        pendapatan_breakdown: {
          per_kategori: kategoriArr,
          detail_per_kategori: detailKategoriObj,
          per_metode: metodeObj,
          lain_per_keterangan: lainObj
        },
        
        biaya_breakdown: {
          bahan_baku: bahanObj,
          sewa: sewaObj,
          gaji: gajiObj,
          gaji_per_role: gajiRoleObj,
          operasional: operasionalObj
        },
        
        // Statistik
        statistik: {
          total_orders: statsOrder.total_orders,
          total_items: statsOrder.total_items,
          total_penjualan_order: Number(statsOrder.total_penjualan_order),
          rata_rata_per_order: Number(rataRataPerOrder.toFixed(0)),
          produk_terlaris: produkTerlaris.map(p => ({
            nama: p.nama,
            qty: p.qty,
            pendapatan: Number(p.pendapatan)
          })),
          designer_terbanyak: designerTerbanyak,
          operator_terbanyak: operatorTerbanyak
        }
      },
    });
  } catch (err) {
    console.error("Error getOwnerReport:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal ambil laporan owner", 
      error: err.message 
    });
  }
};

// =====================================================
// POST: Simpan Arsip Laporan Owner
// =====================================================
exports.saveOwnerReport = async (req, res) => {
  try {
    const {
      periode_awal,
      periode_akhir,
      pendapatan_produk,
      pendapatan_lain,
      biaya_bahan_baku,
      biaya_sewa,
      gaji_karyawan,
      biaya_operasional_lain,
      pendapatan_breakdown,
      biaya_breakdown,
      statistik,
      catatan,
      created_by,
    } = req.body;

    // Hitung total dan hasil
    const total_pendapatan = Number(pendapatan_produk) + Number(pendapatan_lain);
    const total_biaya = Number(biaya_bahan_baku) + Number(biaya_sewa) + Number(gaji_karyawan) + Number(biaya_operasional_lain);
    const laba_bersih = total_pendapatan - total_biaya;
    const profit_margin = total_pendapatan > 0 ? ((laba_bersih / total_pendapatan) * 100) : 0;

    // Convert object to JSON string
    const pendapatanJSON = JSON.stringify(pendapatan_breakdown);
    const biayaJSON = JSON.stringify(biaya_breakdown);
    const statistikJSON = JSON.stringify(statistik);

    await db.query(
      `INSERT INTO report_owner
      (periode_awal, periode_akhir, 
       pendapatan_produk, pendapatan_lain, total_pendapatan,
       biaya_bahan_baku, biaya_sewa, gaji_karyawan, biaya_operasional_lain, total_biaya,
       laba_bersih, profit_margin,
       pendapatan_breakdown, biaya_breakdown, statistik,
       catatan, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        periode_awal, periode_akhir,
        pendapatan_produk, pendapatan_lain, total_pendapatan,
        biaya_bahan_baku, biaya_sewa, gaji_karyawan, biaya_operasional_lain, total_biaya,
        laba_bersih, profit_margin.toFixed(2),
        pendapatanJSON, biayaJSON, statistikJSON,
        catatan, created_by
      ]
    );

    res.json({ 
      success: true, 
      message: "Laporan owner berhasil disimpan",
      data: {
        laba_bersih,
        profit_margin: Number(profit_margin.toFixed(2))
      }
    });
  } catch (err) {
    console.error("Error saveOwnerReport:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal simpan laporan owner", 
      error: err.message 
    });
  }
};

// =====================================================
// GET: Ambil Laporan yang Sudah Disimpan (untuk Compare)
// =====================================================
exports.getSavedReports = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const [reports] = await db.query(
      `SELECT 
        id,
        periode_awal,
        periode_akhir,
        total_pendapatan,
        total_biaya,
        laba_bersih,
        profit_margin,
        created_at
       FROM report_owner
       ORDER BY periode_awal DESC
       LIMIT ?`,
      [parseInt(limit)]
    );

    res.json({
      success: true,
      data: reports.map(r => ({
        id: r.id,
        periode_awal: r.periode_awal,
        periode_akhir: r.periode_akhir,
        total_pendapatan: Number(r.total_pendapatan),
        total_biaya: Number(r.total_biaya),
        laba_bersih: Number(r.laba_bersih),
        profit_margin: Number(r.profit_margin),
        created_at: r.created_at
      }))
    });
  } catch (err) {
    console.error("Error getSavedReports:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal ambil daftar laporan", 
      error: err.message 
    });
  }
};

// =====================================================
// GET: Detail Laporan yang Sudah Disimpan (by ID)
// =====================================================
exports.getReportById = async (req, res) => {
  try {
    const { id } = req.params;

    const [[report]] = await db.query(
      `SELECT * FROM report_owner WHERE id = ?`,
      [id]
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Laporan tidak ditemukan"
      });
    }

    // Parse JSON fields
    const pendapatan_breakdown = report.pendapatan_breakdown 
      ? JSON.parse(report.pendapatan_breakdown) 
      : null;
    const biaya_breakdown = report.biaya_breakdown 
      ? JSON.parse(report.biaya_breakdown) 
      : null;
    const statistik = report.statistik 
      ? JSON.parse(report.statistik) 
      : null;

    res.json({
      success: true,
      data: {
        ...report,
        pendapatan_breakdown,
        biaya_breakdown,
        statistik
      }
    });
  } catch (err) {
    console.error("Error getReportById:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal ambil detail laporan", 
      error: err.message 
    });
  }
};