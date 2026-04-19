const mongoose = require('mongoose');

// ══════════════════════════════════════════════════════════════════
//  AuditLog — سجل كل العمليات المهمة في النظام
//  بيُسجَّل تلقائياً، مش بيأثر على أي بيانات موجودة
// ══════════════════════════════════════════════════════════════════
const auditLogSchema = new mongoose.Schema({

  // مين عمل العملية
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName:  { type: String },
  userRole:  { type: String },

  // نوع العملية
  action: {
    type: String,
    enum: [
      // فواتير
      'invoice_created',   'invoice_approved',
      'invoice_cancelled', 'invoice_suspended',
      'invoice_edited',
      // مرتجعات
      'return_created',    'return_approved', 'return_rejected',
      // مدفوعات
      'payment_created',   'payment_updated', 'payment_deleted',
      // عملاء / موردين
      'customer_created',  'customer_updated', 'customer_deleted',
      'supplier_created',  'supplier_updated', 'supplier_deleted',
      // نظام
      'user_login',        'user_created',     'season_activated',
    ],
    required: true,
  },

  // الكيان المتأثر
  resource:   { type: String },   // 'SaleInvoice' | 'Customer' | ...
  resourceId: { type: mongoose.Schema.Types.ObjectId },
  resourceRef: { type: String },  // invoiceNumber أو name للعرض

  // تفاصيل إضافية (اختياري — مش بيحفظ كل البيانات لتوفير المساحة)
  details: { type: mongoose.Schema.Types.Mixed },

  // التوقيت
  createdAt: { type: Date, default: Date.now },

}, {
  // مش محتاجين updatedAt — الـ audit log للقراءة فقط
  timestamps: false,
  versionKey: false,
});

// Index للبحث والعرض السريع
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// TTL: احذف السجلات القديمة تلقائياً بعد 365 يوم (اختياري)
// auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

module.exports = mongoose.model('AuditLog', auditLogSchema);