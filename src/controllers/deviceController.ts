
import { Request, Response } from 'express';
import prisma from '../prismaClient';
import deviceManager from '../runtime/devices/deviceManager';
import odbc from 'odbc';
/**
 * Create a new device
 */
export const createDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const {  name, type, description, property, enabled = true, polling } = req.body;

    // Validate common fields
    if (!name ) {
      res.status(400).json({ error: "Device name is required" });
    }

    // Check for duplicate device
    const existingDevice = await prisma.device.findUnique({ where: { name } });
    if (existingDevice) {
      res.status(400).json({ error: "Device with the same name already exists" });
    }

    // Save device to the database
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

    // Notify the device manager to initialize the device
    if (enabled) {
      deviceManager.initializeAndPollDevices([newDevice]);
    }

    res.status(201).json(newDevice);

  } catch (error) {
    console.error("Error creating device:", error);
    res.status(500).json({ error: "Failed to create device" });
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
    res.status(404).json({ error: "Device not found" });
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
        const { deviceIds } = req.body; // Expect an array of device IDs

        if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
            res.status(400).json({ error: "validation_error", message: "Device IDs must be provided as a non-empty array." });
            return;
        }

        // Find devices to ensure they exist before deletion
        const existingDevices = await prisma.device.findMany({
            where: { id: { in: deviceIds } },
            select: { id: true, name: true } // Fetch existing device IDs and names
        });

        if (existingDevices.length === 0) {
            res.status(404).json({ error: "not_found", message: "No devices found with the provided IDs." });
            return;
        }

        // Extract found IDs to delete
        const existingDeviceIds = existingDevices.map(device => device.id);

        // Delete the devices
        await prisma.device.deleteMany({
            where: { id: { in: existingDeviceIds } },
        });

        res.status(200).json({
            message: "Devices deleted successfully.",
            deletedDevices: existingDevices
        });

    } catch (error) {
        console.error("Error deleting devices:", error);
        res.status(500).json({ error: "unexpected_error", message: "An error occurred while deleting devices." });
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
  


  


// API to Connect to SQL Server via ODBC and Fetch Data
export const connectODBCAndFetchData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { dsn, query } = req.body;

    if (!dsn) {
      res.status(400).json({ error: "DSN is required to connect to SQL Server." });
      return;
    }

    const connectionString = `
      DSN=${dsn};
      TrustServerCertificate=yes;
    `;

    console.log(`Attempting to connect using DSN: ${dsn}`);

    const connection = await odbc.connect(connectionString.trim());
    console.log('✅ Connection Successful!');

    
    await connection.close();
    console.log('✅ Connection Closed.');

    res.status(200).json({
      message: "Connection successful and data fetched.",
      
    });

  } catch (error: any) {
    console.error('❌ Connection Error:', error.message);
    res.status(500).json({ error: "Connection failed. Check the DSN and query.", details: error.message });
  }
};