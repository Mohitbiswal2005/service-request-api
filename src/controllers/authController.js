const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @route POST /api/auth/signup
const registerUser = async (req, res, next) => {
    try {
        const { name, email, password } = req.body;
        const userExists = await User.findOne({ email });
        if (userExists) {
            res.status(400);
            throw new Error('User already exists');
        }
        const user = await User.create({ name, email, password });
        if (user) {
            res.status(201).json({ _id: user._id, name: user.name, email: user.email, token: generateToken(user._id) });
        }
    } catch (error) { next(error); }
};

// @route POST /api/auth/login
const loginUser = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (user && (await user.matchPassword(password))) {
            res.status(200).json({ _id: user._id, name: user.name, email: user.email, token: generateToken(user._id) });
        } else {
            res.status(401);
            throw new Error('Invalid email or password');
        }
    } catch (error) { next(error); }
};

module.exports = { registerUser, loginUser };