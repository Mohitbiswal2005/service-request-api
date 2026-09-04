require('./setup');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');

const signup = (email, role) => request(app).post('/api/auth/signup')
  .send({ name: 'Test User', email, password: 'Password123' })
  .then(async (res) => {
    if (role) await User.updateOne({ email }, { role });
    return res.body.data;
  });

const create = (token, body) => request(app).post('/api/requests')
  .set('Authorization', `Bearer ${token}`)
  .send({
    title: 'Login server is down',
    description: 'The authentication server is returning 502 errors.',
    category: 'Technical',
    priority: 'High',
    ...body,
  });

describe('refresh token rotation', () => {
  let pair;

  beforeAll(async () => { pair = await signup('rotate@example.com'); });

  it('issues an access token and a refresh token on signup', () => {
    expect(pair.accessToken).toBeDefined();
    expect(pair.refreshToken).toBeDefined();
  });

  it('exchanges a refresh token for a new pair', async () => {
    const res = await request(app).post('/api/auth/refresh')
      .send({ refreshToken: pair.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).not.toBe(pair.refreshToken);   // rotated
    pair.used = pair.refreshToken;
    pair.refreshToken = res.body.data.refreshToken;
  });

  it('refuses the old token once it has been rotated', async () => {
    const res = await request(app).post('/api/auth/refresh')
      .send({ refreshToken: pair.used });
    expect(res.status).toBe(401);
  });

  it('revokes the whole family when a used token is replayed', async () => {
    // The replay above should have killed every token from that login,
    // including the current one.
    const res = await request(app).post('/api/auth/refresh')
      .send({ refreshToken: pair.refreshToken });
    expect(res.status).toBe(401);
  });

  it('rejects a garbage refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh')
      .send({ refreshToken: 'x'.repeat(40) });
    expect(res.status).toBe(401);
  });

  it('logs out of every device', async () => {
    const fresh = await signup('logoutall@example.com');
    const out = await request(app).post('/api/auth/logout')
      .set('Authorization', `Bearer ${fresh.accessToken}`)
      .send({ allDevices: true });
    expect(out.status).toBe(200);

    const after = await request(app).post('/api/auth/refresh')
      .send({ refreshToken: fresh.refreshToken });
    expect(after.status).toBe(401);
  });
});

describe('status history', () => {
  let token, requestId;

  beforeAll(async () => {
    token = (await signup('history@example.com')).accessToken;
    requestId = (await create(token)).body.data.requestId;
  });

  it('records the initial status on creation', async () => {
    const res = await request(app).get(`/api/requests/${requestId}/history`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(1);
    expect(res.body.data.history[0].status).toBe('Pending');
  });

  it('appends an entry with the note when the status changes', async () => {
    await request(app).put(`/api/requests/${requestId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'In Progress', statusNote: 'Investigating the load balancer' });

    const res = await request(app).get(`/api/requests/${requestId}/history`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.history).toHaveLength(2);
    expect(res.body.data.history[1].note).toBe('Investigating the load balancer');
  });

  it('does not append when a non-status field changes', async () => {
    await request(app).put(`/api/requests/${requestId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priority: 'Low' });

    const res = await request(app).get(`/api/requests/${requestId}/history`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.history).toHaveLength(2);
  });
});

describe('soft delete and restore', () => {
  let token, requestId;

  beforeAll(async () => {
    token = (await signup('softdelete@example.com')).accessToken;
    requestId = (await create(token)).body.data.requestId;
  });

  it('hides a deleted request from the list', async () => {
    await request(app).delete(`/api/requests/${requestId}`)
      .set('Authorization', `Bearer ${token}`);

    const list = await request(app).get('/api/requests')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.data.map((r) => r.requestId)).not.toContain(requestId);
  });

  it('returns 404 for a deleted request', async () => {
    const res = await request(app).get(`/api/requests/${requestId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('restores it', async () => {
    const res = await request(app).post(`/api/requests/${requestId}/restore`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isDeleted).toBe(false);
  });

  it('refuses to restore something that is not deleted', async () => {
    const res = await request(app).post(`/api/requests/${requestId}/restore`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

describe('advanced search', () => {
  let token;

  beforeAll(async () => {
    token = (await signup('search@example.com')).accessToken;
    await create(token, { title: 'Login server is down' });
    await create(token, {
      title: 'Invoice problem',
      description: 'The server charged us twice for the same month.',
      category: 'Billing',
    });
  });

  const get = (qs) => request(app).get(`/api/requests${qs}`)
    .set('Authorization', `Bearer ${token}`);

  it('regex mode matches partial words', async () => {
    const res = await get('?search=serv');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('text mode ranks a title hit above a description hit', async () => {
    const res = await get('?search=server&searchMode=text');
    expect(res.status).toBe(200);
    expect(res.body.data[0].title).toBe('Login server is down');
    expect(res.body.data[0].score).toBeGreaterThan(res.body.data[1].score);
  });

  it('filters by date range', async () => {
    const res = await get('?createdAfter=2020-01-01');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('rejects a backwards date range', async () => {
    const res = await get('?createdAfter=2026-06-01&createdBefore=2026-01-01');
    expect(res.status).toBe(400);
  });

  it('returns aggregated stats', async () => {
    const res = await request(app).get('/api/requests/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.byCategory).toHaveProperty('Technical');
  });
});

describe('admin routes and audit trail', () => {
  let adminToken, userToken;

  beforeAll(async () => {
    await signup('theadmin@example.com', 'admin');
    // Log in again so the token is issued after the role was set.
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'theadmin@example.com', password: 'Password123' });
    adminToken = login.body.data.accessToken;
    userToken = (await signup('plainuser@example.com')).accessToken;
    await create(userToken);
  });

  it('blocks a non-admin with 403', async () => {
    const res = await request(app).get('/api/admin/requests')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('lets an admin see every request', async () => {
    const res = await request(app).get('/api/admin/requests')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].createdBy).toHaveProperty('email');   // populated
  });

  it('returns platform stats', async () => {
    const res = await request(app).get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalUsers).toBeGreaterThan(0);
  });

  it('records actions in the audit trail', async () => {
    await new Promise((r) => setTimeout(r, 300));   // audit writes are fire-and-forget
    const res = await request(app).get('/api/admin/audit-logs?action=REQUEST_CREATED')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].action).toBe('REQUEST_CREATED');
  });
});

describe('documentation', () => {
  it('serves the OpenAPI spec', async () => {
    const res = await request(app).get('/api-docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(10);
  });
});
