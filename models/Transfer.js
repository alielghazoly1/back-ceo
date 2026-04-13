const mongoose = require('mongoose');

const transferItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  itemCode: { type: String, required: true },
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true },
  weight: { type: Number, required: true },
});

const transferSchema = new mongoose.Schema({
  transferNumber: { type: String, required: true, unique: true },
  date: { type: Date, default: Date.now },
  fromWarehouse: { type: String, enum: ['ramses', 'october'], required: true },
  toWarehouse: { type: String, enum: ['ramses', 'october'], required: true },
  items: [transferItemSchema],
  totalWeight: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  notes: { type: String },
  season: { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Transfer', transferSchema);