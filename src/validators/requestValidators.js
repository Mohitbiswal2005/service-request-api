const { z } = require('zod');

const CATEGORIES = ['Technical', 'Billing', 'Hardware', 'Network', 'General'];
const PRIORITIES = ['Low', 'Medium', 'High'];
const STATUSES = ['Pending', 'In Progress', 'Completed', 'Cancelled'];
const SORTABLE = ['createdAt', 'updatedAt', 'title', 'priority', 'status'];

const createRequestSchema = z.object({
  title: z.string({ error: 'Title is required' }).trim()
    .min(3, 'Title must be at least 3 characters')
    .max(120, 'Title cannot exceed 120 characters'),
  description: z.string({ error: 'Description is required' }).trim()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description cannot exceed 2000 characters'),
  category: z.enum(CATEGORIES, { message: `Category must be one of: ${CATEGORIES.join(', ')}` }),
  priority: z.enum(PRIORITIES, { message: `Priority must be one of: ${PRIORITIES.join(', ')}` })
    .optional(),
}).strict();  // .strict() rejects createdBy / requestId injection at the door

// .partial() = every field optional, but any field present is still validated.
const updateRequestSchema = createRequestSchema
  .extend({
    status: z.enum(STATUSES, { message: `Status must be one of: ${STATUSES.join(', ')}` }),
    statusNote: z.string().trim().max(200, 'Note cannot exceed 200 characters'),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Request body cannot be empty',
  })
  .refine((data) => !data.statusNote || data.status, {
    message: 'statusNote can only be sent alongside a status change',
  });

const listRequestsSchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: z.enum(CATEGORIES).optional(),

  search: z.string().trim().max(100).optional(),
  // regex = substring matching ("serv" finds "server")
  // text  = the weighted full-text index, whole words, ranked by relevance
  searchMode: z.enum(['regex', 'text']).optional().default('regex'),

  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),

  sort: z.enum(SORTABLE).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1, 'page must be 1 or greater').optional().default(1),
  limit: z.coerce.number().int()
    .min(1, 'limit must be at least 1')
    .max(100, 'limit cannot exceed 100')   // stops ?limit=999999 dumping the collection
    .optional().default(10),
}).strict().refine(
  (d) => !d.createdAfter || !d.createdBefore || d.createdAfter <= d.createdBefore,
  { message: 'createdAfter must be earlier than createdBefore' },
);

const requestIdParamSchema = z.object({
  requestId: z.string().trim().regex(/^REQ-[A-Z0-9-]+$/i, 'Invalid request ID format'),
});

const auditQuerySchema = z.object({
  action: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
}).strict();

module.exports = {
  createRequestSchema,
  updateRequestSchema,
  listRequestsSchema,
  requestIdParamSchema,
  auditQuerySchema,
};
