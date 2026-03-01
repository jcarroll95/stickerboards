const {
  getStix,
  addStick,
  getStick,
  updateStick,
  deleteStick,
} = require('../../usecases/stix/stixUsecases');
const Stick = require('../../models/Stick');
const Stickerboard = require('../../models/Stickerboard');
const StickerPack = require('../../models/StickerPack');
const MomentumService = require('../../services/momentumService');
const mongoose = require('mongoose');

jest.mock('../../models/Stick');
jest.mock('../../models/Stickerboard');
jest.mock('../../models/StickerPack');
jest.mock('../../services/momentumService');

// Mock mongoose session
const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn(),
  inTransaction: jest.fn().mockReturnValue(true),
};
mongoose.startSession = jest.fn().mockResolvedValue(mockSession);

describe('stixUsecases', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addStick', () => {
    test('adds a stick and updates board palette if owner', async () => {
      const actor = { id: 'user123', role: 'user' };
      const boardId = 'board123';
      const body = { stickNumber: 1, opId: 'op1' };

      Stickerboard.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          _id: boardId,
          user: 'user123',
          stickers: []
        })
      });
      // For the findOne dummy check
      Stickerboard.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({}) });

      const mockNewStick = { _id: 'stick123', stickNumber: 1 };
      Stick.create.mockResolvedValue([mockNewStick]);

      const result = await addStick({ actor, boardId, body });

      expect(Stick.create).toHaveBeenCalled();
      expect(Stickerboard.findByIdAndUpdate).toHaveBeenCalledWith(
        boardId,
        { $push: { stickers: expect.any(Object) } },
        expect.any(Object)
      );
      expect(result.stick).toBe(mockNewStick);
      expect(result.opId).toBe('op1');
    });

    test('adds a stick with custom PALETTE_PACK_ID', async () => {
      process.env.PALETTE_PACK_ID = 'pack123';
      const actor = { id: 'user123', role: 'user' };
      const boardId = 'board123';
      const body = { stickNumber: 1 };

      Stickerboard.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({ _id: boardId, user: 'user123', stickers: [] })
      });
      Stickerboard.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({}) });
      Stick.create.mockResolvedValue([{ _id: 'stick123', stickNumber: 1 }]);

      StickerPack.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({ _id: 'pack123', stickers: ['sticker1', 'sticker2'] })
      });

      await addStick({ actor, boardId, body });

      expect(StickerPack.findById).toHaveBeenCalledWith('pack123');
      delete process.env.PALETTE_PACK_ID;
    });

    test('throws 404 if board not found', async () => {
      Stickerboard.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
      Stickerboard.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({}) });

      await expect(addStick({ actor: { id: 'u1' }, boardId: 'b1', body: {} }))
        .rejects.toThrow('No stickerboard found');
    });

    test('throws 401 if not authorized', async () => {
      const actor = { id: 'otherUser', role: 'user' };
      Stickerboard.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          _id: 'board123',
          user: 'owner123',
        })
      });
      Stickerboard.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({}) });

      await expect(addStick({ actor, boardId: 'board123', body: {} }))
        .rejects.toThrow('not authorized');
    });

    test('handles session error by falling back to non-transactional mode', async () => {
      const actor = { id: 'user123', role: 'user' };
      const boardId = 'board123';
      const body = { stickNumber: 1 };

      // Mock session error
      const err = new Error('replica set');
      err.code = 20;
      mongoose.startSession.mockResolvedValueOnce({
        startTransaction: jest.fn().mockRejectedValue(err),
        endSession: jest.fn(),
        inTransaction: jest.fn().mockReturnValue(false),
      });

      Stickerboard.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          _id: boardId,
          user: 'user123',
          stickers: []
        })
      });

      const mockNewStick = { _id: 'stick123', stickNumber: 1 };
      Stick.create.mockResolvedValue([mockNewStick]);

      const result = await addStick({ actor, boardId, body });

      expect(result.stick).toBe(mockNewStick);
      expect(mongoose.startSession).toHaveBeenCalled();
    });

    test('rethrows non-transactional session errors', async () => {
      const actor = { id: 'user123', role: 'user' };
      const boardId = 'board123';

      const err = new Error('other error');
      mongoose.startSession.mockResolvedValueOnce({
        startTransaction: jest.fn().mockRejectedValue(err),
        endSession: jest.fn(),
        inTransaction: jest.fn().mockReturnValue(false),
      });

      await expect(addStick({ actor, boardId, body: {} })).rejects.toThrow('other error');
    });

    test('handles missing palettePack gracefully', async () => {
      process.env.PALETTE_PACK_ID = 'pack123';
      const actor = { id: 'user123', role: 'user' };
      const boardId = 'board123';
      const body = { stickNumber: 1 };

      Stickerboard.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({ _id: boardId, user: 'user123', stickers: [] })
      });
      Stickerboard.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({}) });
      Stick.create.mockResolvedValue([{ _id: 'stick123', stickNumber: 1 }]);

      StickerPack.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null) // Not found
      });

      await addStick({ actor, boardId, body });

      expect(StickerPack.findById).toHaveBeenCalledWith('pack123');
      delete process.env.PALETTE_PACK_ID;
    });

    test('handles palettePack with no stickers gracefully', async () => {
      process.env.PALETTE_PACK_ID = 'pack123';
      const actor = { id: 'user123', role: 'user' };
      const boardId = 'board123';
      const body = { stickNumber: 1 };

      Stickerboard.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({ _id: boardId, user: 'user123', stickers: [] })
      });
      Stickerboard.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue({}) });
      Stick.create.mockResolvedValue([{ _id: 'stick123', stickNumber: 1 }]);

      StickerPack.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({ _id: 'pack123', stickers: null })
      });

      await addStick({ actor, boardId, body });

      expect(StickerPack.findById).toHaveBeenCalledWith('pack123');
      delete process.env.PALETTE_PACK_ID;
    });
  });

  describe('getStix', () => {
    test('returns stix if boardId is provided', async () => {
      Stick.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(['s1', 's2']) });
      const result = await getStix({ boardId: 'b1' });
      expect(result.stix).toHaveLength(2);
    });

    test('returns null stix if no boardId', async () => {
      const result = await getStix({});
      expect(result.stix).toBeNull();
    });
  });

  describe('getStick', () => {
    test('returns stick with populated board', async () => {
      const mockStick = { _id: 's1' };
      Stick.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockStick)
      });

      const result = await getStick({ stickId: 's1' });
      expect(result.stick).toBe(mockStick);
    });
  });

  describe('updateStick', () => {
    test('updates stick if owner', async () => {
      const mockStick = { user: 'user123' };
      Stick.findById.mockResolvedValue(mockStick);
      Stick.findByIdAndUpdate.mockResolvedValue({ _id: 's1', stickDose: 5 });

      const result = await updateStick({ actor: { id: 'user123' }, stickId: 's1', body: { stickDose: 5 } });
      expect(result.stick.stickDose).toBe(5);
    });

    test('throws 404 if stick missing', async () => {
      Stick.findById.mockResolvedValue(null);
      await expect(updateStick({ actor: {}, stickId: 's1', body: {} })).rejects.toThrow('No stick found');
    });

    test('throws 401 if unauthorized', async () => {
      Stick.findById.mockResolvedValue({ user: 'other' });
      await expect(updateStick({ actor: { id: 'me' }, stickId: 's1', body: {} })).rejects.toThrow('not authorized');
    });
  });

  describe('deleteStick', () => {
    test('deletes stick if owner', async () => {
      const mockStick = {
        user: 'user123',
        deleteOne: jest.fn().mockResolvedValue({})
      };
      Stick.findById.mockResolvedValue(mockStick);

      const result = await deleteStick({ actor: { id: 'user123' }, stickId: 's1' });
      expect(mockStick.deleteOne).toHaveBeenCalled();
      expect(result.deleted).toBe(true);
    });

    test('throws 404 if delete target missing', async () => {
      Stick.findById.mockResolvedValue(null);
      await expect(deleteStick({ actor: {}, stickId: 's1' })).rejects.toThrow('No stick found');
    });

    test('throws 401 if delete unauthorized', async () => {
      Stick.findById.mockResolvedValue({ user: 'other' });
      await expect(deleteStick({ actor: { id: 'me' }, stickId: 's1' })).rejects.toThrow('not authorized');
    });
  });
});
