// models/Loan.js
// Model untuk pinjaman karyawan

const mongoose = require('mongoose');

const installmentSchema = new mongoose.Schema({
  month: {
    type: Number,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'overdue'],
    default: 'pending'
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  paidDate: {
    type: Date
  },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String
});

const loanSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  reason: {
    type: String,
    default: 'Pinjaman karyawan'
  },
  installmentMonths: {
    type: Number,
    required: true,
    min: 1
  },
  monthlyInstallment: {
    type: Number,
    required: true
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  remainingAmount: {
    type: Number,
    required: true
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  completedDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active',
    index: true
  },
  installments: [installmentSchema],
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledDate: {
    type: Date
  }
}, {
  timestamps: true
});

// Index untuk query performance
loanSchema.index({ userId: 1, status: 1 });
loanSchema.index({ startDate: 1 });
loanSchema.index({ 'installments.dueDate': 1, 'installments.status': 1 });

// Virtual untuk progress percentage
loanSchema.virtual('progressPercentage').get(function() {
  return ((this.paidAmount / this.amount) * 100).toFixed(2);
});

// Method untuk update installment status to overdue
loanSchema.methods.updateOverdueInstallments = function() {
  const today = new Date();
  let hasChanges = false;

  this.installments.forEach(inst => {
    if (inst.status === 'pending' && inst.dueDate < today) {
      inst.status = 'overdue';
      hasChanges = true;
    }
  });

  return hasChanges;
};

// Static method untuk get active loans summary
loanSchema.statics.getActiveLoansSummary = async function() {
  const result = await this.aggregate([
    {
      $match: { status: 'active' }
    },
    {
      $group: {
        _id: null,
        totalLoans: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        totalPaid: { $sum: '$paidAmount' },
        totalRemaining: { $sum: '$remainingAmount' }
      }
    }
  ]);

  return result[0] || {
    totalLoans: 0,
    totalAmount: 0,
    totalPaid: 0,
    totalRemaining: 0
  };
};

// Ensure virtuals are included in JSON
loanSchema.set('toJSON', { virtuals: true });
loanSchema.set('toObject', { virtuals: true });

const Loan = mongoose.model('Loan', loanSchema);

module.exports = Loan;
