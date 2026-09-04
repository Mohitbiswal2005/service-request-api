// OpenAPI 3.0 specification, served by swagger-ui-express at /api-docs.
// Kept as a plain object rather than JSDoc comments so the whole contract is
// readable in one file instead of being scattered through the controllers.

const bearer = [{ bearerAuth: [] }];

const error = (description, example) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
      example,
    },
  },
});

const VALIDATION_ERROR = error('Validation failed', {
  success: false,
  message: 'Validation failed',
  errors: [{ field: 'email', message: 'Please provide a valid email address' }],
});

const UNAUTHENTICATED = error('Missing, malformed or expired access token', {
  success: false, message: 'Not authorized: no token provided',
});

const FORBIDDEN = error('The record exists but belongs to another user', {
  success: false, message: 'You do not have permission to access this request',
});

const NOT_FOUND = error('No such record', {
  success: false, message: 'Request not found',
});

module.exports = {
  openapi: '3.0.3',

  info: {
    title: 'Service Request Management API',
    version: '1.0.0',
    description: [
      'A RESTful API for managing service requests.',
      '',
      '### Authentication',
      'Call `POST /api/auth/login` to get an access token and a refresh token.',
      'Send the access token as `Authorization: Bearer <token>` on every protected route.',
      'Access tokens are short lived; use `POST /api/auth/refresh` to rotate them.',
      '',
      '### Trying it out',
      'Log in, copy `data.accessToken` from the response, press **Authorize** above',
      'and paste it. Every protected endpoint on this page then works from the browser.',
    ].join('\n'),
    license: { name: 'MIT' },
  },

  servers: [
    { url: 'https://service-request-api-wje1.onrender.com', description: 'Live (Render)' },
    { url: 'http://localhost:5000', description: 'Local development' },
  ],

  tags: [
    { name: 'Auth', description: 'Registration, login, token rotation' },
    { name: 'Requests', description: 'Service request CRUD, filtering and history' },
    { name: 'Admin', description: 'Admin-only reporting and the audit trail' },
    { name: 'System', description: 'Health check' },
  ],

  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },

    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },

      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '652f1a9c4d3b2e0011aa77bc' },
          name: { type: 'string', example: 'Mohit Biswal' },
          email: { type: 'string', format: 'email', example: 'mohit@example.com' },
          role: { type: 'string', enum: ['user', 'admin'], example: 'user' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      StatusHistoryEntry: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'],
          },
          changedBy: { type: 'string' },
          changedAt: { type: 'string', format: 'date-time' },
          note: { type: 'string', example: 'Fixed by restarting the load balancer' },
        },
      },

      Request: {
        type: 'object',
        properties: {
          requestId: { type: 'string', example: 'REQ-MFA1B2C-9F3A11' },
          title: { type: 'string', example: 'Fix login server' },
          description: { type: 'string', example: 'The backend API is crashing on the login route.' },
          category: {
            type: 'string',
            enum: ['Technical', 'Billing', 'Hardware', 'Network', 'General'],
          },
          priority: { type: 'string', enum: ['Low', 'Medium', 'High'] },
          status: {
            type: 'string',
            enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'],
          },
          createdBy: { type: 'string' },
          statusHistory: {
            type: 'array',
            items: { $ref: '#/components/schemas/StatusHistoryEntry' },
          },
          isDeleted: { type: 'boolean' },
          ageInDays: { type: 'integer', description: 'Computed, not stored' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },

      Pagination: {
        type: 'object',
        properties: {
          currentPage: { type: 'integer', example: 1 },
          pageSize: { type: 'integer', example: 10 },
          recordsOnPage: { type: 'integer', example: 3 },
          totalRecords: { type: 'integer', example: 23 },
          totalPages: { type: 'integer', example: 3 },
          hasNextPage: { type: 'boolean' },
          hasPrevPage: { type: 'boolean' },
        },
      },

      TokenPair: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'string', example: '15m' },
        },
      },
    },
  },

  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Liveness probe',
        security: [],
        responses: { 200: { description: 'The service is up' } },
      },
    },

    '/api/auth/signup': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new account',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', minLength: 2, maxLength: 50 },
                  email: { type: 'string', format: 'email' },
                  password: {
                    type: 'string', minLength: 8,
                    description: 'At least one lowercase, one uppercase and one number',
                  },
                },
              },
              example: {
                name: 'Mohit Biswal',
                email: 'mohit@example.com',
                password: 'Password123',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Account created',
            content: {
              'application/json': {
                example: {
                  success: true,
                  message: 'Account created successfully',
                  data: {
                    user: {
                      id: '652f1a9c4d3b2e0011aa77bc',
                      name: 'Mohit Biswal',
                      email: 'mohit@example.com',
                      role: 'user',
                    },
                    accessToken: 'eyJhbGciOi...',
                    refreshToken: 'k3Jd9x...',
                    expiresIn: '15m',
                  },
                },
              },
            },
          },
          400: VALIDATION_ERROR,
          409: error('Email already registered', {
            success: false, message: 'An account with this email already exists',
          }),
          429: error('Too many attempts', { success: false, message: 'Too many attempts, please try again later' }),
        },
      },
    },

    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and receive a token pair',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              example: { email: 'mohit@example.com', password: 'Password123' },
            },
          },
        },
        responses: {
          200: {
            description: 'Logged in',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TokenPair' },
              },
            },
          },
          400: VALIDATION_ERROR,
          401: error('Wrong email or password', {
            success: false, message: 'Invalid email or password',
          }),
        },
      },
    },

    '/api/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate a refresh token',
        description: [
          'Returns a new access token and a new refresh token, and revokes the one supplied.',
          '',
          'If a refresh token that has already been used is presented again, the API treats',
          'it as a stolen credential: every token in that family is revoked and the response',
          'is 401. The legitimate user is logged out of that session and must log in again.',
        ].join('\n'),
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { example: { refreshToken: 'k3Jd9x...' } } },
        },
        responses: {
          200: {
            description: 'New token pair issued',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } },
            },
          },
          400: VALIDATION_ERROR,
          401: error('Invalid, expired, or replayed token', {
            success: false,
            message: 'Refresh token reuse detected. All sessions have been revoked.',
          }),
        },
      },
    },

    '/api/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke a refresh token, or every session',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              examples: {
                'This device': { value: { refreshToken: 'k3Jd9x...' } },
                'All devices': { value: { allDevices: true } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Logged out' },
          400: VALIDATION_ERROR,
          401: UNAUTHENTICATED,
        },
      },
    },

    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'The currently authenticated user',
        security: bearer,
        responses: {
          200: {
            description: 'The current user',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/User' } },
            },
          },
          401: UNAUTHENTICATED,
        },
      },
    },

    '/api/requests': {
      get: {
        tags: ['Requests'],
        summary: "List the authenticated user's requests",
        description: 'Filtering, search, sorting and pagination all compose in a single call.',
        security: bearer,
        parameters: [
          {
            name: 'status', in: 'query',
            schema: { type: 'string', enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'] },
          },
          { name: 'priority', in: 'query', schema: { type: 'string', enum: ['Low', 'Medium', 'High'] } },
          {
            name: 'category', in: 'query',
            schema: { type: 'string', enum: ['Technical', 'Billing', 'Hardware', 'Network', 'General'] },
          },
          {
            name: 'search', in: 'query', schema: { type: 'string', maxLength: 100 },
            description: 'Matches title and description',
          },
          {
            name: 'searchMode', in: 'query',
            schema: { type: 'string', enum: ['regex', 'text'], default: 'regex' },
            description:
              'regex does substring matching, so "serv" finds "server". '
              + 'text uses the weighted full-text index: whole words only, but results are '
              + 'ranked by relevance and a title hit outranks a description hit.',
          },
          { name: 'createdAfter', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'createdBefore', in: 'query', schema: { type: 'string', format: 'date' } },
          {
            name: 'sort', in: 'query',
            schema: {
              type: 'string',
              enum: ['createdAt', 'updatedAt', 'title', 'priority', 'status'],
              default: 'createdAt',
            },
          },
          {
            name: 'order', in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit', in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
            description: 'Capped at 100 so a client cannot pull the whole collection',
          },
        ],
        responses: {
          200: {
            description: 'A page of requests',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Request' },
                    },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          400: VALIDATION_ERROR,
          401: UNAUTHENTICATED,
        },
      },

      post: {
        tags: ['Requests'],
        summary: 'Create a service request',
        description:
          'The owner is always taken from the access token. Sending createdBy in the body '
          + 'is rejected with 400, not silently ignored.',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              example: {
                title: 'Fix login server',
                description: 'The backend API is crashing on the login route.',
                category: 'Technical',
                priority: 'High',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Created',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Request' } },
            },
          },
          400: VALIDATION_ERROR,
          401: UNAUTHENTICATED,
        },
      },
    },

    '/api/requests/stats': {
      get: {
        tags: ['Requests'],
        summary: 'Counts grouped by status, priority and category',
        security: bearer,
        responses: {
          200: {
            description: 'Aggregated counts',
            content: {
              'application/json': {
                example: {
                  success: true,
                  data: {
                    total: 23,
                    byStatus: { Pending: 9, 'In Progress': 6, Completed: 7, Cancelled: 1 },
                    byPriority: { Low: 5, Medium: 11, High: 7 },
                    byCategory: { Technical: 12, Billing: 4, Hardware: 4, Network: 3 },
                  },
                },
              },
            },
          },
          401: UNAUTHENTICATED,
        },
      },
    },

    '/api/requests/{requestId}': {
      parameters: [{
        name: 'requestId', in: 'path', required: true,
        schema: { type: 'string' }, example: 'REQ-MFA1B2C-9F3A11',
      }],

      get: {
        tags: ['Requests'],
        summary: 'Fetch one request',
        security: bearer,
        responses: {
          200: {
            description: 'The request',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Request' } },
            },
          },
          400: VALIDATION_ERROR, 401: UNAUTHENTICATED, 403: FORBIDDEN, 404: NOT_FOUND,
        },
      },

      put: {
        tags: ['Requests'],
        summary: 'Update a request',
        description:
          'Partial update. Only whitelisted fields are accepted; createdBy and requestId '
          + 'are immutable at the schema level as well as rejected by validation.',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              example: { status: 'In Progress', statusNote: 'Investigating the load balancer' },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Request' } },
            },
          },
          400: VALIDATION_ERROR, 401: UNAUTHENTICATED, 403: FORBIDDEN, 404: NOT_FOUND,
        },
      },

      delete: {
        tags: ['Requests'],
        summary: 'Soft delete a request',
        description:
          'The record is flagged rather than removed, so it disappears from every ordinary '
          + 'query but can be brought back with the restore endpoint.',
        security: bearer,
        responses: {
          200: { description: 'Deleted' },
          400: VALIDATION_ERROR, 401: UNAUTHENTICATED, 403: FORBIDDEN, 404: NOT_FOUND,
        },
      },
    },

    '/api/requests/{requestId}/history': {
      get: {
        tags: ['Requests'],
        summary: 'The status history of one request',
        description: 'Appended automatically on creation and on every status change.',
        security: bearer,
        parameters: [{
          name: 'requestId', in: 'path', required: true, schema: { type: 'string' },
        }],
        responses: {
          200: {
            description: 'The history',
            content: {
              'application/json': {
                example: {
                  success: true,
                  data: {
                    requestId: 'REQ-MFA1B2C-9F3A11',
                    history: [
                      { status: 'Pending', changedAt: '2026-09-01T09:00:00.000Z' },
                      {
                        status: 'In Progress',
                        changedAt: '2026-09-02T11:20:00.000Z',
                        note: 'Investigating the load balancer',
                      },
                    ],
                  },
                },
              },
            },
          },
          401: UNAUTHENTICATED, 403: FORBIDDEN, 404: NOT_FOUND,
        },
      },
    },

    '/api/requests/{requestId}/restore': {
      post: {
        tags: ['Requests'],
        summary: 'Restore a soft-deleted request',
        security: bearer,
        parameters: [{
          name: 'requestId', in: 'path', required: true, schema: { type: 'string' },
        }],
        responses: {
          200: { description: 'Restored' },
          401: UNAUTHENTICATED,
          403: FORBIDDEN,
          404: NOT_FOUND,
          409: error('The request is not deleted', {
            success: false, message: 'This request is not deleted',
          }),
        },
      },
    },

    '/api/admin/requests': {
      get: {
        tags: ['Admin'],
        summary: 'Every request in the system, including deleted ones',
        security: bearer,
        responses: {
          200: { description: 'All requests, with owner details populated' },
          401: UNAUTHENTICATED,
          403: error('Not an admin', {
            success: false, message: 'You do not have permission to perform this action',
          }),
        },
      },
    },

    '/api/admin/stats': {
      get: {
        tags: ['Admin'],
        summary: 'Platform-wide statistics',
        security: bearer,
        responses: { 200: { description: 'Aggregated counts and the busiest users' }, 401: UNAUTHENTICATED },
      },
    },

    '/api/admin/audit-logs': {
      get: {
        tags: ['Admin'],
        summary: 'The audit trail',
        description: 'Every significant action, who performed it, from where, and what changed.',
        security: bearer,
        parameters: [
          { name: 'action', in: 'query', schema: { type: 'string' }, example: 'REQUEST_DELETED' },
          { name: 'entityId', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 25, maximum: 100 } },
        ],
        responses: { 200: { description: 'A page of audit entries' }, 401: UNAUTHENTICATED },
      },
    },
  },
};
