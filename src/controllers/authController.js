const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const tokens = require('../services/tokenService');
const audit = require('../services/auditService');

const toPublicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
});

// @desc   Register a new user
// @route  POST /api/auth/signup
// @access Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.validated.body;

  const exists = await User.findOne({ email });
  if (exists) {
    // 409 Conflict is the correct code for a duplicate resource, not 400.
    throw new ApiError(409, 'An account with this email already exists');
  }

  // If two signups race past the check above, the unique index still fires
  // E11000 and errorHandler turns that into the same clean 409.
  const user = await User.create({ name, email, password });
  const pair = await tokens.issuePair(user._id, req);

  audit.record(req, {
    action: 'USER_SIGNUP', entityType: 'User', entityId: String(user._id), actorEmail: email,
  });

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    data: { user: toPublicUser(user), ...pair },
  });
});

// @desc   Authenticate a user and issue an access + refresh token pair
// @route  POST /api/auth/login
// @access Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.validated.body;

  // password has select:false on the schema, so it must be asked for.
  const user = await User.findOne({ email }).select('+password');

  // One identical message for "no such user" and "wrong password" so the
  // endpoint cannot be used to discover which emails are registered.
  if (!user || !(await user.matchPassword(password))) {
    audit.record(req, { action: 'USER_LOGIN_FAILED', outcome: 'failure', actorEmail: email });
    throw new ApiError(401, 'Invalid email or password');
  }

  const pair = await tokens.issuePair(user._id, req);

  audit.record(req, {
    action: 'USER_LOGIN', entityType: 'User', entityId: String(user._id), actorEmail: email,
  });

  res.status(200).json({
    success: true,
    message: 'Logged in successfully',
    data: { user: toPublicUser(user), ...pair },
  });
});

// @desc   Exchange a refresh token for a new pair (with rotation)
// @route  POST /api/auth/refresh
// @access Public (the refresh token itself is the credential)
const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.validated.body;
  const result = await tokens.rotate(refreshToken, req);

  if (result.error === 'REUSE_DETECTED') {
    // A revoked token was replayed. Every session from that login is now dead.
    audit.record(req, {
      action: 'TOKEN_REUSE_DETECTED', outcome: 'failure',
      entityType: 'User', entityId: String(result.userId),
    });
    throw new ApiError(401, 'Refresh token reuse detected. All sessions have been revoked.');
  }

  if (result.error) throw new ApiError(401, 'Invalid or expired refresh token');

  audit.record(req, {
    action: 'TOKEN_REFRESHED', entityType: 'User', entityId: String(result.userId),
  });

  res.status(200).json({
    success: true,
    message: 'Token refreshed',
    data: {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    },
  });
});

// @desc   Revoke a refresh token
// @route  POST /api/auth/logout
// @access Private
const logout = asyncHandler(async (req, res) => {
  const { refreshToken, allDevices } = req.validated.body;

  if (allDevices) await tokens.revokeAllForUser(req.user._id);
  else if (refreshToken) await tokens.revoke(refreshToken);

  audit.record(req, { action: 'USER_LOGOUT', entityType: 'User', entityId: String(req.user._id) });

  res.status(200).json({
    success: true,
    message: allDevices ? 'Logged out of all devices' : 'Logged out',
  });
});

// @desc   Return the currently authenticated user
// @route  GET /api/auth/me
// @access Private
const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: { user: toPublicUser(req.user) } });
});

module.exports = { registerUser, loginUser, refresh, logout, getMe };
