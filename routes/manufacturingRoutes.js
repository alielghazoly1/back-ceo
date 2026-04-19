const express = require('express');
const router  = express.Router();
const {
  getOrders, getOrderById,
  getWorkers, getWorkerReport,
  createOrder, approveOrder, rejectOrder,
} = require('../controllers/manufacturingController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/',                    protect, getOrders);
router.get('/workers',             protect, getWorkers);
router.get('/worker/:workerId',    protect, adminOnly, getWorkerReport);
router.get('/:id',                 protect, getOrderById);
router.post('/',                   protect, createOrder);
router.put('/:id/approve',         protect, adminOnly, approveOrder);
router.put('/:id/reject',          protect, adminOnly, rejectOrder);

module.exports = router;