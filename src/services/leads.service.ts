import pool from '../db';

// ---- Types ----

export interface AssignLeadInput {
  leadId: number;
  toOwnerId: number;
  transferredBy: number;
  reason?: string;
}

// ---- assignLead ----

export async function assignLead(input: AssignLeadInput) {
  const { leadId, toOwnerId, transferredBy, reason } = input;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Step 1: SELECT lead FOR UPDATE (lock row)
    const leadResult = await client.query(
      `SELECT id, status, owner_id FROM leads WHERE id = $1 FOR UPDATE`,
      [leadId]
    );

    if (leadResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'Lead not found', code: 'LEAD_NOT_FOUND', status: 404 };
    }

    const lead = leadResult.rows[0];

    // Step 2: เช็ค closed
    if (lead.status === 'closed_won' || lead.status === 'closed_lost') {
      await client.query('ROLLBACK');
      return { error: 'Cannot reassign a closed lead', code: 'LEAD_CLOSED', status: 409 };
    }

    // Step 3: เช็ค to_owner มีจริง + role = sales
    const ownerResult = await client.query(
      `SELECT id, name FROM users WHERE id = $1 AND role = 'sales'`,
      [toOwnerId]
    );

    if (ownerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        error: 'Target user not found or not a sales role',
        code: 'INVALID_TARGET_OWNER',
        status: 404,
      };
    }

    const toOwner = ownerResult.rows[0];
    const fromOwnerId = lead.owner_id;

    // Step 4: UPDATE leads
    await client.query(
      `UPDATE leads SET owner_id = $1, updated_at = NOW() WHERE id = $2`,
      [toOwnerId, leadId]
    );

    // Step 5: INSERT audit log
    const transferResult = await client.query(
      `INSERT INTO lead_transfers (lead_id, from_owner_id, to_owner_id, transferred_by, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING transferred_at`,
      [leadId, fromOwnerId, toOwnerId, transferredBy, reason ?? null]
    );

    await client.query('COMMIT');

    return {
      data: {
        lead_id: leadId,
        from_owner_id: fromOwnerId,
        to_owner: { id: toOwner.id, name: toOwner.name },
        transferred_at: transferResult.rows[0].transferred_at,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}