#! /usr/bin/env node


const fs = require('fs');
const http = require('http');
const _path = require("path");
const os = require('node:os');
const yargs = require("yargs");
const handler = require('serve-handler');
const qrcode = require('qrcode-terminal');
const portfinder = require('portfinder');
const express = require('express');
const fileUpload = require('express-fileupload');

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
        .option("r", { alias: 'receive', describe: "Receive files", demandOption: false })
        .option("q", { alias: 'receive-port', describe: "change receive default port", demandOption: false })
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
    
    if (options.receive) {
        const app = express();
        let uploadAddress = options.ip? `http://${options.ip}:${options.receivePort}/form`: `http://${getNetworkAddress()}:${options.receivePort}/form`;

        app.use(fileUpload());

        const form = fs.readFileSync('./bin/upload-form.html');

        app.get('/form', (req, res) => {
            res.send(form.toString());
        });

        app.post('/upload', (req, res) => {
            if (!req.files || Object.keys(req.files).length === 0) {
                res.status(400).send('No files were uploaded.');
                return;
            }

            const selectedFile = req.files.selected;

            const uploadPath = _path.resolve(__dirname, path) + '/' + selectedFile.name;
            debugLog(`upload path: ${uploadPath}`);

            selectedFile.mv(uploadPath).then(err => {
                if (err) {
                    return res.status(500).send(err);
                }

                res.send(`
                    <script>
                        window.alert('Shared at ${uploadPath}');
                        window.location.href = '${uploadAddress}';
                    </script>
                `);
            });
        });

        const listener = () => {
            console.log('\nScan the QR-Code to upload your file');
            qrcode.generate(uploadAddress, config.qrcode);
            console.log(`or access this link: ${uploadAddress}\n`);

            console.log('Press ctrl+c to stop sharing');
        }

        if (options.receivePort)
            app.listen(options.receivePort, listener);
        else {
            portfinder.getPort({
                port: 1374,
                stopPort: 1400
            }, (err, port) => {
                options.receivePort = port;
                uploadAddress = options.ip? `http://${options.ip}:${options.receivePort}/form`: `http://${getNetworkAddress()}:${options.receivePort}/form`;
                app.listen(port, listener);
            });
        }

    }

    const shareApp = express();
    shareApp.get('*', (req, res) => handler(req, res, { public: path }));

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
            console.log(`or access this link: ${shareAddress}`);

        if(!options.receive)
            console.log('\nPress ctrl+c to stop sharing');
    }

    if (options.port)
        shareApp.listen(options.port, listener);
    else {
        portfinder.getPort({
            port: 7478,
            stopPort: 8000
        }, (err, port) => {
            options.port = port;
            shareApp.listen(port, listener);
        });
    }

})();
