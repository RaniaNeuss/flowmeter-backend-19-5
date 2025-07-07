/**
 * 'http': webapi wrapper to manage REST API requests.
 */
'use strict';
const axios = require('axios');
const utils = require('../../utils');
const deviceUtils = require('../device-utils');

// Maintain a cache of device data values per device
const varsValueCache = new Map(); // Map<deviceId, { [normalizedKey]: { value, timestamp } }>

function HTTPclient(_data, _logger, _events, _runtime, prisma, io) {
  // Basic references
  const runtime = _runtime;
  let data = _data; // Current device data, e.g. { name, id, property, ... }
  const logger = _logger;
  const events = _events;

  let working = false;
  let connected = false;
  let lastStatus = '';
  let overloading = 0;            // Overload counter
  let lastTimestampRequest = 0;
  let lastTimestampValue = 0;

  let device = null;             // Cached device
  const apiProperty = { getTags: null, postTags: null, format: 'JSON', ownFlag: true };

  // ------------------------------------------------------------------
  // 1) Device and Connection Checks
  // ------------------------------------------------------------------

  /**
   * Fetch and cache the device object.
   */
  const _fetchDevice = async (deviceId) => {
    if (!device || device.id !== deviceId) {
      device = await prisma.device.findUnique({
        where: { id: deviceId },
         include: { tags: true },
        
      });
      logger.info(`Fetched device: ${device ? device.name : 'NULL'}`);
      if (device?.tags) {
        logger.info(`Device '${deviceId}' has ${device.tags.length} tags.`);
      }
    }
    return device;
  };

  /**
   * Check connectivity by making an HTTP GET request to the device's address.
   */
  const _checkConnection = async (deviceId) => {
    try {
      const dev = await prisma.device.findUnique({ where: { id: deviceId } });
      if (!dev) {
        logger.error(`Device '${deviceId}' not found in _checkConnection.`);
        return false;
      }
      const property = dev.property ? JSON.parse(dev.property) : {};
      if (!property.address) {
        logger.error(`Device '${dev.name}' is missing address.`);
        return false;
      }
      // Try GET
      const response = await axios.get(property.address);
      if (response?.status === 200) {
        return true;
      }
      logger.error(`Connection check for '${dev.name}' returned non-200.`);
      return false;
    } catch (err) {
      logger.error(`_checkConnection error for device '${deviceId}': ${err.message}`);
      return false;
    }
  };

  /**
   * Attempt to connect the client by verifying the device and address.
   */
  this.connect = async function (deviceId) {
    try {
      const dev = await _fetchDevice(deviceId);
      if (!dev) {
        _emitStatus('connect-failed', deviceId);
        throw new Error(`Device '${deviceId}' not found.`);
      }
      const property = dev.property ? JSON.parse(dev.property) : {};
      if (!property.address) {
        _emitStatus('connect-failed', deviceId);
        throw new Error(`Device '${dev.name}' has no valid address.`);
      }
      // Properly await
      const isOk = await _checkConnection(deviceId);
      if (isOk) {
        connected = true;
        _emitStatus('connect-ok', deviceId);
      } else {
        connected = false;
        _emitStatus('connect-failed', deviceId);
        throw new Error('Failed to connect - address not reachable.');
      }
    } catch (err) {
      _emitStatus('connect-error', deviceId);
      throw err;
    }
  };

  /**
   * Disconnect the client, emit status, clear local cache.
   */
  this.disconnect = function (deviceId) {
    return new Promise((resolve) => {
      _checkWorking(false);
      logger.info(`'${data.name}' disconnected!`);
      connected = false;
      _emitStatus('connect-off', deviceId);
      _clearVarsValue(deviceId);
      resolve();
    });
  };
   // ------------------------------------------------------------------
  // 2) Polling Logic
  // ------------------------------------------------------------------

  /**
   * The polling function. We intentionally keep polling even if `connected = false`,
   * so that once connectivity is restored, we can become "connect-ok" again.
   */
  this.polling = async function (deviceId) {
    const formattedTime = new Date().toLocaleTimeString('en-US', { hour12: false });
    // logger.info(`Polling started @ ${formattedTime} for device '${data.name}' / ID: ${deviceId}`);

    // FIXED: We no longer require `connected === true` here, because we want
    // to attempt a poll even if we’re offline (in case we come back online).
    if (!_checkWorking(true)) {
      // If we're working from a prior cycle, mark busy
      _emitStatus('connect-busy', deviceId);
      _checkWorking(false);
      return;
    }

    try {
      const dev = await _fetchDevice(deviceId);
      if (!dev) {
        logger.error(`Device '${deviceId}' not found, skipping poll.`);
        return;
      }
      const property = dev.property ? JSON.parse(dev.property) : {};
      if (!property.address) {
        logger.error(`Device '${dev.name}' missing address, skipping poll.`);
        return;
      }

      // If too long since last request, consider an error state
      const now = Date.now();
      if (lastTimestampRequest && dev.polling && lastTimestampRequest + dev.polling * 3 < now) {
        _emitStatus('connect-error', deviceId);
      }

      // Attempt the request
      const result = await _readRequest(property);
      if (result) {
        // If we had errors before, but this worked, set connect-ok
        if (!connected || lastStatus !== 'connect-ok') {
          connected = true;  // FIXED: Re-establish connected
          _emitStatus('connect-ok', deviceId);
        }

        // Flatten & update DB tags
        const varsValueChanged = await _updateVarsValue(result, deviceId, io);
        lastTimestampValue = now;

        // If we want to emit all values to clients
        const deviceVals = varsValueCache.get(deviceId) || {};
        _emitValues(deviceVals, deviceId);

        // Optionally do DAQ if values changed
        if (this.addDaq && !utils.isEmptyObject(varsValueChanged)) {
          this.addDaq(varsValueChanged, dev.name, dev.id);
        }
      }
    } catch (reason) {
      // If a poll fails, we consider the device offline, but keep polling
      logger.error(`Polling error for '${deviceId}': ${reason.message || reason}`);
      connected = false; // We mark offline
      _emitStatus('connect-error', deviceId);
    } finally {
      _checkWorking(false);
    }
  };

  // ------------------------------------------------------------------
  // 3) Reading / Writing Tag Values
  // -----------------------------------
  /**
   * Set the callback to add DAQ data in your own system or DB (if needed).
   */
  this.bindAddDaq = function (fnc) {
    this.addDaq = fnc;
  };
  this.addDaq = null;

  /**
   * Return whether this client is connected (based on last known status).
   */
  this.isConnected = function () {
    return connected;
  };

  /**
   * Return the timestamp of the last read tag operation on polling.
   */
  this.lastReadTimestamp = () => lastTimestampValue;

  /**
   * Load tags from the device data for local usage (if needed).
   * If you don’t actually use requestItemsMap, you can remove it.
   */
  this.load = function (_deviceData) {
    data = JSON.parse(JSON.stringify(_deviceData));
    // If the device has tags, set up a map
    try {
      // ...
      console.log(`Tags loaded for '${data.name}'`);
    } catch (err) {
      console.error(`'${data.name}' load error! ${err}`);
    }
  };

  /**
   * Example to get a single tag value from the cache.
   */
  this.getValue = function (normalizedKey, deviceId) {
    const deviceVals = varsValueCache.get(deviceId) || {};
    if (deviceVals[normalizedKey]) {
      return {
        id: normalizedKey,
        value: deviceVals[normalizedKey].value,
        ts: deviceVals[normalizedKey].timestamp,
      };
    }
    return null;
  };

  /**
   * Return the entire set of values for a device from the cache.
   */
  this.getValues = function (deviceId) {
    return varsValueCache.get(deviceId) || {};
  };

  /**
   * Updated signature: pass deviceId, tagId, value.
   * Otherwise deviceId is not defined in this scope.
   */
  this.setValue = async function (deviceId, tagId, value) {
    try {
      const dev = await _fetchDevice(deviceId);
      if (!dev) {
        console.error(`Device with ID '${deviceId}' not found in setValue.`);
        return false;
      }
      // Find the relevant tag
      const tag = dev.tags.find((t) => t.id === tagId);
      if (!tag) {
        console.log(`Tag with ID '${tagId}' not found on device '${dev.name}'.`);
        return false;
      }
      value = _parseValue(tag.type, value);
      tag.value = await deviceUtils.tagRawCalculator(value, tag, runtime);

      // If your REST API requires posting the new value somewhere, do it:
      if (apiProperty.postTags) {
        await axios.post(apiProperty.postTags, [{ id: tagId, value: tag.value }]);
      }
      lastTimestampRequest = Date.now();
      console.log(`setValue '${tag.name}' to ${value}`);
      return true;
    } catch (err) {
      console.error(`Error setting value for tag '${tagId}': ${err.message}`);
      return false;
    }
  };

  /**
   * Internal function to read from the device via axios GET.
   */
  const _readRequest = async (property) => {
    try {
      const response = await axios.get(property.address);
      lastTimestampRequest = Date.now();
      return response.data;
    } catch (error) {
      console.error(`Error fetching data from ${property.address}: ${error.message}`);
      throw error;
    }
  };

  /**
   * Clear the device’s tag values by setting them to null in the cache.
   * Then emit them to the front-end if needed.
   */
  const _clearVarsValue = function (deviceId) {
    if (varsValueCache.has(deviceId)) {
      const cache = varsValueCache.get(deviceId);
      for (const key in cache) {
        cache[key].value = null;
      }
      _emitValues(cache, deviceId);
    }
  };

  /**
   * Flatten the incoming data and update the matching Tag records in DB if changed.
   * Then store them in varsValueCache.
   */
  const _updateVarsValue = async (reqdata, deviceId, io) => {
    // console.log(`_updateVarsValue called for deviceId: ${deviceId}`);
  
    const timestamp = Date.now();
    const flatData = dataToFlat(reqdata, apiProperty);
  
    if (!varsValueCache.has(deviceId)) {
      varsValueCache.set(deviceId, {});
    }
    const deviceVals = varsValueCache.get(deviceId);
  
    // Re-fetch device just once to get all tags for address->id mapping
    const dev = await prisma.device.findUnique({
      where: { id: deviceId },
       include: { tags: true },
     
    });
    if (!dev) {
      // console.error(`Device '${deviceId}' not found in _updateVarsValue.`);
      return {};
    }
  
    // Build address->tagId map
    const tagIdMap = new Map(dev.tags.map((t) => [t.address, t.id]));
  
    // Gather updates
    const updates = {};
    // Also gather all changes for the front-end
    const changesForFrontend = {};
  
    for (const [rawKey, newVal] of Object.entries(flatData)) {
      const normalizedKey = normalizeKey(rawKey);
      const oldVal = deviceVals[normalizedKey]?.value;
      deviceVals[normalizedKey] = { value: newVal, timestamp };
      changesForFrontend[normalizedKey] = {
        value: newVal,
        oldValue: oldVal,
        newType : typeof newVal
      };


      const tagId = tagIdMap.get(normalizedKey);
  
      // Always update local cache
    if (tagId && oldVal !== newVal) {
        updates[tagId] = String(newVal); // store the new value by tagId
      }
    }
  
    // Perform batch updates in a single transaction
    const updateQueries = Object.entries(updates).map(([tagId, val]) =>
      prisma.tag.update({
        where: { id: tagId },
        data: { value: val, updatedAt: new Date() },
      })
    );
    if (updateQueries.length > 0) {
      try {
        await prisma.$transaction(updateQueries);
      } catch (error) {
        console.error('Batch tag update error:', error);
      }
    }
  
    // Emit changes to front-end
    io.emit('variable-changes', { deviceId, changes: changesForFrontend });
  
    return changesForFrontend;
  };
  

  /**
   * Private method to set “working” (polling/connecting) state safely.
   * If overloading hits 3, we mark as not connected. Optionally call disconnect.
   */
/**
   * FIXED: Overload logic no longer permanently sets connected = false
   * We only skip the current cycle if already working, but next time we keep trying
   */
  const _checkWorking = function (check) {
    if (check && working) {
      overloading++;
      logger.warn(`'${data.name}' is overloaded! Overload count = ${overloading}`);
      return false;
    }
    // If not overloaded, reset
    working = check;
    overloading = 0;
    return true;
  };

  // Connection status emit
  const _emitStatus = function (status, deviceId) {
    lastStatus = status;
    events.emit('device-status:changed', { id: deviceId, status });
    logger.info(`device-status:changed => { id: ${deviceId}, status: ${status} }`);
  };

  const _emitValues = function (valuesObj, deviceId) {
    events.emit('device-value:changed', { id: deviceId, values: valuesObj });
    // logger.info(`device-value:changed => { id: ${deviceId}, values: ... }`);
  };

  /**
   * Parse an incoming string or number to the correct type.
   */
  const _parseValue = function (type, value) {
    if (type === 'number') {
      return parseFloat(value);
    } else if (type === 'boolean') {
      return Boolean(value);
    } else if (type === 'string') {
      return value;
    } else {
      // Attempt float, fallback to boolean or string
      let val = parseFloat(value);
      if (Number.isNaN(val)) {
        // maybe boolean
        val = Number(value);
        if (Number.isNaN(val)) {
          val = value; // fallback string
        }
      } else {
        val = parseFloat(val.toFixed(5));
      }
      return val;
    }
  };
}

