#! /usr/bin/env node


const fs = require('fs');
const http = require('http');
const _path = require("path");
const os = require('node:os');
const yargs = require("yargs");
const handler = require('serve-handler');
const qrcode = require('qrcode-terminal');
const portfinder = require('portfinder');


// Usage
const usage = `
Usage:
• Share file or directory
$ sharing /path/to/file-or-directory

• Share clipboard
$ sharing -c

• Receive file (Soon!)
$ sharing /destination/directory --receive`;


// Config
const config = { 
    debug: false,
    qrcode: {
        small: true
    }
};


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

var debugLog = (log) => {
    if (config.debug)
        console.log(log);
}



// Main
(async () => {

    const options = yargs
        .usage(usage)
        .option("debug", { describe: "enable debuging logs", demandOption: false })
        .option("p", { alias: 'port', describe: "Change default port", demandOption: false })
        .option("ip", { describe: "Your machine public ip address", demandOption: false })
        .option("c", { alias: 'clipboard', describe: "Share Clipboard", demandOption: false })
        .option("w", { alias: 'on-windows-native-terminal', describe: "Enable QR-Code support for windows native terminal", demandOption: false })
        .help(true)
        .argv;

    if (options.debug)
        config.debug = true;

    if (options.onWindowsNativeTerminal) {
        // seems windows os can't support small option on native terminal, refer to https://github.com/gtanner/qrcode-terminal/pull/14/files
        config.qrcode.small = false;
    }
 
    let path = undefined;
    let fileName = undefined;
    
    if (options.clipboard) {

        const clipboard = await import('clipboardy');
        
        const data = clipboard.default.readSync();
        debugLog(`clipboard data:\n ${data}`);

        let filePath = data.substring(data.indexOf('file://') + 'file://'.length).trim();
        filePath = decodeURI(filePath);
        debugLog(`clipboard file path:\n ${filePath}`);

        if (fs.existsSync(filePath)) {
            debugLog(`clipboard file ${filePath} found`);
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
            file = '/' + encodeURIComponent(fileName);
        }

        if (options.clipboard)
            usageMessage = 'Scan the QR-Code to access your Clipboard'

        const time = new Date().getTime();
        const urlInfo = `:${options.port}${file}?time=${time}`;
        const shareAddress = options.ip? `http://${options.ip}${urlInfo}`: `http://${getNetworkAddress()}${urlInfo}`;
        
        console.log(usageMessage);

        qrcode.generate(shareAddress, config.qrcode);

        if (!options.clipboard)
            console.log(`Or enter the following address in a browser tab in your phone: ${shareAddress}`);

        console.log('Press ctrl+c to stop sharing');
    }

    if (options.port)
        server.listen(options.port, listener);
    else {
        portfinder.getPort({
            port: 7478,
            stopPort: 8000
        }, (err, port) => {
            options.port = port;
            server.listen(port, listener);
        });
    }

})();
