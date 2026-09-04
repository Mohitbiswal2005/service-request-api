const mongoose = require('mongoose');

// Refresh tokens are stored HASHED, exactly like passwords. A leaked database
// dump therefore does not hand an attacker a set of usable sessions.
const refreshTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  tokenHash: { type: String, required: true, unique: true },

  // Every token issued from the same original login shares a family id.
  // If a already-used token is presented again, the whole family is revoked.
  family: { type: String, required: true, index: true },

  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  replacedByHash: { type: String, default: null },

  userAgent: String,
  ip: String,
}, { timestamps: true });

// TTL index: Mongo deletes expired documents on its own, so the collection
// does not grow without bound and no cleanup job is needed.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

refreshTokenSchema.methods.isActive = function () {
  return !this.revokedAt && this.expiresAt > new Date();
};

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
