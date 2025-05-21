// routes/rfpRoutes.ts

import { Router } from 'express';
import {
  createFullRfp,
  getFilteredRfps,
  getFullRfps,
  getRfpById,
  patchRfp,
  deleteRfp,
} from '../controllers/rfpController';
import { authenticateUser } from '../lib/authMiddleware';
import { catchAsync } from '../utils/catchAsync';

const router = Router();
// Create a new RFP
router.post('/create',  createFullRfp);

// Get all RFPs
router.get('/full', authenticateUser, getFullRfps);

// Get RFP by ID
router.get('/:id', authenticateUser, getRfpById);

// Filter RFPs
router.post('/filter', authenticateUser, getFilteredRfps);

// Patch (update) RFP by ID
router.patch('/:id', authenticateUser, patchRfp);

// Delete RFP by ID
router.delete('/:id', authenticateUser, deleteRfp);

export default router;
