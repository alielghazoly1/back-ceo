const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  address: { type: String, trim: true },
  notes: { type: String },
  isActive: { type: Boolean, default: true },
  // المورد ممكن يكون عميل في نفس الوقت
  isCustomer: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Supplier', supplierSchema);