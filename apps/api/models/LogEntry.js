const mongoose = require('mongoose');

const LogEntrySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  belongsToBoard: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stickerboard', required: true
  },
  // Reference to the dose if this was logged during a stick
  relatedStick: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stick'
  },
  type: {
    type: String,
    enum: ['weight', 'nsv', 'note'],
    required: true
  },
  weight: {
    type: Number,
    min: 0,
    max: 999
  },
  content: {
    type: String,
    maxLength: 500
  },
  userDate: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('LogEntry', LogEntrySchema);
