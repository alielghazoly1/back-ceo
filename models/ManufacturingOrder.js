const mongoose = require('mongoose');

const rawMaterialSchema = new mongoose.Schema({
  item:        { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  itemCode:    { type: String, required: true },
  itemName:    { type: String, required: true },
  quantity:    { type: Number, required: true },
  weight:      { type: Number, required: true },
  totalWeight: { type: Number, required: true },
});

const outputProductSchema = new mongoose.Schema({
  item:        { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  itemCode:    { type: String, required: true },
  itemName:    { type: String, required: true },
  quantity:    { type: Number, required: true },
  weight:      { type: Number, required: true },
  totalWeight: { type: Number, required: true },
});

const manufacturingOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  date:        { type: Date, default: Date.now },

  // العنبر — الخامات تُخصم منه والمنتجات تُضاف له
  warehouse: {
    type:     String,
    enum:     ['ramses', 'october'],
    required: true,
    default:  'ramses',
  },

  // معلم العنبر — اللي بيشتغل على أمر التصنيع ده
  worker:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  workerName: { type: String },  // محفوظ كنص عشان يظهر لو المستخدم اتحذف

  rawMaterials:   [rawMaterialSchema],
  outputProducts: [outputProductSchema],

  notes: { type: String },

  status: {
    type:    String,
    enum:    ['pending', 'approved', 'rejected'],
    default: 'pending',
  },

  season:     { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
}, { timestamps: true });

// ── Indexes ────────────────────────────────────────────────────────────────
manufacturingOrderSchema.index({ worker: 1, date: -1 });
manufacturingOrderSchema.index({ warehouse: 1, date: -1 });
manufacturingOrderSchema.index({ season: 1, status: 1 });
manufacturingOrderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ManufacturingOrder', manufacturingOrderSchema);