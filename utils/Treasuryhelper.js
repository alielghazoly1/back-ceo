// ══════════════════════════════════════════════════════════════════
//  treasuryHelper.js — دوال مساعدة لتسجيل حركات الخزنة
//  بيُستخدم في: saleController, paymentController, returnController
// ══════════════════════════════════════════════════════════════════
const Treasury = require('../models/Treasury');

/**
 * recordSaleInvoice — تسجيل حركات فاتورة مبيعات نقدي/بنكي
 * بيُستدعى في approveSaleInvoice
 */
const recordSaleInvoice = async (invoice, admin) => {
  const entries = [];

  const base = {
    referenceId: invoice._id,
    referenceModel: 'SaleInvoice',
    referenceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    customerCode: invoice.customerCode,
    season: invoice.season,
    date: invoice.date,
  };

  const method = invoice.paymentMethod;

  if (method === 'cash' && invoice.cashAmount > 0) {
    // نقدي كامل → خزنة الأدمن
    entries.push({
      ...base,
      treasury: 'admin',
      admin: admin._id,
      adminName: admin.name,
      type: 'sale_cash',
      amount: invoice.cashAmount,
      paymentMethod: 'cash',
    });
  } else if (method === 'instapay' && invoice.instapayAmount > 0) {
    // انستاباي كامل → خزنة البنك
    entries.push({
      ...base,
      treasury: 'bank',
      type: 'sale_bank',
      amount: invoice.instapayAmount,
      paymentMethod: 'instapay',
    });
  } else if (method === 'transfer' && invoice.paidAmount > 0) {
    // تحويل → خزنة البنك
    entries.push({
      ...base,
      treasury: 'bank',
      type: 'sale_bank',
      amount: invoice.paidAmount,
      paymentMethod: 'transfer',
    });
  } else if (method === 'check' && invoice.paidAmount > 0) {
    // شيك → خزنة البنك
    entries.push({
      ...base,
      treasury: 'bank',
      type: 'sale_bank',
      amount: invoice.paidAmount,
      paymentMethod: 'check',
    });
  } else if (method === 'mixed') {
    // مختلط → نقدي للأدمن + انستاباي للبنك
    if (invoice.cashAmount > 0) {
      entries.push({
        ...base,
        treasury: 'admin',
        admin: admin._id,
        adminName: admin.name,
        type: 'sale_cash',
        amount: invoice.cashAmount,
        paymentMethod: 'cash',
      });
    }
    if (invoice.instapayAmount > 0) {
      entries.push({
        ...base,
        treasury: 'bank',
        type: 'sale_bank',
        amount: invoice.instapayAmount,
        paymentMethod: 'instapay',
      });
    }
  }

  if (entries.length > 0) {
    await Treasury.insertMany(entries);
  }
};

/**
 * recordPayment — تسجيل دفعة عميل في الخزنة
 * بيُستدعى في createPayment
 */
const recordPayment = async (payment, admin) => {
  if (payment.type !== 'customer_payment') return;

  const base = {
    referenceId: payment._id,
    referenceModel: 'Payment',
    referenceNumber: payment.receiptNumber || payment._id.toString().slice(-6),
    customerName: payment.customerName,
    customerCode: payment.customerCode,
    season: payment.season,
    date: payment.date,
  };

  const method = payment.paymentMethod;
  const entries = [];

  if (method === 'cash') {
    entries.push({
      ...base,
      treasury: 'admin',
      admin: admin._id,
      adminName: admin.name,
      type: 'payment_cash',
      amount: payment.amount,
      paymentMethod: 'cash',
    });
  } else if (['instapay', 'transfer', 'check'].includes(method)) {
    entries.push({
      ...base,
      treasury: 'bank',
      type: 'payment_bank',
      amount: payment.amount,
      paymentMethod: method,
    });
  } else if (method === 'mixed') {
    if (payment.cashAmount > 0) {
      entries.push({
        ...base,
        treasury: 'admin',
        admin: admin._id,
        adminName: admin.name,
        type: 'payment_cash',
        amount: payment.cashAmount,
        paymentMethod: 'cash',
      });
    }
    if (payment.instapayAmount > 0) {
      entries.push({
        ...base,
        treasury: 'bank',
        type: 'payment_bank',
        amount: payment.instapayAmount,
        paymentMethod: 'instapay',
      });
    }
  }

  if (entries.length > 0) {
    await Treasury.insertMany(entries);
  }
};

/**
 * recordReturn — تسجيل مرتجع في الخزنة (خصم)
 * بيُستدعى في approveReturn
 * @param returnInv - وثيقة المرتجع
 * @param admin     - الأدمن اللي وافق
 */
const recordReturn = async (returnInv, admin) => {
  // بس مرتجعات العملاء اللي فيها رد أموال
  if (returnInv.type !== 'customer_return') return;
  if (returnInv.refundMethod === 'none') return;

  const base = {
    referenceId: returnInv._id,
    referenceModel: 'ReturnInvoice',
    referenceNumber: returnInv.invoiceNumber,
    customerName: returnInv.customerName,
    customerCode: returnInv.customerCode,
    season: returnInv.season,
    date: returnInv.date,
  };

  const entries = [];

  // رد نقدي → خصم من خزنة الأدمن (المبلغ سالب)
  if (
    ['cash', 'mixed'].includes(returnInv.refundMethod) &&
    returnInv.refundCashAmount > 0
  ) {
    entries.push({
      ...base,
      treasury: 'admin',
      admin: admin._id,
      adminName: admin.name,
      type: 'return_cash',
      amount: -returnInv.refundCashAmount, // سالب = خصم
      paymentMethod: 'cash',
    });
  }

  // رد بنكي → خصم من خزنة البنك
  if (
    ['bank', 'mixed'].includes(returnInv.refundMethod) &&
    returnInv.refundBankAmount > 0
  ) {
    entries.push({
      ...base,
      treasury: 'bank',
      type: 'return_bank',
      amount: -returnInv.refundBankAmount, // سالب = خصم
      paymentMethod: 'transfer',
    });
  }

  if (entries.length > 0) {
    await Treasury.insertMany(entries);
  }
};

module.exports = { recordSaleInvoice, recordPayment, recordReturn };
