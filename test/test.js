/**
 * Basic tests for the sharing tool.
 * Uses only built-in Node.js modules (no test framework dependency).
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const utils = require('../bin/utils');
const config = require('../bin/config');
const app = require('../bin/app');

let passed = 0;
let failed = 0;
const servers = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log('  ✓ ' + name);
    } catch (err) {
        failed++;
        console.log('  ✗ ' + name);
        console.log('    ' + err.message);
    }
}

async function asyncTest(name, fn) {
    try {
        await fn();
        passed++;
        console.log('  ✓ ' + name);
    } catch (err) {
        failed++;
        console.log('  ✗ ' + name);
        console.log('    ' + err.message);
    }
}

function closeServers() {
    servers.forEach(function (s) {
        try { s.close(); } catch (e) { /* ignore */ }
    });
}

// ---------- utils tests ----------
console.log('\nutils.js');

test('getNetworkAddress returns a string', () => {
    const addr = utils.getNetworkAddress();
    assert.strictEqual(typeof addr, 'string');
});

test('getNetworkAddress returns a valid IPv4 address', () => {
    const addr = utils.getNetworkAddress();
    const parts = addr.split('.');
    assert.strictEqual(parts.length, 4);
});

test('debugLog does not throw when debug is false', () => {
    config.debug = false;
    utils.debugLog('test message');
});

test('debugLog does not throw when debug is true', () => {
    config.debug = true;
    utils.debugLog('test message');
    config.debug = false;
});

// ---------- config tests ----------
console.log('\nconfig.js');

test('config has expected default values', () => {
    assert.strictEqual(config.debug, false);
    assert.strictEqual(config.qrcode.small, true);
    assert.strictEqual(config.auth.username, undefined);
    assert.strictEqual(config.auth.password, undefined);
    assert.strictEqual(config.ssl.protocol, 'http');
    assert.strictEqual(typeof config.portfinder.port, 'number');
    assert.strictEqual(typeof config.portfinder.stopPort, 'number');
});

// ---------- app tests ----------
console.log('\napp.js');

test('app.start is a function', () => {
    assert.strictEqual(typeof app.start, 'function');
});

// ---------- serve a directory and fetch a file ----------
console.log('\nintegration');

function request(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, data: data }));
        }).on('error', reject);
    });
}

async function integrationTests() {
    // Create a temp directory with a test file
    const tmpDir = path.join(__dirname, '.tmp-test-dir');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'hello world');

    const port = 19876;

    await asyncTest('serves a directory and file is downloadable', async () => {
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: port,
                sharePath: tmpDir,
                receive: false,
                clipboard: false,
                updateClipboardData: null,
                onStart: async () => {
                    try {
                        const res = await request('http://127.0.0.1:' + port + '/share/hello.txt');
                        assert.strictEqual(res.status, 200);
                        assert.strictEqual(res.data, 'hello world');
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                },
                postUploadRedirectUrl: '',
                shareAddress: '',
            });
            servers.push(server);
        });
    });

    await asyncTest('receive form is served when receive is enabled', async () => {
        const receivePort = port + 1;
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: receivePort,
                sharePath: tmpDir,
                receive: true,
                clipboard: false,
                updateClipboardData: null,
                onStart: async () => {
                    try {
                        const res = await request('http://127.0.0.1:' + receivePort + '/receive');
                        assert.strictEqual(res.status, 200);
                        assert.ok(res.data.indexOf('uploadForm') !== -1, 'Response should contain upload form');
                        assert.ok(res.data.indexOf('progress-bar') !== -1, 'Response should contain progress bar');
                        assert.ok(res.data.indexOf('progress-text') !== -1, 'Response should contain progress text');
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                },
                postUploadRedirectUrl: 'http://127.0.0.1:' + receivePort + '/receive',
                shareAddress: 'http://127.0.0.1:' + receivePort + '/share/',
            });
            servers.push(server);
        });
    });

    await asyncTest('upload without files returns 400', async () => {
        const uploadPort = port + 2;
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: uploadPort,
                sharePath: tmpDir,
                receive: true,
                clipboard: false,
                updateClipboardData: null,
                onStart: async () => {
                    try {
                        const postData = '';
                        const options = {
                            hostname: '127.0.0.1',
                            port: uploadPort,
                            path: '/upload',
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        };
                        const res = await new Promise((res2, rej2) => {
                            const req = http.request(options, (response) => {
                                let data = '';
                                response.on('data', (chunk) => { data += chunk; });
                                response.on('end', () => res2({ status: response.statusCode, data: data }));
                            });
                            req.on('error', rej2);
                            req.write(postData);
                            req.end();
                        });
                        assert.strictEqual(res.status, 400);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                },
                postUploadRedirectUrl: '',
                shareAddress: '',
            });
            servers.push(server);
        });
    });

    // CLI help test
    await asyncTest('CLI --help exits with code 0', async () => {
        await new Promise((resolve, reject) => {
            execFile(process.execPath, [path.join(__dirname, '..', 'bin', 'index.js'), '--help'], (err, stdout) => {
                if (err) return reject(err);
                assert.ok(stdout.indexOf('Share file or directory') !== -1, 'Help output should contain usage info');
                resolve();
            });
        });
    });

    await asyncTest('CLI --version exits with code 0', async () => {
        await new Promise((resolve, reject) => {
            execFile(process.execPath, [path.join(__dirname, '..', 'bin', 'index.js'), '--version'], (err, stdout) => {
                if (err) return reject(err);
                assert.ok(stdout.trim().match(/^\d+\.\d+\.\d+$/), 'Version should be semver');
                resolve();
            });
        });
    });

    // Cleanup
    closeServers();
    try {
        fs.unlinkSync(path.join(tmpDir, 'hello.txt'));
        fs.rmdirSync(tmpDir);
    } catch (e) { /* ignore */ }
}

integrationTests().then(() => {
    console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed\n');
    if (failed > 0) process.exit(1);
    process.exit(0);
});
