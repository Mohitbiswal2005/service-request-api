const ApiError = require('../utils/ApiError');

// Runs a Zod schema against body / query / params and turns any failure
// into one consistent 400 with a per-field error list.
const validate = (schemas) => (req, res, next) => {
  for (const part of ['body', 'query', 'params']) {
    if (!schemas[part]) continue;

    const result = schemas[part].safeParse(req[part]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || part,
        message: issue.message,
      }));
      return next(new ApiError(400, 'Validation failed', details));
    }

    // Store the parsed+coerced value. req.validated.query gives you a real
    // Number for page/limit instead of the string Express hands you.
    req.validated = req.validated || {};
    req.validated[part] = result.data;
  }
  next();
};

module.exports = validate;
