const express = require('express');
const router = express.Router();
const {
  getAdmins,
  getAdminRegister,
  getBankRegister,
  getDailySummary,
} = require('../controllers/cashRegisterController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/admins', protect, adminOnly, getAdmins);
router.get('/summary', protect, adminOnly, getDailySummary);
router.get('/bank', protect, adminOnly, getBankRegister);
router.get('/:adminId', protect, adminOnly, getAdminRegister);

module.exports = router;
