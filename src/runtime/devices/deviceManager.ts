import HTTPClient from '../devices/httprequest/httpClient';
import prisma from '../../prismaClient';
import { EventEmitter } from 'events';
import { io } from '../../server'; // Import the Socket.IO instance
import odbc from 'odbc';
import { writeApi, Point } from '../../influx/influxClient';

import { Client as PgClient } from 'pg';
import sql from 'mssql';

const connectionString = `
  DSN=MasterPiece;
  TrustServerCertificate=yes;
`;

const pollingIntervals: { [deviceId: string]: NodeJS.Timeout } = {};

/**
 * Initialize and poll all enabled devices.
 */
const initializeAndPollDevices = async (devices: any[]) => {
  try {
    if (devices.length == 0) {
      return console.log('No enabled devices found.');
    }

    for (const device of devices) {
      if (device.type === 'WebAPI') {
        initializeWebAPIDevice(device);
      } else if (device.type === 'ODBC') {
        initializeODBCDevice(device);
      }

       else if (device.type === 'database') {
  const tables = await fetchTablesFromDatabase(device);
  console.log(`📋 Tables for device ${device.id}:`, tables);      }
    }
  } catch (deviceErr) {
    console.error(`❌ Failed to initialize devices:`, deviceErr);
  }
};

/**
 * Initialize WebAPI Device
 */
const initializeWebAPIDevice = (device: any) => {
  console.log(`Initializing WebAPI device '${device.name}'...`);

  const property = device.property ? JSON.parse(device.property) : {};
  if (!property.address) {
    console.error(`Device '${device.name}' is missing a valid address.`);
    return;
  }

  const logger = console;
  const events = new EventEmitter();
  const runtime = {};
  const httpClient = HTTPClient.create(
    { name: device.name, property, id: device.id },
    logger,
    events,
    runtime,
    prisma,
    io
  );

  try {
    httpClient.connect(device.id);
    httpClient.load(device);
    startPolling(device, httpClient);
  } catch (error) {
    console.error(`Error initializing WebAPI device '${device.name}':`, error);
  }
};

/**
 * Initialize ODBC Device
 */
const initializeODBCDevice = (device: any) => {
  console.log(`Initializing ODBC device '${device.name}'...`);

  const pollingInterval = device.polling || 900000; // Default to 15 minutes
  startODBCPolling(device, pollingInterval);
};



