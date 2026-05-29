import { Request, Response, NextFunction } from 'express';
import { query } from '../db';
import { AuthRequest } from '../middleware/authenticate';
import { assignLead } from '../services/leads.service';

export const getLeads = async (req: AuthRequest, res: Response): Promise<void> => {
  const { status, source, page = '1', limit = '20' } = req.query as Record<string, string>;

  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset = (pageNum - 1) * limitNum;

  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // sales เห็นแค่ lead ของตัวเอง
    if (req.user?.role === 'sales') {
      conditions.push(`l.owner_id = $${paramIndex++}`);
      params.push(req.user.id);
    }

    if (status) {
      conditions.push(`l.status = $${paramIndex++}`);
      params.push(status);
    }

    if (source) {
      conditions.push(`l.source = $${paramIndex++}`);
      params.push(source);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataResult = await query(
      `SELECT l.id, l.name, l.phone, l.source, l.status, l.created_at,
              u.id as owner_id, u.name as owner_name
       FROM leads l
       LEFT JOIN users u ON l.owner_id = u.id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limitNum, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM leads l ${where}`,
      params
    );

    res.json({
      data: dataResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        source: row.source,
        status: row.status,
        owner: row.owner_id ? { id: row.owner_id, name: row.owner_name } : null,
        created_at: row.created_at,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: parseInt(countResult.rows[0].count),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createLead = async (req: Request, res: Response): Promise<void> => {
  const { name, phone, email, source, owner_id, note } = req.body;

  try {
    const result = await query(
      `INSERT INTO leads (name, phone, email, source, owner_id, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, status, created_at`,
      [name, phone, email, source, owner_id || null, note || null]
    );

    const lead = result.rows[0];

    // ดึง owner name ถ้ามี
    let owner = null;
    if (owner_id) {
      const ownerResult = await query('SELECT id, name FROM users WHERE id = $1', [owner_id]);
      if (ownerResult.rows[0]) owner = ownerResult.rows[0];
    }

    res.status(201).json({
      data: { ...lead, owner },
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getLeadById = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const result = await query(
      `SELECT l.*, u.id as owner_id, u.name as owner_name
       FROM leads l
       LEFT JOIN users u ON l.owner_id = u.id
       WHERE l.id = $1`,
      [id]
    );

    const lead = result.rows[0];

    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    // sales เห็นแค่ lead ของตัวเอง
    if (req.user?.role === 'sales' && lead.owner_id !== req.user.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // ดึง transfer history
    const transferResult = await query(
      `SELECT lt.*,
              f.name as from_name, t.name as to_name, b.name as by_name
       FROM lead_transfers lt
       LEFT JOIN users f ON lt.from_owner_id = f.id
       JOIN users t ON lt.to_owner_id = t.id
       JOIN users b ON lt.transferred_by = b.id
       WHERE lt.lead_id = $1
       ORDER BY lt.transferred_at ASC`,
      [id]
    );

    res.json({
      data: {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        source: lead.source,
        status: lead.status,
        note: lead.note,
        owner: lead.owner_id ? { id: lead.owner_id, name: lead.owner_name } : null,
        created_at: lead.created_at,
        updated_at: lead.updated_at,
        transfer_history: transferResult.rows.map(t => ({
          from: t.from_owner_id ? { id: t.from_owner_id, name: t.from_name } : null,
          to: { id: t.to_owner_id, name: t.to_name },
          transferred_by: { id: t.transferred_by, name: t.by_name },
          reason: t.reason,
          transferred_at: t.transferred_at,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export async function assignLeadController(req: Request, res: Response, next: NextFunction) {
  try {
    const leadId = parseInt(req.params.id as string);
    const { to_owner_id, reason } = req.body;
    const transferredBy = (req as any).user.id;

    const result = await assignLead({
      leadId,
      toOwnerId: to_owner_id,
      transferredBy,
      reason,
    });

    if (result.error) {
      return res.status(result.status!).json({
        error: result.error,
        code: result.code,
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateLeadController(req: Request, res: Response, next: NextFunction) {
  try {
    const leadId = parseInt(req.params.id as string);
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const { status, note } = req.body;

    // เช็คว่า lead มีอยู่จริง + เช็ค ownership ถ้าเป็น sales
    const leadResult = await query(
      `SELECT id, owner_id FROM leads WHERE id = $1`,
      [leadId]
    );

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found', code: 'LEAD_NOT_FOUND' });
    }

    const lead = leadResult.rows[0];

    // sales แก้ได้แค่ lead ของตัวเอง
    if (userRole === 'sales' && lead.owner_id !== userId) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    if (status !== undefined && !['new', 'contacted', 'qualified', 'closed_won', 'closed_lost'].includes(status)) {
      return res.status(400).json({ error: ' Invalid status value', code: 'INVALID_STATUS'});
    }

    // build SET clause เฉพาะ field ที่ส่งมา
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(status);
    }
    if (note !== undefined) {
      fields.push(`note = $${idx++}`);
      values.push(note);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update', code: 'NO_FIELDS' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(leadId);

    const result = await query(
      `UPDATE leads SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, status, note, updated_at`,
      values
    );
    
    return res.status(200).json({
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
}