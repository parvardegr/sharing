#! /usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');
const yargs = require('yargs');
const qrcode = require('qrcode-terminal');
const portfinder = require('portfinder');

const app = require('./app');
const config = require('./config');
const utils = require('./utils');

// Usage
const usage = [
    '',
    'Usage:',
    '• Share file or directory',
    '$ sharing /path/to/file-or-directory',
    '',
    '• Share clipboard',
    '$ sharing -c',
    '',
    '• Receive file',
    '$ sharing /destination/directory --receive;',
    '',
    '• Share file with Basic Authentication',
    '$ sharing /path/to/file-or-directory -U user -P password  # also works with --receive',
].join('\n');

// Main
(async () => {
    const options = yargs
        .usage(usage)
        .option('debug', { describe: 'Enable debugging logs', type: 'boolean', default: false })
        .option('p', { alias: 'port', describe: 'Change default port', type: 'number' })
        .option('ip', { describe: 'Your machine public ip address', type: 'string' })
        .option('c', { alias: 'clipboard', describe: 'Share Clipboard', type: 'boolean' })
        .option('t', { alias: 'tmpdir', describe: 'Clipboard temporary files directory', type: 'string' })
        .option('w', { alias: 'on-windows-native-terminal', describe: 'Enable QR-Code support for windows native terminal', type: 'boolean' })
        .option('r', { alias: 'receive', describe: 'Receive files', type: 'boolean' })
        .option('q', { alias: 'receive-port', describe: 'Change receive default port', type: 'number' })
        .option('U', { alias: 'username', describe: 'Set basic authentication username', type: 'string', default: 'user' })
        .option('P', { alias: 'password', describe: 'Set basic authentication password', type: 'string' })
        .option('S', { alias: 'ssl', describe: 'Enable https', type: 'boolean' })
        .option('C', { alias: 'cert', describe: 'Path to ssl cert file', type: 'string' })
        .option('K', { alias: 'key', describe: 'Path to ssl key file', type: 'string' })
        .help(true)
        .argv;

    config.debug = options.debug;

    // Windows native terminal can't render small QR codes
    config.qrcode.small = !options.onWindowsNativeTerminal;

    if (options.username && options.password) {
        config.auth.username = options.username;
        config.auth.password = options.password;
    }

    let sharePath;
    let fileName;

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
                key: fs.readFileSync(path.resolve(process.cwd(), options.key)),
                cert: fs.readFileSync(path.resolve(process.cwd(), options.cert)),
            },
        };
    }

    const updateClipboardData = () => {
        let clipboard;
        try {
            clipboard = require('clipboardy');
        } catch (e) {
            console.error('Clipboard support is not available. Install clipboardy: npm install clipboardy@2');
            process.exit(1);
        }

        const data = clipboard.readSync();
        utils.debugLog('clipboard data:\n ' + data);

        let filePath = data;
        if (data.indexOf('file://') !== -1) {
            filePath = data.substring(data.indexOf('file://') + 7).trim();
            try { filePath = decodeURI(filePath); } catch (err) { /* ignore */ }
        }
        utils.debugLog('clipboard file path:\n ' + filePath);

        if (fs.existsSync(filePath)) {
            utils.debugLog('clipboard file ' + filePath + ' found');
            sharePath = filePath;
        } else {
            const outPath = options.tmpdir ? path.join(options.tmpdir, '.clipboard-tmp') : '.clipboard-tmp';
            fs.writeFileSync(outPath, data);
            sharePath = path.resolve(outPath);
        }
    };

    if (options.clipboard) {
        updateClipboardData();
    } else {
        sharePath = options._[0];
    }

    if (!sharePath) {
        console.log('Specify directory or file path.');
        process.exit(1);
    }

    sharePath = path.resolve(String(sharePath));

    if (!fs.existsSync(sharePath)) {
        console.log('Directory or file not found.');
        process.exit(1);
    }

    if (fs.lstatSync(sharePath).isFile()) {
        fileName = path.basename(sharePath);
        sharePath = path.dirname(sharePath);
    }

    if (!options.port) {
        options.port = await portfinder.getPortPromise(config.portfinder);
    }

    const host = options.ip || utils.getNetworkAddress();
    const protocol = config.ssl.protocol;
    const baseUrl = protocol + '://' + host + ':' + options.port;

    const uploadAddress = baseUrl + '/receive';
    const file = fileName ? encodeURIComponent(fileName) : '';
    const shareAddress = baseUrl + '/share/' + file;

    const onStart = () => {
        // Handle receive
        if (options.receive) {
            console.log('\nScan the QR-Code to upload your file');
            qrcode.generate(uploadAddress, config.qrcode);
            console.log('access link: ' + uploadAddress + '\n');
        }

        // Handle share
        let usageMessage;
        if (options.clipboard) {
            usageMessage = 'Scan the QR-Code to access your Clipboard';
        } else if (fileName) {
            usageMessage = "Scan the QR-Code to access '" + fileName + "' file on your phone";
        } else {
            usageMessage = "Scan the QR-Code to access '" + sharePath + "' directory on your phone";
        }

        console.log(usageMessage);
        qrcode.generate(shareAddress, config.qrcode);
        console.log('access link: ' + shareAddress);
        console.log('\nPress ctrl+c to stop sharing\n');
    };

    app.start({
        port: options.port,
        sharePath: sharePath,
        receive: options.receive,
        clipboard: options.clipboard,
        updateClipboardData: updateClipboardData,
        onStart: onStart,
        postUploadRedirectUrl: uploadAddress,
        shareAddress: shareAddress,
    });
})();
