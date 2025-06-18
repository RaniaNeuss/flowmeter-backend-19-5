import { Router } from 'express';
import {
    createDevice, connectODBCAndFetchData,
     editDevice,deleteDevice,getDeviceById,getAllDevices,testWebAPIConnection,deleteManyDevices,deleteAllDevices
} from '../controllers/deviceController';
import { authenticateUser } from "../lib/authMiddleware";
import { authorizeRoles } from '../lib/authorizeRoles';
const router = Router();
// Create a new device
router.post('/create', createDevice); // POST /api/devices/create
router.post("/testconnection", testWebAPIConnection);
// Edit an existing device
 router.put('/:id', editDevice); // PUT /api/devices/edit/:id
 router.get('/', getAllDevices); 
 router.get('/:id', getDeviceById); 
 router.delete('/delete-many', deleteManyDevices); 
 router.delete('/remove-all', deleteAllDevices);
 router.delete('/:id', deleteDevice);
router.post('/odbc-connect', connectODBCAndFetchData);

export default router;
