#! /usr/bin/env node


const fs = require('fs');
const https = require('https');
const _path = require("path");
const os = require('node:os');
const yargs = require("yargs");
const handler = require('serve-handler');
const qrcode = require('qrcode-terminal');
const portfinder = require('portfinder');
const express = require('express');
const fileUpload = require('express-fileupload');
const basicAuth = require('express-basic-auth')
const config = require('./config');

// Usage
const usage = `
Usage:
• Share file or directory
$ sharing /path/to/file-or-directory

• Share clipboard
$ sharing -c

• Receive file
$ sharing /destination/directory --receive;

• Share file with Basic Authentication
$ sharing /path/to/file-or-directory -U user -P password  # also works with --receive`;

// Utils
var createDefaultApp = () => {
    const app = express();
    if (config.auth.username && config.auth.password) {
        // Setup Basic Auth
        app.use(basicAuth({
            challenge: true,
            realm: 'sharing',
            users: { [config.auth.username]: config.auth.password }
        }));
    }
    return app;
}

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
        .option("U", { default: 'user', alias: 'username', describe: "set basic authentication username", demandOption: false })
        .option("P", { alias: 'password', describe: "set basic authentication password", demandOption: false })
        .option("S", { alias: 'ssl', describe: "Enabel https", demandOption: false })
        .option("C", { alias: 'cert', describe: "Path to ssl cert file", demandOption: false })
        .option("K", { alias: 'key', describe: "Path to ssl key file", demandOption: false })
        .help(true)
        .argv;

    config.debug = options.debug || config.debug;
    // seems windows os can't support small option on native terminal, refer to https://github.com/gtanner/qrcode-terminal/pull/14/files
    config.qrcode.small = !options.onWindowsNativeTerminal;

    if (options.username && options.password) {
        config.auth.username = options.username;
        config.auth.password = options.password;
    }
 
    let path = undefined;
    let fileName = undefined;

    if (options.ssl) {
        if (!options.cert) {
            console.log('Specify the cert path.');
            return;
        }
        
        if (!options.key) {
            console.log('Specify the key path.');
            return;
        }

        config.ssl = {
            protocolModule: https,
            protocol: 'https',
            option: {
                key: fs.readFileSync(_path.resolve(__dirname, options.key)),
                cert: fs.readFileSync(_path.resolve(__dirname, options.cert))
            }
        };
    }

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
    
    const startServer = (app, port, listener) => {
        config.ssl.protocolModule.createServer(config.ssl.option, app).listen(port, listener);
    };
    
    if (options.receive) {
        const app = createDefaultApp();
        let uploadAddress = options.ip && options.receivePort ? `${config.ssl.protocol}://${options.ip}:${options.receivePort}/receive`: `${config.ssl.protocol}://${getNetworkAddress()}:${config.defaultReceivePort}/receive`;
        app.use(fileUpload());

        const form = fs.readFileSync(`${__dirname}/receive-form.html`);

        app.get('/receive', (req, res) => {
            res.send(form.toString());
        });

        app.post('/upload', (req, res) => {
            if (!req.files || Object.keys(req.files).length === 0) {
                res.status(400).send('No files were received.');
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
            startServer(app, options.receivePort, listener);
        else {
            portfinder.getPort({
                port: config.defaultReceivePort,
                stopPort: config.defaultReceiveStopPort
            }, (err, port) => {
                options.receivePort = port;
                uploadAddress = options.ip ? `${config.ssl.protocol}://${options.ip}:${options.receivePort}/receive`: `${config.ssl.protocol}://${getNetworkAddress()}:${options.receivePort}/receive`;
                startServer(app, options.receivePort, listener);
            });
        }

    }

    const shareApp = createDefaultApp();
    shareApp.get('/share/*', (req, res) => {
        handler(req, res, { public: path, etag: true, prefix: '/share' });
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
        const shareAddress = options.ip ? `${config.ssl.protocol}://${options.ip}${urlInfo}`: `${config.ssl.protocol}://${getNetworkAddress()}${urlInfo}`;
        
        console.log(usageMessage);

        qrcode.generate(shareAddress, config.qrcode);

        if (!options.clipboard)
            console.log(`or access this link: ${shareAddress}`);

        if(!options.receive)
            console.log('\nPress ctrl+c to stop sharing');
    }

    if (options.port)
        startServer(shareApp, options.port, listener);
    else {
        portfinder.getPort({
            port: config.defaultAppPort,
            stopPort: config.defaultAppStopPort
        }, (err, port) => {
            options.port = port;
            startServer(shareApp, options.port, listener);
        });
    }

})();
