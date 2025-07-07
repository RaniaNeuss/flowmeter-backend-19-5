import { Router } from 'express';
import {
    createDevice,
     editDevice,deleteDevice,getDeviceById,getAllDevices,fetchAndWriteToInflux,getDeviceTableFeilds, getDeviceTables, getDeviceTableData , testDeviceConnection,testWebAPIConnection,deleteManyDevices,deleteAllDevices
} from '../controllers/deviceController';
import { authenticateUser } from "../lib/authMiddleware";
import { authorizeRoles } from '../lib/authorizeRoles';
import { filterFieldsByPermission} from '../lib/filterFieldsByPermission';
import { checkTablePermission} from '../lib/checkTablePermission';
const router = Router();
// Create a new device
router.post('/create',authenticateUser,checkTablePermission("Devices", "canCreate"),createDevice); // POST /api/devices/create
router.post("/testconnection", testWebAPIConnection);
router.post("/test-connection", testDeviceConnection);
router.post('/:id/fetch-and-write', fetchAndWriteToInflux);

// Edit an existing device
 router.put('/:id',authenticateUser,checkTablePermission("Devices", "canUpdate"),editDevice); // PUT /api/devices/edit/:id
 router.get('/',authenticateUser,checkTablePermission("Devices", "canRead"), getAllDevices); 
 router.get('/:id', getDeviceById); 
 router.delete('/delete-many', deleteManyDevices); 
 router.delete('/remove-all', deleteAllDevices);
 router.delete('/:id',authenticateUser,checkTablePermission("Devices", "canDelete"), deleteDevice);
router.get('/:deviceId/tables', getDeviceTables);
router.get('/:deviceId/tables/:tableName/data', getDeviceTableData);
router.post('/:deviceId/tables/:tableName/data', getDeviceTableFeilds);

export default router;
