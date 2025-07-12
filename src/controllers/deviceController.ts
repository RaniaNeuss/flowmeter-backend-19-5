
import { Request, Response } from 'express';
import prisma from '../prismaClient';
import deviceManager from '../runtime/devices/deviceManager';
import odbc from 'odbc';
import axios from 'axios';
import mysql from 'mysql2/promise';
import { Client as PgClient } from 'pg';
import sql from 'mssql';
export const createDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, type, description, property, enabled = true, polling, tables = [] } = req.body;

    if (!name) {
      return void res.status(400).json({ error: "Device name is required" });
    }

    const existingDevice = await prisma.device.findUnique({ where: { name } });
    if (existingDevice) {
      return void res.status(400).json({ error: "Device with the same name already exists" });
    }

    const newDevice = await prisma.device.create({
      data: {
        name,
        type,
        description,
        property: JSON.stringify(property),
        enabled,
        polling,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log(`Device '${newDevice.name}' created.`);

    if (!enabled) {
      return void res.status(201).json(newDevice);
    }

    const deviceType = type?.toLowerCase();
    if (!deviceType) {
      return void res.status(400).json({ error: "Device type is missing or invalid" });
    }

    const deviceId = newDevice.id;

    // Save table metadata
    if (deviceType === "webapi") {
      const exists = await prisma.deviceTable.findFirst({ where: { deviceId, tableName: name } });
      if (!exists) {
        await prisma.deviceTable.create({ data: { deviceId, tableName: name } });
      }
    } else if (deviceType === "database" || deviceType === "odbc") {
      const existingTables = await prisma.deviceTable.findMany({ where: { deviceId } });
      const existingNames = existingTables.map(t => t.tableName);
      const newTableNames = tables.filter((t: string) => !existingNames.includes(t));

      if (newTableNames.length > 0) {
        await prisma.deviceTable.createMany({
          data: newTableNames.map((tableName: string) => ({ deviceId, tableName })),
        });
      }
    }

    // Fetch & Write to Influx
    let data: { table: string; rows: any[] }[] = [];

    if (deviceType === "webapi") {
      const parsed = JSON.parse(newDevice.property || "{}");
      if (!parsed.address) {
        return void res.status(400).json({ error: "Missing WebAPI address in device property" });
      }

      const response = await fetch(parsed.address);
      const json = await response.json();

      data = Array.isArray(json)
        ? [{ table: name, rows: json }]
        : typeof json === "object"
        ? [{ table: name, rows: [json] }]
        : [];

      if (data.length === 0) {
        return void res.status(500).json({ error: "Unsupported WebAPI response format" });
      }

      await deviceManager.writeWebApiDataToInflux(data, {
        id: deviceId,
        enabled,
        tables: [{ tableName: name }],
      });

    } else if (deviceType === "database" || deviceType === "odbc") {
      data = await deviceManager.fetchDataFromODBC(deviceId, tables);
      await deviceManager.writeDataToInflux(data, {
        id: deviceId,
        enabled,
        tables: tables.map((tableName: string) => ({ tableName })),
      });
    }

    res.status(201).json({ message: "✅ Device created and data written to Influx", device: newDevice, data });
  } catch (error: any) {
    console.error("❌ Error creating device:", error);
    res.status(500).json({ error: "Failed to create device", message: error.message });
  }
};

// export const createDevice = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const {  name, type, description, property, enabled = true, polling } = req.body;

//     // Validate common fields
//     if (!name ) {
//       res.status(400).json({ error: "Device name is required" });
//     }

//     // Check for duplicate device
//   const existingDevice = await prisma.device.findUnique({ where: { name } });
//     if (existingDevice) {
//       console.error("Device with the same name already exists.");
//       res.status(400).json({ error: "Device with the same name already exists" });
//       return;
//     }

//     // Save device to the database
//     const newDevice = await prisma.device.create({
//       data: {
       
//         name,
//         type,
//         description,
//         property: JSON.stringify(property),
//         enabled,
//         polling,
//         createdAt: new Date(),
//         updatedAt: new Date(),
//       },
//     });

//     console.log(`Device '${newDevice.name}' created.`);

//     // Notify the device manager to initialize the device
//     if (enabled) {
//       deviceManager.initializeAndPollDevices([newDevice]);
//     }

//     res.status(201).json(newDevice);

//   } catch (error) {
//     console.error("Error creating device:", error);
//     res.status(500).json({ error: "Failed to create device" });
//   }
// };

export const getDeviceTables = async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const device = await prisma.device.findUnique({ where: { id: deviceId } });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
       return;
    }

    const property = device.property ? JSON.parse(device.property) : {};
    const { dbType, host, port, user, password, databaseName } = property;

    if (!dbType || !host || !user || !password || !databaseName) {
       res.status(400).json({ error: 'Missing database credentials in device config.' });
      
    }

    let tables: string[] = [];

    if (dbType === 'postgres') {
      const client = new PgClient({ host, port: Number(port), user, password, database: databaseName });
      await client.connect();

      const result = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
      tables = result.rows.map((row) => row.table_name);
      await client.end();
    } else if (dbType === 'mssql') {
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

      const result = await sql.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`);
      tables = result.recordset.map((row: any) => row.TABLE_NAME);
    } else {
      res.status(400).json({ error: `Unsupported dbType '${dbType}'` });
       return;
    }

    res.status(200).json({ tables });
  } catch (err: any) {
    console.error("❌ Error getting device tables:", err);
    res.status(500).json({ error: 'Failed to fetch tables.', details: err.message });
  }
};

export const getDeviceTableData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceId, tableName } = req.params;
    const device = await prisma.device.findUnique({ where: { id: deviceId } });

    if (!device) {
     res.status(404).json({ error: 'Device not found' });
      return ;
    }

    const property = device.property ? JSON.parse(device.property) : {};
    const { dbType, host, port, user, password, databaseName } = property;

    if (!dbType || !host || !user || !password || !databaseName) {
       res.status(400).json({ error: 'Missing database credentials in device config.' });
       return;
    }

    if (!tableName) {
       res.status(400).json({ error: 'Table name is required.' });
       return;
    }

    let data: any[] = [];

    if (dbType === 'postgres') {
      const client = new PgClient({ host, port: Number(port), user, password, database: databaseName });
      await client.connect();
      const result = await client.query(`SELECT * FROM "${tableName}"`);
      data = result.rows;
      await client.end();
    } else if (dbType === 'mssql') {
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

      const result = await sql.query(`SELECT * FROM [${tableName}]`);
      data = result.recordset;
    } else {
      res.status(400).json({ error: `Unsupported dbType '${dbType}'` });
      return ;
    }

    res.status(200).json({ table: tableName, rowCount: data.length, data });
  } catch (err: any) {
    console.error("❌ Error fetching table data:", err);
    res.status(500).json({ error: 'Failed to fetch table data.', details: err.message });
  }
};

export const getDeviceTableFeilds = async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceId, tableName } = req.params;
    const { fields } = req.body; // Now coming from POST body

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return void res.status(404).json({ error: 'Device not found' });

    const property = device.property ? JSON.parse(device.property) : {};
    const { dbType, host, port, user, password, databaseName } = property;

    if (!dbType || !host || !user || !password || !databaseName) {
      return void res.status(400).json({ error: 'Missing database credentials in device config.' });
    }

    if (!tableName) {
      return void res.status(400).json({ error: 'Table name is required.' });
    }

    let data: any[] = [];
    let selectedFields = '*';

    if (fields && Array.isArray(fields) && fields.length > 0) {
      const cleanFields = fields
        .map((f: string) => f.trim())
        .filter(Boolean)
        .map(f => dbType === 'postgres' ? `"${f}"` : `[${f}]`)
        .join(', ');
      selectedFields = cleanFields;
    }

    if (dbType === 'postgres') {
      const client = new PgClient({ host, port: Number(port), user, password, database: databaseName });
      await client.connect();
      const result = await client.query(`SELECT ${selectedFields} FROM "${tableName}"`);
      data = result.rows;
      await client.end();
    } else if (dbType === 'mssql') {
      await sql.connect({
        user,
        password,
        server: host,
        database: databaseName,
        port: Number(port),
        options: { encrypt: false, trustServerCertificate: true },
      });
      const result = await sql.query(`SELECT ${selectedFields} FROM [${tableName}]`);
      data = result.recordset;
    } else {
      return void res.status(400).json({ error: `Unsupported dbType '${dbType}'` });
    }

    res.status(200).json({ table: tableName, rowCount: data.length, data });
  } catch (err: any) {
    console.error("❌ Error fetching table data:", err);
    res.status(500).json({ error: 'Failed to fetch table data.', details: err.message });
  }
};

// export const testDeviceConnection = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { type, property } = req.body;

//     if (!type || !property) {
//       return void res.status(400).json({ error: "Both 'type' and 'property' are required." });
//     }

//     if (type === "WebAPI") {
//       const { address, method = "GET" } = property;
//       if (!address) {
//         return void res.status(400).json({ error: "API address is required for WebAPI devices." });
//       }

//       try {
//         const response = await axios({ url: address, method });
//         if (response.status >= 200 && response.status < 300) {
//           return void res.status(200).json({ message: "WebAPI connection successful." });
//         } else {
//           return void res.status(500).json({ error: `WebAPI responded with status ${response.status}` });
//         }
//       } catch (err) {
//         return void res.status(500).json({ error: "WebAPI connection failed.", details: (err as Error).message });
//       }
//     }

//     if (type === "ODBC") {
//       const { dsn } = property;
//       if (!dsn) {
//         return void res.status(400).json({ error: "DSN is required for ODBC connection." });
//       }

//       try {
//         const connection = await odbc.connect(`DSN=${dsn};TrustServerCertificate=yes;`);
//         await connection.close();
//         return void res.status(200).json({ message: "ODBC connection successful." });
//       } catch (err: any) {
//         return void res.status(500).json({ error: "ODBC connection failed.", details: err.message });
//       }
//     }

//     if (type === "database") {
//       const { dbType, host, port, user, password, databaseName } = property;
//       if (!dbType || !host || !port || !user || !password || !databaseName) {
//         return void res.status(400).json({ error: "Missing database connection fields." });
//       }

//       if (dbType === "postgres") {
//         try {
//           const client = new PgClient({ host, port: Number(port), user, password, database: databaseName });
//           await client.connect();
//           const result = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
//           const tables = result.rows.map(row => row.table_name);
//           await client.end();
//           return void res.status(200).json({ message: "PostgreSQL connected.", tables });
//         } catch (err: any) {
//           return void res.status(500).json({ error: "PostgreSQL connection failed.", details: err.message });
//         }
//       }

//       if (dbType === "mssql") {
//         try {
//           await sql.connect({
//             user,
//             password,
//             server: host,
//             database: databaseName,
//             port: Number(port),
//             options: {
//               encrypt: false,
//               trustServerCertificate: true,
//             },
//           });

//           const result = await sql.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`);
//           const tables = result.recordset.map((row: any) => row.TABLE_NAME);
//           return void res.status(200).json({ message: "MSSQL connected.", tables });
//         } catch (err: any) {
//           return void res.status(500).json({ error: "MSSQL connection failed.", details: err.message });
//         }
//       }

