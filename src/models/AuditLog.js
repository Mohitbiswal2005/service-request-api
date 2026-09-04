const mongoose = require('mongoose');

const ACTIONS = [
  'USER_SIGNUP', 'USER_LOGIN', 'USER_LOGIN_FAILED', 'USER_LOGOUT',
  'TOKEN_REFRESHED', 'TOKEN_REUSE_DETECTED',
  'REQUEST_CREATED', 'REQUEST_UPDATED', 'REQUEST_STATUS_CHANGED',
  'REQUEST_DELETED', 'REQUEST_RESTORED',
  'AUTHZ_DENIED',
];

const auditLogSchema = new mongoose.Schema({
  action: { type: String, enum: ACTIONS, required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorEmail: String,

  entityType: { type: String, default: null },
  entityId: { type: String, default: null, index: true },

  // Only the fields that actually changed, never the whole document.
  changes: { type: mongoose.Schema.Types.Mixed, default: null },

  ip: String,
  userAgent: String,
  outcome: { type: String, enum: ['success', 'failure'], default: 'success' },
}, { timestamps: { createdAt: true, updatedAt: false } });

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
module.exports.ACTIONS = ACTIONS;
