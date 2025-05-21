import { InfluxDB , Point} from "@influxdata/influxdb-client";

// InfluxDB Configuration
const influxUrl = "http://217.160.33.154:8086";
const influxToken = "zeRdN9WOVvE-VatFubAk2L3mPiHoLwIvGCpefaMGfHZu2a96MJ8H_Z3swhMvSakOqZ6qdcADTDHxnWckohEqtA==";
const org = "neuss";
const bucket = "test2";

// Create InfluxDB Client
const influxDB = new InfluxDB({ url: influxUrl, token: influxToken });

// Export write and query APIs
const writeApi = influxDB.getWriteApi(org, bucket, "ns");
const queryApi = influxDB.getQueryApi(org);

export { influxDB, writeApi, queryApi, org, bucket , Point  };
