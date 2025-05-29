// routes/rfpRoutes.ts

import { Router } from 'express';
import {
  createFullRfp,
  getFilteredRfps,
  getFullRfps,
  getRfpById,
  patchRfp,
  deleteRfp,uploadFile
} from '../controllers/rfpController';
import { authenticateUser } from '../lib/authMiddleware';
import multer from 'multer';
const router = Router();
// Create a new RFP
router.post('/create',  createFullRfp);

// Get all RFPs
router.get('/full',  getFullRfps);

// Get RFP by ID
router.get('/:id', authenticateUser, getRfpById);

// Filter RFPs
router.post('/filter', authenticateUser, getFilteredRfps);

// Patch (update) RFP by ID
router.patch('/:id', authenticateUser, patchRfp);

// Delete RFP by ID
router.delete('/:id', authenticateUser, deleteRfp);

const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.any(), uploadFile);
export default router;
