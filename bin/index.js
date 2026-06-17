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

// Open a URL in the host machine's default browser (best effort).
const openBrowser = (url) => {
    const { spawn } = require('child_process');
    let cmd;
    let args;
    if (process.platform === 'darwin') { cmd = 'open'; args = [url]; }
    else if (process.platform === 'win32') { cmd = 'cmd'; args = ['/c', 'start', '""', url]; }
    else { cmd = 'xdg-open'; args = [url]; }
    try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); }
    catch (e) { /* ignore */ }
};

// Main
(async () => {
    const options = yargs
        .usage(usage)
        .option('debug', { describe: 'Enable debug logging', type: 'boolean', default: false })
        .option('p', { alias: 'port', describe: 'Set the server port (default: auto-assigned)', type: 'number' })
        .option('ip', { describe: 'Specify your machine\'s public IP address', type: 'string' })
        .option('i', { alias: 'interface', describe: 'Network interface/adapter name to advertise (e.g. en0, eth0)', type: 'string' })
        .option('c', { alias: 'clipboard', describe: 'Share clipboard content', type: 'boolean' })
        .option('w', { alias: 'on-windows-native-terminal', describe: 'Enable QR code rendering in Windows native terminal', type: 'boolean' })
        .option('open', { describe: 'Open the QR code in a browser window on this computer', type: 'boolean' })
        .option('r', { alias: 'receive', describe: 'Receive files from another device', type: 'boolean' })
        .option('q', { alias: 'receive-port', describe: 'Set the port for receiving files', type: 'number' })
        .option('U', { alias: 'username', describe: 'Set username for basic authentication', type: 'string', default: 'user' })
        .option('P', { alias: 'password', describe: 'Set password for basic authentication', type: 'string' })
        .option('S', { alias: 'ssl', describe: 'Enable HTTPS (auto self-signed cert when -C/-K are not given)', type: 'boolean' })
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
    let clipboardText = false;

    // Read the clipboard and classify it: either an existing filesystem path to
    // share directly, or raw text to present on the clipboard page. Re-reads live
    // so each request reflects the current clipboard contents.
    const getClipboardData = () => {
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

        if (filePath && fs.existsSync(filePath)) {
            return { isPath: true, path: filePath, text: null };
        }
        return { isPath: false, path: null, text: data };
    };

    if (options.clipboard) {
        const cb = getClipboardData();
        if (cb.isPath) {
            sharePath = cb.path;
        } else {
            clipboardText = true;
            // Not served (the /share mount is skipped in clipboard-text mode); this
            // only needs to be an existing directory to satisfy validation below.
            sharePath = process.cwd();
        }
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

    if (!clipboardText && fs.lstatSync(sharePath).isFile()) {
        fileName = path.basename(sharePath);
        sharePath = path.dirname(sharePath);
    }

    // A directory share (not a single file, not clipboard text) can be zipped.
    const allowZip = !fileName && !clipboardText;

    if (!options.port) {
        options.port = await portfinder.getPortPromise(config.portfinder);
    }

    const interfaceCandidates = utils.getNetworkInterfaces();
    const host = options.ip || utils.getNetworkAddress(options.interface);

    // HTTPS (-S): use the supplied cert/key when both are given, otherwise generate
    // a self-signed certificate on the fly for the resolved host.
    const wantHttps = options.ssl;
    const usingProvidedCert = Boolean(options.cert && options.key);
    if (wantHttps) {
        if (usingProvidedCert) {
            config.ssl = {
                protocolModule: https,
                protocol: 'https',
                option: {
                    key: fs.readFileSync(path.resolve(process.cwd(), options.key)),
                    cert: fs.readFileSync(path.resolve(process.cwd(), options.cert)),
                },
            };
        } else if (options.cert || options.key) {
            console.log('For custom HTTPS, pass both --cert and --key. Omit both to use an auto self-signed certificate.');
            process.exit(1);
        } else {
            let selfsigned;
            try {
                selfsigned = require('selfsigned');
            } catch (e) {
                console.error('Auto HTTPS is not available. Install selfsigned, or pass -C/-K.');
                process.exit(1);
            }
            // An IP altName (type 7) must be a literal IP; a hostname in --ip would
            // make selfsigned throw, so emit it as a DNS altName (type 2) instead.
            const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.indexOf(':') !== -1;
            const altNames = [{ type: 2, value: 'localhost' }];
            altNames.unshift(isIp ? { type: 7, ip: host } : { type: 2, value: host });
            let pems;
            try {
                pems = selfsigned.generate(
                    [{ name: 'commonName', value: host }],
                    { days: 365, keySize: 2048, algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames: altNames }] }
                );
            } catch (e) {
                console.error('Could not create a self-signed certificate; pass -C/-K instead.');
                process.exit(1);
            }
            config.ssl = { protocolModule: https, protocol: 'https', option: { key: pems.private, cert: pems.cert } };
        }
    }

    const protocol = config.ssl.protocol;
    const baseUrl = protocol + '://' + host + ':' + options.port;

    const uploadAddress = baseUrl + '/receive';
    const file = fileName ? encodeURIComponent(fileName) : '';
    const shareAddress = clipboardText ? (baseUrl + '/clipboard') : (baseUrl + '/share/' + file);
    const qrPageUrl = baseUrl + '/qr';

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

        // QR fallback for terminals that can't render it (Windows native, unicode).
        console.log("\nCan't scan the QR-Code? Open this in a browser on this computer:\n  " + qrPageUrl);

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

        if (wantHttps && !usingProvidedCert) {
            console.log('Using a self-signed HTTPS certificate; your browser shows a one-time warning — that is expected.');
        }

        console.log('\nPress ctrl+c to stop sharing\n');

        if (options.open) {
            openBrowser(protocol + '://localhost:' + options.port + '/qr');
        }
    };

    app.start({
        port: options.port,
        sharePath: sharePath,
        receive: options.receive,
        clipboard: options.clipboard,
        updateClipboardData: (options.clipboard && !clipboardText) ? getClipboardData : undefined,
        onStart: onStart,
        postUploadRedirectUrl: uploadAddress,
        shareAddress: shareAddress,
        allowZip: allowZip,
        clipboardText: clipboardText,
        getClipboardData: clipboardText ? getClipboardData : undefined,
    });
})();
