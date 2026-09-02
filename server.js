require('dotenv').config();
const express = require('express');
const connectDB = require('./src/config/db');
const authRoutes = require('./src/routes/authRoutes');
const requestRoutes = require('./src/routes/requestRoutes');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();
connectDB();

app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);

// Error Handling Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));