//       return void res.status(400).json({ error: `Unsupported dbType '${dbType}'. Use 'postgres' or 'mssql'.` });
//     }

//     return void res.status(400).json({ error: `Unsupported type '${type}'. Use 'WebAPI', 'ODBC', or 'database'.` });
//   } catch (err: any) {
//     console.error("❌ testDeviceConnection error:", err);
//     res.status(500).json({ error: "Internal server error.", details: err.message });
//   }
// };







// export const fetchAndWriteToInflux = async (req: Request, res: Response): Promise<void> => {
//   const deviceId = req.params.id;
//   const { tables = [] } = req.body;

//   const device = await prisma.device.findUnique({
//     where: { id: deviceId },
//     include: { tables: true }
//   });

//   if (!device || !device.enabled) {
//     return void res.status(404).json({ error: "Device not found or disabled" });
//   }

//   // Validate 'tables' only if the device is database/odbc
//   if ((device.type === "database" || device.type === "ODBC") && (!Array.isArray(tables) || tables.length === 0)) {
//     return void res.status(400).json({ error: "No table names provided" });
//   }

//   // Save new tables for ODBC/DB devices
//   if (device.type === "database" || device.type === "ODBC") {
//     const existingTableNames = device.tables.map(t => t.tableName);
// const newTables = tables.filter((name: string) => !existingTableNames.includes(name));

