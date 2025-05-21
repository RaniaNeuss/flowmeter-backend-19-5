const EventEmitter = require('events');
const logger = {
    info: console.log,
    error: console.error,
    warn: console.warn,
};

// Import the S7 module (index.js file)
const s7Module = require('./index'); // Adjust path if needed

// Runtime configuration
const runtime = {};

// Define PLC connection data and tags
const baseAddress = "DB1";
const offset = 10;

const plcData = {
    id: "plc_1",
    name: "SiemensS7-1200",
    property: {
        address: "192.168.1.3", // PLC IP Address
        rack: 0,
        slot: 1,
        port: 102
    },
    tags: {
        entranceOpenCMD: { name: "Entrance Open CMD", address: `${baseAddress},X0.0`, type: "BOOL" },
        entranceCloseCMD: { name: "Entrance Close CMD", address: `${baseAddress},X0.1`, type: "BOOL" },
        exitOpenCMD: { name: "Exit Open CMD", address: `${baseAddress},X0.2`, type: "BOOL" },
        exitCloseCMD: { name: "Exit Close CMD", address: `${baseAddress},X0.3`, type: "BOOL" },
    }
};

// Add dynamic bay tags
for (let i = 1; i <= 8; i++) {
    const currentOffset = offset * (i - 1) + 2;
    plcData.tags[`Bay${i}maintenance`] = { name: `Bay ${i} Maintenance`, address: `${baseAddress},X${currentOffset}.0`, type: "BOOL" };
    plcData.tags[`Bay${i}active`] = { name: `Bay ${i} Active`, address: `${baseAddress},X${currentOffset}.2`, type: "BOOL" };
}

// Create an EventEmitter instance
const events = new EventEmitter();

// Create the S7 client
const plcClient = s7Module.create(plcData, logger, events, null, runtime);

// Flag to manage polling state
let isWriting = false;
let pollingInterval = null;

// **Start Polling Function**
function startPolling(interval = 1000) {
    if (pollingInterval) return; // Avoid multiple intervals
    pollingInterval = setInterval(() => {
        if (!isWriting) {
            console.log("🔄 Polling PLC...");
            plcClient.polling(); // Fetch values from PLC
        }
    }, interval);
}

// **Stop Polling Function**
function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log("🛑 Polling stopped.");
    }
}

// **Write a Single Value**
async function writeValue(tagName, value) {
    if (isWriting) {
        console.warn("❗ A write operation is already in progress. Skipping single write.");
        return;
    }

    stopPolling(); // Stop polling before writing
    isWriting = true;

    try {
        console.log(`✏️ Writing value ${value} to tag ${tagName}...`);
        await plcClient.setValue(tagName, value);
        console.log(`✅ Successfully wrote value "${value}" to tag "${tagName}".`);
    } catch (err) {
        console.error(`❌ Error writing value to tag "${tagName}":`, err.message);
    } finally {
        isWriting = false;
        startPolling(); // Restart polling after write is complete
    }
}

// **Write Multiple Values**
async function writeMultipleValues(tagValuePairs) {
    if (isWriting) {
        console.warn("❗ A write operation is already in progress. Skipping multiple write.");
        return;
    }

    stopPolling(); // Stop polling before writing
    isWriting = true;

    try {
        console.log(`✏️ Writing multiple values...`);
        
        // Use setValue() multiple times in parallel
        await Promise.all(tagValuePairs.map(({ tag, value }) => plcClient.setValue(tag, value)));

        console.log(`✅ Successfully wrote multiple values:`, tagValuePairs);
    } catch (err) {
        console.error("❌ Error writing multiple values:", err.message);
    } finally {
        isWriting = false;
        startPolling(); // Restart polling after write is complete
    }
}

// **Event Listeners**
events.on('device-value:changed', (data) => {
    console.log(`🔄 Values updated for PLC (${data.id}):`, data.values);
});

events.on('device-status:changed', (data) => {
    console.log(`🔄 Connection status for PLC (${data.id}):`, data.status);
});

// **Example Usage**
(async () => {
    try {
        console.log("🔌 Connecting to PLC...");
        await plcClient.connect();
        console.log("✅ Connected to PLC!");

        startPolling(1000); // Start polling every second

        // **Write a Single Value**
        await writeValue('entranceOpenCMD', 1); // Example single write

        // **Write Multiple Values**
        await writeMultipleValues([
            { tag: 'Bay1maintenance', value: 1 },
            { tag: 'Bay2active', value: 0 },
        ]); // Example multiple write

        // Stop polling and disconnect after 10 seconds
        setTimeout(async () => {
            stopPolling(); // Stop polling
            await plcClient.disconnect(); // Disconnect from the PLC
            console.log("✅ Disconnected from PLC.");
        }, 1000000);
    } catch (err) {
        console.error("❌ Failed to initialize PLC client:", err?.message || err);
    }
})();
