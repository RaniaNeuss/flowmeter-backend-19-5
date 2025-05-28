import { saveAccumulatedFlow , } from "../controllers/Saveinfluxdb";
import { saveInfluxDataToSQL } from "../controllers/Saveinfluxdb";
import { Router } from 'express';
const router = Router();
router.post('/flow', saveAccumulatedFlow); // Store accumulated flow
router.post('/influx-to-sql', saveInfluxDataToSQL);

export default router;