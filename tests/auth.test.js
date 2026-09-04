require('./setup');
const request = require('supertest');
const app = require('../src/app');

const VALID = { name: 'Mohit', email: 'mohit@example.com', password: 'Password123' };

describe('POST /api/auth/signup', () => {
  it('creates an account and returns a token', async () => {
    const res = await request(app).post('/api/auth/signup').send(VALID);
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.password).toBeUndefined();   // never leak the hash
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await request(app).post('/api/auth/signup').send(VALID);
    expect(res.status).toBe(409);
  });

  it('treats email case-insensitively', async () => {
    const res = await request(app).post('/api/auth/signup')
      .send({ ...VALID, email: 'MOHIT@EXAMPLE.COM' });
    expect(res.status).toBe(409);
  });

  it('rejects a weak password with 400', async () => {
    const res = await request(app).post('/api/auth/signup')
      .send({ ...VALID, email: 'other@example.com', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('password');
  });

  it('rejects an invalid email format with 400', async () => {
    const res = await request(app).post('/api/auth/signup')
      .send({ ...VALID, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('refuses to let a signup set its own role', async () => {
    const res = await request(app).post('/api/auth/signup')
      .send({ ...VALID, email: 'sneaky@example.com', role: 'admin' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: VALID.email, password: VALID.password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('rejects an empty body with 400, not 500', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('rejects a wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: VALID.email, password: 'WrongPassword1' });
    expect(res.status).toBe(401);
  });

  it('gives the same message for an unknown email as for a wrong password', async () => {
    const unknown = await request(app).post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password123' });
    const wrong = await request(app).post('/api/auth/login')
      .send({ email: VALID.email, password: 'WrongPassword1' });
    expect(unknown.body.message).toBe(wrong.body.message);
  });
});

describe('protected routes', () => {
  it('rejects a missing token with 401', async () => {
    const res = await request(app).get('/api/requests');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed token with 401', async () => {
    const res = await request(app).get('/api/requests')
      .set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
  });
});
