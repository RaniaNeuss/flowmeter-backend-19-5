import { Router } from 'express';
import {
    createDevice, connectODBCAndFetchData,
     editDevice,deleteDevice,getDeviceById,getAllDevices, getDeviceTables, getDeviceTableData , testDeviceConnection,testWebAPIConnection,deleteManyDevices,deleteAllDevices
} from '../controllers/deviceController';
import { authenticateUser } from "../lib/authMiddleware";
import { authorizeRoles } from '../lib/authorizeRoles';
import { authorizePermissions } from '../lib//authorizePermissions';

const router = Router();
// Create a new device
router.post('/create',authenticateUser, authorizeRoles('SuperAdmin'), createDevice); // POST /api/devices/create
router.post("/testconnection", testWebAPIConnection);
router.post("/test-connection", testDeviceConnection);
router.post('/odbc-connect', connectODBCAndFetchData);
// Edit an existing device
 router.put('/:id',authenticateUser, authorizeRoles('SuperAdmin'), editDevice); // PUT /api/devices/edit/:id
 router.get('/',authenticateUser, authorizeRoles('SuperAdmin'), getAllDevices); 
 router.get('/:id', getDeviceById); 
 router.delete('/delete-many', deleteManyDevices); 
 router.delete('/remove-all', deleteAllDevices);
 router.delete('/:id',authenticateUser, authorizeRoles('SuperAdmin'), deleteDevice);
router.get('/:deviceId/tables', getDeviceTables);
router.get('/:deviceId/tables/:tableName/data', getDeviceTableData);

export default router;
