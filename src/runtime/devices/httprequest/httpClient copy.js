/**
 * 'http': webapi wrapper to manage REST API request
 */
'use strict';
const axios = require('axios');
const utils = require('../../utils');
const deviceUtils = require('../device-utils');
const prisma =require ('../../../prismaClient')

function HTTPclient(_data, _logger, _events, _runtime,prisma,io) {
    var runtime = _runtime;
    var data = _data;                   // Current webapi data
    var logger = _logger;               // Logger var working = false;                // Working flag to manage overloading polling and connection
    var working = false;                // Working flag to manage overloading polling and connection
    var connected = false;              // Connected flag
    var events = _events;               // Events to commit change to runtime
    var lastStatus = '';                // Last webapi status
    var varsValue = [];                 // Signale to send to frontend { id, type, value }
    var requestItemsMap = {};           // Map of request (JSON, CSV, XML, ...) {key: item path, value: tag}
    var overloading = 0;                // Overloading counter to mange the break connection
    var lastTimestampRequest;           // Last Timestamp request
    var lastTimestampValue;             // Last Timestamp of asked values
    var newItemsCount;                  // Count of new items, between load and received
    const socket = io;
    var device = null;                  // Cached device object

    var apiProperty = { getTags: null, postTags: null, format: 'JSON', ownFlag: true };

    /**
     * Connect the client by make a request
     */
    

  
    /**
     * Fetch and cache the device object
     */
    const _fetchDevice = async (deviceId) => {
      if (!device || device.id !== deviceId) {
        device = await prisma.device.findUnique({
          where: { id: deviceId },
          include: { tags: true }, // Ensure tags are fetched
        });
    
        // Debugging: Log fetched device and its tags
        console.log(`Fetched device:`, device);
        if (device?.tags) {
          console.log(`Tags for device '${deviceId}':`, device.tags);
        }
      }
      return device;
    };
    



    

    this.connect = function (deviceId) {
      return new Promise(async (resolve, reject) => {
          try {
              const device = await _fetchDevice(deviceId);

              if (!device) {
                  logger.error(`Device with ID '${deviceId}' not found.`);
                  _emitStatus('connect-failed', deviceId);
                  reject(new Error(`Device with ID '${deviceId}' not found.`));
                  return;
              }

              const property = device.property ? JSON.parse(device.property) : {};
              if (!property.address) {
                  logger.error(`Device '${device.name}' is missing a valid address.`);
                  _emitStatus('connect-failed', deviceId);
                  reject(new Error(`Device '${device.name}' is missing a valid address.`));
                  return;
              }

              if (_checkConnection(deviceId)) {
                  _emitStatus('connect-ok', deviceId);
                  connected = true;
                  resolve();
              } else {
                  _emitStatus('connect-failed', deviceId);
                  connected = false;
                  reject(new Error('Failed to connect.'));
              }
          } catch (err) {
              _emitStatus('connect-error', deviceId);
              reject(err);
          }
      });
  };

      /**
       * Disconnect the client
       * Emit connection status to clients, clear all Tags values
       */
      this.disconnect = function (deviceId) {
        return new Promise(function (resolve, reject) {
          _checkWorking(false);
          logger.info(`'${data.name}' disconnected!`, true);
          connected = false;
          _emitStatus('connect-off, deviceId');
          _clearVarsValue(deviceId);
          resolve();
        });
      };
    
     


      this.polling = async function (deviceId) {
        const currentTime = new Date();
        const formattedTime = currentTime.toLocaleTimeString('en-US', { hour12: false });

        console.log(`Polling started @ ${formattedTime} for deviceId: ${deviceId}`);

        if (_checkWorking(true)) {
            try {
                const device = await _fetchDevice(deviceId);

                if (!device) {
                    console.error(`Device with ID '${deviceId}' not found. Skipping polling.`);
                    _checkWorking(false);
                    return;
                }

                const property = device.property ? JSON.parse(device.property) : {};

                if (!property.address) {
                    console.error(`Device '${device.name}' is missing a valid address. Skipping polling.`);
                    _checkWorking(false);
                    return;
                }

                const dt = new Date().getTime();
                if (lastTimestampRequest + device.polling * 3 < dt) {
                    _emitStatus('connect-error', deviceId);
                    _checkWorking(false);
                    return;
                }

                const result = await _readRequest(property);

                if (result) {
                    const varsValueChanged = await _updateVarsValue(result, deviceId, io);

                    lastTimestampValue = new Date().getTime();
                    _emitValues(varsValue, deviceId);

                    if (this.addDaq && !utils.isEmptyObject(varsValueChanged)) {
                        this.addDaq(varsValueChanged, device.name, device.id);
                    }

                    if (lastStatus !== 'connect-ok') {
                        _emitStatus('connect-ok', deviceId);
                    }
                }

                _checkWorking(false);
            } catch (reason) {
                console.error(`Polling error for '${deviceId}': ${reason.message || reason}`);
                _checkWorking(false);
            }
        } else {
            _emitStatus('connect-busy', deviceId);
        }
    };




    
      /**
       * Return if http request is working
       * is disconnected if the last request result is older as 3 polling interval
       */
      this.isConnected = function (deviceId) {
        return connected;
      };
    
      /**
       * Set the callback to set value to DAQ
       */
      this.bindAddDaq = function (fnc) {
        this.addDaq = fnc; // Add the DAQ value to db history
      };
      this.addDaq = null; // Callback to add the DAQ value to db history
    
      /**
       * Return the timestamp of last read tag operation on polling
       * @returns
       */
      this.lastReadTimestamp = () => {
        return lastTimestampValue;
      };
    
      /**
       * Load Tags to read by polling
       */
      this.load = function (_data) {
       
        varsValue = [];
        data = JSON.parse(JSON.stringify(_data));
    
        try {
            requestItemsMap = {};
            const count = Object.keys(data.tags).length;
    
            for (const id in data.tags) {
                const name = data.tags[id].name || data.tags[id].id; // Use `name` as the unique identifier
                if (!requestItemsMap[name]) {
                    requestItemsMap[name] = [data.tags[id]];
                } else {
                    requestItemsMap[name].push(data.tags[id]);
                }
            }
    
            console.log(`${count} Tags loaded for '${data.name}'`, true);
        } catch (err) {
            console.error(`'${data.name}' load error! ${err}`);
        }
    };
    
      /**
       * Return Tag value { id: <name>, value: <value>, ts: <lastTimestampValue> }
       */
      this.getValue = function (id) {
        if (varsValue[id]) {
          return { id: id, value: varsValue[id].value, ts: lastTimestampValue };
        }
        return null;
      };
    
      /**
       * Return Tags values array { id: <name>, value: <value>, type: <type> }
       */
      this.getValues = function () {
        return varsValue;
      };
    
     

      this.setValue = async function (tagId, value) {
        try {
          // Fetch the device and its tags
          const device = await _fetchDevice(deviceId);
          if (!device) {
            logger.error(`Device with ID '${deviceId}' not found.`);
            return false;
          }
      
          const tag = device.tags.find((t) => t.id === tagId);
          if (!tag) {
           console.log(`Tag with ID '${tagId}' not found.`);
            return false;
          }
      
          value = _parseValue(tag.type, value);
          tag.value = await deviceUtils.tagRawCalculator(value, tag, runtime);
      
          await axios.post(apiProperty.postTags, [{ id: tagId, value: tag.value }]);
      
          lastTimestampRequest = new Date().getTime();
       console.log(`setValue '${tag.name}' to ${value}`, true, true);
      
          return true;
        } catch (err) {
          console.log(`Error setting value for tag '${tagId}': ${err.message}`);
          return false;
        }
      };
      


      /**
       * Return connection status 'connect-off', 'connect-ok', 'connect-error'
       */
      this.getStatus = function () {
        return lastStatus;
      };
    
      /**
       * Return Tag property
       */
      this.getTagProperty = function (id) {
        if (data.tags[id]) {
          return {
            id: id,
            name: data.tags[id].name,
            type: data.tags[id].type,
            format: data.tags[id].format,
          };
        } else {
          return null;
        }
      };
    
      /**
       * Return Tags property
       */
      this.getTagsProperty = function () {
        return new Promise(function (resolve, reject) {
          try {
            resolve({
              tags: Object.values(requestItemsMap),
              newTagsCount: newItemsCount,
            });
          } catch (err) {
            reject(err);
          }
        });
      };
    
      /**
       * Return the Daq settings of Tag
       * @returns
       */
      this.getTagDaqSettings = (tagId) => {
        return data.tags[tagId] ? data.tags[tagId].daq : null;
      };
    
      /**
       * Set Daq settings of Tag
       * @returns
       */
      this.setTagDaqSettings = (tagId, settings) => {
        if (data.tags[tagId]) {
          utils.mergeObjectsValues(data.tags[tagId].daq, settings);
        }
      };
    
      // console.log('XX URL XX', JSON.parse(data.property.address));
      var _checkConnection = async function (deviceId) {
        try {
          // Fetch the device details from Prisma
          const device = await prisma.device.findUnique({
            where: { id: deviceId },
          });
      
          if (!device) {
            console.error(`Device with ID '${deviceId}' not found.`);
            return false; // Connection check failed
          }
      
          // Parse the device property
          const property = device.property ? JSON.parse(device.property) : {};
      
          if (!property.address) {
            console.error(`Device '${device.name}' is missing a valid address.`);
            return false; // Connection check failed
          }
      
          // Simulate a connection check by validating the address
          const response = await axios.get(property.address).catch((err) => {
            console.error(`Connection check failed for '${device.name}': ${err.message}`);
            return false;
          });
      
          if (response && response.status === 200) {
            return true;
          } else {
            console.error(`Connection validation failed for device '${device.name}'.`);
            return false;
          }
        } catch (error) {
          console.error(`Error checking connection for deviceId '${deviceId}': ${error.message || error}`);
          return false; // Connection check failed
        }
      };
      
      
  
      
      const _readRequest = async (property) => {
        try {
            const response = await axios.get(property.address); // Fetch data from the device
            lastTimestampRequest = new Date().getTime(); // Track when the last request was made
            return response.data; // Return the fetched data
        } catch (error) {
            console.error(`Error fetching data from ${property.address}: ${error.message}`);
            throw error;
        }
    };
    


  
      
    
      /**
       * Clear the Tags values by setting to null
       * Emit to clients
       */
      var _clearVarsValue = function (deviceId) {
        for (var id in varsValue) {
          varsValue[id].value = null;
        }
        _emitValues(varsValue,deviceId);
      };
    
      /** // if the request was updated if data get changed
       * Update the Tags values read
       * For WebAPI NotOwn: first convert the request data to a flat struct
       * @param {*} reqdata
       */
    
      
      
      
    
    
    


   

const varsValueCache = new Map(); // Key: deviceId, Value: varsValue map for each device

const _updateVarsValue = async (reqdata, deviceId, io) => {
  console.log(`_updateVarsValue called for deviceId: ${deviceId}`);

  const timestamp = new Date().getTime();
  const flatData = dataToFlat(reqdata, apiProperty);
// console.log('📢 flatData', flatData);
  if (!varsValueCache.has(deviceId)) {
      varsValueCache.set(deviceId, {});
  }
  const varsValue = varsValueCache.get(deviceId);

  const changed = {};
  const allTags = {};

 
  // 🔄 Fetch device and its tags directly from Prisma
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { tags: true }, // Ensure tags are fetched
  });

  if (!device ) {
      console.error(`❌ Device '${deviceId}' not found `);
      return;
  }

  // Create a lookup map for tag addresses -> IDs
  const tagIdMap = new Map(device.tags.map(tag => [tag.address, tag.id]));

  for (const [key, newValue] of Object.entries(flatData)) {
      // ✅ Get the type of value from `flatData`
      const newType = typeof newValue;
      const normalizedKey = normalizeKey(key);
      const oldValue = varsValue[normalizedKey]?.value;
      const tagId = tagIdMap.get(normalizedKey) || null;
      allTags[normalizedKey] = {
          tagId,  
          value: (newValue),
       
          newType,
          oldValue,
          timestamp: varsValue[normalizedKey]?.timestamp || timestamp,
          changed: oldValue !== (newValue),
      };
      // console.log(`🆕 New Type for '${normalizedKey}': ${newType}, Value: ${newValue}`);

      if (tagId && oldValue !== (newValue)) {
          varsValue[normalizedKey] = { value: (newValue), timestamp };
          changed[normalizedKey] = { tagId, value: (newValue), timestamp };

          // ✅ Update tag value in the database
          await updateTagValue(tagId, (newValue));
      }
  }

  // console.log('📢 variable-changes', { deviceId, changes: allTags });

  // Emit the updated tags (with tagId) via WebSocket
  io.emit('variable-changes', { deviceId, changes: allTags  });

  return changed;
};


