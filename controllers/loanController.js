// loanController.js
// Controller untuk mengelola pinjaman karyawan

const Loan = require('../models/Loan');
const User = require('../models/User');
const moment = require('moment');

// Create new loan
exports.createLoan = async (req, res) => {
  try {
    const {
      userId,
      amount,
      reason,
      installmentMonths,
      startDate,
      notes
    } = req.body;

    // Validate required fields
    if (!userId || !amount || !installmentMonths) {
      return res.status(400).json({
        success: false,
        message: 'userId, amount, dan installmentMonths harus diisi'
      });
    }

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      });
    }

    // Calculate installment per month
    const monthlyInstallment = amount / installmentMonths;

    // Create installment schedule
    const installments = [];
    const loanStartDate = startDate ? new Date(startDate) : new Date();
    
    for (let i = 0; i < installmentMonths; i++) {
      const dueDate = moment(loanStartDate).add(i + 1, 'months').toDate();
      installments.push({
        month: i + 1,
        amount: monthlyInstallment,
        dueDate: dueDate,
        status: 'pending',
        paidAmount: 0
      });
    }

    // Create loan
    const loan = await Loan.create({
      userId,
      amount,
      reason: reason || 'Pinjaman karyawan',
      installmentMonths,
      monthlyInstallment,
      remainingAmount: amount,
      startDate: loanStartDate,
      status: 'active',
      installments,
      notes,
      createdBy: req.user._id // dari auth middleware
    });

    await loan.populate('userId', 'name position');

    res.status(201).json({
      success: true,
      message: 'Pinjaman berhasil dibuat',
      data: loan
    });

  } catch (error) {
    console.error('Error creating loan:', error);
    res.status(500).json({
      success: false,
      message: 'Error membuat pinjaman',
      error: error.message
    });
  }
};

// Get all loans (with filters)
exports.getAllLoans = async (req, res) => {
  try {
    const { userId, status, startDate, endDate } = req.query;

    let query = {};

    if (userId) query.userId = userId;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }

    const loans = await Loan.find(query)
      .populate('userId', 'name position employeeId')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    // Calculate summary
    const summary = {
      totalLoans: loans.length,
      totalAmount: loans.reduce((sum, loan) => sum + loan.amount, 0),
      totalRemaining: loans.reduce((sum, loan) => sum + loan.remainingAmount, 0),
      totalPaid: loans.reduce((sum, loan) => sum + loan.paidAmount, 0),
      activeLoans: loans.filter(l => l.status === 'active').length,
      completedLoans: loans.filter(l => l.status === 'completed').length
    };

    res.status(200).json({
      success: true,
      summary,
      total: loans.length,
      data: loans
    });

  } catch (error) {
    console.error('Error getting loans:', error);
    res.status(500).json({
      success: false,
      message: 'Error mendapatkan data pinjaman',
      error: error.message
    });
  }
};

// Get loan by ID
exports.getLoanById = async (req, res) => {
  try {
    const { loanId } = req.params;

    const loan = await Loan.findById(loanId)
      .populate('userId', 'name position employeeId email phone')
      .populate('createdBy', 'name')
      .populate('installments.paidBy', 'name');

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Pinjaman tidak ditemukan'
      });
    }

    res.status(200).json({
      success: true,
      data: loan
    });

  } catch (error) {
    console.error('Error getting loan:', error);
    res.status(500).json({
      success: false,
      message: 'Error mendapatkan data pinjaman',
      error: error.message
    });
  }
};

// Get loans by user
exports.getLoansByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    let query = { userId };
    if (status) query.status = status;

    const loans = await Loan.find(query)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    // Calculate user's loan summary
    const summary = {
      totalLoans: loans.length,
      activeLoans: loans.filter(l => l.status === 'active').length,
      totalBorrowed: loans.reduce((sum, loan) => sum + loan.amount, 0),
      totalRemaining: loans.filter(l => l.status === 'active').reduce((sum, loan) => sum + loan.remainingAmount, 0),
      totalPaid: loans.reduce((sum, loan) => sum + loan.paidAmount, 0),
      monthlyInstallmentTotal: loans
        .filter(l => l.status === 'active')
        .reduce((sum, loan) => sum + loan.monthlyInstallment, 0)
    };

    res.status(200).json({
      success: true,
      userId,
      summary,
      total: loans.length,
      data: loans
    });

  } catch (error) {
    console.error('Error getting user loans:', error);
    res.status(500).json({
      success: false,
      message: 'Error mendapatkan data pinjaman user',
      error: error.message
    });
  }
};

