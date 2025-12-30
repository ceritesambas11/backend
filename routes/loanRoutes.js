const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

// Protect all routes
router.use(authenticate);

// ==================== EMPLOYEE ENDPOINTS ====================

// Get my loans
router.get('/my-loans', async (req, res) => {
  try {
    const userId = req.user.id;

    const [loans] = await db.query(
      `SELECT l.*, u.full_name, u.username
       FROM loans l
       JOIN users u ON l.user_id = u.id
       WHERE l.user_id = ? 
       ORDER BY l.loan_date DESC`,
      [userId]
    );

    res.json({
      success: true,
      count: loans.length,
      data: loans
    });
  } catch (error) {
    console.error('Error fetching my loans:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching loans'
    });
  }
});

// Get specific loan details
router.get('/my-loans/:loanId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { loanId } = req.params;

    const [loans] = await db.query(
      `SELECT l.*, u.full_name, u.username
       FROM loans l
       JOIN users u ON l.user_id = u.id
       WHERE l.id = ? AND l.user_id = ?`,
      [loanId, userId]
    );

    if (loans.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    res.json({
      success: true,
      data: loans[0]
    });
  } catch (error) {
    console.error('Error fetching loan details:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching loan details'
    });
  }
});

// Request new loan
router.post('/request', async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, duration, notes } = req.body;

    // Validate input
    if (!amount || !duration) {
      return res.status(400).json({
        success: false,
        message: 'Amount and duration are required'
      });
    }

    // Check if user has unpaid loans
    const [unpaidLoans] = await db.query(
      'SELECT * FROM loans WHERE user_id = ? AND status != ?',
      [userId, 'paid']
    );

    if (unpaidLoans.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You have an existing unpaid loan. Please complete it before requesting a new one.'
      });
    }

    // Calculate monthly installment
    const monthlyInstallment = amount / duration;

    // Insert loan request
    const [result] = await db.query(
      `INSERT INTO loans 
       (user_id, amount, remaining, duration, monthly_installment, loan_date, status, notes) 
       VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [userId, amount, amount, duration, monthlyInstallment, 'active', notes]
    );

    res.status(201).json({
      success: true,
      message: 'Loan request submitted successfully',
      data: {
        id: result.insertId,
        amount,
        duration,
        monthly_installment: monthlyInstallment
      }
    });
  } catch (error) {
    console.error('Error requesting loan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error requesting loan'
    });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// Get all loans (Admin only)
router.get('/', async (req, res) => {
  try {
    // Check if user is admin or owner
    if (!['admin', 'owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { status, user_id, limit = 100 } = req.query;
    let query = `
      SELECT l.*, u.full_name, u.username, u.role
      FROM loans l
      JOIN users u ON l.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND l.status = ?';
      params.push(status);
    }

    if (user_id) {
      query += ' AND l.user_id = ?';
      params.push(user_id);
    }

    query += ' ORDER BY l.loan_date DESC LIMIT ?';
    params.push(parseInt(limit));

    const [loans] = await db.query(query, params);

    res.json({
      success: true,
      count: loans.length,
      data: loans
    });
  } catch (error) {
    console.error('Error fetching all loans:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching loans'
    });
  }
});

