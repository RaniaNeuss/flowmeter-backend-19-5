// routes/rfpRoutes.ts

import { Router } from 'express';
import {
  createFullRfp,
  getFilteredRfps,
  getFullRfps,
  getRfpById,
  patchRfp, updateFile, deleteFile,
  deleteRfp,uploadFile
} from '../controllers/rfpController';


import { authenticateUser } from '../lib/authMiddleware';
import multer from 'multer';
const router = Router();
// Create a new RFP
router.post('/create',  createFullRfp);

// Get all RFPs
router.get('/full',  getFullRfps);

router.patch('/attachment/:id', authenticateUser, updateFile);
router.delete('/attachment/:id', authenticateUser, deleteFile);

// Get RFP by ID
router.get('/:id', authenticateUser, getRfpById);

// Filter RFPs
router.post('/filter', authenticateUser, getFilteredRfps);

// Patch (update) RFP by ID
router.patch('/:id', authenticateUser, patchRfp);

// Delete RFP by ID
router.delete('/:id', authenticateUser, deleteRfp);
// router.put('/:id', authenticateUser, updateFullRfp);

const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.any(), uploadFile);
export default router;
