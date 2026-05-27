import express from 'express';
import authRouter from './routes/auth';
import leadsRouter from './routes/leads';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes จะ mount ที่นี่ใน D16
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/leads', leadsRouter);
// app.use('/api/v1/users', usersRouter);

export default app;