import { InfluxDB , Point} from "@influxdata/influxdb-client";

// InfluxDB Configuration
const influxUrl = process.env.INFLUX_URL || "https://us-east-1-1.aws.cloud2.influxdata.com/";
const influxToken = process.env.INFLUX_TOKEN || "K8gsItrTCSM5tBHLHacOK1Gd1r-T1Cm8hl5VghFGknGuc4enzzhqsTAbVJZlACvH4XTJus6PKjOCDAsFKumSNw==";
const org = process.env.INFLUX_ORG || "neuss";
const bucket = process.env.INFLUX_BUCKET || "test2";

// Create InfluxDB Client
const influxDB = new InfluxDB({ url: influxUrl, token: influxToken });

// Export write and query APIs
const writeApi = influxDB.getWriteApi(org, bucket, "ns");
const queryApi = influxDB.getQueryApi(org);

export { influxDB, writeApi, queryApi, org, bucket , Point  };
