// backend/controllers/AdminRewardController.js
const db = require("../config/database");

// ======================================================
// ?? GET COIN RULES
// ======================================================
exports.getCoinRules = async (req, res) => {
  try {
    const [rules] = await db.query("SELECT * FROM coin_rules LIMIT 1");

    if (rules.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coin rules belum dikonfigurasi",
      });
    }

    res.json({
      success: true,
      data: rules[0],
    });
  } catch (err) {
    console.error("? Error getCoinRules:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil coin rules",
      error: err.message,
    });
  }
};

// ======================================================
// ?? UPDATE COIN RULES
// ======================================================
exports.updateCoinRules = async (req, res) => {
  try {
    const {
      rupiah_per_coin,
      coin_value,
      min_transaction_for_use,
      max_coin_mid,
      min_transaction_high,
      max_coin_high,
      require_rating,
      require_lunas,
      allowed_payment_methods,
    } = req.body;

    // Validation
    if (
      !rupiah_per_coin ||
      !coin_value ||
      !min_transaction_for_use ||
      !allowed_payment_methods
    ) {
      return res.status(400).json({
        success: false,
        message: "Field wajib tidak boleh kosong",
      });
    }

    // Check if rules exist
    const [existing] = await db.query("SELECT id FROM coin_rules LIMIT 1");

    if (existing.length === 0) {
      // Insert new rules
      await db.query(
        `INSERT INTO coin_rules (
          rupiah_per_coin, coin_value, min_transaction_for_use,
          max_coin_mid, min_transaction_high, max_coin_high,
          require_rating, require_lunas, allowed_payment_methods
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rupiah_per_coin,
          coin_value,
          min_transaction_for_use,
          max_coin_mid || 10,
          min_transaction_high || 200000,
          max_coin_high || 25,
          require_rating ? 1 : 0,
          require_lunas ? 1 : 0,
          allowed_payment_methods,
        ]
      );
    } else {
      // Update existing rules
      await db.query(
        `UPDATE coin_rules SET
          rupiah_per_coin = ?,
          coin_value = ?,
          min_transaction_for_use = ?,
          max_coin_mid = ?,
          min_transaction_high = ?,
          max_coin_high = ?,
          require_rating = ?,
          require_lunas = ?,
          allowed_payment_methods = ?,
          updated_at = NOW()
        WHERE id = ?`,
        [
          rupiah_per_coin,
          coin_value,
          min_transaction_for_use,
          max_coin_mid || 10,
          min_transaction_high || 200000,
          max_coin_high || 25,
          require_rating ? 1 : 0,
          require_lunas ? 1 : 0,
          allowed_payment_methods,
          existing[0].id,
        ]
      );
    }

    res.json({
      success: true,
      message: "Coin rules berhasil diupdate",
    });
  } catch (err) {
    console.error("? Error updateCoinRules:", err);
    res.status(500).json({
      success: false,
      message: "Gagal update coin rules",
      error: err.message,
    });
  }
};

// ======================================================
// ?? GET ALL VOUCHERS
// ======================================================
exports.getAllVouchers = async (req, res) => {
  try {
    const [vouchers] = await db.query(`
      SELECT 
        vr.*,
        COUNT(DISTINCT cv.client_id) as total_claimed,
        COUNT(DISTINCT CASE WHEN cv.is_used = 1 THEN cv.client_id END) as total_used
      FROM voucher_rules vr
      LEFT JOIN client_vouchers cv ON vr.voucher_code = cv.voucher_code
      GROUP BY vr.id
      ORDER BY vr.created_at DESC
    `);

    res.json({
      success: true,
      data: vouchers,
      count: vouchers.length,
    });
  } catch (err) {
    console.error("? Error getAllVouchers:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data voucher",
      error: err.message,
    });
  }
};

// ======================================================
// ?? GET VOUCHER BY ID
// ======================================================
exports.getVoucherById = async (req, res) => {
  try {
    const { id } = req.params;

    const [vouchers] = await db.query(
      `SELECT * FROM voucher_rules WHERE id = ?`,
      [id]
    );

    if (vouchers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Voucher tidak ditemukan",
      });
    }

    res.json({
      success: true,
      data: vouchers[0],
    });
  } catch (err) {
    console.error("? Error getVoucherById:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil detail voucher",
      error: err.message,
    });
  }
};

// ======================================================
// ?? CREATE VOUCHER
// ======================================================
exports.createVoucher = async (req, res) => {
  try {
    const {
      voucher_code,
      description,
      discount_amount,
      discount_percent,
      max_discount,
      min_transaction,
      max_usage_per_order,
      max_usage_total,
      max_usage_per_client,
      payment_method,
      start_date,
      end_date,
      is_active,
    } = req.body;

    // Validation
    if (!voucher_code || !description || !payment_method) {
      return res.status(400).json({
        success: false,
        message: "Voucher code, deskripsi, dan payment method wajib diisi",
      });
    }

    if (!discount_amount && !discount_percent) {
      return res.status(400).json({
        success: false,
        message: "Harus ada discount_amount atau discount_percent",
      });
    }

    // Check duplicate voucher code
    const [existing] = await db.query(
      "SELECT id FROM voucher_rules WHERE voucher_code = ?",
      [voucher_code]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Kode voucher sudah digunakan",
      });
    }

    // Insert voucher
    await db.query(
      `INSERT INTO voucher_rules (
        voucher_code, description, discount_amount, discount_percent,
        max_discount, min_transaction, max_usage_per_order,
        max_usage_total, max_usage_per_client,
        payment_method, start_date, end_date, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        voucher_code.toUpperCase(),
        description,
        discount_amount || null,
        discount_percent || null,
        max_discount || null,
        min_transaction || 0,
        max_usage_per_order || 1,
        max_usage_total || null,
        max_usage_per_client || 1,
        payment_method,
        start_date || null,
        end_date || null,
        is_active ? 1 : 0,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Voucher berhasil dibuat",
    });
  } catch (err) {
    console.error("? Error createVoucher:", err);
    res.status(500).json({
      success: false,
      message: "Gagal membuat voucher",
      error: err.message,
    });
  }
};

// ======================================================
// ?? UPDATE VOUCHER
// ======================================================
exports.updateVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      description,
      discount_amount,
      discount_percent,
      max_discount,
      min_transaction,
      max_usage_per_order,
      max_usage_total,
      max_usage_per_client,
      payment_method,
      start_date,
      end_date,
      is_active,
    } = req.body;

    // Check if voucher exists
    const [existing] = await db.query(
      "SELECT id FROM voucher_rules WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Voucher tidak ditemukan",
      });
    }

    // Update voucher
    await db.query(
      `UPDATE voucher_rules SET
        description = ?,
        discount_amount = ?,
        discount_percent = ?,
        max_discount = ?,
        min_transaction = ?,
        max_usage_per_order = ?,
        max_usage_total = ?,
        max_usage_per_client = ?,
        payment_method = ?,
        start_date = ?,
        end_date = ?,
        is_active = ?,
        updated_at = NOW()
      WHERE id = ?`,
      [
        description,
        discount_amount || null,
        discount_percent || null,
        max_discount || null,
        min_transaction || 0,
        max_usage_per_order || 1,
        max_usage_total || null,
        max_usage_per_client || 1,
        payment_method,
        start_date || null,
        end_date || null,
        is_active ? 1 : 0,
        id,
      ]
    );

    res.json({
      success: true,
      message: "Voucher berhasil diupdate",
    });
  } catch (err) {
    console.error("? Error updateVoucher:", err);
    res.status(500).json({
      success: false,
      message: "Gagal update voucher",
      error: err.message,
    });
  }
};

