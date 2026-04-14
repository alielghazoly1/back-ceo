const express = require('express');
const router  = express.Router();
const {
  getSaleInvoices, getSaleInvoiceById,
  checkDocNumber, searchInvoice,
  createSaleInvoice, updateSaleInvoice,
  forceEditSaleInvoice,
  approveSaleInvoice, suspendSaleInvoice, cancelSaleInvoice,
} = require('../controllers/saleController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ⚠️ الثابتة قبل /:id
router.get('/check-doc',           protect, checkDocNumber);
router.get('/search',              protect, searchInvoice);
router.get('/',                    protect, getSaleInvoices);
router.post('/',                   protect, createSaleInvoice);
router.get('/:id',                 protect, getSaleInvoiceById);
router.put('/:id/force-edit',      protect, adminOnly, forceEditSaleInvoice);
router.put('/:id/approve',         protect, adminOnly, approveSaleInvoice);
router.put('/:id/suspend',         protect, suspendSaleInvoice);
router.put('/:id',                 protect, updateSaleInvoice);
router.delete('/:id',              protect, cancelSaleInvoice);

module.exports = router;