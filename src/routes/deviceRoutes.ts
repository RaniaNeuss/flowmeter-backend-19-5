import { Router } from 'express';
import {
    createDevice, connectODBCAndFetchData,
     editDevice,deleteDevice,getDeviceById,getAllDevices, testDeviceConnection,testWebAPIConnection,deleteManyDevices,deleteAllDevices
} from '../controllers/deviceController';
import { authenticateUser } from "../lib/authMiddleware";
import { authorizeRoles } from '../lib/authorizeRoles';
const router = Router();
// Create a new device
router.post('/create', createDevice); // POST /api/devices/create
router.post("/testconnection", testWebAPIConnection);
router.post("/test-connection", testDeviceConnection);
router.post('/odbc-connect', connectODBCAndFetchData);
// Edit an existing device
 router.put('/:id', editDevice); // PUT /api/devices/edit/:id
 router.get('/', getAllDevices); 
 router.get('/:id', getDeviceById); 
 router.delete('/delete-many', deleteManyDevices); 
 router.delete('/remove-all', deleteAllDevices);
 router.delete('/:id', deleteDevice);


export default router;
