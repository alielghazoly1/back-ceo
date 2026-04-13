const express = require('express');
const router = express.Router();
const { getSeasons, getActiveSeason, createSeason, updateSeason } = require('../controllers/seasonController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/', protect, getSeasons);
router.get('/active', protect, getActiveSeason);
router.post('/', protect, adminOnly, createSeason);
router.put('/:id', protect, adminOnly, updateSeason);

module.exports = router;