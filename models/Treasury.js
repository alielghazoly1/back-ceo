const mongoose = require('mongoose');

// ══════════════════════════════════════════════════════════════════
//  Treasury — خزنة موحدة لكل أنواع الحركات المالية
//
//  خزنتين:
//   - خزنة الأدمن (admin): النقدي فقط، مرتبطة بالأدمن اللي استلم
//   - خزنة البنك (bank):   انستاباي + تحويل بنكي + شيكات، مشتركة
//
//  الحركات:
//   + sale_cash        فاتورة نقدي (عند الموافقة)
//   + sale_bank        فاتورة بنكي/انستاباي (عند الموافقة)
//   + payment_cash     دفعة عميل نقدي
//   + payment_bank     دفعة عميل بنكي/انستاباي
//   - return_cash      مرتجع نقدي (خصم من خزنة الأدمن)
//   - return_bank      مرتجع بنكي/انستاباي (خصم من البنك)
// ══════════════════════════════════════════════════════════════════
const treasurySchema = new mongoose.Schema(
  {
    // ── نوع الخزنة ──────────────────────────────────────────────
    treasury: {
      type: String,
      enum: ['admin', 'bank'],
      required: true,
    },

    // الأدمن — مطلوب فقط في خزنة الأدمن
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminName: { type: String },

    // ── نوع الحركة ──────────────────────────────────────────────
    type: {
      type: String,
      enum: [
        'sale_cash',
        'sale_bank',
        'payment_cash',
        'payment_bank',
        'return_cash',
        'return_bank',
      ],
      required: true,
    },

    // المبلغ — موجب = وارد | سالب = صادر (مرتجع)
    amount: { type: Number, required: true },

    // طريقة الدفع الفعلية
    paymentMethod: {
      type: String,
      enum: ['cash', 'instapay', 'transfer', 'check', 'mixed'],
    },

    // مرجع الحركة
    referenceId: { type: mongoose.Schema.Types.ObjectId },
    referenceModel: { type: String }, // SaleInvoice | Payment | ReturnInvoice
    referenceNumber: { type: String },

    // بيانات العميل
    customerName: { type: String },
    customerCode: { type: String },

    season: { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Indexes للبحث السريع
treasurySchema.index({ treasury: 1, date: -1 });
treasurySchema.index({ admin: 1, date: -1 });

module.exports = mongoose.model('Treasury', treasurySchema);
