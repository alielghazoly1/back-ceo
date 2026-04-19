// ════════════════════════════════════════════
//  server/controllers/paymentController.js
// ════════════════════════════════════════════
const Payment       = require('../models/Payment');
const { audit }     = require('../utils/auditHelper');
const { recordPayment } = require('../utils/treasuryHelper');
const Season  = require('../models/Season');

const getPayments = async (req, res) => {
  try {
    const { customerId, supplierId, seasonId, type } = req.query;
    let query = {};
    if (customerId) query.customer = customerId;
    if (supplierId) query.supplier = supplierId;
    if (seasonId)   query.season   = seasonId;
    if (type)       query.type     = type;

    const payments = await Payment.find(query)
      .populate('createdBy', 'name')
      .populate('season', 'name')
      .sort({ date: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// التحقق من رقم الوصل — مينفعش يتكرر
const checkReceiptNumber = async (req, res) => {
  try {
    const { receiptNumber, excludeId } = req.query;
    if (!receiptNumber?.trim()) return res.json({ exists: false });
    let query = { receiptNumber };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await Payment.findOne(query);
    res.json({ exists: !!exists });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createPayment = async (req, res) => {
  try {
    const {
      type,
      customerId, customerCode, customerName,
      supplierId, supplierCode, supplierName,
      amount, paymentMethod,
      cashAmount, instapayAmount,
      notes, reference,
      receiptNumber,   // ← رقم الوصل اليدوي
      date, seasonId,
    } = req.body;

    // التحقق من رقم الوصل لو موجود
    if (receiptNumber?.trim()) {
      const exists = await Payment.findOne({ receiptNumber: receiptNumber.trim() });
      if (exists) {
        return res.status(400).json({ message: `رقم الوصل "${receiptNumber}" موجود بالفعل` });
      }
    }

    let season;
    if (seasonId) {
      season = await Season.findById(seasonId);
    } else {
      season = await Season.findOne({ isActive: true });
    }
    if (!season) return res.status(400).json({ message: 'مفيش موسم نشط' });

    const payment = await Payment.create({
      type,
      customer: customerId, customerCode, customerName,
      supplier: supplierId, supplierCode, supplierName,
      season: season._id,
      amount: Number(amount),
      paymentMethod: paymentMethod || 'cash',
      cashAmount:    Number(cashAmount)    || 0,
      instapayAmount: Number(instapayAmount) || 0,
      notes, reference,
      receiptNumber: receiptNumber?.trim() || null,
      date: date || Date.now(),
      createdBy: req.user._id,
    });

    const populated = await payment.populate('createdBy', 'name');

    // ── تسجيل في الخزنة (نقدي للأدمن + بنكي للبنك) ───────────
    await recordPayment(payment, req.user);

    await audit(req.user, 'payment_created', 'Payment', payment._id, payment.receiptNumber || payment._id.toString().slice(-6), { amount: payment.amount, type: payment.type, customerName: payment.customerName, supplierName: payment.supplierName });
    res.status(201).json(populated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'رقم الوصل موجود بالفعل' });
    }
    res.status(500).json({ message: err.message });
  }
};

// تعديل دفعة موجودة
const updatePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'الدفعة مش موجودة' });

    const {
      amount, paymentMethod, cashAmount, instapayAmount,
      notes, reference, receiptNumber, date,
    } = req.body;

    // التحقق من رقم الوصل لو اتغير
    if (receiptNumber?.trim() && receiptNumber.trim() !== payment.receiptNumber) {
      const exists = await Payment.findOne({
        receiptNumber: receiptNumber.trim(),
        _id: { $ne: payment._id },
      });
      if (exists) {
        return res.status(400).json({ message: `رقم الوصل "${receiptNumber}" موجود بالفعل` });
      }
    }

    payment.amount         = Number(amount)         || payment.amount;
    payment.paymentMethod  = paymentMethod           || payment.paymentMethod;
    payment.cashAmount     = Number(cashAmount)      || 0;
    payment.instapayAmount = Number(instapayAmount)  || 0;
    payment.notes          = notes          ?? payment.notes;
    payment.reference      = reference      ?? payment.reference;
    payment.receiptNumber  = receiptNumber?.trim() || payment.receiptNumber;
    payment.date           = date           || payment.date;

    await payment.save();
    const updated = await payment.populate('createdBy', 'name');
    res.json(updated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'رقم الوصل موجود بالفعل' });
    }
    res.status(500).json({ message: err.message });
  }
};

const deletePayment = async (req, res) => {
  try {
    await Payment.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getPayments, checkReceiptNumber, createPayment, updatePayment, deletePayment };


// ════════════════════════════════════════════
//  server/routes/paymentRoutes.js
// ════════════════════════════════════════════
/*
const express = require('express');
const router  = express.Router();
const {
  getPayments, checkReceiptNumber,
  createPayment, updatePayment, deletePayment,
} = require('../controllers/paymentController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/check-receipt', protect, checkReceiptNumber);
router.get('/',              protect, getPayments);
router.post('/',             protect, createPayment);
router.put('/:id',           protect, updatePayment);
router.delete('/:id',        protect, adminOnly, deletePayment);

module.exports = router;
*/