import request from 'supertest';
import app from '../src/app';
import * as db from '../src/db';
import bcrypt from 'bcrypt';

// ล้าง tables ก่อนทุก test
beforeEach(async () => {
  await db.query('DELETE FROM lead_transfers');
  await db.query('DELETE FROM leads');
  await db.query('DELETE FROM users');
});

// ปิด connection pool หลังทุก test เสร็จ
afterAll(async () => {
  await db.end();
});

// ---- Helper functions ----

async function createUser(role: 'admin' | 'sales', email: string) {
  const hash = await bcrypt.hash('password123', 10);
  const result = await db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email`,
    [role === 'admin' ? 'Test Admin' : 'Test Sales', email, hash, role]
  );
  return result.rows[0];
}

async function loginUser(email: string) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'password123' });
  return res.body.token as string;
}

async function createLead(ownerId: number | null = null) {
  const result = await db.query(
    `INSERT INTO leads (name, phone, source, status, owner_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    ['Test Lead', '0812345678', 'web', 'new', ownerId]
  );
  return result.rows[0];
}

// ---- Test Suites ----

describe('PATCH /api/v1/leads/:id/assign', () => {

  test('assign lead สำเร็จ → 200 + transfer log ถูกสร้าง', async () => {
    const admin = await createUser('admin', 'admin@test.com');
    const sales = await createUser('sales', 'sales@test.com');
    const lead = await createLead();
    const token = await loginUser('admin@test.com');

    const res = await request(app)
      .patch(`/api/v1/leads/${lead.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ to_owner_id: sales.id, reason: 'test assign' });

    expect(res.status).toBe(200);
    expect(res.body.data.lead_id).toBe(lead.id);
    expect(res.body.data.to_owner.id).toBe(sales.id);

    // ตรวจ DB ว่า transfer log ถูกสร้างจริง
    const log = await db.query(
      'SELECT * FROM lead_transfers WHERE lead_id = $1',
      [lead.id]
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0].to_owner_id).toBe(sales.id);
  });

  test('assign closed lead → 409', async () => {
    const admin = await createUser('admin', 'admin@test.com');
    const sales = await createUser('sales', 'sales@test.com');
    const result = await db.query(
      `INSERT INTO leads (name, source, status) VALUES ('Closed Lead', 'web', 'closed_won') RETURNING id`
    );
    const token = await loginUser('admin@test.com');

    const res = await request(app)
      .patch(`/api/v1/leads/${result.rows[0].id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ to_owner_id: sales.id });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LEAD_CLOSED');
  });

  test('sales user เข้า assign endpoint → 403', async () => {
    const sales = await createUser('sales', 'sales@test.com');
    const lead = await createLead();
    const token = await loginUser('sales@test.com');

    const res = await request(app)
      .patch(`/api/v1/leads/${lead.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ to_owner_id: sales.id });

    expect(res.status).toBe(403);
  });

  test('ไม่มี JWT → 401', async () => {
    const lead = await createLead();

    const res = await request(app)
      .patch(`/api/v1/leads/${lead.id}/assign`)
      .send({ to_owner_id: 1 });

    expect(res.status).toBe(401);
  });

  test('to_owner_id ไม่มีใน DB → 404 + INVALID_TARGET_OWNER', async () => {
      const admin = await createUser('admin', 'admin@test.com');
      const sales = await createUser('sales', 'sales@test.com');
      const lead = await createLead();
      const token = await loginUser('admin@test.com');
      

      const res = await request(app)
        .patch(`/api/v1/leads/${lead.id}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ to_owner_id: 99999 }) 

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('INVALID_TARGET_OWNER');
  });

  test('to_owner_id เป็น admin ไม่ใช่ sales → 404 + INVALID_TARGET_OWNER', async () => {
      const admin = await createUser('admin', 'admin@test.com');
      const sales = await createUser('sales', 'sales@test.com');
      const lead = await createLead();
      const token = await loginUser('admin@test.com');
      

      const res = await request(app)
        .patch(`/api/v1/leads/${lead.id}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ to_owner_id: admin.id, reason: 'ABC' })

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('INVALID_TARGET_OWNER');
  });

  test('lead id ไม่มีใน DB → 404', async () => {
      const admin = await createUser('admin', 'admin@test.com');
      const sales = await createUser('sales', 'sales@test.com');
      const token = await loginUser('admin@test.com');
      

      const res = await request(app)
        .patch(`/api/v1/leads/${99999}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ to_owner_id: sales.id, reason: 'test assign' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('LEAD_NOT_FOUND');
  });

});

