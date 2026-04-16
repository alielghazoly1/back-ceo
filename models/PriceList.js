const mongoose = require('mongoose');

const priceListSchema = new mongoose.Schema({
  // ━━━ م��لومات القائمة ━━━
  priceListName: { type: String, required: true },
  priceListDescription: { type: String, default: '' },
  displayOrder: { type: Number, default: 0 },  // ← ترتيب القائمة
  
  // ━━━ معلومات الصنف ━━━
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  itemCode: { type: String, required: true },
  itemName: { type: String, required: true },
  category: { type: String },
  unit: { type: String, default: 'كرتون' },
  defaultWeight: { type: Number, default: 0 },
  itemDisplayOrder: { type: Number, default: 0 },  // ← ترتيب الصنف داخل القائمة
  
  // ━━━ الأسعار والمصدر ━━━
  origin: { type: String, trim: true },
  prices: [
    {
      label: { type: String },
      price: { type: Number, required: true },
    }
  ],
  defaultPrice: { type: Number, default: 0 },
  notes: { type: String },
  
  // ━━━ التتبع ━━━
  isActive: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Unique constraint على (item + priceListName)
priceListSchema.index({ item: 1, priceListName: 1 }, { unique: true });
// Index للبحث السريع
priceListSchema.index({ priceListName: 1, itemDisplayOrder: 1 });

module.exports = mongoose.model('PriceList', priceListSchema);