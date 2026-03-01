const mongoose = require('mongoose');
const MomentumService = require('../../services/momentumService');
const MomentumLedger = require('../../models/MomentumLedger');
const User = require('../../models/User');
const GlobalStats = require('../../models/GlobalStats');
const StickerInventory = require('../../models/StickerInventory');
const StickerPack = require('../../models/StickerPack');
const LogEntry = require('../../models/LogEntry');

jest.mock('../../models/MomentumLedger');
jest.mock('../../models/User');
jest.mock('../../models/GlobalStats');
jest.mock('../../models/StickerInventory');
jest.mock('../../models/StickerPack');
jest.mock('../../models/LogEntry');

describe('MomentumService', () => {
  const userId = new mongoose.Types.ObjectId();
  const packId = new mongoose.Types.ObjectId();
  const stickerId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logAction', () => {
    test('logs action and updates user and global stats', async () => {
      const trigger = 'stickMe';
      const metadata = { boardId: 'board123' };

      User.findByIdAndUpdate.mockResolvedValue({ _id: userId, momentumBalance: 15 });
      GlobalStats.findOneAndUpdate.mockResolvedValue({});

      await MomentumService.logAction(userId, trigger, metadata);

      expect(MomentumLedger.create).toHaveBeenCalledWith(expect.objectContaining({
        user: userId,
        trigger,
        delta: 15,
        metadata
      }));

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(userId, { $inc: { momentumBalance: 15 } }, { new: true });
      expect(GlobalStats.findOneAndUpdate).toHaveBeenCalledWith({}, { $inc: { totalCommunityMomentum: 15 } }, { upsert: true });
    });

    test('handles weightLog and calculates weight lost', async () => {
      const trigger = 'weightLog';
      const metadata = { weight: 190, entryId: 'newEntry123' };

      User.findByIdAndUpdate.mockResolvedValue({ _id: userId, momentumBalance: 25 });

      LogEntry.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue({ weight: 200 })
      });

      await MomentumService.logAction(userId, trigger, metadata);

      expect(GlobalStats.findOneAndUpdate).toHaveBeenCalledWith({}, { $inc: { totalWeightLost: 10 } });
    });

    test('triggers reward when threshold met', async () => {
      const trigger = 'firstLog'; // 50 points, threshold 50

      User.findByIdAndUpdate.mockResolvedValueOnce({ _id: userId, momentumBalance: 55 });

      // Mock grantNewSticker to avoid its internal logic for this test
      const grantSpy = jest.spyOn(MomentumService, 'grantNewSticker').mockResolvedValue({});

      await MomentumService.logAction(userId, trigger);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(userId, { $inc: { momentumBalance: -50 } });
      expect(grantSpy).toHaveBeenCalledWith(userId);

      grantSpy.mockRestore();
    });

    test('uses default config if trigger not found', async () => {
      const trigger = 'unknownTrigger';
      User.findByIdAndUpdate.mockResolvedValue({ _id: userId, momentumBalance: 5 });
      GlobalStats.findOneAndUpdate.mockResolvedValue({});

      await MomentumService.logAction(userId, trigger);

      expect(MomentumLedger.create).toHaveBeenCalledWith(expect.objectContaining({
        delta: 5
      }));
    });

    test('skips weight lost calculation if weight is not in metadata', async () => {
      const trigger = 'weightLog';
      const metadata = { entryId: 'newEntry123' }; // weight missing

      User.findByIdAndUpdate.mockResolvedValue({ _id: userId, momentumBalance: 25 });

      await MomentumService.logAction(userId, trigger, metadata);

      expect(LogEntry.findOne).not.toHaveBeenCalled();
    });

    test('skips weight lost calculation if no previous entry', async () => {
      const trigger = 'weightLog';
      const metadata = { weight: 190, entryId: 'newEntry123' };

      User.findByIdAndUpdate.mockResolvedValue({ _id: userId, momentumBalance: 25 });
      LogEntry.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(null)
      });

      await MomentumService.logAction(userId, trigger, metadata);

      expect(GlobalStats.findOneAndUpdate).not.toHaveBeenCalledWith({}, { $inc: { totalWeightLost: expect.any(Number) } });
    });

    test('skips weight lost calculation if previous weight is not greater', async () => {
      const trigger = 'weightLog';
      const metadata = { weight: 190, entryId: 'newEntry123' };

      User.findByIdAndUpdate.mockResolvedValue({ _id: userId, momentumBalance: 25 });
      LogEntry.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue({ weight: 180 })
      });

      await MomentumService.logAction(userId, trigger, metadata);

      expect(GlobalStats.findOneAndUpdate).not.toHaveBeenCalledWith({}, { $inc: { totalWeightLost: expect.any(Number) } });
    });
  });

  describe('grantNewSticker', () => {
    test('fills empty slot if available', async () => {
      const mockEmptySlot = {
        userId,
        quantity: 0,
        save: jest.fn().mockResolvedValue({})
      };
      StickerInventory.findOne.mockResolvedValue(mockEmptySlot);

      await MomentumService.grantNewSticker(userId);

      expect(mockEmptySlot.quantity).toBe(1);
      expect(mockEmptySlot.save).toHaveBeenCalled();
    });

    test('awards new pack if no empty slots', async () => {
      StickerInventory.findOne.mockResolvedValue(null);
      StickerInventory.distinct.mockResolvedValue([]);

      const mockPack = {
        _id: packId,
        stickers: [{ _id: stickerId }, { _id: new mongoose.Types.ObjectId() }]
      };
      StickerPack.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockPack)
      });

      await MomentumService.grantNewSticker(userId);

      expect(StickerInventory.bulkWrite).toHaveBeenCalled();
      const ops = StickerInventory.bulkWrite.mock.calls[0][0];
      expect(ops).toHaveLength(2);
      expect(ops[0].insertOne.document.quantity).toBeLessThanOrEqual(1);
    });

    test('skips if no new packs found', async () => {
      StickerInventory.findOne.mockResolvedValue(null);
      StickerInventory.distinct.mockResolvedValue(['somePackId']);
      StickerPack.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      const result = await MomentumService.grantNewSticker(userId);
      expect(result).toBeUndefined();
    });

    test('skips if new pack has no stickers', async () => {
      StickerInventory.findOne.mockResolvedValue(null);
      StickerInventory.distinct.mockResolvedValue(['somePackId']);
      StickerPack.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue({ _id: 'newPack', stickers: [] })
      });

      const result = await MomentumService.grantNewSticker(userId);
      expect(result).toBeUndefined();
    });
  });
});