describe('PATCH /api/v1/leads/:id', () => {

  test('อัปเดต status สำเร็จ → 200', async () => {
    const sales = await createUser('sales', 'sales@test.com');
    const lead = await createLead(sales.id);
    const token = await loginUser('sales@test.com');

    const res = await request(app)
      .patch(`/api/v1/leads/${lead.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'contacted' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('contacted');
  });

  test('ไม่ส่ง field อะไรเลย → 400', async () => {
    const sales = await createUser('sales', 'sales@test.com');
    const lead = await createLead(sales.id);
    const token = await loginUser('sales@test.com');

    const res = await request(app)
      .patch(`/api/v1/leads/${lead.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_FIELDS');
  });

  test('ส่ง status ที่ไม่อยู่ใน enum → 400', async () => {
    const sales = await createUser('sales', 'sales@test.com');
    const lead = await createLead(sales.id);
    const token = await loginUser('sales@test.com');

    const res = await request(app)
      .patch(`/api/v1/leads/${lead.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'flying' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_STATUS');
  });

  test('sales อัปเดต lead ของคนอื่น → 403', async () => {
    const sales1 = await createUser('sales', 'sales1@test.com');
    const sales2 = await createUser('sales', 'sales2@test.com');
    const lead = await createLead(sales2.id);
    const token = await loginUser('sales1@test.com');

    const res = await request(app)
      .patch(`/api/v1/leads/${lead.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'contracted' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('lead id ไม่มีใน DB → 404', async () => {
    const sales = await createUser('sales', 'sales@test.com');
    const token = await loginUser('sales@test.com');

    const res = await request(app)
      .patch(`/api/v1/leads/${99999}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'contracted' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('LEAD_NOT_FOUND');

  });
});

describe('GET /api/v1/leads', () => {

  test('admin เห็น leads ทั้งหมด', async () => {
    const admin = await createUser('admin', 'admin@test.com');
    const sales = await createUser('sales', 'sales@test.com');
    await createLead(sales.id);
    await createLead(null);
    const token = await loginUser('admin@test.com');

    const res = await request(app)
      .get('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
  });

  test('sales เห็นแค่ lead ของตัวเอง', async () => {
    const sales = await createUser('sales', 'sales@test.com');
    await createUser('admin', 'admin@test.com');
    await createLead(sales.id);
    await createLead(null);
    const token = await loginUser('sales@test.com');

    const res = await request(app)
      .get('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
  });

});

describe('GET /api/v1/leads/:id', () => {

  test('admin ดู lead ของคนอื่นได้ → 200', async () => {
    const admin = await createUser('admin', 'admin@test.com');
    const sales = await createUser('sales', 'sales@test.com');
    const lead = await createLead(sales.id);
    const token = await loginUser('admin@test.com');

    const res = await request(app)
      .get(`/api/v1/leads/${lead.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(lead.id);
  });

  test('sales ดู lead ของคนอื่น → 403', async () => {
    const admin = await createUser('admin', 'admin@test.com');
    const sales = await createUser('sales', 'sales@test.com');
    const lead = await createLead(admin.id);
    const token = await loginUser('sales@test.com');

    const res = await request(app)
      .get(`/api/v1/leads/${lead.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

});

describe('GET /api/v1/leads - filter', () => {

  test('filter ?status=new → คืนแค่ leads ที่ status ตรง', async () => {
    const admin = await createUser('admin', 'admin@test.com');
    const token = await loginUser('admin@test.com');

    await createLead();  // status = new (default)
    await createLead();  // status = new
    await db.query(
    `INSERT INTO leads (name, source, status) VALUES ('Contacted Lead', 'web', 'contacted')`
    );

    const res = await request(app)
    .get('/api/v1/leads?status=new')
    .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.data.every((l: any) => l.status === 'new')).toBe(true);

  });

});

describe('GET /api/v1/users', () => {

  test('admin ดูได้ → 200', async () => {
    const admin = await createUser('admin', 'admin@test.com');
    const token = await loginUser('admin@test.com');

    await createUser('sales', 'sale1@test.com');
    await createUser('sales', 'sale2@test.com');

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2); // 2 users

  });

  test('sales เข้าไม่ได้ → 403', async () => {
    const sales = await createUser('sales', 'sales@test.com');
    const token = await loginUser('sales@test.com');

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

});