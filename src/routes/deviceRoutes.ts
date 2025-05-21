import { Router } from 'express';
import {
    createDevice, connectODBCAndFetchData,
     editDevice,deleteDevice,getDeviceById,getAllDevices,testWebAPIConnection,deleteManyDevices,deleteAllDevices
} from '../controllers/deviceController';
import { authenticateUser } from "../lib/authMiddleware";
import { authorizeRoles } from '../lib/authorizeRoles';
const router = Router();

// Create a new device
router.post('/create',authenticateUser, createDevice); // POST /api/devices/create
// router.post('/create',authenticateUser,authorizeRoles(['SuperAdmin']), createDevice); // POST /api/devices/create

router.post("/testconnection", testWebAPIConnection);


// Edit an existing device
 router.put('/:id',authenticateUser, editDevice); // PUT /api/devices/edit/:id
//  router.put('/:id',authenticateUser,authorizeRoles(['SuperAdmin']), editDevice); // PUT /api/devices/edit/:id

 router.get('/',authenticateUser, getAllDevices); 
//  router.get('/',authenticateUser,authorizeRoles(['SuperAdmin']), getAllDevices); 

 router.get('/:id',authenticateUser, getDeviceById); 
//  router.get('/:id',authenticateUser,authorizeRoles(['SuperAdmin']), getDeviceById); 

 router.delete('/delete-many', deleteManyDevices); 
 router.delete('/remove-all', deleteAllDevices);
 router.delete('/:id',authenticateUser,authorizeRoles(['SuperAdmin']), deleteDevice);

router.post('/odbc-connect', connectODBCAndFetchData);

// router.post('/poll-sql-to-influx', pollSQLToInflux);










export default router;
