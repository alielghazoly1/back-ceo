const express = require('express');
const router = express.Router();
const {
  getGeneralStats,
  getTodayMovements,
  getStockReport,
  getUserMovements,
  getCustomerItemPrices,
} = require('../controllers/reportController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/stats', protect, adminOnly, getGeneralStats);
router.get('/today', protect, adminOnly, getTodayMovements);
router.get('/stock', protect, getStockReport);
router.get('/user/:userId', protect, adminOnly, getUserMovements);
router.get('/customer/:customerId/prices', protect, getCustomerItemPrices);

module.exports = router;