const express = require('express');
const router = express.Router();

const {
  createRequest, getRequests, getStats, getRequestById, getRequestHistory,
  updateRequest, deleteRequest, restoreRequest,
} = require('../controllers/requestController');
const { protect } = require('../middleware/auth');
const validate = require('../validators/validate');
const {
  createRequestSchema, updateRequestSchema, listRequestsSchema, requestIdParamSchema,
} = require('../validators/requestValidators');

router.use(protect);   // every route below requires a valid access token

// Must be declared before '/:requestId', or Express matches "stats" as an id.
router.get('/stats', getStats);

router.route('/')
  .post(validate({ body: createRequestSchema }), createRequest)
  .get(validate({ query: listRequestsSchema }), getRequests);

router.route('/:requestId')
  .get(validate({ params: requestIdParamSchema }), getRequestById)
  .put(validate({ params: requestIdParamSchema, body: updateRequestSchema }), updateRequest)
  .delete(validate({ params: requestIdParamSchema }), deleteRequest);

router.get('/:requestId/history', validate({ params: requestIdParamSchema }), getRequestHistory);
router.post('/:requestId/restore', validate({ params: requestIdParamSchema }), restoreRequest);

module.exports = router;