const fetchTablesFromDatabase = async (device: any): Promise<string[]> => {
  try {
    console.log(`📡 Fetching tables for Device ID: ${device.id}...`);

    const property = device.property ? JSON.parse(device.property) : {};
    const { dbType, host, port, user, password, databaseName } = property;

    if (!dbType || !host || !user || !password || !databaseName) {
      console.error("❌ Missing database credentials.");
      return [];
    }

    if (dbType === 'postgres') {
      const client = new PgClient({
        host,
        port: Number(port),
        user,
        password,
        database: databaseName,
      });

      await client.connect();

      const query = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `;

      console.log(`🔍 Executing PostgreSQL query: ${query}`);
      const result = await client.query(query);
      await client.end();

      const tables = result.rows.map((row) => row.table_name);
      console.log(`✅ Tables found for device ${device.id}:`, tables);
      return tables;
    }

    if (dbType === 'mssql') {
      await sql.connect({
        user,
        password,
        server: host,
        database: databaseName,
        port: Number(port),
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
      });

      const query = `
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE'
      `;

      console.log(`🔍 Executing MSSQL query: ${query}`);
      const result = await sql.query(query);
      const tables = result.recordset.map((row) => row.TABLE_NAME);

      console.log(`✅ Tables found for device ${device.id}:`, tables);
      return tables;
    }

    console.warn(`⚠ Unsupported DB type for device ${device.id}: ${dbType}`);
    return [];
  } catch (err) {
    console.error(`❌ Error fetching tables for device ${device.id}:`, err);
    return [];
  }
};

/**
 * Fetch Data from ODBC
 */
/**
 * Fetch Data from ODBC
 */
const fetchDataFromODBC = async (deviceId: string): Promise<any[]> => {
  try {
    console.log(`🔄 Fetching data for ODBC Device ID: ${deviceId}...`);
    
    const connection = await odbc.connect(connectionString);

    const query = `
      SELECT TOP 10 rawData
      FROM SensorData
      ORDER BY timestamp DESC;
    `;

    console.log(`Executing SQL Query: ${query}`);

    const result = await connection.query(query);
    await connection.close();

    console.log(`✅ Raw data fetched from SQL for Device ID ${deviceId}:`, result);

    const formattedData = result.map((row: any) => ({
      timestamp: new Date().toISOString(),
      station: 'Station_1',
      bay: 'Bay_1',
      flow: 0,
      rawData: row.rawData,
    }));

    console.log(`Formatted Data for InfluxDB:`, JSON.stringify(formattedData, null, 2));

    return formattedData;

  } catch (error) {
    console.error(`❌ Error fetching data from ODBC for Device ID: ${deviceId}:`, error);
    return [];
  }
};


/**
 * Write Data to InfluxDB
 */
const writeDataToInflux = async (data: any[]) => {
  try {
    for (const record of data) {
      try {
        const rawDataArray = JSON.parse(record.rawData);

        for (const entry of rawDataArray) {
          const timestamp = entry.time ? new Date(entry.time).getTime() * 1000000 : Date.now() * 1000000;

          if (isNaN(timestamp)) {
            console.error("Invalid timestamp for entry:", entry);
            continue;
          }

          const point = new Point("accumulated_flow")
            .tag("station", entry.station)
            .tag("bay", entry.bay)
            .floatField("flow", entry.flow)
            .timestamp(timestamp);

          writeApi.writePoint(point);
        }
      } catch (parseError) {
        console.error("Error parsing rawData JSON:", parseError);
      }
    }

    await writeApi.flush();
    console.log("✅ Data successfully written to InfluxDB.");
  } catch (error) {
    // console.error("❌ Error writing data to InfluxDB:", error);
  }
};

/**
 * Start Polling for ODBC Device
 */
const startODBCPolling = (device: any, pollingInterval: number) => {
  console.log(`🚀 Starting ODBC polling for Device ID: ${device.id} every ${pollingInterval / 60000} minutes.`);

  pollingIntervals[device.id] = setInterval(async () => {
    const deviceData = await prisma.device.findUnique({ where: { id: device.id } });

    if (!deviceData || !deviceData.enabled) {
      console.log(`❌ Device ${device.id} is disabled. Stopping polling.`);
      clearInterval(pollingIntervals[device.id]);
      delete pollingIntervals[device.id];
      return;
    }

    const data = await fetchDataFromODBC(device.id);
    if (data.length > 0) {
      await writeDataToInflux(data);
    }
  }, pollingInterval);
};

/**
 * Start polling for WebAPI Device
 */
const startPolling = (device: any, httpClient: any) => {
  const pollingInterval = device.polling || 5000;

  pollingIntervals[device.id] = setInterval(async () => {
    try {
      await httpClient.polling(device.id);
    } catch (error) {
      console.error(`Polling error for WebAPI device '${device.name}':`, error);
    }
  }, pollingInterval);
};

/**
 * Stop polling for a specific device.
 */
const stopPolling = (deviceId: string) => {
  if (pollingIntervals[deviceId]) {
    clearInterval(pollingIntervals[deviceId]);
    delete pollingIntervals[deviceId];
    console.log(`Stopped polling for device: ${deviceId}.`);
  }
};

/**
 * Handle device updates.
 */
const handleDeviceUpdated = async (updatedDevice: any, prevDevice: any) => {
  console.log(`Device updated: ${updatedDevice.name}`);

  if (prevDevice.enabled !== updatedDevice.enabled) {
    if (updatedDevice.enabled) {
      console.log(`Device '${updatedDevice.name}' enabled. Starting polling...`);

      if (updatedDevice.type === 'ODBC') {
        startODBCPolling(updatedDevice, updatedDevice.polling);
      } else if (updatedDevice.type === 'WebAPI') {
        initializeWebAPIDevice(updatedDevice);
      }
    } else {
      stopPolling(updatedDevice.id);
    }
  }

  if (prevDevice.polling !== updatedDevice.polling) {
    console.log(`Polling interval for '${updatedDevice.name}' changed.`);
    stopPolling(updatedDevice.id);

    if (updatedDevice.enabled) {
      if (updatedDevice.type === 'ODBC') {
        startODBCPolling(updatedDevice, updatedDevice.polling);
      } else if (updatedDevice.type === 'WebAPI') {
        initializeWebAPIDevice(updatedDevice);
      }
    }
  }
};

/**
 * Handle device deletion.
 */
const handleDeviceDeleted = (deviceId: string) => {
  console.log(`Device deleted: ${deviceId}`);
  stopPolling(deviceId);
};

export default {
  initializeAndPollDevices,
  handleDeviceUpdated,
  handleDeviceDeleted,
};













