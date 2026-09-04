const express = require('express');
const router = express.Router();

const Request = require('../models/Request');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../validators/validate');
const { auditQuerySchema } = require('../validators/requestValidators');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect, restrictTo('admin'));   // 401 if no token, 403 if not an admin

// @desc  Every request in the system, including soft-deleted ones
// @route GET /api/admin/requests
router.get('/requests', asyncHandler(async (req, res) => {
  const requests = await Request.find()
    .setOptions({ withDeleted: true })       // admins see deleted records too
    .populate('createdBy', 'name email')     // demonstrates the ref relationship
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  res.json({ success: true, count: requests.length, data: requests });
}));

// @desc  Platform-wide statistics
// @route GET /api/admin/stats
router.get('/stats', asyncHandler(async (req, res) => {
  const [byStatus, byCategory, topUsers, totals] = await Promise.all([
    Request.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }]),
    Request.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }]),
    Request.aggregate([
      { $group: { _id: '$createdBy', requests: { $sum: 1 } } },
      { $sort: { requests: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { _id: 0, name: '$user.name', email: '$user.email', requests: 1 } },
    ]),
    Promise.all([
      User.countDocuments(),
      Request.countDocuments().setOptions({ withDeleted: true }),
      Request.countDocuments({ isDeleted: true }).setOptions({ withDeleted: true }),
    ]),
  ]);

  res.json({
    success: true,
    data: {
      totalUsers: totals[0],
      totalRequests: totals[1],
      deletedRequests: totals[2],
      byStatus,
      byCategory,
      topUsers,
    },
  });
}));

// @desc  The audit trail
// @route GET /api/admin/audit-logs
router.get('/audit-logs', validate({ query: auditQuerySchema }), asyncHandler(async (req, res) => {
  const { action, entityId, page, limit } = req.validated.query;

  const filter = {};
  if (action) filter.action = action;
  if (entityId) filter.entityId = entityId;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('actor', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: {
      currentPage: page, pageSize: limit, totalRecords: total,
      totalPages: Math.ceil(total / limit) || 0,
    },
  });
}));

module.exports = router;
