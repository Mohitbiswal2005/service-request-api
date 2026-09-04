const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../models/RefreshToken');

const ACCESS_TTL = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 7);

const signAccessToken = (userId) =>
  jwt.sign({ id: userId, type: 'access' }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });

// The raw token is random bytes, not a JWT. It carries no claims, so it is
// useless on its own -- it is only a lookup key into the RefreshToken collection.
const hash = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const issueRefreshToken = async (userId, req, family = crypto.randomUUID()) => {
  const raw = crypto.randomBytes(48).toString('base64url');
  await RefreshToken.create({
    user: userId,
    tokenHash: hash(raw),
    family,
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400000),
    userAgent: req?.get?.('user-agent'),
    ip: req?.ip,
  });
  return { raw, family };
};

const issuePair = async (userId, req) => {
  const { raw } = await issueRefreshToken(userId, req);
  return {
    accessToken: signAccessToken(userId),
    refreshToken: raw,
    expiresIn: ACCESS_TTL,
  };
};

// Rotation: the presented token is revoked and a new one issued in the same family.
// Presenting an already-revoked token means it was stolen and replayed, so the
// entire family is killed and every session from that login is logged out.
const rotate = async (rawToken, req) => {
  const stored = await RefreshToken.findOne({ tokenHash: hash(rawToken) });

  if (!stored) return { error: 'INVALID' };

  if (stored.revokedAt) {
    await RefreshToken.updateMany(
      { family: stored.family, revokedAt: null },
      { revokedAt: new Date() },
    );
    return { error: 'REUSE_DETECTED', userId: stored.user };
  }

  if (stored.expiresAt <= new Date()) return { error: 'EXPIRED' };

  const { raw } = await issueRefreshToken(stored.user, req, stored.family);
  stored.revokedAt = new Date();
  stored.replacedByHash = hash(raw);
  await stored.save();

  return {
    userId: stored.user,
    accessToken: signAccessToken(stored.user),
    refreshToken: raw,
    expiresIn: ACCESS_TTL,
  };
};

const revoke = async (rawToken) => {
  const stored = await RefreshToken.findOne({ tokenHash: hash(rawToken), revokedAt: null });
  if (!stored) return false;
  stored.revokedAt = new Date();
  await stored.save();
  return true;
};

const revokeAllForUser = (userId) =>
  RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });

module.exports = { signAccessToken, issuePair, rotate, revoke, revokeAllForUser, hash };
