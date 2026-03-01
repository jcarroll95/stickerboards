const mongoose = require('mongoose');

const GlobalStatsSchema = new mongoose.Schema({
  totalCommunityMomentum: { type: Number, default: 0 },
  totalWeightLost: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});
module.exports = mongoose.model('GlobalStats', GlobalStatsSchema);
