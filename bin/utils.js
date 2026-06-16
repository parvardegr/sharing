const os = require('os');
const config = require('./config');

const getNetworkAddress = () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const details = interfaces[name];
        if (!details) continue;
        for (const detail of details) {
            if (detail.family === 'IPv4' && !detail.internal) {
                return detail.address;
            }
        }
    }
    return '127.0.0.1';
};

const debugLog = (log) => {
    if (config.debug) {
        console.log(log);
    }
};

module.exports = {
    getNetworkAddress,
    debugLog,
};