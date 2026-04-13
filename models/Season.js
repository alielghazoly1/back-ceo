const mongoose = require('mongoose');

const seasonSchema = new mongoose.Schema({
  name: { type: String, required: true },       // مثلاً "موسم 2024"
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  isManufacturing: { type: Boolean, default: false }, // هل ده موسم تصنيع؟
}, { timestamps: true });

module.exports = mongoose.model('Season', seasonSchema);