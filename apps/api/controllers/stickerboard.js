// controllers/stickerboard.js

const path = require('path');
const ErrorResponse = require('../utils/errorResponse');
const Stickerboard = require('../models/Stickerboard');
const asyncHandler = require('../middleware/async');
const { updateStickerboardUseCase } = require('../usecases/stickerboards/updateStickerboard');

/**
 * @desc Get all stickerboards
 * @route GET /api/v1/stickerboards
 * @access Public
 */
exports.getStickerboards = asyncHandler(async (req, res) => {
  res.status(200).json(res.advancedResults);
});

/**
 * @desc Get single stickerboard
 * @route GET /api/v1/stickerboards/:id
 * @access Public
 */
exports.getStickerboard = asyncHandler(async (req, res, next) => {
  const idOrSlug = req.params.id;

  const stickerboard = await Stickerboard.findByIdOrSlug(idOrSlug)
    .populate({ path: 'stix', options: { sort: { stickNumber: 1 } } })
    .populate('comments');

  if (!stickerboard) {
    return next(new ErrorResponse(`Stickerboard not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({ success: true, data: stickerboard });
});

/**
 * @desc Create new stickerboard
 * @route POST /api/v1/stickerboards
 * @access Private
 */
exports.createStickerboard = asyncHandler(async (req, res, next) => {
  req.body.user = req.user.id;

  const publishedStickerboard = await Stickerboard.findOne({ user: req.user.id });

  if (publishedStickerboard && req.user.role !== 'vipuser') {
    return next(
      new ErrorResponse(`The user with ID ${req.user.id} has already published a Stickerboard`, 400)
    );
  }

  const stickerboard = await Stickerboard.create(req.body);
  res.status(201).json({ success: true, data: stickerboard });
});

/**
 * @desc Update stickerboard
 * @route PUT /api/v1/stickerboards/:id
 * @access Private
 */
exports.updateStickerboard = asyncHandler(async (req, res, next) => {
  try {
    const boardId = req.params.id;
    const actor = { id: req.user.id, role: req.user.role };
    const body = req.body;
    const opId = body?.opId;

    // Delegate to application/use-case layer (no req/res/next inside)
    const stickerboard = await updateStickerboardUseCase({
      actor,
      boardId,
      body,
    });

    const response = { success: true, data: stickerboard };
    if (opId) response.opId = opId;

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * @desc Delete stickerboard
 * @route DELETE /api/v1/stickerboards/:id
 * @access Private
 */
exports.deleteStickerboard = asyncHandler(async (req, res, next) => {
  const stickerboard = await Stickerboard.findById(req.params.id);

  if (!stickerboard) {
    return next(new ErrorResponse(`Stickerboard not found with id of ${req.params.id}`, 404));
  }

  if (stickerboard.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to delete this board`, 401));
  }

  await stickerboard.deleteOne();
  res.status(200).json({ success: true, data: {} });
});

/**
 * @desc Upload photo for stickerboard
 * @route PUT /api/v1/stickerboards/:id/photo
 * @access Private
 */
exports.stickerboardPhotoUpload = asyncHandler(async (req, res, next) => {
  const stickerboard = await Stickerboard.findById(req.params.id);

  if (!stickerboard) {
    return next(new ErrorResponse(`Stickerboard not found with id of ${req.params.id}`, 404));
  }

  if (stickerboard.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to delete this board`, 401));
  }

  if (!req.files) {
    return next(new ErrorResponse(`Please upload a file`, 400));
  }

  const file = req.files.file;

  if (!file.mimetype.startsWith('image')) {
    return next(new ErrorResponse(`Please upload an image`, 400));
  }

  if (file.size > process.env.MAX_FILE_UPLOAD) {
    return next(
      new ErrorResponse(`Please upload an image smaller than ${process.env.MAX_FILE_UPLOAD} bytes`, 400)
    );
  }

  file.name = `photo_${stickerboard._id}${path.parse(file.name).ext}`;

  file.mv(`${process.env.FILE_UPLOAD_PATH}/${file.name}`, async (err) => {
    if (err) {
      console.error(err);
      return next(new ErrorResponse(`Problem with file upload`, 500));
    }

    await Stickerboard.findByIdAndUpdate(req.params.id, { photo: file.name });

    res.status(200).json({
      success: true,
      data: file.name,
    });
  });
});

/**
 * @desc System-generated thumbnail update for stickerboard
 * @route POST /api/v1/stickerboards/:id/thumbnail
 * @access Private
 */
exports.postThumbnail = asyncHandler(async (req, res, next) => {
  const { isRateLimited, updateRateLimit, getTimeRemaining } = require('../utils/rateLimiter');

  const stickerboard = await Stickerboard.findById(req.params.id);

  if (!stickerboard) {
    return next(new ErrorResponse(`Stickerboard not found with id of ${req.params.id}`, 404));
  }

  const isAdmin = req.user.role === 'admin';
  const isManual = req.body.isManual === true;

  if (!isAdmin && !isManual && isRateLimited(req.user.id, req.params.id)) {
    const remaining = Math.ceil(getTimeRemaining(req.user.id, req.params.id) / 1000);
    return next(
      new ErrorResponse(
        `Rate limit exceeded. Please wait ${remaining} seconds before uploading another thumbnail for this board.`,
        429
      )
    );
  }

  if (!req.body.imageData) {
    return next(new ErrorResponse('Image seed-data is required', 400));
  }

  try {
    const base64Data = req.body.imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const { uploadThumbnailToS3, cleanupOldThumbnails } = await import('../utils/s3Helper.js');

    const result = await uploadThumbnailToS3(stickerboard.id, buffer);

    const { publicUrl, version, contentType, bytes } = result;
    const width = req.body.width || 0;
    const height = req.body.height || 0;

    await Stickerboard.findByIdAndUpdate(req.params.id, {
      thumbnail: {
        version,
        width,
        height,
        contentType,
        bytes,
        url: publicUrl,
        createdAt: new Date(version),
      },
    });

    updateRateLimit(req.user.id, req.params.id);

    cleanupOldThumbnails(stickerboard.id, 3).catch((err) => {
      console.error('Failed to cleanup old thumbnails:', err);
    });

    res.status(200).json({
      success: true,
      data: { publicUrl, version, width, height },
    });
  } catch (err) {
    console.error('Error in postThumbnail:', err);
    return next(new ErrorResponse(`Failed to upload thumbnail: ${err.name} - ${err.message}`, 500));
  }
});
