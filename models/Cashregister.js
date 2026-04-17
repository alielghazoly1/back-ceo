const mongoose = require('mongoose');

// ══════════════════════════════════════════════════════
//  CashRegister — خزنة كل أدمن
//  بتتسجل تلقائياً عند:
//   1. موافقة الأدمن على فاتورة نقدي (cashAmount فقط)
//   2. تسجيل دفعة عميل نقدي (cashAmount فقط)
// ══════════════════════════════════════════════════════
const cashRegisterSchema = new mongoose.Schema({
  // الأدمن اللي استلم الفلوس (اللي وافق أو سجل الدفعة)
  admin:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adminName: { type: String, required: true },

  // نوع الحركة
  type: {
    type: String,
    enum: ['sale_cash', 'payment_cash'],  // فاتورة نقدي | دفعة عميل
    required: true,
  },

  // المبلغ النقدي المستلم فعلياً (cashAmount فقط، مش instapay)
  cashAmount: { type: Number, required: true, min: 0 },

  // مرجع الحركة
  referenceId:    { type: mongoose.Schema.Types.ObjectId },   // _id الفاتورة أو الدفعة
  referenceModel: { type: String },                           // SaleInvoice | Payment
  referenceNumber: { type: String },                          // رقم الفاتورة / الوصل

  // بيانات العميل
  customerName: { type: String },
  customerCode: { type: String },

  season: { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
  date:   { type: Date, default: Date.now },
}, { timestamps: true });

// Index للبحث السريع بالأدمن والتاريخ
cashRegisterSchema.index({ admin: 1, date: -1 });

module.exports = mongoose.model('CashRegister', cashRegisterSchema);