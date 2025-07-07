import { PrismaClient, Device,   } from '@prisma/client';
import deviceManager from './runtime/devices/deviceManager';
// import alarmManager from './runtime/alarms/alarmmanager';

// Reuse a single PrismaClient instance
const basePrisma = new PrismaClient();



/**
 * Extended Prisma with middleware that intercepts operations on Device, Tag, Alarm.
 */
const prisma = basePrisma.$extends({
  query: {
    device: {
      /**
       * Intercept all device operations: create, update, delete, etc.
       */
      async $allOperations({ operation, args, query }) {
        console.log(`Intercepted operation on Device: ${operation}`);

        let prevDevice: Device | null = null;

        try {
          if (operation === 'update') {
            const deviceId = args.where?.id;
            if (deviceId) {
              // Fetch old device if you still need it:
              prevDevice = await prisma.device.findUnique({
                where: { id: deviceId },
              });
            } else {
              console.warn(
                'No `id` provided in `where` clause for update operation on device.'
              );
            }
          }

          // Execute the original operation
          const result = await query(args);

          if (operation === 'create') {
            const createdDev = result as Device;
            console.log(`Device created with ID: ${createdDev.id}`);
            if (createdDev.enabled) {
              console.log(
                `Initializing polling for new device '${createdDev.name}'...`
              );
              deviceManager.initializeAndPollDevices([createdDev]);
            }
          } else if (operation === 'delete') {
            const deletedDeviceId = args.where?.id;
            if (deletedDeviceId) {
              console.log(`Device deleted with ID: ${deletedDeviceId}`);
              deviceManager.handleDeviceDeleted(deletedDeviceId);
            }
          } else if (operation === 'update') {
            const updatedDev = result as Device;
            if (prevDevice) {
              console.log(`Device updated with ID: ${updatedDev.id}`);
              deviceManager.handleDeviceUpdated(updatedDev, prevDevice);
            } else {
              console.warn(
                `No previous device state found for update. (ID: ${args.where?.id})`
              );
            }
          }

          return result;
        } catch (err) {
          console.error('Error in Prisma device middleware:', err);
          throw err;
        }
      },
    },

   
  
   
    // ... other extended parts: device, tag, alarm
 
   
  },
});

export default prisma;