const updateTagValue = async (tagId, newValue) => {
  try {
      const updatedTag = await prisma.tag.update({
          where: { id: tagId },
          data: {
              value: String (newValue),
              updatedAt: new Date(),
          },
      });

      // console.log(`✅ Tag '${updatedTag.label}' (ID: ${tagId}) updated to value: ${newValue}`);
  } catch (error) {
      console.error(`❌ Error updating tag ID '${tagId}':`, error.message);
  }
};




/**
 * Emit the webapi connection status
 * @param {*} status
 */
const _emitStatus = function (status, deviceId) {
  // console.log(`_emitStatus called with deviceId: ${deviceId}`); // Log the deviceId
  lastStatus = status;
  events.emit('device-status:changed', { id: deviceId, status });
  console.log('device-status:changed', { id: deviceId, status });
};

const _emitValues = function (values, deviceId) {
  // console.log(`_emitValues called with deviceId: ${deviceId}`); // Log the deviceId
  events.emit('device-value:changed', { id: deviceId, values });
  // console.log('device-value:changed', { id: deviceId, values });
};

    
      /**
       * Used to manage the async connection and polling automation (that not overloading)
       * @param {*} check
       */
      var _checkWorking = function (check) {
        if (check && working) {
          overloading++;
          logger.warn(
            `'${data.name}' working (connection || polling) overload! ${overloading}`
          );
          // !The driver don't give the break connection
          if (overloading >= 3) {
            connected = false;
            // disconnect();
          } else {
            return false;
          }
        }
        working = check;
        overloading = 0;
        return true;
      };
    
      /**
       * Cheack and parse the value return converted value
       * @param {*} type as string
       * @param {*} value as string
       * return converted value
       */
       /**
     * Cheack and parse the value return converted value
     * @param {*} type as string
     * @param {*} value as string
     * return converted value
     */
    var _parseValue = function (type, value) {
      if (type === 'number') {
          return parseFloat(value);
      } else if (type === 'boolean') {
          return Boolean(value);
      } else if (type === 'string') {
          return value;
      } else {
          let val = parseFloat(value);
          if (Number.isNaN(val)) {
              // maybe boolean
              val = Number(value);
              // maybe string
              if (Number.isNaN(val)) {
                  val = value;
              }
          } else {
              val = parseFloat(val.toFixed(5));
          }
          return val;
      }
  }
}

