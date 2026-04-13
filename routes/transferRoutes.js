const express = require('express');
const router = express.Router();
const { getTransfers, createTransfer, approveTransfer, rejectTransfer } = require('../controllers/transferController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/', protect, getTransfers);
router.post('/', protect, createTransfer);
router.put('/:id/approve', protect, adminOnly, approveTransfer);
router.put('/:id/reject', protect, adminOnly, rejectTransfer);

module.exports = router;