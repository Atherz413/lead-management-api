import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth';
import leadsRouter from './routes/leads';
import usersRouter from './routes/users';

const app = express();
app.use((req, _res, next) => {
  console.log('>> Request:', req.method, req.path);
  next();
});

const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes จะ mount ที่นี่ใน D16
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/leads', leadsRouter);
app.use('/api/v1/users', usersRouter);

export default app;