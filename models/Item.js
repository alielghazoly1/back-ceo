const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, trim: true },  // مكسرات / فول / جوز هند ...
  unit: { type: String, default: 'كرتون' },  // وحدة القياس
  
  // المخزون في كل مخزن
  stock: {
    ramses: { 
      quantity: { type: Number, default: 0 },  // عدد كراتين
      weight: { type: Number, default: 0 },    // إجمالي الوزن كيلو
    },
    october: {
      quantity: { type: Number, default: 0 },
      weight: { type: Number, default: 0 },
    },
  },

  // الوزن الافتراضي للوحدة (مثلاً الكرتون = 22.68 كيلو)
  defaultWeight: { type: Number, default: 0 },

  // آخر سعر توريد — بيساعد في المراجعة
  lastPurchasePrice: { type: Number, default: 0 },
  // آخر سعر بيع
  lastSalePrice: { type: Number, default: 0 },

  isRawMaterial: { type: Boolean, default: false }, // خامة تصنيع؟
  isActive: { type: Boolean, default: true },
  notes: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Item', itemSchema);