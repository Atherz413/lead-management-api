import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { getUsers } from '../controllers/users.controller';

const router = Router();

router.get('/', authenticate, authorize('admin'), getUsers);


export default router;