// Pay installment
exports.payInstallment = async (req, res) => {
  try {
    const { loanId, installmentMonth } = req.params;
    const { amount, paymentDate, notes } = req.body;

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Pinjaman tidak ditemukan'
      });
    }

    // Find installment
    const installment = loan.installments.find(inst => inst.month === parseInt(installmentMonth));
    if (!installment) {
      return res.status(404).json({
        success: false,
        message: 'Cicilan tidak ditemukan'
      });
    }

    if (installment.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Cicilan sudah dibayar'
      });
    }

    // Update installment
    const payAmount = amount || installment.amount;
    installment.paidAmount = payAmount;
    installment.status = 'paid';
    installment.paidDate = paymentDate ? new Date(paymentDate) : new Date();
    installment.paidBy = req.user._id;
    if (notes) installment.notes = notes;

    // Update loan totals
    loan.paidAmount += payAmount;
    loan.remainingAmount -= payAmount;

    // Check if loan is completed
    const allPaid = loan.installments.every(inst => inst.status === 'paid');
    if (allPaid) {
      loan.status = 'completed';
      loan.completedDate = new Date();
    }

    await loan.save();
    await loan.populate('userId', 'name position');

    res.status(200).json({
      success: true,
      message: 'Pembayaran cicilan berhasil',
      data: loan
    });

  } catch (error) {
    console.error('Error paying installment:', error);
    res.status(500).json({
      success: false,
      message: 'Error membayar cicilan',
      error: error.message
    });
  }
};

// Update loan
exports.updateLoan = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { status, notes } = req.body;

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Pinjaman tidak ditemukan'
      });
    }

    // Update allowed fields
    if (status) loan.status = status;
    if (notes) loan.notes = notes;

    loan.updatedAt = new Date();

    await loan.save();
    await loan.populate('userId', 'name position');

    res.status(200).json({
      success: true,
      message: 'Pinjaman berhasil diupdate',
      data: loan
    });

  } catch (error) {
    console.error('Error updating loan:', error);
    res.status(500).json({
      success: false,
      message: 'Error update pinjaman',
      error: error.message
    });
  }
};

// Delete loan (soft delete - set status to cancelled)
exports.deleteLoan = async (req, res) => {
  try {
    const { loanId } = req.params;

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Pinjaman tidak ditemukan'
      });
    }

    // Only allow delete if no payments made yet
    if (loan.paidAmount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Tidak dapat menghapus pinjaman yang sudah ada pembayaran'
      });
    }

    loan.status = 'cancelled';
    loan.cancelledDate = new Date();
    loan.cancelledBy = req.user._id;
    await loan.save();

    res.status(200).json({
      success: true,
      message: 'Pinjaman berhasil dibatalkan'
    });

  } catch (error) {
    console.error('Error deleting loan:', error);
    res.status(500).json({
      success: false,
      message: 'Error menghapus pinjaman',
      error: error.message
    });
  }
};

// Get upcoming installments (due this month)
exports.getUpcomingInstallments = async (req, res) => {
  try {
    const startOfMonth = moment().startOf('month').toDate();
    const endOfMonth = moment().endOf('month').toDate();

    const loans = await Loan.find({
      status: 'active'
    }).populate('userId', 'name position employeeId');

    const upcomingInstallments = [];

    loans.forEach(loan => {
      loan.installments.forEach(inst => {
        if (inst.status === 'pending' && 
            inst.dueDate >= startOfMonth && 
            inst.dueDate <= endOfMonth) {
          upcomingInstallments.push({
            loanId: loan._id,
            userId: loan.userId._id,
            userName: loan.userId.name,
            position: loan.userId.position,
            employeeId: loan.userId.employeeId,
            installmentMonth: inst.month,
            amount: inst.amount,
            dueDate: inst.dueDate,
            loanReason: loan.reason,
            totalLoanAmount: loan.amount,
            remainingAmount: loan.remainingAmount
          });
        }
      });
    });

    // Sort by due date
    upcomingInstallments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    res.status(200).json({
      success: true,
      month: moment().format('MMMM YYYY'),
      total: upcomingInstallments.length,
      totalAmount: upcomingInstallments.reduce((sum, inst) => sum + inst.amount, 0),
      data: upcomingInstallments
    });

  } catch (error) {
    console.error('Error getting upcoming installments:', error);
    res.status(500).json({
      success: false,
      message: 'Error mendapatkan cicilan yang akan datang',
      error: error.message
    });
  }
};

