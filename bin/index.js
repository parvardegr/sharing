#! /usr/bin/env node


const fs = require('fs');
const http = require('http');
const _path = require("path");
const os = require('node:os');
const yargs = require("yargs");
const handler = require('serve-handler');
const qrcode = require('qrcode-terminal');
const portfinder = require('portfinder');
const qrcodeOption = { small: true };

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
        .option("w", { alias: 'on-windows-native-terminal', describe: "Enable QR-Code support for windows native terminal", type: "boolean", demandOption: false })
        .help(true)
        .argv;


    let path = undefined;
    let fileName = undefined;

    if (options.onWindowsNativeTerminal) {
        // seems windows os can't support small option on native terminal, refer to https://github.com/gtanner/qrcode-terminal/pull/14/files
        qrcodeOption.small = false;
    }

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

    const server = http.createServer((request, response) => {
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
        const shareAddress = options.ip? `http://${options.ip}${urlInfo}`: `http://${getNetworkAddress()}${urlInfo}`;
        
        console.log(usageMessage);

        qrcode.generate(shareAddress, qrcodeOption);

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
