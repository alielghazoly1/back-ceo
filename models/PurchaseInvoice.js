const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema({
  item:     { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  itemCode: { type: String, required: true },
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  weight:   { type: Number, required: true, min: 0 },
  price:    { type: Number, required: true, min: 0 },
  total:    { type: Number, required: true },
}, { _id: true });

const purchaseInvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },

  // ← مش unique globally — compound index per season
  docNumber: { type: String, required: true, trim: true },

  date:         { type: Date, required: true, default: Date.now },
  supplier:     { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierCode: { type: String, required: true },
  supplierName: { type: String, required: true },
  warehouse:    { type: String, enum: ['ramses', 'october'], required: true },
  items:        [purchaseItemSchema],
  totalAmount:  { type: Number, required: true },
  totalWeight:  { type: Number, default: 0 },

  status: {
    type:    String,
    enum:    ['pending', 'approved', 'suspended', 'cancelled'],
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

// docNumber فريد داخل نفس الموسم فقط
purchaseInvoiceSchema.index({ docNumber: 1, season: 1 }, { unique: true });

// MIGRATION: db.purchaseinvoices.dropIndex("docNumber_1")

module.exports = mongoose.model('PurchaseInvoice', purchaseInvoiceSchema);