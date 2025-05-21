import { writeApi , Point , bucket  , queryApi} from "../influx/influxClient"; // Adjust path as needed
import { Request, Response } from "express";


import odbc from 'odbc';


export const saveAccumulatedFlow = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stationId, bayId, srsId, newFlow } = req.body;

        if (!stationId || !bayId || !srsId || newFlow === undefined) {
            res.status(400).json({ error: "validation_error", message: "stationId, bayId, srsId, and newFlow are required." });
            return;
        }

        const point = new Point("accumulated_flow")
            .tag("station", stationId)
            .tag("bay", bayId)
            .tag("srs", srsId)
            .floatField("flow", newFlow)
            .timestamp(new Date());

        writeApi.writePoint(point);
        await writeApi.flush();

        res.status(200).json({ message: "Accumulated flow recorded successfully.", newFlow });
    } catch (err: any) {
        console.error(`Error saving accumulated flow: ${err.message}`);
        res.status(500).json({ error: "unexpected_error", message: "An error occurred while saving accumulated flow." });
    }
};


// Close connection on exit
process.on("exit", async () => {
    console.log("Closing InfluxDB connection...");
    await writeApi.close();
});





const connectionString = `
  DSN=Masterpiece;
  TrustServerCertificate=yes;
`;


interface InfluxData {
  time: string;
  station: string;
  bay: string;
  flow: number;
}

export const saveInfluxDataToSQL = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.body;

    if (!query) {
      res.status(400).json({ error: "Query is required to read data from InfluxDB." });
      return;
    }

    console.log(`Fetching data from InfluxDB using query: ${query}`);
    const influxData: InfluxData[] = [];

    await queryApi.queryRows(query, {
      next(row, tableMeta) {
        const data = tableMeta.toObject(row);
        influxData.push({
          time: new Date(data._time).toISOString(),
          station: String(data.station),
          bay: String(data.bay),
          flow: parseFloat(data._value)
        });
      },
      error(err) {
        console.error('Query Error:', err);
        res.status(500).json({ error: "Error querying InfluxDB." });
        return;
      },
      complete() {
        console.log("Data fetched from InfluxDB:", influxData);
        saveDataToSQL(influxData, res);
      }
    });

  } catch (error) {
    console.error("Error transferring data from InfluxDB to SQL Server:", error);
    res.status(500).json({ error: "Error transferring data from InfluxDB to SQL Server." });
  }
};

// Save Data as a JSON String to SQL Server
const saveDataToSQL = async (data: InfluxData[], res: Response): Promise<void> => {
  try {
    console.log(`Saving data to SQL Server...`);

    const connection = await odbc.connect(connectionString);

    // Convert the data array to a JSON string
    const rawData = JSON.stringify(data);

    const sqlQuery = `
      INSERT INTO SensorData (timestamp, station, bay, flow, rawData)
      VALUES (GETDATE(), 'BulkData', 'BulkData', 0, ?);
    `;

    console.log("Inserting raw data:", rawData);

    await connection.query(sqlQuery, [rawData]);

    await connection.close();
    console.log('✅ Data successfully saved to SQL Server.');

    res.status(200).json({ message: "Data successfully transferred from InfluxDB to SQL Server as JSON string." });

  } catch (error) {
    console.error("Error saving data to SQL Server:", error);
    res.status(500).json({ error: "Error saving data to SQL Server." });
  }
};
