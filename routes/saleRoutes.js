const express = require('express');
const router = express.Router();
const {
  getSaleInvoices, getSaleInvoiceById,
  checkDocNumber, createSaleInvoice, updateSaleInvoice,
  approveSaleInvoice, suspendSaleInvoice, cancelSaleInvoice,
} = require('../controllers/saleController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/check-doc', protect, checkDocNumber);
router.get('/', protect, getSaleInvoices);
router.get('/:id', protect, getSaleInvoiceById);
router.post('/', protect, createSaleInvoice);
router.put('/:id', protect, updateSaleInvoice);
router.put('/:id/approve', protect, adminOnly, approveSaleInvoice);
router.put('/:id/suspend', protect, suspendSaleInvoice);
router.put('/:id/cancel', protect, cancelSaleInvoice);

module.exports = router;