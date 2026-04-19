const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  code:    { type: String, required: true, unique: true, trim: true },
  name:    { type: String, required: true, trim: true },
  phone:   { type: String, trim: true },
  address: { type: String, trim: true },
  type: {
    type:    String,
    enum:    ['cash', 'credit'],
    default: 'credit',
  },
  isSupplier: { type: Boolean, default: false },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  notes:      { type: String },
  isActive:   { type: Boolean, default: true },
}, { timestamps: true });

// ── Indexes ────────────────────────────────────────────────────────────────
// البحث النصي في CustomerSearch
customerSchema.index({ name: 1 });
customerSchema.index({ isActive: 1, code: 1 });
customerSchema.index({ isActive: 1, type: 1 });

module.exports = mongoose.model('Customer', customerSchema);