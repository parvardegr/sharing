#! /usr/bin/env node

const fs = require('fs');
const https = require('https');
const _path = require("path");
const yargs = require("yargs");
const qrcode = require('qrcode-terminal');
const portfinder = require('portfinder');

const app = require('./app');
const config = require('./config');
const utils = require('./utils');


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


// Main
(async () => {
    const options = yargs
        .usage(usage)
        .option("debug", { describe: "enable debuging logs", demandOption: false })
        .option("p", { alias: 'port', describe: "Change default port", demandOption: false })
        .option("ip", { describe: "Your machine public ip address", demandOption: false })
        .option("c", { alias: 'clipboard', describe: "Share Clipboard", demandOption: false })
        .option("t", { alias: 'tmpdir', describe: "Clipboard Temporary files directory", demandOption: false })
        .option("w", { alias: 'on-windows-native-terminal', describe: "Enable QR-Code support for windows native terminal", demandOption: false })
        .option("r", { alias: 'receive', describe: "Receive files", demandOption: false })
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

    const updateClipboardData = async () => {
        const clipboard = await import('clipboardy');
        
        const data = clipboard.default.readSync();
        utils.debugLog(`clipboard data:\n ${data}`);

        let filePath = data;
        if (data.indexOf('file://') !== -1) {
          filePath = data.substring(data.indexOf('file://') + 'file://'.length).trim();
          try { filePath = decodeURI(filePath); } catch (err) {}
        }
        utils.debugLog(`clipboard file path:\n ${filePath}`);

        if (fs.existsSync(filePath)) {
            utils.debugLog(`clipboard file ${filePath} found`);
            path = filePath;
        } else {
            const outPath = options.tmpdir ? _path.join(options.tmpdir, '.clipboard-tmp') : '.clipboard-tmp';
            fs.writeFileSync(outPath, data);
            path = _path.resolve(outPath);
        }
    }

    if (options.clipboard) {
        await updateClipboardData();
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
    
    options.port = options.port? options.port: await portfinder.getPortPromise(config.portfinder);


    const uploadAddress = options.ip ? `${config.ssl.protocol}://${options.ip}:${options.port}/receive`: `${config.ssl.protocol}://${utils.getNetworkAddress()}:${options.port}/receive`;

    const time = new Date().getTime();
    const file = fileName ? encodeURIComponent(fileName) : '';
    const urlInfo = `:${options.port}/share/${file}?time=${time}`;
    const shareAddress = options.ip ? `${config.ssl.protocol}://${options.ip}${urlInfo}`: `${config.ssl.protocol}://${utils.getNetworkAddress()}${urlInfo}`;    

    const onStart = () => {
        // Handle receive
        if (options.receive) {
            console.log('\nScan the QR-Code to upload your file');
            qrcode.generate(uploadAddress, config.qrcode);
            console.log(`access link: ${uploadAddress}\n`);
        }

        // Handle share
        if (options.clipboard)
            usageMessage = 'Scan the QR-Code to access your Clipboard'
        else usageMessage = fileName? `Scan the QR-Code to access '${fileName}' file on your phone`: `Scan the QR-Code to access '${path}' directory on your phone`;

        console.log(usageMessage);
        qrcode.generate(shareAddress, config.qrcode);
        console.log(`access link: ${shareAddress}`);

        // How to exit
        console.log('\nPress ctrl+c to stop sharing\n');
    }

    app.start({ 
        port: options.port,
        path,
        receive: options.receive,
        clipboard: options.clipboard,
        updateClipboardData,
        onStart,
        postUploadRedirectUrl: uploadAddress,
        shareAddress
    });

})();
