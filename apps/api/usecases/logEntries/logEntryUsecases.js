const LogEntry = require('../../models/LogEntry');
const ErrorResponse = require('../../utils/errorResponse');
const MomentumService = require('../../services/momentumService');
async function addEntry({ actor, boardId, body }) {

  const entryData = {
    user: actor.id,
    belongsToBoard: boardId,
    type: body.type, // 'weight', 'nsv', 'note'
    userDate: body.userDate || new Date()
  };

  if (entryData.type === 'weight') {
    entryData.weight = Number(body.weight);
  } else {
    entryData.content = String(body.content);
  }

  const entry = await LogEntry.create(entryData);

  // adding a basic momentum service trigger for making log entries
  const triggerMap = { weight: 'weightLog', note: 'doseLog', nsv: 'nsvLog' };
  await MomentumService.logAction(entryData.user, triggerMap[entryData.type] || 'doseLog', {
    weight: entry.weight,
    entryId: entry._id
  });

  return entry;
}

async function getEntries({ boardId, type }) {
  const query = { belongsToBoard: boardId };
  if (type) query.type = type; // Filter by weight only, or NSV only

  return await LogEntry.find(query).sort({ userDate: -1 });
}


/**
 * Update a logEntry.
 * @param {{ logEntry id: string, actor: { id: string, role: string }, body: any }} args
 */
async function updateEntry({ logEntryId, actor, body }) {
  let thisEntry = await LogEntry.findById(logEntryId);
  if (!thisEntry) {
    throw new ErrorResponse(`No entry with id ${logEntryId}`, 404);
  }

  const isOwner = thisEntry.user.toString() === actor.id;
  const isAdmin = actor.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw new ErrorResponse(`Not authorized to update log entry ${logEntryId}`, 401);
  }

  // Field allowlist
  const updateData = {};
  if (body.weight !== undefined) updateData.weight = body.weight;
  if (body.content !== undefined) updateData.content = body.content;
  if (body.userDate !== undefined) updateData.userDate = body.userDate;

  const updateThisEntry = await LogEntry.findByIdAndUpdate(logEntryId, updateData, {
    new: true,
    runValidators: true,
  });

  return { updateThisEntry };
}

/**
 * Get one specific logEntry by id.
 * @param {{ logEntryId: string }} args
 */
async function getEntry({ logEntryId }) {
  const entry = await LogEntry.findById(logEntryId).populate({
    path: 'belongsToBoard',
    select: ['name']
  });

  if (!entry) {
    throw new ErrorResponse(`No entry found with id ${logEntryId}`, 404);
  }

  return { entry };
}

/**
 * Delete a logEntry.
 * @param {{ logEntryId: string, actor: { id: string, role: string } }} args
 */
async function deleteEntry({ logEntryId, actor }) {
  // 1. Find the document
  const thisEntry = await LogEntry.findById(logEntryId);
  if (!thisEntry) {
    throw new ErrorResponse(`No entry found with id ${logEntryId}`, 404);
  }

  // 2. Check Permissions (User must own the entry or be an admin)
  const isOwner = thisEntry.user.toString() === actor.id;
  const isAdmin = actor.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw new ErrorResponse(`Not authorized to delete this log entry`, 401);
  }

  // 3. Remove from database
  await thisEntry.deleteOne();

  return { success: true, deletedId: logEntryId };
}

module.exports = {
  addEntry,
  getEntries,
  getEntry,
  updateEntry,
  deleteEntry
};
