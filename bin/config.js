const http = require('http');

module.exports = { 
    debug: false,
    qrcode: {
        small: true
    },
    auth: {
        username: undefined,
        password: undefined
    },
    ssl: {
        protocolModule: http,
        protocol: 'http',
        option: {}
    },
    defaultAppPort: 7478,
    defaultAppStopPort: 8000,
    defaultReceivePort: 1374,
    defaultReceiveStopPort: 1400, 
};