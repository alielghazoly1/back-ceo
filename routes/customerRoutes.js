const express = require('express');
const router  = express.Router();
const {
  getCustomers,
  getCustomerStatement,
  getCustomerItemStatement,
  getCustomerAllSeasons,
  getSupplierAllSeasons,
  getSupplierItemStatement,
  getSupplierStatement,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} = require('../controllers/customerController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/', protect, getCustomers);
router.get('/supplier/:supplierId/statement',    protect, getSupplierStatement);
router.get('/supplier/:supplierId/all-seasons',  protect, getSupplierAllSeasons);
router.get('/supplier/:supplierId/item/:itemId',  protect, getSupplierItemStatement);
router.get('/:customerId/statement',             protect, getCustomerStatement);
router.get('/:customerId/item/:itemId',          protect, getCustomerItemStatement);
router.get('/:customerId/all-seasons',           protect, getCustomerAllSeasons);
router.post('/',   protect, adminOnly, createCustomer);
router.put('/:id', protect, adminOnly, updateCustomer);
router.delete('/:id', protect, adminOnly, deleteCustomer);

module.exports = router;