//     if (newTables.length > 0) {
//       await prisma.deviceTable.createMany({
// data: newTables.map((tableName: string) => ({ deviceId, tableName }))
//       });
//     }
//   }

//   // Fetch data based on device type
//   let data: { table: string; rows: any[] }[] = [];

//   try {
//     if (device.type === "WebAPI") {
//       const property = device.property ? JSON.parse(device.property) : {};
//       const address = property.address;
//       if (!address) {
//         return void res.status(400).json({ error: "Missing WebAPI address in device property" });
//       }

//       const response = await fetch(address);
//       const json = await response.json();

//       if (typeof json === "object" && !Array.isArray(json)) {
//         data = [{ table: device.name, rows: [json] }];
//       } else if (Array.isArray(json)) {
//         data = [{ table: device.name, rows: json }];
//       } else {
//         return void res.status(500).json({ error: "Unsupported WebAPI response format" });
//       }

//     } else if (device.type === "ODBC" || device.type === "database") {
//       data = await deviceManager.fetchDataFromODBC(deviceId, tables);

//     } else {
//       return void res.status(400).json({ error: `Unsupported device type '${device.type}'` });
//     }
//   } catch (error: any) {
//     console.error(`❌ Data fetch failed:`, error);
//     return void res.status(500).json({ error: "Data fetch failed", message: error.message });
//   }

