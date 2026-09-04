const Request = require('../models/Request');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const escapeRegex = require('../utils/escapeRegex');
const generateRequestId = require('../utils/generateRequestId');
const audit = require('../services/auditService');

// Fetch by business key, then decide 404 vs 403 separately.
// 404 = it does not exist. 403 = it exists but it is not yours.
const findOwnedRequest = async (requestId, user, opts = {}) => {
  const query = Request.findOne({ requestId });
  if (opts.withDeleted) query.setOptions({ withDeleted: true });

  const request = await query;
  if (!request) throw new ApiError(404, 'Request not found');

  if (request.createdBy.toString() !== user._id.toString() && user.role !== 'admin') {
    throw new ApiError(403, 'You do not have permission to access this request');
  }
  return request;
};

// @desc   Create a service request
// @route  POST /api/requests
// @access Private
const createRequest = asyncHandler(async (req, res) => {
  const request = new Request({
    ...req.validated.body,
    requestId: generateRequestId(),
    createdBy: req.user._id,          // always the token owner, never the body
  });
  request.$locals.changedBy = req.user._id;   // read by the statusHistory hook
  await request.save();

  audit.record(req, {
    action: 'REQUEST_CREATED', entityType: 'Request', entityId: request.requestId,
  });

  res.status(201).json({
    success: true,
    message: 'Request created successfully',
    data: request,
  });
});

// @desc   List the authenticated user's requests
// @route  GET /api/requests
// @access Private
const getRequests = asyncHandler(async (req, res) => {
  const {
    status, priority, category, search, searchMode,
    sort, order, page, limit, createdAfter, createdBefore,
  } = req.validated.query;

  const filter = { createdBy: req.user._id };   // ownership is in the query itself
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;

  if (createdAfter || createdBefore) {
    filter.createdAt = {};
    if (createdAfter) filter.createdAt.$gte = createdAfter;
    if (createdBefore) filter.createdAt.$lte = createdBefore;
  }

  // Two search strategies, because they are good at different things.
  //   regex (default) - substring matching, so "serv" finds "server"
  //   text            - the weighted index, whole words only, ranked by relevance
  let projection;
  let sortOption = { [sort]: order === 'asc' ? 1 : -1 };

  if (search) {
    if (searchMode === 'text') {
      filter.$text = { $search: search };
      projection = { score: { $meta: 'textScore' } };
      sortOption = { score: { $meta: 'textScore' }, ...sortOption };
    } else {
      const safe = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ title: safe }, { description: safe }];
    }
  }

  const skip = (page - 1) * limit;

  // Run both queries in parallel instead of one after the other.
  const [requests, totalRecords] = await Promise.all([
    Request.find(filter, projection).sort(sortOption).skip(skip).limit(limit).lean(),
    Request.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalRecords / limit) || 0;

  res.status(200).json({
    success: true,
    data: requests,
    pagination: {
      currentPage: page,
      pageSize: limit,
      recordsOnPage: requests.length,
      totalRecords,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    appliedFilters: {
      status, priority, category, search, searchMode, sort, order,
      createdAfter, createdBefore,
    },
  });
});

// @desc   Aggregated counts for the authenticated user
// @route  GET /api/requests/stats
// @access Private
const getStats = asyncHandler(async (req, res) => {
  const match = { createdBy: req.user._id, isDeleted: { $ne: true } };

  const [byStatus, byPriority, byCategory, total] = await Promise.all([
    Request.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Request.aggregate([{ $match: match }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
    Request.aggregate([{ $match: match }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
    Request.countDocuments({ createdBy: req.user._id }),
  ]);

  const shape = (rows) => rows.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});

  res.status(200).json({
    success: true,
    data: {
      total,
      byStatus: shape(byStatus),
      byPriority: shape(byPriority),
      byCategory: shape(byCategory),
    },
  });
});

// @desc   Get one request
// @route  GET /api/requests/:requestId
// @access Private
const getRequestById = asyncHandler(async (req, res) => {
  const request = await findOwnedRequest(req.validated.params.requestId, req.user);
  res.status(200).json({ success: true, data: request });
});

// @desc   Get the status history of one request
// @route  GET /api/requests/:requestId/history
// @access Private
const getRequestHistory = asyncHandler(async (req, res) => {
  const request = await findOwnedRequest(req.validated.params.requestId, req.user);
  await request.populate('statusHistory.changedBy', 'name email');

  res.status(200).json({
    success: true,
    data: { requestId: request.requestId, history: request.statusHistory },
  });
});

// @desc   Update a request
// @route  PUT /api/requests/:requestId
// @access Private
const updateRequest = asyncHandler(async (req, res) => {
  const request = await findOwnedRequest(req.validated.params.requestId, req.user);

  const before = request.toObject();
  const previousStatus = request.status;

  // Only assign fields the schema allowed through. req.body is never spread
  // directly, so createdBy / requestId can never be overwritten.
  const { statusNote, ...fields } = req.validated.body;
  Object.assign(request, fields);

  request.$locals.changedBy = req.user._id;
  request.$locals.statusNote = statusNote;
  await request.save();            // runs full schema validation + history hook

  audit.record(req, {
    action: previousStatus !== request.status ? 'REQUEST_STATUS_CHANGED' : 'REQUEST_UPDATED',
    entityType: 'Request',
    entityId: request.requestId,
    changes: audit.diff(before, request.toObject()),
  });

  res.status(200).json({
    success: true,
    message: 'Request updated successfully',
    data: request,
  });
});

// @desc   Soft delete a request
// @route  DELETE /api/requests/:requestId
// @access Private
const deleteRequest = asyncHandler(async (req, res) => {
  const request = await findOwnedRequest(req.validated.params.requestId, req.user);

  // Soft delete: the row stays, the query hooks hide it. Nothing is lost,
  // and an accidental delete is a one-call recovery.
  request.isDeleted = true;
  request.deletedAt = new Date();
  request.deletedBy = req.user._id;
  await request.save();

  audit.record(req, {
    action: 'REQUEST_DELETED', entityType: 'Request', entityId: request.requestId,
  });

  res.status(200).json({
    success: true,
    message: 'Request deleted successfully',
    data: { requestId: request.requestId, deletedAt: request.deletedAt },
  });
});

// @desc   Restore a soft-deleted request
// @route  POST /api/requests/:requestId/restore
// @access Private
const restoreRequest = asyncHandler(async (req, res) => {
  const request = await findOwnedRequest(
    req.validated.params.requestId, req.user, { withDeleted: true },
  );

  if (!request.isDeleted) throw new ApiError(409, 'This request is not deleted');

  request.isDeleted = false;
  request.deletedAt = null;
  request.deletedBy = null;
  await request.save();

  audit.record(req, {
    action: 'REQUEST_RESTORED', entityType: 'Request', entityId: request.requestId,
  });

  res.status(200).json({
    success: true,
    message: 'Request restored successfully',
    data: request,
  });
});

module.exports = {
  createRequest, getRequests, getStats, getRequestById, getRequestHistory,
  updateRequest, deleteRequest, restoreRequest,
};