// Get overdue installments
exports.getOverdueInstallments = async (req, res) => {
  try {
    const today = new Date();

    const loans = await Loan.find({
      status: 'active'
    }).populate('userId', 'name position employeeId phone');

    const overdueInstallments = [];

    loans.forEach(loan => {
      loan.installments.forEach(inst => {
        if (inst.status === 'pending' && inst.dueDate < today) {
          const daysOverdue = moment().diff(moment(inst.dueDate), 'days');
          overdueInstallments.push({
            loanId: loan._id,
            userId: loan.userId._id,
            userName: loan.userId.name,
            position: loan.userId.position,
            employeeId: loan.userId.employeeId,
            phone: loan.userId.phone,
            installmentMonth: inst.month,
            amount: inst.amount,
            dueDate: inst.dueDate,
            daysOverdue,
            loanReason: loan.reason,
            totalLoanAmount: loan.amount,
            remainingAmount: loan.remainingAmount
          });
        }
      });
    });

    // Sort by days overdue (descending)
    overdueInstallments.sort((a, b) => b.daysOverdue - a.daysOverdue);

    res.status(200).json({
      success: true,
      total: overdueInstallments.length,
      totalAmount: overdueInstallments.reduce((sum, inst) => sum + inst.amount, 0),
      data: overdueInstallments
    });

  } catch (error) {
    console.error('Error getting overdue installments:', error);
    res.status(500).json({
      success: false,
      message: 'Error mendapatkan cicilan yang terlambat',
      error: error.message
    });
  }
};

// Get loan summary statistics
exports.getLoanStatistics = async (req, res) => {
  try {
    const loans = await Loan.find({});

    const stats = {
      total: {
        loans: loans.length,
        amount: loans.reduce((sum, loan) => sum + loan.amount, 0),
        paid: loans.reduce((sum, loan) => sum + loan.paidAmount, 0),
        remaining: loans.reduce((sum, loan) => sum + loan.remainingAmount, 0)
      },
      active: {
        loans: loans.filter(l => l.status === 'active').length,
        amount: loans.filter(l => l.status === 'active').reduce((sum, loan) => sum + loan.amount, 0),
        remaining: loans.filter(l => l.status === 'active').reduce((sum, loan) => sum + loan.remainingAmount, 0)
      },
      completed: {
        loans: loans.filter(l => l.status === 'completed').length,
        amount: loans.filter(l => l.status === 'completed').reduce((sum, loan) => sum + loan.amount, 0)
      },
      cancelled: {
        loans: loans.filter(l => l.status === 'cancelled').length,
        amount: loans.filter(l => l.status === 'cancelled').reduce((sum, loan) => sum + loan.amount, 0)
      }
    };

    // Get this month's installments
    const startOfMonth = moment().startOf('month').toDate();
    const endOfMonth = moment().endOf('month').toDate();
    
    let thisMonthDue = 0;
    let thisMonthPaid = 0;

    loans.filter(l => l.status === 'active').forEach(loan => {
      loan.installments.forEach(inst => {
        if (inst.dueDate >= startOfMonth && inst.dueDate <= endOfMonth) {
          thisMonthDue += inst.amount;
          if (inst.status === 'paid') {
            thisMonthPaid += inst.paidAmount;
          }
        }
      });
    });

    stats.thisMonth = {
      due: thisMonthDue,
      paid: thisMonthPaid,
      remaining: thisMonthDue - thisMonthPaid
    };

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error getting loan statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error mendapatkan statistik pinjaman',
      error: error.message
    });
  }
};

module.exports = exports;
