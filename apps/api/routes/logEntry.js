const express = require('express');
const {
  addLogEntry,
  getLogEntries,
  getLogEntry,
  updateLogEntry,
  deleteLogEntry
} = require('../controllers/logEntries');
const router = express.Router({ mergeParams: true });
const { protect } = require('../middleware/auth');

router.use(protect); // All log entry routes require login

router.route('/')
  .get(getLogEntries);
router.route('/')
  .post(addLogEntry);
router.route('/:id')
  .get(getLogEntry)
  .put(updateLogEntry)
  .delete(deleteLogEntry);

module.exports = router;
