#! /usr/bin/env node


const fs = require('fs');
const http = require('http');
const _path = require("path");
const os = require('node:os');
const yargs = require("yargs");
const handler = require('serve-handler');
const qrcode = require('qrcode-terminal');


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
        .option("p", { alias: 'port', default: 7478, describe: "Change default port", demandOption: false })
        .option("ip", { describe: "Your machine public ip address", type: "string", demandOption: false })
        .option("c", { alias: 'clipboard', describe: "Share Clipboard", type: "boolean", demandOption: false })                                                                                             
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
        const justPath = path.substring(0, path.lastIndexOf("/") + 1);
        fileName = path.substring(path.lastIndexOf("/") + 1, path.length);
        path = justPath;
    }

    const server = http.createServer((request, response) => {
        return handler(request, response, { public: path });
    });

    server.listen(options.port, () => {
        let usageMessage = `Scan the QR-Code to access '${path}' directory on your phone`;
        let file = '';
        if (fileName) {
            usageMessage = `Scan the QR-Code to access '${fileName}' file on your phone`;
            file = '/' + fileName;
        }
    
        if (options.clipboard)
            usageMessage = 'Scan the QR-Code to access your Clipboard'

        const shareAddress = options.ip? `http://${options.ip}:${options.port}${file}`: `http://${getNetworkAddress()}:${options.port}${file}`;
        
        console.log(usageMessage);
    
        qrcode.generate(shareAddress, { small: true });
    
        if (!options.clipboard)
            console.log(`Or enter the following address in a browser tab in your phone: ${shareAddress}`);

        console.log('Press ctrl+c to stop sharing')
    });

})();

