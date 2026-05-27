import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../db';

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  try {
    // Step 2: ดึง user จาก DB ด้วย email
    const result = await query(
      'SELECT id, name, email, role, password_hash FROM users WHERE email = $1',
      [email]
    );

   //console.log('user found:', result.rows[0]);
    const user = result.rows[0];

    // Step 3: ถ้าไม่เจอ user → 401
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Step 4: เปรียบเทียบ password กับ hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    //console.log('isMatch:', isMatch);

    // Step 5: ถ้าไม่ตรง → 401
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Step 6: สร้าง JWT
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '24h' }
    );

    // Step 7: ส่งกลับ
    res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};