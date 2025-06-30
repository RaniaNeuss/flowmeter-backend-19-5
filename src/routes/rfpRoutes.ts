// routes/rfpRoutes.ts

import { Router } from 'express';
import {
  createFullRfp,
  getFilteredRfps,
  getFullRfps,
  getRfpById,getFileById,
 updateFile, deleteFile,
  deleteRfp,uploadFile,getDashboardStats,getFilesByRfpId,updateFullRfp
} from '../controllers/rfpController';
import { authenticateUser } from "../lib/authMiddleware";
import { authorizeRoles } from '../lib/authorizeRoles';
import { checkTablePermission} from '../lib/checkTablePermission';

// import { authorizePermissions } from '../lib//authorizePermissions';
import multer from 'multer';
const router = Router();
// Create a new RFP
router.post('/create',authenticateUser,  createFullRfp);

// Get all RFPs
router.get('/full',authenticateUser,checkTablePermission("Rfp", "canRead"),   getFullRfps);
router.get("/dashboard", authenticateUser, getDashboardStats);

router.patch('/attachment/:id',authenticateUser, updateFile);
router.delete('/attachment/:id',authenticateUser, deleteFile);

// Get RFP by ID
router.get('/:id', authenticateUser, getRfpById);

// Filter RFPs
router.post('/filter', authenticateUser, getFilteredRfps);

// Patch (update) RFP by ID
router.patch('/:id',authenticateUser, updateFullRfp);

// Delete RFP by ID
router.delete('/:id',authenticateUser, deleteRfp);
// router.put('/:id', authenticateUser, updateFullRfp);

const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.any(), uploadFile);
router.get('/attachments/by-rfp/:rfpId',authenticateUser, getFilesByRfpId);
router.get('/files/:id',authenticateUser, getFileById);

export default router;
