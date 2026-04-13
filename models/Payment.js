const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['customer_payment', 'supplier_payment'],
    required: true,
  },

  // للعميل
  customer:     { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerCode: { type: String },
  customerName: { type: String },

  // للمورد
  supplier:     { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierCode: { type: String },
  supplierName: { type: String },

  season: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', required: true },

  amount:         { type: Number, required: true, min: 0 },
  paymentMethod:  { type: String, default: 'cash' },

  // لو الدفع مختلط
  cashAmount:     { type: Number, default: 0 },
  instapayAmount: { type: Number, default: 0 },

  // رقم الوصل — يدخله المستخدم يدوياً، unique لو موجود
  receiptNumber: {
    type:   String,
    sparse: true,   // unique بس لو مش null
    unique: true,
    trim:   true,
  },

  notes:     { type: String },
  reference: { type: String },   // رقم شيك / مرجع تحويل

  date:      { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);