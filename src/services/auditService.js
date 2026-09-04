const AuditLog = require('../models/AuditLog');

// Audit writes must never break the request that triggered them.
// Fire and forget, swallow failures, report them to stderr only.
const record = (req, { action, entityType, entityId, changes, outcome = 'success', actorEmail }) => {
  AuditLog.create({
    action,
    actor: req.user?._id || null,
    actorEmail: actorEmail || req.user?.email || null,
    entityType: entityType || null,
    entityId: entityId || null,
    changes: changes || null,
    outcome,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  }).catch((err) => console.error('[audit] failed to write log:', err.message));
};

// Returns only the fields that actually changed, with before and after values.
const diff = (before, after) => {
  const out = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      out[key] = { from: before[key], to: after[key] };
    }
  }
  return Object.keys(out).length ? out : null;
};

module.exports = { record, diff };
