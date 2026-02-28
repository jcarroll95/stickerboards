// Routes for Stickerboard resources
const express = require('express');

const router = express.Router();

// Include outside resource routers and send them to the right place
const stickRouter = require('./stix');
router.use('/:belongsToBoard/stix', stickRouter)
const commentRouter = require('./comments');
router.use('/:belongsToBoard/comments', commentRouter);
const logRouter = require('./logEntry');
router.use('/:belongsToBoard/logs', logRouter);


const { protect, authorize } = require('../middleware/auth');
const { idempotencyMiddleware } = require('../middleware/idempotency');



// Bring in controller functions
const {
  getStickerboards,
  getStickerboard,
  createStickerboard,
  updateStickerboard,
  deleteStickerboard,
  stickerboardPhotoUpload,
  postThumbnail
} = require('../controllers/stickerboard');

const Stickerboard = require('../models/Stickerboard');
const advancedResults = require('../middleware/advancedResults');

// Map routes to controller actions
router.route('/')
  .get(advancedResults(Stickerboard, 'stix'), getStickerboards)
  .post(protect, createStickerboard);

router.route('/:id')
  .get(getStickerboard)
  .put(protect, idempotencyMiddleware('updateStickerboard'), updateStickerboard)
  .delete(protect, deleteStickerboard);

router.route('/:id/thumbnail')
    .post(protect, postThumbnail);

router.route('/:id/photo')
    .put(protect, authorize('vipuser'), stickerboardPhotoUpload);

module.exports = router;

