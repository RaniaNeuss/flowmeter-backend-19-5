'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
var logger;

/**
 * Initialize the storage module with a logger
 * @param {*} _logger - Application logger
 */
function init(_logger) {
  logger = _logger; // Save the logger instance
}

/**
 * Clear all alarms from the database
 * @param {boolean} all - If true, clears both `alarms` and `AlarmHistory` tables
 */
export async function clearAlarms(all) {
  try {
    await prisma.alarm.deleteMany(); // Clear alarms
    if (all) {
      await prisma.alarmHistory.deleteMany(); // Clear alarm history
    }
    return true;
  } catch (err) {
    logger.error('alarmsstorage.clearAlarms failed: ' + err.message);
    throw new Error('Failed to clear alarms: ' + err.message);
  }
}












/**
 * Fetch all active alarms from the database
 */
export async function getAlarms() {
  try {
      const alarms = await prisma.alarm.findMany();
      return alarms;
  } catch (err) {
      logger.error('alarmstorage.getAlarms failed: ' + err.message);
      throw new Error('Failed to fetch alarms: ' + err.message);
  }
}



/**
 * Fetch alarm history within a specific time range
 * @param {number} from - Start time for the range (timestamp in milliseconds)
 * @param {number} to - End time for the range (timestamp in milliseconds)
 * @returns {Promise<Array>} - Returns a promise resolving to the alarm history
 */
export async function getAlarmsHistory(from, to) {
  return new Promise(async (resolve, reject) => {
    try {
      const start = from || 0; // Default to 0 if `from` is not provided
      const end = to || Date.now(); // Default to current timestamp if `to` is not provided

      // Fetch the alarm history from the database using Prisma
      const history = await prisma.alarmHistory.findMany({
        where: {
          ontime: {
            gte: new Date(start),
            lte: new Date(end),
          },
        },
        orderBy: {
          ontime: 'desc',
        },
      });

      // Resolve the promise with the fetched rows
      resolve(history);
    } catch (err) {
      console.error('Error fetching alarm history:', err.message);
      reject(new Error('Failed to fetch alarm history: ' + err.message));
    }
  });
}



/**
 * Add or update alarm records in the database
 * @param {Array} alarms - List of alarms to insert or update
 */
/**
 * Upsert alarms in the database using Prisma.
 * - Updates status, ontime, offtime, acktime if alarm exists.
 * - Creates a new alarm if it doesn't exist.
 * - Stores historical data in `chronicle` (optional).
 * - Removes alarms marked for deletion.
 */
async function setAlarms(alarms) {
    if (!alarms || alarms.length === 0) return;

    try {
        // Use Prisma transaction to handle batch operations
        await prisma.$transaction(
            alarms.map(alr => {
                const { name, type, status, ontime, offtime, acktime, toremove } = alr;
                const subproperty = alr.subproperty ? JSON.stringify(alr.subproperty) : "{}";
                const userack = alr.userack || "";
                const grp = alr.subproperty?.group || "";
                const text = alr.subproperty?.text || "";

                if (toremove) {
                    // If the alarm is marked for removal, delete it
                    return prisma.alarm.deleteMany({
                        where: { id: alr.id },
                    });
                }

                // Upsert logic for the `alarms` table
                return prisma.alarm.upsert({
                    where: { id: alr.id }, // Primary key-based upsert
                    update: { status, ontime, offtime, acktime },
                    create: {
                        id: alr.id,
                        name,
                        type,
                        status,
                        ontime,
                        offtime,
                        acktime,
                        subproperty,
                        isEnabled: alr.isEnabled,
                        projectId: alr.projectId || null, // Ensure projectId is set correctly
                    },
                });
            })
        );

        // Insert into `chronicle` for history tracking (optional)
        await prisma.$transaction(
            alarms.map(alr => {
                if (alr.ontime) {
                    return prisma.alarmHistory.upsert({
                        where: {
                            alarmId_ontime: {
                                alarmId: alr.id,
                                ontime: alr.ontime,
                            },
                        },
                        create: {
                            alarmId: alr.id,
                            name: alr.name,
                            type: alr.type,
                            status: alr.status,
                            text,
                            group: grp,
                            ontime: alr.ontime,
                            offtime: alr.offtime,
                            acktime: alr.acktime,
                            userack,
                        },
                        update: {
                            status: alr.status,
                            offtime: alr.offtime,
                            acktime: alr.acktime,
                            userack,
                        },
                    });
                }
            }).filter(Boolean) // Remove `undefined` entries
        );

        console.log("✅ Alarms successfully set in DB.");
    } catch (error) {
        console.error("❌ Error setting alarms:", error);
        throw error;
    }
}


/**
 * Removes an alarm by ID and its associated alarm histories.
 * @param {string} alarmId - The ID of the alarm to be removed.
 * @returns {Promise<void>} Resolves when the alarm and its histories are removed.
 */
export async function removeAlarm(alarmId) {
  try {
    // Delete associated alarm histories
    await prisma.alarmHistory.deleteMany({
      where: { alarmId },
    });

    // Delete the alarm itself
    await prisma.alarm.delete({
      where: { id: alarmId },
    });

    logger.info(`Alarm with ID ${alarmId} removed successfully.`);
  } catch (err) {
    const errorMessage = err?.message || 'Unknown error occurred while removing alarm.';
    logger.error(`Error in removeAlarm: ${errorMessage}`);
    throw new Error(errorMessage);
  }
}









/**
 * Close the Prisma client
 */
export async function close() {
  await prisma.$disconnect();
}

/**
 * Export the module functions
 */
export default {
  init,
  close,
  getAlarms,
  getAlarmsHistory,
  setAlarms,
  clearAlarms,
  removeAlarm,
  
};

