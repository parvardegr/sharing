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
    appPort: 7478,
    appStopPort: 8000,
    receivePort: 1374,
    receiveStopPort: 1400, 
};