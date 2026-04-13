const express = require('express');
const router = express.Router();
const {
  getPurchaseInvoices, getPurchaseInvoiceById,
  createPurchaseInvoice, approvePurchaseInvoice,
  suspendPurchaseInvoice, cancelPurchaseInvoice,
  getItemMovements,
} = require('../controllers/purchaseController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// مهم — المسارات الثابتة قبل المتغيرة
router.get('/movements/:itemId', protect, getItemMovements);
router.get('/', protect, getPurchaseInvoices);
router.get('/:id', protect, getPurchaseInvoiceById);
router.post('/', protect, createPurchaseInvoice);
router.put('/:id/approve', protect, adminOnly, approvePurchaseInvoice);
router.put('/:id/suspend', protect, suspendPurchaseInvoice);
router.put('/:id/cancel', protect, cancelPurchaseInvoice);

module.exports = router;