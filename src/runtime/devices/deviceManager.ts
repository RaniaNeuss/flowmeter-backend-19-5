// deviceManager.ts


import HTTPClient from '../devices/httprequest/httpClient';

import prisma from '../../prismaClient';
import { EventEmitter } from 'events';
import { io } from '../../server';
import odbc from 'odbc';
import { writeApi, Point } from '../../influx/influxClient';
import { Client as PgClient } from 'pg';
import sql from 'mssql';

  // Define your DSN value here or retrieve it from configuration/environment
  const dsn = process.env.ODBC_DSN || 'YourDSNName';
  
  const connectionString = `
      DSN=${dsn};
      TrustServerCertificate=yes;
    `;
const pollingIntervals: { [deviceId: string]: NodeJS.Timeout } = {};


export function dataToFlat(data: any): Record<string, string | number | boolean | null> {
  const parseTree = (node: any, parentKey = ''): Record<string, any> => {
    let result: Record<string, any> = {};

    if (Array.isArray(node)) {
      node.forEach((item, idx) => {
        const newKey = parentKey ? `${parentKey}[${idx}]` : `[${idx}]`;
        Object.assign(result, parseTree(item, newKey));
      });
    } else if (node !== null && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        const newKey = parentKey ? `${parentKey}.${key}` : key;
        Object.assign(result, parseTree(node[key], newKey));
      }
    } else {
      result[parentKey] = node;
    }

    return result;
  };

  const flattened = parseTree(data);
  const normalizedData: Record<string, string | number | boolean | null> = {};

  for (const key in flattened) {
    if (!key) continue;
    normalizedData[normalizeKey(key)] = flattened[key];
  }

  return normalizedData;
}
export function normalizeKey(key: string): string {
  return key
    .replace(/:/g, '.')
    .replace(/\[(\d+)\]/g, '.$1');
}
const initializeAndPollDevices = async (devices: any[]) => {
  try {
    if (devices.length === 0) return console.log('No enabled devices found.');
    for (const device of devices) {
      const deviceId = device.id;
      if (device.type === 'WebAPI') {
        initializeWebAPIDevice(device, deviceId);
      } else if (device.type === 'ODBC') {
        initializeODBCDevice(device, deviceId);
      } else if (device.type === 'database') {
        const tables = await fetchTablesFromDatabase(device, deviceId);
        console.log(`📋 Tables for device ${deviceId}:`, tables);
      }
    }
  } catch (err) {
    console.error(`❌ Failed to initialize devices:`, err);
  }
};

const initializeWebAPIDevice = (device: any, deviceId: string) => {
  console.log(`Initializing WebAPI device '${device.name}'...`);
  const property = device.property ? JSON.parse(device.property) : {};
  if (!property.address) return console.error(`Device '${device.name}' missing address.`);

  const logger = console;
  const events = new EventEmitter();
  const runtime = {};
  const httpClient = HTTPClient.create(
    { name: device.name, property, id: deviceId },
    logger,
    events,
    runtime,
    prisma,
    io
  );

  try {
    httpClient.connect(deviceId);
    httpClient.load(device);
    startPolling(deviceId, device, httpClient);
  } catch (error) {
    console.error(`Error initializing WebAPI device '${device.name}':`, error);
  }
};

const initializeODBCDevice = (device: any, deviceId: string) => {
  if (!device.enabled) return console.warn(`⚠️ Device '${device.name}' is disabled.`);
  console.log(`Initializing ODBC device '${device.name}'...`);
  const pollingInterval = device.polling || 900000;
  startODBCPolling(deviceId, pollingInterval);
};

