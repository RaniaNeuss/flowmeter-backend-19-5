// routes/rfpRoutes.ts

import { Router } from 'express';
import {
  createFullRfp,
  getFilteredRfps,
  getFullRfps,
  getRfpById,
  patchRfp, updateFile, deleteFile,
  deleteRfp,uploadFile,getFilesByRfpId
} from '../controllers/rfpController';
import { authenticateUser } from "../lib/authMiddleware";
import { authorizeRoles } from '../lib/authorizeRoles';
import { authorizePermissions } from '../lib//authorizePermissions';
import multer from 'multer';
const router = Router();
// Create a new RFP
router.post('/create',authenticateUser, authorizeRoles('SuperAdmin'),  createFullRfp);

// Get all RFPs
router.get('/full',authenticateUser, authorizeRoles('SuperAdmin'),  getFullRfps);

router.patch('/attachment/:id',authenticateUser, authorizeRoles('SuperAdmin'), updateFile);
router.delete('/attachment/:id',authenticateUser, authorizeRoles('SuperAdmin'), deleteFile);

// Get RFP by ID
router.get('/:id', authenticateUser, getRfpById);

// Filter RFPs
router.post('/filter', authenticateUser, getFilteredRfps);

// Patch (update) RFP by ID
router.patch('/:id',authenticateUser, authorizeRoles('SuperAdmin'), patchRfp);

// Delete RFP by ID
router.delete('/:id',authenticateUser, authorizeRoles('SuperAdmin'), deleteRfp);
// router.put('/:id', authenticateUser, updateFullRfp);

const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.any(), uploadFile);
router.get('/attachments/by-rfp/:rfpId',authenticateUser, authorizeRoles('SuperAdmin'), getFilesByRfpId);

export default router;
