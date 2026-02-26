// usecases/stickerboards/updateStickerboard.js

const mongoose = require('mongoose');
const ErrorResponse = require('../../utils/errorResponse');
const Stickerboard = require('../../models/Stickerboard');


const { DomainError } = require('../../domain/errors/domainError');
const {
  assertNonOwnerOnlyAppendingSticker,
  extractCandidateSticker,
} = require('../../domain/stickerboards/nonOwnerAppendPolicy');
const { pickAllowedBoardFields } = require('../../domain/stickerboards/pickAllowedBoardFields');
const { buildCheersSticker } = require('../../domain/stickers/buildCheersSticker');

const {
  consumeCheersStickerForNonOwner,
  consumeInventoryStickerIfAppending,
} = require('../stickers/consumeStickerForPlacement');

/**
 * UpdateStickerboard use case.
 * Express-free. Throws ErrorResponse.
 *
 * @param {{
 *   actor: { id: string, role: string },
 *   boardId: string,
 *   body: any
 * }} args
 *
 * @returns {Promise<any>} updated Stickerboard document
 */
async function updateStickerboardUseCase({ actor, boardId, body }) {
  const userId = actor?.id;
  const role = actor?.role;
  const isAdmin = role === 'admin';

  if (!boardId) throw new ErrorResponse('Stickerboard id is required', 400);
  if (!userId) throw new ErrorResponse('User context is required', 401);

  // Helper: translate domain errors into ErrorResponse so the existing middleware behaves.
  const translateDomainError = (err) => {
    if (err && err.name === 'DomainError') {
      throw new ErrorResponse(err.message, err.statusCode || 400);
    }
    throw err;
  };

  // Transaction wrapper with replica-set fallback
  const runWithOptionalTransaction = async (work) => {
    const session = await mongoose.startSession();
    try {
      // Try transaction
      await session.startTransaction();
      // Dummy op to verify support
      await Stickerboard.findOne({ _id: new mongoose.Types.ObjectId() }).session(session);

      const result = await work({ sessionOpt: { session }, session });
      await session.commitTransaction();
      return result;
    } catch (err) {
      // Fallback if transactions unsupported (local dev without replica set)
      const msg = String(err?.message || '');
      if (err?.code === 20 || msg.includes('replica set') || msg.includes('Transaction numbers')) {
        try {
          if (session.inTransaction()) await session.abortTransaction();
        } catch (_) {
          // ignore abort errors in fallback mode
        } finally {
          session.endSession();
        }
        // Rerun without session
        return work({ sessionOpt: {}, session: null });
      }

      // Real error: abort if needed and rethrow
      try {
        if (session.inTransaction()) await session.abortTransaction();
      } finally {
        session.endSession();
      }
      throw err;
    } finally {
      // Ensure endSession if we didn't already end it in fallback
      if (session && !session.hasEnded) {
        try {
          session.endSession();
        } catch (_) {
          // ignore
        }
      }
    }
  };

  return runWithOptionalTransaction(async ({ sessionOpt, session }) => {
    // 1) Load board
    const stickerboard = await Stickerboard.findById(boardId).session(session || null);

    if (!stickerboard) {
      throw new ErrorResponse(`Stickerboard not found with id of ${boardId}`, 404);
    }

    // 2) Actor classification
    const isOwner = String(stickerboard.user) === String(userId);

    // 3) Non-owner path: ONLY append Cheers sticker and must consume one
    if (!isOwner && !isAdmin) {
      try {
        assertNonOwnerOnlyAppendingSticker(body);
        const candidateSticker = extractCandidateSticker({
          body,
          existingStickerCount: stickerboard.stickers?.length || 0,
        });

        const stickerToInsert = buildCheersSticker(candidateSticker);
        if (!stickerToInsert) {
          throw new ErrorResponse('Invalid sticker data provided', 400);
        }

        await consumeCheersStickerForNonOwner({
          userId,
          stickerId: stickerToInsert.stickerId,
          sessionOpt,
        });

        const updated = await Stickerboard.findOneAndUpdate(
          { _id: boardId },
          { $push: { stickers: stickerToInsert } },
          { new: true, runValidators: true, ...sessionOpt }
        );

        return updated;
      } catch (err) {
        if (err instanceof DomainError || err?.name === 'DomainError') translateDomainError(err);
        throw err;
      }
    }

    // 4) Owner/admin path: allowlisted field updates; optionally consume inventory if appending
    const updateData = pickAllowedBoardFields(body);

    // If owner is appending an inventory sticker, consume it (admins can bypass)
    await consumeInventoryStickerIfAppending({
      userId,
      isAdmin,
      existingStickersLength: stickerboard.stickers?.length || 0,
      updatedStickers: updateData.stickers,
      sessionOpt,
    });

    const updated = await Stickerboard.findOneAndUpdate(
      { _id: boardId },
      updateData,
      { new: true, runValidators: true, ...sessionOpt }
    );

    return updated;
  });
}

module.exports = { updateStickerboardUseCase };
