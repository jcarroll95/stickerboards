const asyncHandler = require('../middleware/async');
const { addEntry, getEntries, getEntry, updateEntry, deleteEntry } = require('../usecases/logEntries/logEntryUsecases');

// @desc    Create a log entry
// @route   POST /api/v1/:belongsToBoard/logs
exports.addLogEntry = asyncHandler(async (req, res) => {
  const result = await addEntry({
    actor: req.user,
    boardId: req.params.belongsToBoard,
    body: req.body
  });
  res.status(201).json({ success: true, data: result });
});

// @desc    Get all log entries for a user (optionally by type)
// @route   GET /api/v1/logs
exports.getLogEntries = asyncHandler(async (req, res) => {
  const result = await getEntries({
    userId: req.user.id,
    type: req.query.type // Allows ?type=weight or ?type=nsv
  });
  res.status(200).json({ success: true, ...result });
});

// @desc    Get a single log entry
// @route   GET /api/v1/logs/:id
exports.getLogEntry = asyncHandler(async (req, res) => {
  const result = await getEntry({
    logEntryId: req.params.id
  });
  res.status(200).json({ success: true, ...result });
});

// @desc    Update a log entry
// @route   PUT /api/v1/logs/:id
exports.updateLogEntry = asyncHandler(async (req, res) => {
  const result = await updateEntry({
    logEntryId: req.params.id,
    actor: req.user,
    body: req.body
  });

  res.status(200).json({ success: true, ...result });

});

// @desc    Delete a log entry
// @route   DELETE /api/v1/logs/:id
exports.deleteLogEntry = asyncHandler(async (req, res) => {
  const result = await deleteEntry({
    logEntryId: req.params.id,
    actor: req.user
  });
  res.status(200).json({ success: true, ...result });
});
