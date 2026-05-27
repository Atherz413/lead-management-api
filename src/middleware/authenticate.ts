import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ขยาย Request type ให้มี user field
export interface AuthRequest extends Request {
  user?: { id: number; role: string };
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  // ตรวจว่ามี header และขึ้นต้นด้วย "Bearer "
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: number;
      role: string;
    };

    req.user = payload; // แนบ user info เข้า request
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};