// ======================================================
// ?? DELETE VOUCHER
// ======================================================
exports.deleteVoucher = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Check if voucher exists
    const [voucher] = await connection.query(
      "SELECT voucher_code FROM voucher_rules WHERE id = ?",
      [id]
    );

    if (voucher.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Voucher tidak ditemukan",
      });
    }

    const voucherCode = voucher[0].voucher_code;

    // Check if voucher has been claimed
    const [claimed] = await connection.query(
      "SELECT COUNT(*) as count FROM client_vouchers WHERE voucher_code = ?",
      [voucherCode]
    );

    if (claimed[0].count > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Tidak bisa hapus voucher. Sudah diklaim oleh ${claimed[0].count} pelanggan. Nonaktifkan saja (is_active = 0).`,
      });
    }

    // Delete voucher
    await connection.query("DELETE FROM voucher_rules WHERE id = ?", [id]);

    await connection.commit();

    res.json({
      success: true,
      message: "Voucher berhasil dihapus",
    });
  } catch (err) {
    await connection.rollback();
    console.error("? Error deleteVoucher:", err);
    res.status(500).json({
      success: false,
      message: "Gagal menghapus voucher",
      error: err.message,
    });
  } finally {
    connection.release();
  }
};

// ======================================================
// ?? GIVE VOUCHER TO CLIENT
// ======================================================
exports.giveVoucherToClient = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { client_id, voucher_code } = req.body;

    if (!client_id || !voucher_code) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Client ID dan voucher code wajib diisi",
      });
    }

    // Check if client exists
    const [client] = await connection.query(
      "SELECT id, full_name FROM client WHERE id = ?",
      [client_id]
    );

    if (client.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Client tidak ditemukan",
      });
    }

    // Check if voucher exists and active
    const [voucher] = await connection.query(
      "SELECT * FROM voucher_rules WHERE voucher_code = ? AND is_active = 1",
      [voucher_code]
    );

    if (voucher.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Voucher tidak ditemukan atau tidak aktif",
      });
    }

    // Check if client already has this voucher
    const [existing] = await connection.query(
      "SELECT id FROM client_vouchers WHERE client_id = ? AND voucher_code = ?",
      [client_id, voucher_code]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Client sudah memiliki voucher ini",
      });
    }

    // Give voucher to client
    await connection.query(
      `INSERT INTO client_vouchers (client_id, voucher_code, obtained_from)
       VALUES (?, ?, 'admin')`,
      [client_id, voucher_code]
    );

    await connection.commit();

    res.json({
      success: true,
      message: `Voucher ${voucher_code} berhasil diberikan ke ${client[0].full_name}`,
    });
  } catch (err) {
    await connection.rollback();
    console.error("? Error giveVoucherToClient:", err);
    res.status(500).json({
      success: false,
      message: "Gagal memberikan voucher",
      error: err.message,
    });
  } finally {
    connection.release();
  }
};

// ======================================================
// ?? GET REWARD STATISTICS
// ======================================================
exports.getRewardStats = async (req, res) => {
  try {
    // Total coins earned and used
    const [coinStats] = await db.query(`
      SELECT 
        SUM(CASE WHEN type = 'earn' THEN coins ELSE 0 END) as total_earned,
        SUM(CASE WHEN type = 'use' THEN coins ELSE 0 END) as total_used,
        COUNT(DISTINCT client_id) as total_clients_with_coins
      FROM coin_history
    `);

    // Total vouchers
    const [voucherStats] = await db.query(`
      SELECT 
        COUNT(*) as total_vouchers,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_vouchers
      FROM voucher_rules
    `);

    // Total vouchers claimed and used
    const [voucherUsage] = await db.query(`
      SELECT 
        COUNT(*) as total_claimed,
        COUNT(CASE WHEN is_used = 1 THEN 1 END) as total_used,
        COUNT(DISTINCT client_id) as total_clients_with_vouchers
      FROM client_vouchers
    `);

    // Top 5 clients with most coins
    const [topClients] = await db.query(`
      SELECT 
        c.id,
        c.full_name,
        c.coin,
        c.level
      FROM client c
      WHERE c.coin > 0
      ORDER BY c.coin DESC
      LIMIT 5
    `);

    // Most popular vouchers
    const [popularVouchers] = await db.query(`
      SELECT 
        vr.voucher_code,
        vr.description,
        COUNT(cv.id) as claim_count,
        COUNT(CASE WHEN cv.is_used = 1 THEN 1 END) as use_count
      FROM voucher_rules vr
      LEFT JOIN client_vouchers cv ON vr.voucher_code = cv.voucher_code
      GROUP BY vr.id
      ORDER BY claim_count DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        coins: {
          total_earned: coinStats[0].total_earned || 0,
          total_used: coinStats[0].total_used || 0,
          balance: (coinStats[0].total_earned || 0) - (coinStats[0].total_used || 0),
          total_clients: coinStats[0].total_clients_with_coins || 0,
        },
        vouchers: {
          total_vouchers: voucherStats[0].total_vouchers || 0,
          active_vouchers: voucherStats[0].active_vouchers || 0,
          total_claimed: voucherUsage[0].total_claimed || 0,
          total_used: voucherUsage[0].total_used || 0,
          total_clients: voucherUsage[0].total_clients_with_vouchers || 0,
        },
        top_clients: topClients,
        popular_vouchers: popularVouchers,
      },
    });
  } catch (err) {
    console.error("? Error getRewardStats:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil statistik reward",
      error: err.message,
    });
  }
};

module.exports = exports;