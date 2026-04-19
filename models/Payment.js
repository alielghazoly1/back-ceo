const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  type: {
    type:     String,
    enum:     ['customer_payment', 'supplier_payment'],
    required: true,
  },

  customer:     { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerCode: { type: String },
  customerName: { type: String },

  supplier:     { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierCode: { type: String },
  supplierName: { type: String },

  season: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', required: true },

  amount:         { type: Number, required: true, min: 0 },
  paymentMethod:  { type: String, default: 'cash' },

  cashAmount:     { type: Number, default: 0 },
  instapayAmount: { type: Number, default: 0 },

  receiptNumber: {
    type:   String,
    sparse: true,
    unique: true,
    trim:   true,
  },

  notes:     { type: String },
  reference: { type: String },
  date:      { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// ── Indexes ────────────────────────────────────────────────────────────────
// الأهم — الـ aggregation في getCustomers / getSuppliers
paymentSchema.index({ customer: 1, type: 1 });
paymentSchema.index({ supplier: 1, type: 1 });

// كشف الحساب بالموسم
paymentSchema.index({ customer: 1, type: 1, season: 1 });
paymentSchema.index({ supplier: 1, type: 1, season: 1 });

// قائمة المدفوعات
paymentSchema.index({ season: 1, createdAt: -1 });
paymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);