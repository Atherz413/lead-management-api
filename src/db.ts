import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;

const pool = new Pool({ connectionString });

export const query = (text: string, params?: unknown[]) =>
  pool.query(text, params);

export const end = () => pool.end();

export default pool;