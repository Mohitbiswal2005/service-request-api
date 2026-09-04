const express = require('express');
const router = express.Router();

const {
  registerUser, loginUser, refresh, logout, getMe,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validate = require('../validators/validate');
const {
  signupSchema, loginSchema, refreshSchema, logoutSchema,
} = require('../validators/authValidators');

router.post('/signup', validate({ body: signupSchema }), registerUser);
router.post('/login', validate({ body: loginSchema }), loginUser);
router.post('/refresh', validate({ body: refreshSchema }), refresh);
router.post('/logout', protect, validate({ body: logoutSchema }), logout);
router.get('/me', protect, getMe);

module.exports = router;
