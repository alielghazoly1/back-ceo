const express = require('express');
const router  = express.Router();
const {
  getPurchaseInvoices, getPurchaseInvoiceById, checkDocNumber,
  createPurchaseInvoice, forceEditPurchaseInvoice,
  approvePurchaseInvoice, suspendPurchaseInvoice, cancelPurchaseInvoice,
  getItemMovements,
} = require('../controllers/purchaseController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ⚠️ ترتيب مهم — الثابتة قبل /:id
router.get('/check-doc',           protect, checkDocNumber);
router.get('/movements/:itemId',   protect, getItemMovements);
router.get('/',                    protect, getPurchaseInvoices);
router.post('/',                   protect, createPurchaseInvoice);
router.get('/:id',                 protect, getPurchaseInvoiceById);
router.put('/:id/force-edit',      protect, adminOnly, forceEditPurchaseInvoice); // ← جديد
router.put('/:id/approve',         protect, adminOnly, approvePurchaseInvoice);
router.put('/:id/suspend',         protect, suspendPurchaseInvoice);
router.delete('/:id',              protect, cancelPurchaseInvoice);

module.exports = router;