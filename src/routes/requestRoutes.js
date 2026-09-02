const express = require('express');
const router = express.Router();
const { createRequest, getRequests, getRequestById, updateRequest, deleteRequest } = require('../controllers/requestController');
const { protect } = require('../middleware/auth');

router.use(protect); // Protect all request routes

router.route('/').post(createRequest).get(getRequests);
router.route('/:requestId').get(getRequestById).put(updateRequest).delete(deleteRequest);

module.exports = router;