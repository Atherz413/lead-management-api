import { Response, NextFunction } from 'express';
import { query } from '../db';
import { AuthRequest } from '../middleware/authenticate';

export async function getUsers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await query(`
      SELECT u.id, u.name, u.role, COUNT(l.id) FILTER (WHERE l.status NOT IN ('closed_won', 'closed_lost')) as active_leads_count
        FROM users u
        LEFT JOIN leads l ON l.owner_id = u.id
        WHERE u.role = 'sales'
        GROUP BY u.id
    `);

    res.json({
      data: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        role: row.role,
        active_leads_count: parseInt(row.active_leads_count)
      })),
    });
  } catch (err) {
    next(err);
  }
}