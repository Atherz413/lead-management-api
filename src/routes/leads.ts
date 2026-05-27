import { Router } from 'express';
import { getLeads, createLead, getLeadById } from '../controllers/leads.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.get('/', authenticate, getLeads);
router.post('/', authenticate, authorize('admin'), createLead);
router.get('/:id', authenticate, getLeadById);

export default router;