//   try {
//     await deviceManager.writeDataToInflux(data, {
//   id: device.id,
//   enabled: device.enabled,
//   tables:
//     device.type === "WebAPI"
//       ? [{ tableName: device.name }]
//       : tables.map((tableName: string) => ({ tableName }))
// });


//     res.status(200).json({ message: "✅ Data written to Influx", data });
//   } catch (error: any) {
//     console.error("❌ Influx write failed:", error);
//     res.status(500).json({ error: "Failed to write to Influx", message: error.message });
//   }
// };

export const testDeviceConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, property } = req.body;

    if (!type || !property) {
      return void res.status(400).json({ error: "Both 'type' and 'property' are required." });
    }

    if (type === "WebAPI") {
      const { address, method = "GET" } = property;
      if (!address) {
        return void res.status(400).json({ error: "API address is required for WebAPI devices." });
      }

      try {
        const response = await axios({ url: address, method });
        if (response.status >= 200 && response.status < 300) {
          return void res.status(200).json({ message: "WebAPI connection successful." });
        } else {
          return void res.status(500).json({ error: `WebAPI responded with status ${response.status}` });
        }
      } catch (err) {
        return void res.status(500).json({ error: "WebAPI connection failed.", details: (err as Error).message });
      }
    }

    if (type === "ODBC") {
      const { dsn } = property;
      if (!dsn) {
        return void res.status(400).json({ error: "DSN is required for ODBC connection." });
      }

      try {
        const connection = await odbc.connect(`DSN=${dsn};TrustServerCertificate=yes;`);
        const result = await connection.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'`);
        const tables = result.map((row: any) => row.TABLE_NAME);
        await connection.close();
        return void res.status(200).json({ message: "ODBC connection successful.", tables });
      } catch (err: any) {
        return void res.status(500).json({ error: "ODBC connection failed.", details: err.message });
      }
    }

    if (type === "database") {
      const { dbType, host, port, user, password, databaseName } = property;
      if (!dbType || !host || !port || !user || !password || !databaseName) {
        return void res.status(400).json({ error: "Missing database connection fields." });
      }

      if (dbType === "postgres") {
        try {
          const client = new PgClient({ host, port: Number(port), user, password, database: databaseName });
          await client.connect();
          const result = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
          const tables = result.rows.map(row => row.table_name);
          await client.end();
          return void res.status(200).json({ message: "PostgreSQL connected.", tables });
        } catch (err: any) {
          return void res.status(500).json({ error: "PostgreSQL connection failed.", details: err.message });
        }
      }

      if (dbType === "mssql") {
        try {
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

          const result = await sql.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`);
          const tables = result.recordset.map((row: any) => row.TABLE_NAME);
          return void res.status(200).json({ message: "MSSQL connected.", tables });
        } catch (err: any) {
          return void res.status(500).json({ error: "MSSQL connection failed.", details: err.message });
        }
      }

      return void res.status(400).json({ error: `Unsupported dbType '${dbType}'. Use 'postgres' or 'mssql'.` });
    }

    return void res.status(400).json({ error: `Unsupported type '${type}'. Use 'WebAPI', 'ODBC', or 'database'.` });
  } catch (err: any) {
    console.error("❌ testDeviceConnection error:", err);
    res.status(500).json({ error: "Internal server error.", details: err.message });
  }
};

/**
 * Edit a device
 */
export const editDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, property, enabled, polling, type } = req.body;

    const device = await prisma.device.findUnique({ where: { id } });

    if (!device) {
       res.status(404).json({ error: "Device not found" });
    }

    const updatedDevice = await prisma.device.update({
      where: { id },
      data: {
        name,
        description,
        property: JSON.stringify(property),
        enabled,
        polling,
        type,
        updatedAt: new Date(),
      },
    });

    console.log(`Device '${id}' updated.`);

    // Notify the device manager about the update
    deviceManager.handleDeviceUpdated(updatedDevice, device);

    res.status(200).json(updatedDevice);

  } catch (error) {
    console.error("Error updating device:", error);
    res.status(500).json({ error: "Failed to update device" });
  }
};

/**
 * Delete a device
 */
export const deleteDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const device = await prisma.device.findUnique({ where: { id } });

    if (!device) {
  return void res.status(404).json({ error: "Device not found" }); // ❗ add return
    }

    await prisma.device.delete({ where: { id } });

    console.log(`Device '${id}' deleted.`);

    // Notify the device manager to stop polling
    deviceManager.handleDeviceDeleted(id);

    res.status(200).json({ message: "Device deleted successfully." });

  } catch (error) {
    console.error("Error deleting device:", error);
    res.status(500).json({ error: "Failed to delete device" });
  }
};

export const testWebAPIConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("Incoming request for WebAPI connection test:", req.body);

    const { property } = req.body;

    if (!property || !property.address) {
      console.error("API address is missing in property.");
      res.status(400).json({ error: "API address is required for WebAPI devices" });
      return;
    }

    const { address, method = "GET" , format = "JSON"  } = property;

    try {
      // Try fetching data from the given API address
      const response = await axios({ url: address, method });

      if (response.status >= 200 && response.status < 300) {
        console.log("✅ Connection successful!");
        res.status(200).json({ message: "Connected!" });
      } else {
        console.error("⚠ API responded with an error:", response.status);
        res.status(500).json({ error: "API responded with an error" });
      }
    } catch (error) {
      console.error("❌ Failed to establish connection:");
      res.status(500).json({ error: "Failed to establish connection. Please check the API address." });
    }
  } catch (error) {
    console.error("❌ Error testing WebAPI connection:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


export const deleteManyDevices = async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceIds } = req.body;

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      res.status(400).json({
        error: "validation_error",
        message: "Device IDs must be provided as a non-empty array.",
      });
      return;
    }

    const deletedDevices: { id: string; name: string }[] = [];

    for (const id of deviceIds) {
      const device = await prisma.device.findUnique({ where: { id } });

      if (!device) {
        console.warn(`Device with ID ${id} not found. Skipping.`);
        continue;
      }

      await prisma.device.delete({ where: { id } });
      deviceManager.handleDeviceDeleted(id);
      deletedDevices.push({ id, name: device.name });
    }

    if (deletedDevices.length === 0) {
      res.status(404).json({ error: "not_found", message: "No valid devices were deleted." });
      return;
    }

    res.status(200).json({
      message: "Devices deleted successfully.",
      deletedDevices,
    });

  } catch (error) {
    console.error("Error deleting devices:", error);
    res.status(500).json({
      error: "unexpected_error",
      message: "An error occurred while deleting devices.",
    });
  }
};


export const deleteAllDevices = async (req: Request, res: Response): Promise<void> => {
  try {
      // Delete all devices from the database
      const deletedDevices = await prisma.device.deleteMany({});

      if (deletedDevices.count === 0) {
          res.status(404).json({ error: "not_found", message: "No devices found to delete." });
          return;
      }

      res.status(200).json({
          message: "All devices have been deleted successfully.",
          deletedCount: deletedDevices.count
      });

  } catch (error) {
      console.error("Error deleting all devices:", error);
      res.status(500).json({ error: "unexpected_error", message: "An error occurred while deleting all devices." });
  }
};



  export const getAllDevices = async (req: Request, res: Response): Promise<void> => {
    try {
      const devices = await prisma.device.findMany({
     
      });
      res.status(200).json(devices);
    } catch (error) {
      console.error('Error fetching devices:', error);
      res.status(500).json({ error: 'Failed to fetch devices.' });
    }
  };
  
  export const getDeviceById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
  
      const device = await prisma.device.findUnique({
        where: { id },
      
      });
  
      if (!device) {
        res.status(404).json({ error: 'Device not found.' });
        return;
      }
  
      res.status(200).json(device);
    } catch (error) {
      console.error('Error fetching device by ID:', error);
      res.status(500).json({ error: 'Failed to fetch device.' });
    }
  };
  
// export const fetchAndWriteToInflux = async (req: Request, res: Response): Promise<void> => {
//   const deviceId = req.params.id;
//   const { tables = [] }: { tables?: string[] } = req.body;

//   const device = await prisma.device.findUnique({
//     where: { id: deviceId },
//     include: { tables: true }
//   });

//   if (!device || !device.enabled) {
//     return void res.status(404).json({ error: "Device not found or disabled" });
//   }

//   const deviceType = device.type?.toLowerCase();
//   let data: { table: string; rows: any[] }[] = [];

//   // Validate tables only for database/odbc
//   if ((deviceType === "database" || deviceType === "odbc") && (!Array.isArray(tables) || tables.length === 0)) {
//     return void res.status(400).json({ error: "No table names provided" });
//   }

//   // Save missing tables
//   if (deviceType === "webapi") {
//     const alreadyExists = device.tables.some(t => t.tableName === device.name);
//     if (!alreadyExists) {
//       await prisma.deviceTable.create({
//         data: { deviceId, tableName: device.name }
//       });
//     }
//   } else if (deviceType === "database" || deviceType === "odbc") {
//     const existingTableNames = device.tables.map(t => t.tableName);
//     const newTables = tables.filter((name: string) => !existingTableNames.includes(name));
//     if (newTables.length > 0) {
//       await prisma.deviceTable.createMany({
//         data: newTables.map((tableName: string) => ({ deviceId, tableName }))
//       });
//     }
//   }

//   // Fetch data
//   try {
//     if (deviceType === "webapi") {
//       const property = device.property ? JSON.parse(device.property) : {};
//       const address = property.address;
//       if (!address) {
//         return void res.status(400).json({ error: "Missing WebAPI address in device property" });
//       }

//       const response = await fetch(address);
//       const json = await response.json();

//       data = Array.isArray(json)
//         ? [{ table: device.name, rows: json }]
//         : typeof json === "object"
//         ? [{ table: device.name, rows: [json] }]
//         : [];

//       if (data.length === 0) {
//         return void res.status(500).json({ error: "Unsupported WebAPI response format" });
//       }
//     } else if (deviceType === "odbc" || deviceType === "database") {
//       data = await deviceManager.fetchDataFromODBC(deviceId, tables);
//     } else {
//       return void res.status(400).json({ error: `Unsupported device type '${device.type}'` });
//     }
//   } catch (error: any) {
//     console.error("❌ Data fetch failed:", error);
//     return void res.status(500).json({ error: "Data fetch failed", message: error.message });
//   }

//   // Write to InfluxDB
//   try {
//     if (deviceType === "webapi") {
//       await deviceManager.writeWebApiDataToInflux(data, {
//         id: device.id,
//         enabled: device.enabled,
//         tables: [{ tableName: device.name }]
//       });
//     } else {
//       await deviceManager.writeDataToInflux(data, {
//         id: device.id,
//         enabled: device.enabled,
//         tables: tables.map((tableName: string) => ({ tableName }))
//       });
//     }

//     res.status(200).json({ message: "✅ Data written to Influx", data });
//   } catch (error: any) {
//     console.error("❌ Influx write failed:", error);
//     res.status(500).json({ error: "Failed to write to Influx", message: error.message });
//   }
// };


export const fetchAndWriteToInflux = async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;
    const { tables = [] }: { tables?: string[] } = req.body;

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { tables: true },
    });

    if (!device || !device.enabled) {
      return void res.status(404).json({ error: "Device not found or disabled" });
    }

    const deviceType = device.type?.toLowerCase();
    if (!deviceType) {
      return void res.status(400).json({ error: "Device type is missing or invalid" });
    }

    // Validate tables input for database/ODBC
    if ((deviceType === "database" || deviceType === "odbc") && (!Array.isArray(tables) || tables.length === 0)) {
      return void res.status(400).json({ error: "No table names provided" });
    }

    // Store new table names if missing
    if (deviceType === "webapi") {
      const alreadyExists = device.tables.some((t: { tableName: string }) => t.tableName === device.name);
      if (!alreadyExists) {
        await prisma.deviceTable.create({
          data: { deviceId, tableName: device.name },
        });
      }
    } else if (deviceType === "database" || deviceType === "odbc") {
      const existingTableNames = device.tables.map((t: { tableName: string }) => t.tableName);
      const newTables = tables.filter((name: string) => !existingTableNames.includes(name));
      if (newTables.length > 0) {
        await prisma.deviceTable.createMany({
          data: newTables.map((tableName: string) => ({ deviceId, tableName })),
        });
      }
    }

    // Fetch the data
    let data: { table: string; rows: any[] }[] = [];

    if (deviceType === "webapi") {
      const property = device.property ? JSON.parse(device.property) : {};
      const address = property.address;
      if (!address) {
        return void res.status(400).json({ error: "Missing WebAPI address in device property" });
      }

      const response = await fetch(address);
      const json = await response.json();

      data = Array.isArray(json)
        ? [{ table: device.name, rows: json }]
        : typeof json === "object"
        ? [{ table: device.name, rows: [json] }]
        : [];

      if (data.length === 0) {
        return void res.status(500).json({ error: "Unsupported WebAPI response format" });
      }
    } else if (deviceType === "odbc" || deviceType === "database") {
      data = await deviceManager.fetchDataFromODBC(deviceId, tables);
    } else {
      return void res.status(400).json({ error: `Unsupported device type '${device.type}'` });
    }

    // Write to InfluxDB
    if (deviceType === "webapi") {
      await deviceManager.writeWebApiDataToInflux(data, {
        id: device.id,
        enabled: device.enabled,
        tables: [{ tableName: device.name }],
      });
    } else {
      await deviceManager.writeDataToInflux(data, {
        id: device.id,
        enabled: device.enabled,
        tables: tables.map((tableName: string) => ({ tableName })),
      });
    }

    res.status(200).json({ message: "✅ Data written to Influx", data });
  } catch (error: any) {
    console.error("❌ Error in fetchAndWriteToInflux:", error);
    res.status(500).json({ error: "Unexpected error", message: error.message });
  }
};
