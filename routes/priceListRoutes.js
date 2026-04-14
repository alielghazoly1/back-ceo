const express = require('express');
const router  = express.Router();
const {
  getPriceList,
  getItemPrice,
  getItemPriceWithLastPurchase,
  upsertPriceList,
  deletePriceEntry,
} = require('../controllers/priceListController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ⚠️ ترتيب مهم — الـ routes الثابتة قبل /:itemId
router.get('/item-with-purchase/:itemId', protect, getItemPriceWithLastPurchase);
router.get('/item/:itemId', protect, getItemPrice);
router.get('/',            protect, getPriceList);
router.post('/',           protect, adminOnly, upsertPriceList);
router.delete('/:id',      protect, adminOnly, deletePriceEntry);

module.exports = router;