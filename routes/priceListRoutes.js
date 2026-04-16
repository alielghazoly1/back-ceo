const express = require('express');
const router  = express.Router();
const {
  getAllPriceLists,
  getPriceListByName,
  getPriceList,
  getItemPrice,
  getItemPriceWithLastPurchase,
  upsertPriceList,
  reorderItems,
  deletePriceEntry,
  createPriceList,
  updatePriceListInfo,
} = require('../controllers/priceListController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚠️ IMPORTANT: Static routes MUST come before dynamic routes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ══ STATIC GET ROUTES (قبل /:param) ══
router.get('/lists', protect, getAllPriceLists);
router.get('/item-with-purchase/:itemId', protect, getItemPriceWithLastPurchase);
router.get('/item/:itemId', protect, getItemPrice);

// ══ STATIC POST ROUTES ══
router.post('/lists', protect, adminOnly, createPriceList);  // ← إنشاء قائمة جديدة
router.post('/reorder', protect, adminOnly, reorderItems);    // ← تحديث الترتيب

// ══ STATIC PUT ROUTES ══
router.put('/lists/info', protect, adminOnly, updatePriceListInfo); // ← تعديل القائمة

// ══ STATIC DELETE ROUTES ══
router.delete('/:id', protect, adminOnly, deletePriceEntry);

// ══ MAIN CRUD ROUTES ══
router.post('/', protect, adminOnly, upsertPriceList);      // ← إضافة/تعديل صنف
router.get('/:listName/items', protect, getPriceListByName); // ← جلب قائمة معينة
router.get('/', protect, getPriceList);                      // ← جلب كل الأسعار

module.exports = router;