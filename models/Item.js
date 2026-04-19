const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  code:     { type: String, required: true, unique: true, trim: true },
  name:     { type: String, required: true, trim: true },
  category: { type: String, trim: true },
  unit:     { type: String, default: 'كرتون' },

  stock: {
    ramses:  { quantity: { type: Number, default: 0 }, weight: { type: Number, default: 0 } },
    october: { quantity: { type: Number, default: 0 }, weight: { type: Number, default: 0 } },
  },

  defaultWeight:     { type: Number, default: 0 },
  lastPurchasePrice: { type: Number, default: 0 },
  lastSalePrice:     { type: Number, default: 0 },
  isRawMaterial:     { type: Boolean, default: false },
  isActive:          { type: Boolean, default: true },
  notes:             { type: String },
}, { timestamps: true });

// ── Indexes ────────────────────────────────────────────────────────────────
// البحث النصي في ItemSearch
itemSchema.index({ name: 1 });
itemSchema.index({ isActive: 1, code: 1 });

module.exports = mongoose.model('Item', itemSchema);