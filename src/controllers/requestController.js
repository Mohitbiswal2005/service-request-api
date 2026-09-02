const Request = require('../models/Request');

const createRequest = async (req, res, next) => {
    try {
        const { title, description, category, priority } = req.body;
        const requestId = 'REQ-' + Date.now(); // Simple unique ID generator
        const request = await Request.create({
            requestId, title, description, category, priority, createdBy: req.user._id
        });
        res.status(201).json(request);
    } catch (error) { next(error); }
};

const getRequests = async (req, res, next) => {
    try {
        const { status, priority, category, search, sort, page = 1, limit = 10 } = req.query;
        let query = { createdBy: req.user._id }; // Enforce ownership

        // Filtering
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (category) query.category = category;

        // Searching
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Pagination & Sorting
        const skip = (Number(page) - 1) * Number(limit);
        const sortOption = sort ? { [sort]: 1 } : { createdAt: -1 };

        const requests = await Request.find(query).sort(sortOption).skip(skip).limit(Number(limit));
        const totalRecords = await Request.countDocuments(query);

        res.status(200).json({
            currentPage: Number(page),
            totalRecords,
            totalPages: Math.ceil(totalRecords / Number(limit)),
            data: requests
        });
    } catch (error) { next(error); }
};

const getRequestById = async (req, res, next) => {
    try {
        const request = await Request.findOne({ requestId: req.params.requestId, createdBy: req.user._id });
        if (!request) { res.status(404); throw new Error('Request not found or unauthorized'); }
        res.status(200).json(request);
    } catch (error) { next(error); }
};

const updateRequest = async (req, res, next) => {
    try {
        const request = await Request.findOneAndUpdate(
            { requestId: req.params.requestId, createdBy: req.user._id },
            req.body,
            { new: true, runValidators: true }
        );
        if (!request) { res.status(404); throw new Error('Request not found or unauthorized'); }
        res.status(200).json(request);
    } catch (error) { next(error); }
};

const deleteRequest = async (req, res, next) => {
    try {
        const request = await Request.findOneAndDelete({ requestId: req.params.requestId, createdBy: req.user._id });
        if (!request) { res.status(404); throw new Error('Request not found or unauthorized'); }
        res.status(200).json({ message: 'Request deleted successfully' });
    } catch (error) { next(error); }
};

module.exports = { createRequest, getRequests, getRequestById, updateRequest, deleteRequest };