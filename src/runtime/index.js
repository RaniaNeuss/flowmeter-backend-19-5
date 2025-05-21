var Promise = require('bluebird'); // Import Bluebird for promises
var Events = require('./events'); // Import custom event manager
var events = Events.create(); // Create an event emitter instance
var devices = require('./devices'); // Manage devices
var project = require('./project'); // Handle project management
var users = require('./users'); // Manage users
var alarms = require('./alarms'); // Handle alarms
var notificator = require('./notificator'); // Manage notifications
var scripts = require('./scripts'); // Handle scripts
var plugins = require('./plugins'); // Manage plugins
var utils = require('./utils'); // Utility functions
const daqstorage = require('./storage/daqstorage'); // Data acquisition storage manager
var jobs = require('./jobs'); // Handle scheduled jobs

// Globals
var api;
var settings;
var logger;
var io; // Socket.IO server instance
var alarmsMgr; // Alarm manager instance
var notificatorMgr; // Notification manager instance
var scriptsMgr; // Scripts manager instance
var jobsMgr; // Jobs manager instance
var tagsSubscription = new Map(); // Tag subscriptions map
var socketPool = new Map(); // Pool of active socket connections
var socketMutex = new Map(); // Mutex for managing socket concurrency

// Initialize the runtime module
function init(_io, _api, _settings, _log, eventsMain) {
    io = _io; // Assign Socket.IO instance
    settings = _settings; // Assign settings
    logger = _log; // Assign logger
    api = _api; // Assign API handler

    // Check if initialization is complete and notify main
    var checkInit = function () {
        if (!events.listenerCount('init-plugins-ok') &&
            !events.listenerCount('init-users-ok') &&
            !events.listenerCount('init-project-ok')) {
            eventsMain.emit('init-runtime-ok'); // Notify main of successful initialization
        }
    };

    // Setup event listeners to check for initialization completion
    events.once('init-plugins-ok', checkInit);
    events.once('init-users-ok', checkInit);
    events.once('init-project-ok', checkInit);

    // Initialize various modules
    daqstorage.init(settings, logger);

    plugins.init(settings, logger).then(result => {
        logger.info('runtime init plugins successful!', true);
        events.emit('init-plugins-ok');
    }).catch(function (err) {
        logger.error('runtime.failed-to-init plugins');
    });

    users.init(settings, logger).then(result => {
        logger.info('runtime init users successful!', true);
        events.emit('init-users-ok');
    }).catch(function (err) {
        logger.error('runtime.failed-to-init users');
    });

    project.init(settings, logger, runtime).then(result => {
        logger.info('runtime init project successful!', true);
        events.emit('init-project-ok');
    }).catch(function (err) {
        logger.error('runtime.failed-to-init project');
    });

    // Create managers for alarms, notifications, scripts, and jobs
    alarmsMgr = alarms.create(runtime);
    notificatorMgr = notificator.create(runtime);
    scriptsMgr = scripts.create(runtime);
    jobsMgr = jobs.create(runtime);

    // Initialize device handling
    devices.init(runtime);

    // Register event listeners for runtime
    events.on('project-device:change', updateDevice);
    events.on('device-value:changed', updateDeviceValues);
    events.on('device-status:changed', updateDeviceStatus);
    events.on('alarms-status:changed', updateAlarmsStatus);
    events.on('tag-change:subscription', subscriptionTagChange);
    events.on('script-console', scriptConsoleOutput);

    // Handle client connections via Socket.IO
    io.on('connection', async (socket) => {
        logger.info(`socket.io client connected`);
        socket.tagsClientSubscriptions = []; // Initialize subscription array

        // Handle authentication if secure mode is enabled
        if (settings.secureEnabled && !settings.secureOnlyEditor) {
            const token = socket.handshake.query.token;
            if (!token || token === 'null') {
                socket.disconnect();
                logger.error(`Token is missing!`);
            } else {
                try {
                    const authenticated = await api.authJwt.verify(token);
                    if (!authenticated) {
                        logger.error(`Token error!`);
                        socket.disconnect();
                    }
                } catch (error) {
                    logger.error(`Token error: ${error}`);
                    socket.disconnect();
                }
            }
        }

        // Handle device status requests from the client
        socket.on(Events.IoEventTypes.DEVICE_STATUS, (message) => {
            if (message === 'get') {
                var adevs = devices.getDevicesStatus();
                for (var id in adevs) {
                    updateDeviceStatus({ id: id, status: adevs[id] });
                }
            } else {
                updateDeviceStatus(message);
            }
        });

        // Handle device property requests
        socket.on(Events.IoEventTypes.DEVICE_PROPERTY, (message) => {
            try {
                if (message && message.endpoint && message.type) {
                    devices.getSupportedProperty(message.endpoint, message.type).then(result => {
                        message.result = result;
                        io.emit(Events.IoEventTypes.DEVICE_PROPERTY, message);
                    }).catch(function (err) {
                        logger.error(`${Events.IoEventTypes.DEVICE_PROPERTY}: ${err}`);
                        message.error = err;
                        io.emit(Events.IoEventTypes.DEVICE_PROPERTY, message);
                    });
                } else {
                    logger.error(`${Events.IoEventTypes.DEVICE_PROPERTY}: wrong message`);
                    message.error = 'wrong message';
                    io.emit(Events.IoEventTypes.DEVICE_PROPERTY, message);
                }
            } catch (err) {
                logger.error(`${Events.IoEventTypes.DEVICE_PROPERTY}: ${err}`);
            }
        });

        // Handle device values requests
        socket.on(Events.IoEventTypes.DEVICE_VALUES, (message) => {
            try {
                if (message === 'get') {
                    var adevs = devices.getDevicesValues();
                    for (var id in adevs) {
                        updateDeviceValues({ id: id, values: adevs[id] });
                    }
                } else if (message.cmd === 'set' && message.var) {
                    devices.setDeviceValue(message.var.source, message.var.id, message.var.value, message.fnc);
                }
            } catch (err) {
                logger.error(`${Events.IoEventTypes.DEVICE_VALUES}: ${err}`);
            }
        });
        // (Additional event handling code continues...)
    });

    // Periodic heartbeat message to clients
    setInterval(() => {
        io.emit(Events.IoEventTypes.ALIVE, { message: 'FUXA server is alive!' });
    }, 10000);
}

