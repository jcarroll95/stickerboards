const mongoose = require('mongoose');
require('./LogEntry');
const stickLocations = ['Stomach', 'Arm', 'Thigh', 'Other'];
const stickLocMod = ['Left', 'Right', 'Upper', 'Upper Left', 'Upper Right', 'Lower', 'Lower Left', 'Lower Right'];

const StickSchema = new mongoose.Schema({
    belongsToBoard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Stickerboard',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    stickType: String,
    stickNumber: Number,
    stickMed: {
        type: String,
        maxlength: [50, 'Max medicine type length is 50 characters']
    },
    stickLocation: {
        type: String,
        enum: stickLocations
    },
    stickLocMod: {
        type: String,
        enum: stickLocMod
    },
    stickDose: {
        type: Number,
        default: 2.5
    },
    userTime: Date,
    userDate: Date,
    description: {
        type: String,
        maxlength: [500, 'Max description length is 500 characters']
    },
    nsv: {
        type: String,
        maxlength: [500, 'Max description length is 500 characters']
    },
    weight: {
        type: Number,
        min: 0,
        max: 999
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    cost: {
        type: Number,
        min: 0,
        max: 9999,
        default: 0
    }
});

StickSchema.statics.getAverageCost = async function(belongsToBoard) {
    // Aggregate average cost for all stix that belong to this board
    const aggObj = await this.aggregate([
        { $match: { belongsToBoard: belongsToBoard } },
        {
            $group: {
                _id: '$belongsToBoard',
                averageCost: { $avg: '$cost' }
            }
        }
    ]);


    try {
        const avg = aggObj.length > 0 ? aggObj[0].averageCost : 0;
        await this.model('Stickerboard').findByIdAndUpdate(
            belongsToBoard,
            { averageCost: avg },
            { new: true, runValidators: false }
        );
    } catch (err) {
        console.error('Error updating Stickerboard averageCost:', err);
    }
}


StickSchema.post('save', async function() {
  try {
    await this.constructor.getAverageCost(this.belongsToBoard);
  } catch (err) {
    console.error('[CRITICAL] Failed to update averageCost:', err);
  }
});

StickSchema.post('deleteOne', { document: true, query: false }, async function() {
  try {
    await this.constructor.getAverageCost(this.belongsToBoard);
  } catch (err) {
    console.error('[CRITICAL] Failed to update averageCost:', err);
    // Don't throw - don't fail the save because aggregate failed
    // But log loudly so it's visible
  }
});

StickSchema.post('save', async function(doc) {
  const LogEntry = mongoose.model('LogEntry');
  const logs = [];

  // If weight was provided in the dose form
  if (doc.weight) {
    logs.push({
      user: doc.user,
      belongsToBoard: doc.belongsToBoard,
      relatedStick: doc._id,
      type: 'weight',
      weight: doc.weight,
      userDate: doc.userDate || doc.createdAt
    });
  }

  // If NSV was provided in the dose form
  if (doc.nsv) {
    logs.push({
      user: doc.user,
      belongsToBoard: doc.belongsToBoard,
      relatedStick: doc._id,
      type: 'nsv',
      nsv: doc.nsv,
      userDate: doc.userDate || doc.createdAt
    });
  }

  if (logs.length > 0) {
    await LogEntry.insertMany(logs);

    // Clean up the Stick document so data isn't duplicated
    doc.weight = undefined;
    doc.nsv = undefined;
    await doc.save();
  }
});

module.exports = mongoose.model('Stick', StickSchema);

