const mongoose = require('mongoose');

const priceListSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, unique: true },
  itemCode: { type: String, required: true },
  itemName: { type: String, required: true },
  category: { type: String },
  unit: { type: String, default: 'كرتون' },
  defaultWeight: { type: Number, default: 0 },
  origin: { type: String, trim: true },     // ← بلد المنشأ
  prices: [
    {
      label: { type: String },
      price: { type: Number, required: true },
    }
  ],
  defaultPrice: { type: Number, default: 0 }, // ← السعر الافتراضي للفاتورة
  notes: { type: String },
  isActive: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('PriceList', priceListSchema);