const fetchTablesFromDatabase = async (device: any, deviceId: string): Promise<string[]> => {
  try {
    console.log(`📡 Fetching tables for Device ID: ${deviceId}...`);
    const property = device.property ? JSON.parse(device.property) : {};
    const { dbType, host, port, user, password, databaseName } = property;

    if (!dbType || !host || !user || !password || !databaseName) {
      console.error("❌ Missing DB credentials.");
      return [];
    }

    if (dbType === 'postgres') {
      const client = new PgClient({ host, port: Number(port), user, password, database: databaseName });
      await client.connect();
      const result = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
      await client.end();
      return result.rows.map((row) => row.table_name);
    }

    if (dbType === 'mssql') {
      await sql.connect({
        user, password, server: host, database: databaseName, port: Number(port),
        options: { encrypt: false, trustServerCertificate: true }
      });
      const result = await sql.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`);
      return result.recordset.map((row) => row.TABLE_NAME);
    }

    console.warn(`⚠ Unsupported DB type: ${dbType}`);
    return [];
  } catch (err) {
    console.error(`❌ Error fetching tables for device ${deviceId}:`, err);
    return [];
  }
};


const fetchDataFromODBC = async (
  deviceId: string,
  overrideTables?: string[]
): Promise<{ table: string; rows: any[] }[]> => {
  try {
    console.log(`🔄 Fetching ODBC data for device ${deviceId}...`);

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { tables: true },
    });

    if (!device || !device.enabled) return [];

    const connection = await odbc.connect(connectionString);
    const allResults: { table: string; rows: any[] }[] = [];

    const selectedTables = overrideTables?.length
      ? overrideTables.map(name => ({ tableName: name }))
      : device.tables;

for (const table of selectedTables) {
  const tableName = table.tableName;

  try {
    const columnQuery = `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${tableName}'
    `;
    const columnResult = await connection.query(columnQuery);

    if (!columnResult || columnResult.length === 0) {
      console.warn(`⚠️ No columns found for table '${tableName}'. Skipping.`);
      continue;
    }

    const columnNames = columnResult.map((col: any) => col.COLUMN_NAME).join(", ");
    const query = `SELECT TOP 10 ${columnNames} FROM ${tableName}`;

    console.log(`📥 Executing ODBC query on ${tableName}: ${query}`);
    const result = await connection.query(query);
    allResults.push({ table: tableName, rows: result });

    console.log(`✅ Fetched ${result.length} rows from table '${tableName}'.`);
  } catch (error) {
    console.error(`⚠️ Failed to query table '${tableName}':`, error);
  }
}


    await connection.close();

    if (allResults.length > 0) {
      await writeDataToInflux(allResults, {
        id: device.id,
        enabled: device.enabled,
        tables: selectedTables
      });
    }

    return allResults;
  } catch (error) {
    console.error(`❌ Error in fetchDataFromODBC(${deviceId}):`, error);
    return [];
  }
};


const writeDataToInflux = async (
  data: { table: string; rows: any[] }[],
  device: {
    id: string;
    enabled: boolean;
    tables: { tableName: string }[];
  }
) => {
  if (!device || !device.enabled) {
    console.warn(`⚠️ Skipping InfluxDB write. Device is deleted or disabled.`);
    return;
  }

  try {
    for (const { table, rows } of data) {
      for (const row of rows) {
        const point = new Point(table); // use table name as measurement
        for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'number') {
  point.floatField(key, value);
} else if (typeof value === 'boolean') {
  point.booleanField(key, value);
} else if (typeof value === 'string') {
  // Avoid writing numbers as strings if previously written as numeric
  point.stringField(key, value); // changed from tag()
}
        }
        point.timestamp(Date.now() * 1_000_000);
        writeApi.writePoint(point);
      }
    }

    await writeApi.flush();
    console.log("✅ Data successfully written to InfluxDB.");
  } catch (error) {
    console.error("❌ Error writing data to InfluxDB:", error);
  }
};


function flattenObject(obj: any, prefix = ''): Record<string, any> {
  return Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      Object.assign(acc, flattenObject(v, key));
    } else {
      acc[key] = v;
    }
    return acc;
  }, {} as Record<string, any>);
}

function sanitizeField(row: any): any {
  if (row?.registered?.date && typeof row.registered.date !== 'string') {
    delete row.registered.date;
  }
  if (row?.location?.postcode && typeof row.location.postcode !== 'string') {
    delete row.location.postcode;
  }
  return row;
}

export async function writeWebApiDataToInflux(
  results: { table: string; rows: any[] }[],
  device: any
): Promise<void> {
  for (const { table, rows } of results) {
    try {
      const points = rows.map(rawRow => {
        const row = sanitizeField(rawRow);
        const flat = flattenObject(row);
        const point = new Point(table);
        for (const [key, value] of Object.entries(flat)) {
          if (typeof value === 'number') point.floatField(key, value);
          else if (typeof value === 'string') point.stringField(key, value);
          // You may optionally add .booleanField if needed
        }
        return point;
      });

      writeApi.writePoints(points);
      console.log(`✅ Data written to InfluxDB for table ${table}`);
    } catch (err) {
      console.error(`❌ Error writing ${table} to InfluxDB:`, err);
    }
  }

  try {
    await writeApi.flush();
  } catch (err) {
    console.error('❌ Error flushing InfluxDB data:', err);
  }
}

const fetchDataFromWebAPI = async (deviceId: string): Promise<{ table: string; rows: any[] }[]> => {
  console.log(`🔄 Fetching WebAPI data for device ${deviceId}...`);

  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { tables: true },
  });

  if (!device || !device.enabled) {
    console.warn(`⛔ Device not found or disabled.`);
    return [];
  }

  const property = device.property ? JSON.parse(device.property) : {};
  const address = property.address;
  if (!address) {
    console.warn(`⛔ Missing address for WebAPI device.`);
    return [];
  }

  const results: { table: string; rows: any[] }[] = [];

  for (const table of device.tables) {
    const url = `${address}`; // do not append /table.tableName
    try {
      console.log(`📡 Requesting: ${url}`);
      const res = await fetch(url);

      if (!res.ok) {
        const text = await res.text();
        console.error(`⚠️ HTTP ${res.status} for '${table.tableName}': ${text}`);
        continue;
      }

      let json: any;
      try {
        json = await res.json();
      } catch (parseError) {
        console.error(`⚠️ Failed to parse JSON for '${table.tableName}':`, parseError);
        continue;
      }

      // Accept either an array or an object with `results`
      const rows = Array.isArray(json) ? json : Array.isArray(json.results) ? json.results : null;
      if (rows) {
        results.push({ table: table.tableName, rows });
      } else {
        console.warn(`⚠️ Data for table '${table.tableName}' is not an array or lacks 'results'. Skipping.`);
      }
    } catch (error) {
      console.error(`⚠️ Failed to fetch WebAPI table '${table.tableName}':`, error);
    }
  }

  if (results.length > 0) {
    await writeWebApiDataToInflux(results, {
      id: device.id,
      enabled: device.enabled,
      tables: device.tables
    });
  }

  return results;
};


const startODBCPolling = (deviceId: string, pollingInterval: number) => {
  console.log(`🚀 Starting ODBC polling for Device ID: ${deviceId} every ${pollingInterval / 60000} minutes.`);

  pollingIntervals[deviceId] = setInterval(async () => {
   const deviceData = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { tables: true }, // ✅ include linked tables
    });
    if (!deviceData || !deviceData.enabled) {
      // console.log(`❌ Device ${deviceId} is disabled or deleted. Stopping polling.`);
      stopPolling(deviceId);
      return;
    }

    const data = await fetchDataFromODBC(deviceId);
    const stillExists = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!stillExists || !stillExists.enabled) {
      console.warn(`⛔ Skipping InfluxDB write: Device ${deviceId} was deleted or disabled mid-cycle.`);
      return;
    }

    if (data.length > 0) await writeDataToInflux(data, deviceData);
  }, pollingInterval);
};

const startPolling = (deviceId: string, device: any, httpClient: any) => {
  const pollingInterval: number = device.polling || 5000;

  const interval = setInterval(async () => {
    try {
      const deviceData = await prisma.device.findUnique({
        where: { id: deviceId },
        include: { tables: true },
      });

      if (!deviceData || !deviceData.enabled) {
        console.warn(`❌ Device ${deviceId} is disabled or deleted. Stopping polling.`);
        stopPolling(deviceId);
        clearInterval(interval);
        return;
      }

      const data = await fetchDataFromWebAPI(deviceId);

      const stillExists = await prisma.device.findUnique({
        where: { id: deviceId },
      });

      if (!stillExists || !stillExists.enabled) {
        console.warn(`⛔ Skipping InfluxDB write: Device ${deviceId} was deleted or disabled mid-cycle.`);
        return;
      }

      if (data.length > 0) {
        await writeWebApiDataToInflux(data, deviceData);
      }
    } catch (err) {
      console.error(`Polling error for device ${deviceId}:`, err);
    }
  }, pollingInterval);
};



const stopPolling = (deviceId: string) => {
  if (pollingIntervals[deviceId]) {
    clearInterval(pollingIntervals[deviceId]);
    delete pollingIntervals[deviceId];
    console.log(`Stopped polling for device: ${deviceId}.`);
  }
};

const handleDeviceUpdated = async (updatedDevice: any, prevDevice: any) => {
  const deviceId = updatedDevice.id;
  if (prevDevice.enabled !== updatedDevice.enabled) {
    stopPolling(deviceId);
    if (updatedDevice.enabled) {
      updatedDevice.type === 'ODBC'
        ? startODBCPolling(deviceId, updatedDevice.polling)
        : initializeWebAPIDevice(updatedDevice, deviceId);
    }
  } else if (prevDevice.polling !== updatedDevice.polling) {
    stopPolling(deviceId);
    if (updatedDevice.enabled) {
      updatedDevice.type === 'ODBC'
        ? startODBCPolling(deviceId, updatedDevice.polling)
        : initializeWebAPIDevice(updatedDevice, deviceId);
    }
  }
};

const handleDeviceDeleted = (deviceId: string) => {
  console.log(`Device deleted: ${deviceId}`);
  stopPolling(deviceId);
};

export default {
  initializeAndPollDevices,
    fetchDataFromODBC,
    writeWebApiDataToInflux,
  writeDataToInflux,
  fetchDataFromWebAPI,
  handleDeviceUpdated,
  handleDeviceDeleted,
};
