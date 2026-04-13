const express = require('express');
const router = express.Router();
const {
  getPayments,
  checkReceiptNumber,
  createPayment,
  updatePayment,
  deletePayment,
} = require('../controllers/paymentController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/check-receipt', protect, checkReceiptNumber);
router.get('/', protect, getPayments);
router.post('/', protect, createPayment);
router.put('/:id', protect, updatePayment);
router.delete('/:id', protect, adminOnly, deletePayment);

module.exports = router;
