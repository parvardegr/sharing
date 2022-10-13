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
    portfinder: {
        port: 7478,
        stopPort: 8000
    }
};