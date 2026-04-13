const express = require('express');
const router = express.Router();
const {
  getPriceList, getItemPrice,
  upsertPriceList, deletePriceEntry,
} = require('../controllers/priceListController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/', protect, getPriceList);
router.get('/item/:itemId', protect, getItemPrice);
router.post('/', protect, adminOnly, upsertPriceList);
router.delete('/:id', protect, adminOnly, deletePriceEntry);

module.exports = router;