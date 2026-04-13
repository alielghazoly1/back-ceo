const mongoose = require('mongoose');

// snapshot للمخزن عند بداية كل موسم
const stockSnapshotSchema = new mongoose.Schema({
  item:     { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
  itemCode: String,
  itemName: String,
  ramses:   { quantity: { type: Number, default: 0 }, weight: { type: Number, default: 0 } },
  october:  { quantity: { type: Number, default: 0 }, weight: { type: Number, default: 0 } },
}, { _id: false });

const seasonSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  startDate:       { type: Date,   required: true },
  endDate:         { type: Date,   required: true },
  isActive:        { type: Boolean, default: true },
  isManufacturing: { type: Boolean, default: false },

  // snapshot للمخزن عند لحظة إنشاء الموسم
  stockSnapshot: [stockSnapshotSchema],
}, { timestamps: true });

module.exports = mongoose.model('Season', seasonSchema);