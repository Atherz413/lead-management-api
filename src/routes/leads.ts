import { Router } from 'express';
import { getLeads, createLead, getLeadById } from '../controllers/leads.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { assignLeadController } from '../controllers/leads.controller';
import { updateLeadController } from '../controllers/leads.controller';

const router = Router();

router.get('/', authenticate, getLeads);
router.post('/', authenticate, authorize('admin'), createLead);
router.get('/:id', authenticate, getLeadById);
router.patch(
  '/:id/assign',
  authenticate,
  authorize('admin'),
  assignLeadController
);
router.patch('/:id', authenticate, updateLeadController);

export default router;