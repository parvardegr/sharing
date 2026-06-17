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
    'sharing — quickly share files, directories, and clipboard content from your',
    'terminal to any device with a browser.',
    '',
    'Examples:',
    '',
    '  Share file or directory',
    '  $ sharing /path/to/file-or-directory',
    '',
    '  Share clipboard content',
    '  $ sharing -c',
    '',
    '  Receive files from another device',
    '  $ sharing /destination/directory --receive',
    '',
    '  Share with basic authentication',
    '  $ sharing /path/to/file-or-directory -U user -P password',
    '',
    '  Share over HTTPS',
    '  $ sharing /path/to/file-or-directory -S -C cert.pem -K key.pem',
].join('\n');

// Main
(async () => {
    const options = yargs
        .usage(usage)
        .option('debug', { describe: 'Enable debug logging', type: 'boolean', default: false })
        .option('p', { alias: 'port', describe: 'Set the server port (default: auto-assigned)', type: 'number' })
        .option('ip', { describe: 'Specify your machine\'s public IP address', type: 'string' })
        .option('i', { alias: 'interface', describe: 'Network interface/adapter name to advertise (e.g. en0, eth0)', type: 'string' })
        .option('c', { alias: 'clipboard', describe: 'Share clipboard content', type: 'boolean' })
        .option('t', { alias: 'tmpdir', describe: 'Set temporary directory for clipboard files', type: 'string' })
        .option('w', { alias: 'on-windows-native-terminal', describe: 'Enable QR code rendering in Windows native terminal', type: 'boolean' })
        .option('r', { alias: 'receive', describe: 'Receive files from another device', type: 'boolean' })
        .option('q', { alias: 'receive-port', describe: 'Set the port for receiving files', type: 'number' })
        .option('U', { alias: 'username', describe: 'Set username for basic authentication', type: 'string', default: 'user' })
        .option('P', { alias: 'password', describe: 'Set password for basic authentication', type: 'string' })
        .option('S', { alias: 'ssl', describe: 'Enable HTTPS', type: 'boolean' })
        .option('C', { alias: 'cert', describe: 'Path to SSL certificate file', type: 'string' })
        .option('K', { alias: 'key', describe: 'Path to SSL private key file', type: 'string' })
        .option('tunnel', { describe: 'Show guide for sharing over the internet via tunnel services', type: 'boolean' })
        .help(true)
        .argv;

    config.debug = options.debug;

    // Windows native terminal can't render small QR codes
    config.qrcode.small = !options.onWindowsNativeTerminal;

    if (options.tunnel) {
        const tunnelGuide = [
            '',
            'Tunnel Guide: Expose your share over the internet',
            '='.repeat(50),
            '',
            'When to use a tunnel:',
            '  You are on a local network (home Wi-Fi, office, hotel, etc.) and',
            '  want to share files with someone who is NOT on the same network.',
            '  For example, sharing photos from your laptop at home with a friend',
            '  across the city — without needing a public IP address.',
            '',
            'How it works:',
            '  1. Start sharing as usual:  $ sharing /path/to/files',
            '  2. In a separate terminal, run one of the tunnel commands below.',
            '  3. Share the public URL the tunnel service gives you.',
            '',
            'Tunnel services:',
            '',
            '1. ngrok (https://ngrok.com/docs/getting-started/)',
            '   $ ngrok http {port}',
            '',
            '2. localtunnel (https://theboroer.github.io/localtunnel-www/)',
            '   $ npx localtunnel --port {port}',
            '',
            '3. cloudflared (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)',
            '   $ cloudflared tunnel --url http://localhost:{port}',
            '',
            '4. ssh reverse tunnel',
            '   $ ssh -R 80:localhost:{port} your-server',
            '',
            'Replace {port} with the port number shown when you start sharing',
            '(default: 7478).',
            '',
        ].join('\n');
        console.log(tunnelGuide);
        process.exit(0);
    }

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
        console.error('Error: No file or directory specified.\n');
        console.error('Usage:  sharing <path>       Share a file or directory');
        console.error('        sharing -c           Share clipboard content');
        console.error('        sharing --help       Show all available options');
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

    const interfaceCandidates = utils.getNetworkInterfaces();
    const host = options.ip || utils.getNetworkAddress(options.interface);
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

        // If several network addresses exist and the user didn't pin one, surface
        // them so a wrong-interface guess is easy to correct.
        if (!options.ip && !options.interface && interfaceCandidates.length > 1) {
            const others = interfaceCandidates
                .filter((c) => c.address !== host)
                .map((c) => c.name + ' (' + c.address + ')')
                .join(', ');
            if (others) {
                console.log('\nAdvertising ' + host + '. Other addresses: ' + others);
                console.log('  (wrong one? pick with --interface <name> or --ip <addr>)');
            }
        }

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
