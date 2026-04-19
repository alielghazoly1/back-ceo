// ══════════════════════════════════════════════════════════════════
//  auditHelper.js — utils/auditHelper.js
//  استخدامه: await audit(req.user, 'invoice_approved', 'SaleInvoice', invoice._id, invoice.invoiceNumber)
//  مش بيرمي error لو فشل — الـ audit مش أهم من العملية الأصلية
// ══════════════════════════════════════════════════════════════════
const AuditLog = require('../models/AuditLog');

/**
 * @param {Object} user       - req.user
 * @param {String} action     - من enum الـ AuditLog
 * @param {String} resource   - 'SaleInvoice' | 'Customer' | ...
 * @param {*}      resourceId - _id
 * @param {String} resourceRef - invoiceNumber أو name (للعرض)
 * @param {Object} details    - أي بيانات إضافية (اختياري)
 */
const audit = async (user, action, resource, resourceId, resourceRef, details) => {
  try {
    await AuditLog.create({
      user:        user?._id,
      userName:    user?.name,
      userRole:    user?.role,
      action,
      resource,
      resourceId,
      resourceRef: String(resourceRef || ''),
      details:     details || undefined,
    });
  } catch {
    // نتجاهل أي خطأ في الـ audit — مش المفروض يوقف العملية الأصلية
  }
};

module.exports = { audit };