function normalizeKey(key) {
  return key
      .replace(/:/g, '.')          // Convert colons `:` to dots `.`
      .replace(/\[(\d+)\]/g, '.$1'); // Convert array brackets `[0]` to dot notation `.0`
}

function dataToFlat(data, property) {
  const parseTree = (nodes, parentKey = '') => {
      let result = {};

      if (Array.isArray(nodes)) {
          nodes.forEach((item, index) => {
              const newKey = parentKey ? `${parentKey}[${index}]` : `[${index}]`;
              Object.assign(result, parseTree(item, newKey));
          });
      } else if (nodes && typeof nodes === 'object') {
          Object.keys(nodes).forEach((key) => {
              const newKey = parentKey ? `${parentKey}.${key}` : key;
              Object.assign(result, parseTree(nodes[key], newKey));
          });
      } else {
          result[parentKey] = nodes;
      }

      return result;
  };

  // Flatten the data
  const flattenedData = parseTree(data);

  // Normalize keys for comparison
  const normalizedData = {};
  for (const key in flattenedData) {
      const normalizedKey = normalizeKey(key); // Normalize keys here
      normalizedData[normalizedKey] = flattenedData[key];
  }

  return normalizedData;
}

/**
 * Return the result of http request
 */
function getRequestResult(property) {
    return new Promise(function (resolve, reject) {
        try {
            if (property.method === 'GET') {
                axios.get(property.address).then(res => {
                    resolve(res.data);
                }).catch(err => {
                    reject(err);
                });
            } else {
                reject('getrequestresult-error: method is missing!');
            }
        } catch (err) {
            reject('getrequestresult-error: ' + err);
        }
    });
}

module.exports = {
    init: function (settings) {
        // deviceCloseTimeout = settings.deviceCloseTimeout || 15000;
    },
    create: function (data, logger, events, runtime,prisma ,io) {
        return new HTTPclient(data, logger, events, runtime, prisma,io);
    },
    getRequestResult: getRequestResult
    , dataToFlat: dataToFlat,
    
}


     