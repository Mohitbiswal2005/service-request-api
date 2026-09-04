// User input goes straight into $regex. Without escaping, a search for
// "c++" throws, and "(a+)+$" is a ReDoS that can hang the event loop.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = escapeRegex;
