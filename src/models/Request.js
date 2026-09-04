const mongoose = require('mongoose');

const CATEGORIES = ['Technical', 'Billing', 'Hardware', 'Network', 'General'];
const PRIORITIES = ['Low', 'Medium', 'High'];
const STATUSES = ['Pending', 'In Progress', 'Completed', 'Cancelled'];

// A record of every status change, appended automatically. Never written by a client.
const statusHistorySchema = new mongoose.Schema({
  status: { type: String, enum: STATUSES, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  changedAt: { type: Date, default: Date.now },
  note: { type: String, maxlength: 200 },
}, { _id: false });

const requestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    required: true,
    unique: true,
    immutable: true,   // business key can never be rewritten by a client
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    minlength: [3, 'Title must be at least 3 characters'],
    maxlength: [120, 'Title cannot exceed 120 characters'],
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    minlength: [10, 'Description must be at least 10 characters'],
    maxlength: [2000, 'Description cannot exceed 2000 characters'],
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: { values: CATEGORIES, message: '{VALUE} is not a supported category' },
  },
  priority: {
    type: String,
    enum: { values: PRIORITIES, message: '{VALUE} is not a valid priority' },
    default: 'Medium',
  },
  status: {
    type: String,
    enum: { values: STATUSES, message: '{VALUE} is not a valid status' },
    default: 'Pending',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,   // ownership can never be transferred by a request body
  },

  // --- status history (bonus) ---
  statusHistory: { type: [statusHistorySchema], default: [] },

  // --- soft delete (bonus) ---
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true, versionKey: false },
  toObject: { virtuals: true },
});

// Indexes that match the queries this API actually runs.
requestSchema.index({ createdBy: 1, isDeleted: 1, createdAt: -1 });
requestSchema.index({ createdBy: 1, isDeleted: 1, status: 1, priority: 1 });

// Weighted full-text index: a hit in the title outranks a hit in the description.
requestSchema.index(
  { title: 'text', description: 'text' },
  { weights: { title: 5, description: 1 }, name: 'request_text_index' },
);

// How long the request has been open, computed rather than stored.
requestSchema.virtual('ageInDays').get(function () {
  const end = this.status === 'Completed' || this.status === 'Cancelled'
    ? this.updatedAt : new Date();
  return Math.floor((end - this.createdAt) / 86400000);
});

// --- soft delete: hide deleted records from every ordinary query ---
// Pass .setOptions({ withDeleted: true }) to opt back in (admin routes do this).
const excludeDeleted = function () {
  if (!this.getOptions().withDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
};
['find', 'findOne', 'findOneAndUpdate', 'countDocuments', 'distinct']
  .forEach((op) => requestSchema.pre(op, excludeDeleted));

// --- status history: appended automatically, including on creation ---
requestSchema.pre('save', function () {
  if (this.isNew || this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      changedBy: this.$locals.changedBy || this.createdBy,
      note: this.$locals.statusNote,
    });
  }
});

module.exports = mongoose.model('Request', requestSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.PRIORITIES = PRIORITIES;
module.exports.STATUSES = STATUSES;
