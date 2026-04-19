const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  code:       { type: String, required: true, unique: true, trim: true },
  name:       { type: String, required: true, trim: true },
  phone:      { type: String, trim: true },
  address:    { type: String, trim: true },
  notes:      { type: String },
  isActive:   { type: Boolean, default: true },
  isCustomer: { type: Boolean, default: false },
}, { timestamps: true });

// ── Indexes ────────────────────────────────────────────────────────────────
// البحث النصي في SupplierSearch
supplierSchema.index({ name: 1 });
supplierSchema.index({ isActive: 1, code: 1 });

module.exports = mongoose.model('Supplier', supplierSchema);