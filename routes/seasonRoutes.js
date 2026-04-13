const express = require('express');
const router  = express.Router();
const {
  getSeasons, getActiveSeason,
  createSeason, activateSeason, updateSeason,
} = require('../controllers/seasonController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/',        protect, getSeasons);
router.get('/active',  protect, getActiveSeason);
router.post('/',       protect, adminOnly, createSeason);
router.put('/:id/activate', protect, adminOnly, activateSeason);  // ← جديد
router.put('/:id',     protect, adminOnly, updateSeason);

module.exports = router;