const mongoose = require('mongoose');
const MomentumLedgerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  trigger: {
    type: String,
    required: true,
    enum: [
      "doseLog",
      "weightLog",
      "nsvLog",
      "comment",
      "stickMe",
      "stickOther",
      "explore",
      "motivate",
      "stickNew",
      "firstLog"
    ]
  },
  eventKey: String,
  ruleId: String,
  ruleVersion: Number,
  delta: Number,
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MomentumLedger', MomentumLedgerSchema);