// Get loans by user ID (Admin only)
router.get('/user/:userId', async (req, res) => {
  try {
    // Check if user is admin or owner
    if (!['admin', 'owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { userId } = req.params;
    const { status } = req.query; // Ambil status dari query parameter

    let query = `
      SELECT l.*, u.full_name, u.username
      FROM loans l
      JOIN users u ON l.user_id = u.id
      WHERE l.user_id = ?
    `;
    const params = [userId];

    // Tambah filter status jika ada
    if (status) {
      query += ' AND l.status = ?';
      params.push(status);
    }

    query += ' ORDER BY l.loan_date DESC';

    const [loans] = await db.query(query, params);

    res.json({
      success: true,
      count: loans.length,
      data: loans
    });
  } catch (error) {
    console.error('Error fetching user loans:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user loans'
    });
  }
});

// Get upcoming payments (Admin only)
router.get('/upcoming-payments', async (req, res) => {
  try {
    // Check if user is admin or owner
    if (!['admin', 'owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const [loansList] = await db.query(
      `SELECT l.*, u.full_name, u.username
       FROM loans l
       JOIN users u ON l.user_id = u.id
       WHERE l.status = 'active'
       ORDER BY l.loan_date ASC
       LIMIT 50`
    );

    res.json({
      success: true,
      count: loansList.length,
      data: loansList
    });
  } catch (error) {
    console.error('Error fetching upcoming payments:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching upcoming payments'
    });
  }
});

// Create new loan (Admin only)
router.post('/', async (req, res) => {
  try {
    // Check if user is admin or owner
    if (!['admin', 'owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { user_id, amount, duration, notes } = req.body;

    // Validate input
    if (!user_id || !amount || !duration) {
      return res.status(400).json({
        success: false,
        message: 'User ID, amount, and duration are required'
      });
    }

    // Check if user exists
    const [users] = await db.query('SELECT id FROM users WHERE id = ?', [user_id]);
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Calculate monthly installment
    const monthlyInstallment = amount / duration;

    // Insert loan
    const [result] = await db.query(
      `INSERT INTO loans 
       (user_id, amount, remaining, duration, monthly_installment, loan_date, status, notes) 
       VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [user_id, amount, amount, duration, monthlyInstallment, 'active', notes]
    );

    res.status(201).json({
      success: true,
      message: 'Loan created successfully',
      data: {
        id: result.insertId,
        user_id,
        amount,
        duration,
        monthly_installment: monthlyInstallment
      }
    });
  } catch (error) {
    console.error('Error creating loan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating loan'
    });
  }
});

// Update loan (Admin only)
router.put('/:loanId', async (req, res) => {
  try {
    // Check if user is admin or owner
    if (!['admin', 'owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { loanId } = req.params;
    const { amount, remaining, duration, status, notes } = req.body;

    // Check if loan exists
    const [loans] = await db.query('SELECT * FROM loans WHERE id = ?', [loanId]);
    if (loans.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    // Calculate new monthly installment if amount or duration changed
    const newAmount = amount !== undefined ? amount : loans[0].amount;
    const newDuration = duration !== undefined ? duration : loans[0].duration;
    const monthlyInstallment = newAmount / newDuration;

    // Update loan
    const [result] = await db.query(
      `UPDATE loans 
       SET amount = ?, 
           remaining = ?, 
           duration = ?, 
           monthly_installment = ?,
           status = ?, 
           notes = ?
       WHERE id = ?`,
      [
        newAmount,
        remaining !== undefined ? remaining : loans[0].remaining,
        newDuration,
        monthlyInstallment,
        status || loans[0].status,
        notes !== undefined ? notes : loans[0].notes,
        loanId
      ]
    );

    res.json({
      success: true,
      message: 'Loan updated successfully'
    });
  } catch (error) {
    console.error('Error updating loan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating loan'
    });
  }
});

// Process loan payment (Admin only)
router.post('/:loanId/pay', async (req, res) => {
  try {
    // Check if user is admin or owner
    if (!['admin', 'owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { loanId } = req.params;
    const { payment_amount } = req.body;

    if (!payment_amount || payment_amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid payment amount is required'
      });
    }

    // Get loan details
    const [loans] = await db.query('SELECT * FROM loans WHERE id = ?', [loanId]);
    if (loans.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    const loan = loans[0];

    if (loan.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Loan is already paid'
      });
    }

    // Calculate new remaining amount
    const newRemaining = Math.max(0, loan.remaining - payment_amount);
    const newStatus = newRemaining === 0 ? 'paid' : 'active';

    // Update loan
    await db.query(
      'UPDATE loans SET remaining = ?, status = ?, last_payment_date = NOW() WHERE id = ?',
      [newRemaining, newStatus, loanId]
    );

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        payment_amount,
        new_remaining: newRemaining,
        status: newStatus
      }
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing payment'
    });
  }
});

// Delete loan (Admin only)
router.delete('/:loanId', async (req, res) => {
  try {
    // Check if user is admin or owner
    if (!['admin', 'owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { loanId } = req.params;

    const [result] = await db.query('DELETE FROM loans WHERE id = ?', [loanId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    res.json({
      success: true,
      message: 'Loan deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting loan:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting loan'
    });
  }
});

module.exports = router;