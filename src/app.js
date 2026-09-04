const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const openapi = require('./docs/openapi');
const authRoutes = require('./routes/authRoutes');
const requestRoutes = require('./routes/requestRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);   // correct req.ip behind a proxy, needed by rate limiting

// Helmet's default Content-Security-Policy blocks the inline styles Swagger UI
// needs, so it is relaxed for that one path only. Everything else keeps the
// full default policy.
app.use('/api-docs', helmet({ contentSecurityPolicy: false }));
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));   // caps oversized payloads

// NOTE: express-mongo-sanitize is NOT used. It crashes on Express 5
// ("Cannot set property query which has only a getter"). NoSQL operator
// injection is already blocked because every Zod schema uses .strict(),
// so a key like {"$gt":""} is rejected as an unrecognized key.

// A correlation id on every request, echoed in the response header. Makes a
// single request traceable across logs when something goes wrong in production.
app.use((req, res, next) => {
  req.id = req.get('x-request-id') || crypto.randomUUID();
  res.set('x-request-id', req.id);
  next();
});

// One line per request. Skipped during tests so the output stays readable.
if (process.env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        reqId: req.id,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        ms: Date.now() - start,
      }));
    });
    next();
  });
}

// Brute-force protection on the auth endpoints only.
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later' },
}));

// General throttle for the rest of the API.
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.get('/', (req, res) =>
  res.json({
    success: true,
    name: 'Service Request Management API',
    version: '1.0.0',
    docs: '/api-docs',
    health: '/health',
  }));
app.get('/health', (req, res) =>
  res.status(200).json({ success: true, status: 'ok', uptime: process.uptime() }));

// Interactive documentation. The raw spec is also served so other tools
// (Postman, code generators) can import it.
app.get('/api-docs.json', (req, res) => res.json(openapi));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi, {
  customSiteTitle: 'Service Request API',
  swaggerOptions: { persistAuthorization: true, docExpansion: 'none' },
}));

app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);      // must come after all routes
app.use(errorHandler);  // must be last

module.exports = app;
