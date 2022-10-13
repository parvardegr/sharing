const os = require('node:os');
const config = require('./config');


const getNetworkAddress = () => {
    for (const interfaceDetails of Object.values(os.networkInterfaces())) {
        if (!interfaceDetails)
            continue;
        for (const details of interfaceDetails) {
            const { address, family, internal } = details;
            if (family === "IPv4" && !internal)
                return address;
        }
    }
};

const debugLog = (log) => {
    if (config.debug)
        console.log(log);
}

module.exports = {
    getNetworkAddress,
    debugLog
}