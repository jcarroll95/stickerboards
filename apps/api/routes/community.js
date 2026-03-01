const express = require('express');
const router = express.Router();
const { getCommunityStats } = require('../controllers/community');
const { protect } = require('../middleware/auth');

router.get('/stats', protect, getCommunityStats);

module.exports = router;
