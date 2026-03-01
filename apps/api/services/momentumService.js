const MomentumLedger = require('../models/MomentumLedger');
const User = require('../models/User');
const GlobalStats = require('../models/GlobalStats');
const StickerInventory = require('../models/StickerInventory');
const StickerPack = require('../models/StickerPack');
const LogEntry = require('../models/LogEntry');

/**
 * Configuration for Momentum Triggers.
 * Centralizing this here means Usecases don't need to know 'how much' an action is worth.
 */
const TRIGGER_CONFIGS = {
  doseLog:    { delta: 10, rewardThreshold: 100 },
  weightLog:  { delta: 25, rewardThreshold: 100 },
  nsvLog:     { delta: 20, rewardThreshold: 100 },
  comment:    { delta: 5,  rewardThreshold: 50  },
  stickMe:    { delta: 15, rewardThreshold: 100 },
  stickOther: { delta: 20, rewardThreshold: 100 },
  explore:    { delta: 5,  rewardThreshold: 50  },
  motivate:   { delta: 10, rewardThreshold: 100 },
  stickNew:   { delta: 30, rewardThreshold: 100 },
  firstLog:   { delta: 50, rewardThreshold: 50  }
};

class MomentumService {
  /**
   * Logs an action and automatically determines delta/rewards based on trigger type.
   */
  static async logAction(userId, trigger, metadata = {}) {
    const config = TRIGGER_CONFIGS[trigger] || { delta: 5, rewardThreshold: 100 };
    const { delta, rewardThreshold } = config;

    // 1. Append-only record
    await MomentumLedger.create({ user: userId, trigger, delta, metadata });

    // 2. Denormalized updates
    const [user] = await Promise.all([
      User.findByIdAndUpdate(userId, { $inc: { momentumBalance: delta } }, { new: true }),
      GlobalStats.findOneAndUpdate({}, { $inc: { totalCommunityMomentum: delta } }, { upsert: true })
    ]);
    if (trigger === 'weightLog' && metadata.weight) {
      const previousEntry = await LogEntry.findOne({
        user: userId,
        type: 'weight',
        _id: { $ne: metadata.entryId } // current entry we just saved
      }).sort({ createdAt: -1 });

      if (previousEntry && previousEntry.weight > metadata.weight) {
        const lost = previousEntry.weight - metadata.weight;
        await GlobalStats.findOneAndUpdate({}, { $inc: { totalWeightLost: lost } });
      }
    }

    // 3. Reward Check
    if (user.momentumBalance >= rewardThreshold) {
      // "Spend" the points and grant a sticker
      await User.findByIdAndUpdate(userId, { $inc: { momentumBalance: -rewardThreshold } });
      await this.grantNewSticker(userId);
    }
  }

  /**
   * The Baseline Reward Function:
   * 1. Looks for a sticker the user 'owns' (is in inventory) but has quantity 0.
   * 2. If none, awards a brand new random pack with 1 sticker active and others at 0.
   */
  static async grantNewSticker(userId) {
    // Phase 1: Try to fill an existing empty slot in current inventory
    const emptySlot = await StickerInventory.findOne({ userId, quantity: 0, stickerId: { $ne: null } });

    if (emptySlot) {
      emptySlot.quantity = 1;
      emptySlot.updatedAt = Date.now();
      return await emptySlot.save();
    }

    // Phase 2: If no empty slots, award a brand new pack
    // Find packs the user doesn't have ANY record of yet
    const userPacks = await StickerInventory.distinct('packId', { userId });
    const newPack = await StickerPack.findOne({ _id: { $nin: userPacks } }).populate('stickers');

    if (newPack && newPack.stickers.length > 0) {
      const stickers = newPack.stickers;
      const luckyIndex = Math.floor(Math.random() * stickers.length);

      const ops = stickers.map((s, index) => ({
        insertOne: {
          document: {
            userId,
            stickerId: s._id,
            packId: newPack._id,
            quantity: index === luckyIndex ? 1 : 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        }
      }));

      return await StickerInventory.bulkWrite(ops);
    }
  }
}

module.exports = MomentumService;
