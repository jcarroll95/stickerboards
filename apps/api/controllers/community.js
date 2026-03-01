const asyncHandler = require('../middleware/async');
const GlobalStats = require('../models/GlobalStats');

// @desc    Get community global stats
// @route   GET /api/v1/community/stats
// @access  Public
exports.getCommunityStats = asyncHandler(async (req, res, next) => {
  let stats = await GlobalStats.findOne();

  if (!stats) {
    stats = await GlobalStats.create({
      totalCommunityMomentum: 0,
      totalWeightLost: 0,
      lastUpdated: new Date()
    });
  }

  res.status(200).json({
    success: true,
    data: {
      totalCommunityMomentum: stats.totalCommunityMomentum,
      totalWeightLost: stats.totalWeightLost,
      lastUpdated: stats.lastUpdated
    }
  });
});
