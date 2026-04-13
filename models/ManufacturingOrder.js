const mongoose = require('mongoose');

// الخامات المستخدمة في التصنيع
const rawMaterialSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  itemCode: { type: String, required: true },
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true },
  weight: { type: Number, required: true },
  totalWeight: { type: Number, required: true }, // quantity × weight
});

// المنتجات الناتجة من التصنيع
const outputProductSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  itemCode: { type: String, required: true },
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true },   // عدد العلب / كراتين
  weight: { type: Number, required: true },     // وزن الوحدة
  totalWeight: { type: Number, required: true }, // quantity × weight
});

const manufacturingOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  date: { type: Date, default: Date.now },

  // الخامات المصروفة من أكتوبر
  rawMaterials: [rawMaterialSchema],
  // المنتجات الناتجة
  outputProducts: [outputProductSchema],

  // ملاحظات التصنيع
  notes: { type: String },

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },

  season: { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('ManufacturingOrder', manufacturingOrderSchema);