/**
 * Normalize a key from e.g. "data[0]:val" to "data.0.val".
 */
function normalizeKey(key) {
  return key
    .replace(/:/g, '.')
    .replace(/\[(\d+)\]/g, '.$1');
}

/**
 * Flatten nested objects/arrays into dot-notation keys.
 */
function dataToFlat(data, property) {
  const parseTree = (node, parentKey = '') => {
    let result = {};
    if (Array.isArray(node)) {
      node.forEach((item, idx) => {
        const newKey = parentKey ? `${parentKey}[${idx}]` : `[${idx}]`;
        Object.assign(result, parseTree(item, newKey));
      });
    } else if (node && typeof node === 'object') {
      Object.keys(node).forEach((k) => {
        const newKey = parentKey ? `${parentKey}.${k}` : k;
        Object.assign(result, parseTree(node[k], newKey));
      });
    } else {
      result[parentKey] = node;
    }
    return result;
  };
  const flattened = parseTree(data);
  // Now normalize each flattened key
  const normalizedData = {};
  for (const key in flattened) {
    normalizedData[normalizeKey(key)] = flattened[key];
  }
  return normalizedData;
}

/**
 * If you need a direct function to fetch the device's data one time.
 */
function getRequestResult(property) {
  return new Promise((resolve, reject) => {
    if (property.method === 'GET') {
      axios.get(property.address)
        .then((res) => resolve(res.data))
        .catch((err) => reject(err));
    } else {
      reject(new Error('getrequestresult-error: method is missing or invalid!'));
    }
  });
}

// Export
module.exports = {
  init: function (settings) {
    // e.g. set deviceCloseTimeout = settings.deviceCloseTimeout || 15000;
  },
  create: function (data, logger, events, runtime, prisma, io) {
    return new HTTPclient(data, logger, events, runtime, prisma, io);
  },
  getRequestResult,
  dataToFlat,
};
