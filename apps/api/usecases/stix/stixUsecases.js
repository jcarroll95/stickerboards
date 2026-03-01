// apps/api/usecases/stix/stixUsecases.js

const mongoose = require('mongoose');
const ErrorResponse = require('../../utils/errorResponse');
const MomentumService = require('../../services/momentumService');
const Stick = require('../../models/Stick');
const Stickerboard = require('../../models/Stickerboard');
const StickerPack = require('../../models/StickerPack');

const { buildStickCreateData, buildStickUpdateData } = require('../../domain/stix/stickFields');
const { choosePaletteStickerId, buildPaletteSticker } = require('../../domain/stickerboards/palette');

/**
 * Get stix: either for a specific board (sorted) or handled by advancedResults at controller level.
 * @param {{ boardId?: string }} args
 */
async function getStix({ boardId }) {
  if (boardId) {
    const stix = await Stick.find({ belongsToBoard: boardId }).sort({ stickNumber: 1 });
    return { stix };
  }
  return { stix: null }; // controller will return res.advancedResults
}

/**
 * Get one stick by id.
 * @param {{ stickId: string }} args
 */
async function getStick({ stickId }) {
  const stick = await Stick.findById(stickId).populate({
    path: 'belongsToBoard',
    select: ['name', 'description'],
  });

  if (!stick) throw new ErrorResponse(`No stick found with id ${stickId}`, 404);
  return { stick };
}

/**
 * Add stick use case with optional transaction fallback.
 * Mirrors your current behavior but isolates it from HTTP.
 *
 * @param {{
 *   actor: { id: string, role: string },
 *   boardId: string,
 *   body: any
 * }} args
 */
async function addStick({ actor, boardId, body }) {
  const opId = body?.opId;

  const session = await mongoose.startSession();
  let useTransaction = true;

  try {
    await session.startTransaction();
    await Stickerboard.findOne({ _id: new mongoose.Types.ObjectId() }).session(session);
  } catch (err) {
    const msg = String(err?.message || '');
    if (err?.code === 20 || msg.includes('replica set') || msg.includes('Transaction numbers')) {
      useTransaction = false;
      if (session.inTransaction()) await session.abortTransaction();
    } else {
      session.endSession();
      throw err;
    }
  }

  try {
    const sessionOpt = useTransaction ? { session } : {};

    // 1) Board exists + ownership/admin
    const stickerboard = await Stickerboard.findById(boardId).session(useTransaction ? session : null);
    if (!stickerboard) {
      if (useTransaction) await session.abortTransaction();
      session.endSession();
      throw new ErrorResponse(`No stickerboard found with id ${boardId}`, 404);
    }

    const isOwner = stickerboard.user.toString() === actor.id;
    const isAdmin = actor.role === 'admin';
    if (!isOwner && !isAdmin) {
      if (useTransaction) await session.abortTransaction();
      session.endSession();
      throw new ErrorResponse(
        `User ${actor.id} is not authorized to add stix to board ${stickerboard.id}`,
        401
      );
    }

    // 2) Create stick
    const stickData = buildStickCreateData({ body, boardId, userId: actor.id });
    const created = await Stick.create([stickData], sessionOpt);
    const newStick = created[0];

    // 3) Push palette sticker onto board
    if (!Array.isArray(stickerboard.stickers)) stickerboard.stickers = [];

    // Prefer modern palette from a dedicated StickerPack if configured
    let paletteStickerIds = [];
    const palettePackId = process.env.PALETTE_PACK_ID;

    if (palettePackId) {
      const palettePack = await StickerPack.findById(palettePackId).session(sessionOpt.session || null);
      if (palettePack && Array.isArray(palettePack.stickers)) {
        // pack.stickers are StickerDefinition ObjectIds
        paletteStickerIds = palettePack.stickers.map(String);
      }
    }

    const stickerId = choosePaletteStickerId({
      stickNumber: newStick.stickNumber,
      existingStickers: stickerboard.stickers,
      paletteStickerIds,
    });

    const paletteSticker = buildPaletteSticker({ stickerId });

    await Stickerboard.findByIdAndUpdate(
      boardId,
      { $push: { stickers: paletteSticker } },
      { ...sessionOpt, new: true, runValidators: true }
    );

    // let's throw to momentum for user awards
    await MomentumService.logAction(actor.id, 'stickMe', { boardId });

    if (useTransaction) await session.commitTransaction();
    session.endSession();

    return { stick: newStick, opId };
  } catch (err) {
    if (useTransaction) await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

/**
 * Update stick use case.
 * @param {{ actor: { id: string, role: string }, stickId: string, body: any }} args
 */
async function updateStick({ actor, stickId, body }) {
  let stick = await Stick.findById(stickId);
  if (!stick) throw new ErrorResponse(`No stick found with id ${stickId}`, 404);

  const isOwner = stick.user.toString() === actor.id;
  const isAdmin = actor.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw new ErrorResponse(`User ${actor.id} is not authorized to update this stick`, 401);
  }

  const updateData = buildStickUpdateData({ body });

  stick = await Stick.findByIdAndUpdate(stickId, updateData, {
    new: true,
    runValidators: true,
  });

  return { stick };
}

/**
 * Delete stick use case.
 * @param {{ actor: { id: string, role: string }, stickId: string }} args
 */
async function deleteStick({ actor, stickId }) {
  const stick = await Stick.findById(stickId);
  if (!stick) throw new ErrorResponse(`No stick found with id ${stickId}`, 404);

  const isOwner = stick.user.toString() === actor.id;
  const isAdmin = actor.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw new ErrorResponse(`User ${actor.id} is not authorized to delete this stick`, 401);
  }

  await stick.deleteOne();
  return { deleted: true };
}

module.exports = { getStix, getStick, addStick, updateStick, deleteStick };
