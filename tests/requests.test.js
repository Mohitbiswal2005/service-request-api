require('./setup');
const request = require('supertest');
const app = require('../src/app');

const signup = (email) => request(app).post('/api/auth/signup')
  .send({ name: 'Test User', email, password: 'Password123' });

const makeRequest = (token, body) => request(app).post('/api/requests')
  .set('Authorization', `Bearer ${token}`)
  .send({
    title: 'Fix login server',
    description: 'The backend API is crashing on the login route.',
    category: 'Technical',
    priority: 'High',
    ...body,
  });

describe('CRUD', () => {
  let token, requestId;

  beforeAll(async () => {
    token = (await signup('crud@example.com')).body.data.accessToken;
  });

  it('creates a request', async () => {
    const res = await makeRequest(token);
    expect(res.status).toBe(201);
    expect(res.body.data.requestId).toMatch(/^REQ-/);
    expect(res.body.data.status).toBe('Pending');   // default applied
    requestId = res.body.data.requestId;
  });

  it('reads it back', async () => {
    const res = await request(app).get(`/api/requests/${requestId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('updates it', async () => {
    const res = await request(app).put(`/api/requests/${requestId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'In Progress' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('In Progress');
  });

  it('rejects an invalid enum with 400, not 500', async () => {
    const res = await makeRequest(token, { priority: 'Urgent' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing required field with 400, not 500', async () => {
    const res = await request(app).post('/api/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'No title supplied here.', category: 'Technical' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const res = await request(app).get('/api/requests/REQ-ZZZZZZZ-000000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('deletes it', async () => {
    const res = await request(app).delete(`/api/requests/${requestId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('ownership enforcement', () => {
  let tokenA, tokenB, requestIdOfA;

  beforeAll(async () => {
    tokenA = (await signup('a@example.com')).body.data.accessToken;
    tokenB = (await signup('b@example.com')).body.data.accessToken;
    requestIdOfA = (await makeRequest(tokenA)).body.data.requestId;
  });

  it("keeps user A's request out of user B's list", async () => {
    const res = await request(app).get('/api/requests')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.requestId)).not.toContain(requestIdOfA);
  });

  it("blocks user B from reading user A's request", async () => {
    const res = await request(app).get(`/api/requests/${requestIdOfA}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(403);
  });

  it("blocks user B from updating user A's request", async () => {
    const res = await request(app).put(`/api/requests/${requestIdOfA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ status: 'Cancelled' });
    expect(res.status).toBe(403);
  });

  it("blocks user B from deleting user A's request", async () => {
    const res = await request(app).delete(`/api/requests/${requestIdOfA}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(403);
  });

  it('blocks ownership transfer through the request body', async () => {
    const res = await request(app).put(`/api/requests/${requestIdOfA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ createdBy: '652f1a9c4d3b2e0011aa77bc' });
    expect(res.status).toBe(400);
  });
});

describe('filtering, search, pagination, sorting', () => {
  let token;

  beforeAll(async () => {
    token = (await signup('filters@example.com')).body.data.accessToken;
    await makeRequest(token, { title: 'Server is down', category: 'Technical', priority: 'High' });
    await makeRequest(token, { title: 'Invoice wrong', description: 'Duplicate line item on the October invoice.', category: 'Billing', priority: 'Low' });
    await makeRequest(token, { title: 'Laptop broken', description: 'The screen has stopped turning on.', category: 'Hardware', priority: 'Medium' });
  });

  const get = (qs) => request(app).get(`/api/requests${qs}`)
    .set('Authorization', `Bearer ${token}`);

  it('filters by priority', async () => {
    const res = await get('?priority=High');
    expect(res.status).toBe(200);
    expect(res.body.data.every((r) => r.priority === 'High')).toBe(true);
  });

  it('combines two filters', async () => {
    const res = await get('?status=Pending&priority=High');
    expect(res.status).toBe(200);
  });

  it('searches title and description', async () => {
    const res = await get('?search=server');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('does not crash on regex metacharacters', async () => {
    const res = await get('?search=' + encodeURIComponent('c++'));
    expect(res.status).toBe(200);
  });

  it('paginates and reports the meta the brief asks for', async () => {
    const res = await get('?page=1&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    expect(res.body.pagination).toEqual(expect.objectContaining({
      currentPage: 1, pageSize: 2, recordsOnPage: expect.any(Number),
      totalRecords: expect.any(Number), totalPages: expect.any(Number),
    }));
  });

  it('sorts in both directions', async () => {
    const asc = await get('?sort=title&order=asc');
    const desc = await get('?sort=title&order=desc');
    expect(asc.status).toBe(200);
    expect(desc.body.data[0].title).toBe(asc.body.data[asc.body.data.length - 1].title);
  });

  it('caps limit to protect the database', async () => {
    const res = await get('?limit=999999');
    expect(res.status).toBe(400);
  });

  it('rejects an unknown sort field', async () => {
    const res = await get('?sort=password');
    expect(res.status).toBe(400);
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404, not an Express HTML page', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
