// import { writeApi , Point , bucket  , queryApi } from "../influx/influxClient"; // Adjust path as needed
// import axios from "axios"; // Import Axios for Fake API

// // Cache to store last flow values
// const flowCache = new Map<string, number>();

// /**
//  * Load all last flow values from DB into cache at startup
//  */
// const loadLastFlowsToCache = async () => {
//   const fluxQuery = `
//     from(bucket: "${bucket}")
//     |> range(start: -30d)
//     |> filter(fn: (r) => r._measurement == "accumulated_flow")
//     |> sort(columns: ["_time"], desc: true)
//     |> limit(n:1)
//   `;

//   queryApi.queryRows(fluxQuery, {
//     next(row, tableMeta) {
//       const data = tableMeta.toObject(row);
//       const key = `${data.station}_${data.bay}`;
//       const flow = parseFloat(data._value);
//       flowCache.set(key, flow);
//     },
//     error(err) {
//       console.error("❌ Error loading cache:", err);
//     },
//     complete() {
//       console.log("✅ Initial flowCache loaded:", flowCache);
//     }
//   });
// };

// // --- FAKE DATA SETUP ---
// const stations = ["Station_1", "Station_2", "Station_3"];
// const baysPerStation = 8;
// const srsPerBay = 2;

// const FAKE_API_URL = "http://localhost:5000/api/sewage/flow"; // POST endpoint

// /**
//  * Send fake data and update cached flow
//  */
// const sendFakeAccumulatedFlow = async () => {
//   try {
//     for (const station of stations) {
//       for (let bay = 1; bay <= baysPerStation; bay++) {
//         const srsId = `SRS_${Math.ceil(bay / 2)}`;
//         const flowAmount = (Math.random() * 10).toFixed(2); // Max flowAmount 100

//         const key = `${station}_Bay_${bay}`;
//         const cachedFlow = flowCache.get(key) || 0;
//         const newFlow = cachedFlow + parseFloat(flowAmount);

//         const payload = {
//           stationId: station,
//           bayId: `Bay_${bay}`,
//           srsId: srsId,
//           flowAmount: parseFloat(flowAmount),
//           cachedFlow: cachedFlow,
//           newFlow: newFlow
//         };

//         console.log("🚀 Sending Fake Flow:", payload);
//         await axios.post(FAKE_API_URL, payload);

//         // Update cache with new flow
//         flowCache.set(key, newFlow);
//       }
//     }
//     console.log("✅ Fake accumulated flow data sent successfully!");
//   } catch (error) {
//     console.error("❌ Error sending fake data:", error);
//   }
// };

// // Start fake data sending every 60 seconds
// setInterval(sendFakeAccumulatedFlow, 60000);


// export { loadLastFlowsToCache };