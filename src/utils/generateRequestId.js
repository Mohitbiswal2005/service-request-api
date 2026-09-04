const crypto = require('crypto');

// Date.now() alone collides if two requests land in the same millisecond,
// and it is trivially guessable. Random entropy fixes both problems.
const generateRequestId = () =>
  `REQ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

module.exports = generateRequestId;
