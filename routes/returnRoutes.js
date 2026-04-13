const express = require('express');
const router = express.Router();
const { getReturns, createReturn, approveReturn, rejectReturn } = require('../controllers/returnController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/', protect, getReturns);
router.post('/', protect, createReturn);
router.put('/:id/approve', protect, adminOnly, approveReturn);
router.put('/:id/reject', protect, adminOnly, rejectReturn);

module.exports = router;