// Start the runtime
function start() {
    return new Promise(function (resolve, reject) {
        project.load().then(result => {
            devices.start().then(() => resolve(true)).catch(err => {
                logger.error('runtime.failed-to-start-devices: ' + err);
                reject();
            });
            alarmsMgr.start().then(() => resolve(true)).catch(err => {
                logger.error('runtime.failed-to-start-alarms: ' + err);
                reject();
            });
            notificatorMgr.start().then(() => resolve(true)).catch(err => {
                logger.error('runtime.failed-to-start-notificator: ' + err);
                reject();
            });
            scriptsMgr.start().then(() => resolve(true)).catch(err => {
                logger.error('runtime.failed-to-start-scripts: ' + err);
                reject();
            });
            jobsMgr.start().then(() => resolve(true)).catch(err => {
                logger.error('runtime.failed-to-start-jobs: ' + err);
                reject();
            });
        }).catch(err => {
            logger.error('runtime.failed-to-start: ' + err);
            reject();
        });
    });
}

// Stop the runtime
function stop() {
    return new Promise(function (resolve, reject) {
        devices.stop().then(() => {}).catch(err => {
            logger.error('runtime.failed-to-stop-devices: ' + err);
        });
        alarmsMgr.stop().then(() => {}).catch(err => {
            logger.error('runtime.failed-to-stop-alarms: ' + err);
        });
        notificatorMgr.stop().then(() => {}).catch(err => {
            logger.error('runtime.failed-to-stop-notificator: ' + err);
        });
        scriptsMgr.stop().then(() => {}).catch(err => {
            logger.error('runtime.failed-to-stop-scriptsMgr: ' + err);
        });
        jobsMgr.stop().then(() => {}).catch(err => {
            logger.error('runtime.failed-to-stop-jobsMgr: ' + err);
        });
        resolve(true);
    });
}

// Update runtime with new data
function update(cmd, data) {
    return new Promise(function (resolve, reject) {
        try {
            // Handle various update commands
            if (cmd === project.ProjectDataCmdType.SetDevice) {
                devices.updateDevice(data);
                alarmsMgr.reset();
            } else if (cmd === project.ProjectDataCmdType.DelDevice) {
                devices.removeDevice(data);
                alarmsMgr.reset();
            } else if (cmd === project.ProjectDataCmdType.SetAlarm || cmd === project.ProjectDataCmdType.DelAlarm) {
                alarmsMgr.reset();
                notificatorMgr.reset();
            } else if (cmd === project.ProjectDataCmdType.SetNotification || cmd === project.ProjectDataCmdType.DelNotification) {
                notificatorMgr.reset();
            } else if (cmd === project.ProjectDataCmdType.SetScript) {
                scriptsMgr.updateScript(data);
            } else if (cmd === project.ProjectDataCmdType.DelScript) {
                scriptsMgr.removeScript(data);
            } else if (cmd === project.ProjectDataCmdType.SetReport || cmd === project.ProjectDataCmdType.DelReport) {
                jobsMgr.reset();
            }
            resolve(true);
        } catch (err) {
            logger.error(err.stack || err);
            reject();
        }
    });
}

// Restart the runtime
function restart(clear) {
    return new Promise(function (resolve, reject) {
        stop().then(() => {
            if (clear) {
                alarmsMgr.clear();
                notificatorMgr.clear();
            }
            logger.info('runtime.update-project: stopped!', true);
            start().then(() => {
                logger.info('runtime.update-project: restart!');
                resolve(true);
            }).catch(err => {
                logger.error('runtime.update-project-start: ' + err);
                reject();
            });
        }).catch(err => {
            logger.error('runtime.update-project-stop: ' + err);
            reject();
        });
    });
}

// Helper functions for updating device and transmitting events
function updateDevice(event) {
    console.log('emit updateDevice: ' + event);
}
function updateDeviceValues(event) {
    // Emit updated device values to clients
}
function updateDeviceStatus(event) {
    // Emit updated device status to clients
}
function updateAlarmsStatus() {
    // Emit alarm status to clients
}
function scriptConsoleOutput(output) {
    // Emit script console output to clients
}
function scriptSendCommand(command) {
    // Emit script commands to clients
}

// Export runtime module
var runtime = module.exports = {
    init,
    project,
    users,
    plugins,
    start,
    stop,
    update,
    restart,
    get io() { return io },
    get logger() { return logger },
    get settings() { return settings },
    get devices() { return devices },
    get daqStorage() { return daqstorage },
    get alarmsMgr() { return alarmsMgr },
    get notificatorMgr() { return notificatorMgr },
    get scriptsMgr() { return scriptsMgr },
    get jobsMgr() { return jobsMgr },
    events,
    scriptSendCommand,
};
