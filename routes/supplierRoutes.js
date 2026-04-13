const express = require('express');
const router = express.Router();
const { getSuppliers, getSupplierByCode, createSupplier, updateSupplier, deleteSupplier } = require('../controllers/supplierController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/', protect, getSuppliers);
router.get('/code/:code', protect, getSupplierByCode);
router.post('/', protect, adminOnly, createSupplier);
router.put('/:id', protect, adminOnly, updateSupplier);
router.delete('/:id', protect, adminOnly, deleteSupplier);

module.exports = router;