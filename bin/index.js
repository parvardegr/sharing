#! /usr/bin/env node


const fs = require('fs');
const http = require('http');
const https = require('https');
const _path = require("path");
const os = require('node:os');
const yargs = require("yargs");
const handler = require('serve-handler');
const qrcode = require('qrcode-terminal');
const portfinder = require('portfinder');
let securityConfig = {
    module: http,
    protocol: 'http',
    option: {}
};

portfinder.setBasePort(7478);
portfinder.setHighestPort(8000);

// Utils
var getNetworkAddress = () => {
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


// Main
(async () => {

    const options = yargs
        .usage("\nUsage: sharing <directory-or-file-path>")
        .option("p", { alias: 'port', describe: "Change default port", type: "integer", demandOption: false })
        .option("ip", { describe: "Your machine public ip address", type: "string", demandOption: false })
        .option("c", { alias: 'clipboard', describe: "Share Clipboard", type: "boolean", demandOption: false })
        .option("S", { alias: 'ssl', describe: "Enabel https", type: "boolean", demandOption: false })
        .option("C", { alias: 'cert', describe: "Path to ssl cert file", type: "string", demandOption: false })
        .option("K", { alias: 'key', describe: "Path to ssl key file", type: "string", demandOption: false })
        .help(true)
        .argv;


    let path = undefined;
    let fileName = undefined;

    if (options.clipboard) {

        const clipboard = await import('clipboardy');
        
        const data = clipboard.default.readSync();
        const filePath = data.substring(data.indexOf('file://') + 'file://'.length).trim();
        if (fs.existsSync(filePath)) {
            path = filePath;
        } else {
            fs.writeFileSync('.clipboard-tmp', data);
            path = _path.resolve('.clipboard-tmp');
        }

    } else {
        path = options._[0];
    }

    if (!path) {
        console.log('Specify directory or file path.');
        process.exit(1);
    }
    if (!fs.existsSync(path)) {
        console.log('Directory or file not found.');
        process.exit(1);
    }

    if (fs.lstatSync(path).isFile()) {
        let trailingSlash = (path.lastIndexOf("/") > -1) ? '/' : '\\';
        fileName = _path.basename(path);
        path = path.substring(0, path.lastIndexOf(trailingSlash) + 1);
    }

    if (options.ssl) {
        securityConfig = {
            module: https,
            protocol: 'https',
            option: {
                key: fs.readFileSync(_path.resolve(__dirname, options.key)),
                cert: fs.readFileSync(_path.resolve(__dirname, options.cert))
            }
        };
    }

    const server = securityConfig.module.createServer(securityConfig.option, (request, response) => {
        return handler(request, response, { public: path });
    });

    const listener = () => {
        let usageMessage = `Scan the QR-Code to access '${path}' directory on your phone`;
        let file = '';
        if (fileName) {
            usageMessage = `Scan the QR-Code to access '${fileName}' file on your phone`;
            file = '/' + fileName;
        }

        if (options.clipboard)
            usageMessage = 'Scan the QR-Code to access your Clipboard'

        const time = new Date().getTime();
        const urlInfo = `:${options.port}${file}?time=${time}`;
        const shareAddress = options.ip? `${securityConfig.protocol}://${options.ip}${urlInfo}`: `${securityConfig.protocol}://${getNetworkAddress()}${urlInfo}`;
        
        console.log(usageMessage);

        qrcode.generate(shareAddress, { small: true });

        if (!options.clipboard)
            console.log(`Or enter the following address in a browser tab in your phone: ${shareAddress}`);

        console.log('Press ctrl+c to stop sharing');
    }

    if (options.port)
        server.listen(options.port, listener);
    else {
        portfinder.getPort({
            port: 7478,    // start port
            stopPort: 8000 // maximum port
        }, (err, port) => {
            console.log(`Listening on ${port}`);
            options.port = port;
            server.listen(port, listener);
        });
    }

})();
