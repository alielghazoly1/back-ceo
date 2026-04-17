const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  itemCode: { type: String, required: true },
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true },
  weight: { type: Number, required: true },
  price: { type: Number, required: true },
  total: { type: Number, required: true },
});

const returnInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    docNumber: { type: String, required: true },
    date: { type: Date, default: Date.now },
    type: {
      type: String,
      enum: ['customer_return', 'supplier_return'],
      required: true,
    },

    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerCode: { type: String },
    customerName: { type: String },

    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    supplierCode: { type: String },
    supplierName: { type: String },

    warehouse: { type: String, enum: ['ramses', 'october'], required: true },
    items: [returnItemSchema],
    totalAmount: { type: Number, required: true },
    totalWeight: { type: Number, default: 0 },

    // ── طريقة رد الأموال (للمرتجع من عميل نقدي) ─────────────
    // هل الأدمن هيرد الفلوس نقدي ولا بنكي؟
    refundMethod: {
      type: String,
      enum: ['cash', 'bank', 'none'], // none = مرتجع آجل (مش فيه كاش)
      default: 'none',
    },
    refundCashAmount: { type: Number, default: 0 }, // المبلغ النقدي المسترد
    refundBankAmount: { type: Number, default: 0 }, // المبلغ البنكي المسترد

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    notes: { type: String },
    originalInvoice: { type: String },
    season: { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
  },
  { timestamps: true },
);

module.exports = mongoose.model('ReturnInvoice', returnInvoiceSchema);
