
// The events.js file is like a messenger and coordinator for the project. Here's what it does in simple terms:

// Defines Types of Messages: It lists all the different kinds of messages (events) that can happen in the system, such as:

// Device status updates
// Alarm notifications
// Data queries
// Heartbeat signals (to ensure everything is running)
// Creates a Messenger: It provides a tool (an event emitter) that can send and listen for these messages across different parts of the project.

// Facilitates Communication: It allows different parts of the project (like devices, alarms, and the frontend) to talk to each other by emitting (sending) and reacting to these events.

// In short, the events.js file is the messenger service that helps the various pieces of the project stay coordinated and communicate efficiently.








var events = require("events");

/**
 * @enum
 */
const IoEventTypes = {
    DEVICE_STATUS: 'device-status',
    DEVICE_PROPERTY: 'device-property',
    DEVICE_VALUES: 'device-values',
    DEVICE_BROWSE: 'device-browse',
    DEVICE_NODE_ATTRIBUTE: 'device-node-attribute',
    DEVICE_WEBAPI_REQUEST: 'device-webapi-request',
    DEVICE_TAGS_REQUEST: 'device-tags-request',
    DEVICE_TAGS_SUBSCRIBE: 'device-tags-subscribe',
    DEVICE_TAGS_UNSUBSCRIBE: 'device-tags-unsubscribe',
    DEVICE_ENABLE: 'device-enable',
    DAQ_QUERY: 'daq-query',
    DAQ_RESULT: 'daq-result',
    DAQ_ERROR: 'daq-error',
    ALARMS_STATUS: 'alarms-status',
    HOST_INTERFACES: 'host-interfaces',
    SCRIPT_CONSOLE: 'script-console',
    ALIVE: 'heartbeat',
}

// module.exports = IoEventTypes;

module.exports = {
    create: function () {
        return new events.EventEmitter();
    },
    IoEventTypes: IoEventTypes
}