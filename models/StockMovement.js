const mongoose = require('mongoose');

const stockMovementSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  itemCode: { type: String, required: true },
  itemName: { type: String, required: true },
  type: {
    type: String,
    enum: ['purchase', 'sale', 'return_in', 'return_out', 'transfer_in', 'transfer_out', 'manufacturing_in', 'manufacturing_out'],
    required: true,
  },
  quantity: { type: Number, required: true },
  weight: { type: Number, required: true },
  price: { type: Number, default: 0 },
  warehouse: { type: String, enum: ['ramses', 'october'], required: true },
  reference: { type: String },        // رقم الفاتورة
  referenceModel: { type: String },   // PurchaseInvoice / SaleInvoice ...
  referenceId: { type: mongoose.Schema.Types.ObjectId },
  season: { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('StockMovement', stockMovementSchema);