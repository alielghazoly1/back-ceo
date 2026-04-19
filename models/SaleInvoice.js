const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema({
  item:     { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  itemCode: { type: String, required: true },
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  weight:   { type: Number, required: true, min: 0 },
  price:    { type: Number, required: true, min: 0 },
  total:    { type: Number, required: true },
}, { _id: true });

const saleInvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  docNumber:     { type: String, required: true, trim: true },
  date:          { type: Date,   required: true, default: Date.now },

  customer:     { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerCode: { type: String, required: true },
  customerName: { type: String, required: true },
  warehouse:    { type: String, enum: ['ramses', 'october'], required: true },

  items:       [saleItemSchema],
  totalAmount: { type: Number, required: true },
  totalWeight: { type: Number, default: 0 },

  paidAmount:     { type: Number, default: 0 },
  cashAmount:     { type: Number, default: 0 },
  instapayAmount: { type: Number, default: 0 },
  paymentMethod:  {
    type: String,
    enum: ['cash', 'credit', 'instapay', 'transfer', 'check', 'mixed'],
    default: 'credit',
  },

  status: {
    type:    String,
    enum:    ['pending', 'approved', 'suspended', 'cancelled', 'returned'],
    default: 'pending',
  },

  season:        { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
  notes:         { type: String },
  suspendReason: { type: String },

  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  editedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  editedAt:   { type: Date },
  editNotes:  { type: String },
}, { timestamps: true });

// ── Indexes ────────────────────────────────────────────────────────────────
// Uniqueness per season
saleInvoiceSchema.index({ docNumber: 1, season: 1 }, { unique: true });

// الأكثر استخداماً — قائمة فواتير العميل + الـ aggregation
saleInvoiceSchema.index({ customer: 1, status: 1 });
saleInvoiceSchema.index({ customer: 1, paymentMethod: 1, status: 1 });

// قائمة فواتير الموسم (الصفحة الرئيسية + التقارير)
saleInvoiceSchema.index({ season: 1, status: 1 });
saleInvoiceSchema.index({ season: 1, createdAt: -1 });

// بحث الأدمن بالتاريخ
saleInvoiceSchema.index({ createdAt: -1 });
saleInvoiceSchema.index({ date: -1 });

// بحث بـ invoiceNumber (عرض فاتورة)
// invoiceNumber مكفول بـ unique: true أعلاه

// MIGRATION NOTE: db.saleinvoices.dropIndex("docNumber_1")

module.exports = mongoose.model('SaleInvoice', saleInvoiceSchema);