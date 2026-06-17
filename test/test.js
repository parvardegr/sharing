/**
 * Basic tests for the sharing tool.
 * Uses only built-in Node.js modules (no test framework dependency).
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// Signal to the app that we are running under tests (e.g. so the /text route
// does not write to the developer's real clipboard).
process.env.SHARING_TEST = '1';

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

test('scoreInterface prefers a LAN address over a docker/virtual one', () => {
    const lan = utils.scoreInterface({ name: 'en0', address: '192.168.1.20' });
    const docker = utils.scoreInterface({ name: 'docker0', address: '172.17.0.1' });
    const vpn = utils.scoreInterface({ name: 'utun3', address: '10.8.0.2' });
    assert.ok(lan > docker, 'LAN interface should outrank docker');
    assert.ok(lan > vpn, 'LAN interface should outrank a VPN tunnel');
});

test('getNetworkInterfaces returns an array of {name,address}', () => {
    const list = utils.getNetworkInterfaces();
    assert.ok(Array.isArray(list));
    list.forEach((c) => {
        assert.strictEqual(typeof c.name, 'string');
        assert.strictEqual(typeof c.address, 'string');
    });
});

test('getNetworkAddress falls back when a missing interface is requested', () => {
    assert.strictEqual(typeof utils.getNetworkAddress('definitely-not-an-iface'), 'string');
});

test('parseDuration parses human durations', () => {
    assert.strictEqual(utils.parseDuration('30s'), 30000);
    assert.strictEqual(utils.parseDuration('10m'), 600000);
    assert.strictEqual(utils.parseDuration('1h'), 3600000);
    assert.strictEqual(utils.parseDuration('500ms'), 500);
    assert.strictEqual(utils.parseDuration('45'), 45000);
    assert.strictEqual(utils.parseDuration('nope'), null);
    assert.strictEqual(utils.parseDuration(null), null);
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

// Collect a (possibly binary) response as a Buffer.
function requestRaw(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            const chunks = [];
            res.on('data', (chunk) => { chunks.push(chunk); });
            res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks), headers: res.headers }));
        }).on('error', reject);
    });
}

// POST several files in a single multipart/form-data request, all under the same field.
function postMultipart(port, urlPath, parts) {
    return new Promise((resolve, reject) => {
        const boundary = '----testboundary' + Date.now();
        const pieces = [];
        parts.forEach((p) => {
            pieces.push('--' + boundary + '\r\n');
            pieces.push('Content-Disposition: form-data; name="' + p.field + '"; filename="' + p.filename + '"\r\n');
            pieces.push('Content-Type: application/octet-stream\r\n\r\n');
            pieces.push(p.content);
            pieces.push('\r\n');
        });
        pieces.push('--' + boundary + '--\r\n');
        const body = Buffer.from(pieces.join(''), 'utf8');
        const req = http.request({
            hostname: '127.0.0.1', port: port, path: urlPath, method: 'POST',
            headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length },
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, data: data }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function postJson(port, urlPath, obj) {
    return new Promise((resolve, reject) => {
        const body = Buffer.from(JSON.stringify(obj), 'utf8');
        const req = http.request({
            hostname: '127.0.0.1', port: port, path: urlPath, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, data: data }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function integrationTests() {
    // Create a temp directory with test files
    const tmpDir = path.join(__dirname, '.tmp-test-dir');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
    const subDir = path.join(tmpDir, 'subdir');
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'hello world');
    fs.writeFileSync(path.join(tmpDir, 'File #1.txt'), 'hashtag content');
    fs.writeFileSync(path.join(tmpDir, 'page.html'), '<html><body><a href="/somewhere">link</a></body></html>');
    fs.writeFileSync(path.join(subDir, 'nested.txt'), 'nested content');
    // Names with characters that break naive link generation (URL-significant
    // and non-ASCII). These must all stay reachable from the directory listing.
    const trickyNames = ['100%done.txt', 'a&b.txt', 'what?.txt', 'café.txt'];
    trickyNames.forEach((n) => fs.writeFileSync(path.join(tmpDir, n), 'tricky:' + n));

    // Decode the HTML entities serve-handler uses for '/' in listing links,
    // mimicking how a browser resolves the href before navigating.
    function decodeHref(s) {
        return s
            .replace(/&#0*47;/gi, '/')
            .replace(/&#x0*2f;/gi, '/')
            .replace(/&#0*38;/gi, '&')
            .replace(/&amp;/gi, '&');
    }
    function listingHrefs(body) {
        return [...body.matchAll(/href="([^"]*)"/g)].map((m) => decodeHref(m[1]));
    }

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

    await asyncTest('file with hashtag in name is accessible via encoded URL', async () => {
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: port + 1,
                sharePath: tmpDir,
                receive: false,
                clipboard: false,
                updateClipboardData: null,
                onStart: async () => {
                    try {
                        const res = await request('http://127.0.0.1:' + (port + 1) + '/share/File%20%231.txt');
                        assert.strictEqual(res.status, 200);
                        assert.strictEqual(res.data, 'hashtag content');
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

    await asyncTest('directory listing encodes hashtag in file links', async () => {
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: port + 2,
                sharePath: tmpDir,
                receive: false,
                clipboard: false,
                updateClipboardData: null,
                onStart: async () => {
                    try {
                        const res = await request('http://127.0.0.1:' + (port + 2) + '/share/');
                        assert.strictEqual(res.status, 200);
                        assert.ok(res.data.includes('%23'), 'Directory listing should encode # as %23');
                        assert.ok(!/href="[^"]*(?<!&)#[^"]*"/.test(res.data), 'Directory listing should not have raw # in href');
                        assert.ok(!res.data.includes('&%2347;'), 'Directory listing should not break &#47; HTML entities');
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

    await asyncTest('directory listing links keep the /share prefix and are reachable', async () => {
        const listingPort = port + 10;
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: listingPort,
                sharePath: tmpDir,
                receive: false,
                clipboard: false,
                updateClipboardData: null,
                onStart: async () => {
                    try {
                        const base = 'http://127.0.0.1:' + listingPort;
                        const listing = await request(base + '/share/');
                        assert.strictEqual(listing.status, 200);
                        const hrefs = listingHrefs(listing.data);
                        assert.ok(hrefs.length > 0, 'Listing should contain links');
                        // Every link must be reachable when followed like a browser
                        // (resolved relative to /share/) — i.e. it must not 404.
                        for (const href of hrefs) {
                            const target = new URL(href, base + '/share/').pathname;
                            assert.ok(
                                target.startsWith('/share'),
                                'Listing link should stay under /share, got: ' + target
                            );
                            const res = await request(base + target);
                            assert.ok(
                                res.status < 400,
                                'Listing link ' + target + ' should be reachable, got ' + res.status
                            );
                        }
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

    await asyncTest('subdirectory is browsable and nested files are downloadable', async () => {
        const nestedPort = port + 11;
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: nestedPort,
                sharePath: tmpDir,
                receive: false,
                clipboard: false,
                updateClipboardData: null,
                onStart: async () => {
                    try {
                        const base = 'http://127.0.0.1:' + nestedPort;
                        const sub = await request(base + '/share/subdir/');
                        assert.strictEqual(sub.status, 200, 'Subdirectory listing should load');
                        const nested = await request(base + '/share/subdir/nested.txt');
                        assert.strictEqual(nested.status, 200);
                        assert.strictEqual(nested.data, 'nested content');
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

    await asyncTest('files with URL-significant and non-ASCII names download via their listing link', async () => {
        const trickyPort = port + 13;
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: trickyPort,
                sharePath: tmpDir,
                receive: false,
                clipboard: false,
                updateClipboardData: null,
                onStart: async () => {
                    try {
                        const base = 'http://127.0.0.1:' + trickyPort;
                        const listing = await request(base + '/share/');
                        const hrefs = listingHrefs(listing.data);
                        // Each tricky file must appear in the listing and be
                        // downloadable with its exact original bytes by following
                        // the link the way a browser does.
                        for (const name of trickyNames) {
                            const href = hrefs.find((h) => decodeURIComponent(h).endsWith('/' + name));
                            assert.ok(href, 'Listing should contain a link for "' + name + '"');
                            const target = new URL(href, base + '/share/');
                            const res = await request(base + target.pathname);
                            assert.strictEqual(res.status, 200, 'Download of "' + name + '" should succeed, got ' + res.status);
                            assert.strictEqual(res.data, 'tricky:' + name, 'Content of "' + name + '" should round-trip');
                        }
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

    await asyncTest('html files are served as-is, not redirected or rewritten', async () => {
        const htmlPort = port + 12;
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: htmlPort,
                sharePath: tmpDir,
                receive: false,
                clipboard: false,
                updateClipboardData: null,
                onStart: async () => {
                    try {
                        const res = await request('http://127.0.0.1:' + htmlPort + '/share/page.html');
                        assert.strictEqual(res.status, 200, 'HTML file should be served directly, not redirected');
                        // The file's own links must not be rewritten with the /share prefix.
                        assert.ok(res.data.includes('href="/somewhere"'), 'Shared HTML content must be left intact');
                        assert.ok(!res.data.includes('/share/somewhere'), 'Shared HTML links must not be rewritten');
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
        const receivePort = port + 3;
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
        const uploadPort = port + 4;
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

    await asyncTest('CLI --tunnel exits with code 0 and shows tunnel guide', async () => {
        await new Promise((resolve, reject) => {
            execFile(process.execPath, [path.join(__dirname, '..', 'bin', 'index.js'), '--tunnel'], (err, stdout) => {
                if (err) return reject(err);
                assert.ok(stdout.indexOf('ngrok') !== -1, 'Tunnel guide should mention ngrok');
                assert.ok(stdout.indexOf('localtunnel') !== -1, 'Tunnel guide should mention localtunnel');
                assert.ok(stdout.indexOf('cloudflared') !== -1, 'Tunnel guide should mention cloudflared');
                resolve();
            });
        });
    });

    await asyncTest('qr route renders a scannable image page', async () => {
        const p = port + 22;
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: p, sharePath: tmpDir, receive: false, clipboard: false,
                updateClipboardData: null, postUploadRedirectUrl: '',
                shareAddress: 'http://127.0.0.1:' + p + '/share/',
                onStart: async () => {
                    try {
                        const res = await request('http://127.0.0.1:' + p + '/qr');
                        assert.strictEqual(res.status, 200);
                        assert.ok(res.data.indexOf('data:image') !== -1, 'should embed a QR image');
                        assert.ok(res.data.indexOf('/share/') !== -1, 'should show the share link');
                        resolve();
                    } catch (e) { reject(e); }
                },
            });
            servers.push(server);
        });
    });

    await asyncTest('uploads multiple files in one request, never overwriting or escaping the dir', async () => {
        const p = port + 20;
        const recvDir = path.join(tmpDir, 'recv');
        if (!fs.existsSync(recvDir)) fs.mkdirSync(recvDir);
        fs.writeFileSync(path.join(recvDir, 'a.txt'), 'pre-existing');
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: p, sharePath: recvDir, receive: true, clipboard: false,
                updateClipboardData: null, postUploadRedirectUrl: '', shareAddress: '',
                onStart: async () => {
                    try {
                        const res = await postMultipart(p, '/upload', [
                            { field: 'selected', filename: 'a.txt', content: 'AAA' },
                            { field: 'selected', filename: 'b.txt', content: 'BBB' },
                            { field: 'selected', filename: '../escape.txt', content: 'CCC' },
                        ]);
                        assert.strictEqual(res.status, 200);
                        assert.strictEqual(fs.readFileSync(path.join(recvDir, 'a.txt'), 'utf8'), 'pre-existing');
                        assert.ok(fs.existsSync(path.join(recvDir, 'a (1).txt')), 'collision-safe rename');
                        assert.ok(fs.existsSync(path.join(recvDir, 'b.txt')), 'b.txt saved');
                        assert.ok(fs.existsSync(path.join(recvDir, 'escape.txt')), 'escape saved as basename');
                        assert.ok(!fs.existsSync(path.join(tmpDir, 'escape.txt')), 'must not escape the share dir');
                        resolve();
                    } catch (e) { reject(e); }
                },
            });
            servers.push(server);
        });
    });

    await asyncTest('two same-named files in one request are both kept (no clobber)', async () => {
        const p = port + 25;
        const d = path.join(tmpDir, 'recv2');
        if (!fs.existsSync(d)) fs.mkdirSync(d);
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: p, sharePath: d, receive: true, clipboard: false,
                updateClipboardData: null, postUploadRedirectUrl: '', shareAddress: '',
                onStart: async () => {
                    try {
                        const res = await postMultipart(p, '/upload', [
                            { field: 'selected', filename: 'dup.txt', content: 'FIRST' },
                            { field: 'selected', filename: 'dup.txt', content: 'SECOND' },
                        ]);
                        assert.strictEqual(res.status, 200);
                        assert.ok(fs.existsSync(path.join(d, 'dup.txt')), 'first kept');
                        assert.ok(fs.existsSync(path.join(d, 'dup (1).txt')), 'second kept under a fresh name');
                        const c1 = fs.readFileSync(path.join(d, 'dup.txt'), 'utf8');
                        const c2 = fs.readFileSync(path.join(d, 'dup (1).txt'), 'utf8');
                        assert.ok((c1 === 'FIRST' && c2 === 'SECOND') || (c1 === 'SECOND' && c2 === 'FIRST'), 'both contents preserved');
                        resolve();
                    } catch (e) { reject(e); }
                },
            });
            servers.push(server);
        });
    });

    await asyncTest('upload never writes through a symlink to escape the share dir', async () => {
        const p = port + 26;
        const d = path.join(tmpDir, 'recv3');
        if (!fs.existsSync(d)) fs.mkdirSync(d);
        const outside = path.join(tmpDir, 'OUTSIDE-secret.txt');
        try { fs.unlinkSync(outside); } catch (e) { /* ignore */ }
        let symlinked = true;
        try { fs.symlinkSync(outside, path.join(d, 'evil.txt')); } catch (e) { symlinked = false; }
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: p, sharePath: d, receive: true, clipboard: false,
                updateClipboardData: null, postUploadRedirectUrl: '', shareAddress: '',
                onStart: async () => {
                    try {
                        await postMultipart(p, '/upload', [{ field: 'selected', filename: 'evil.txt', content: 'PWNED' }]);
                        assert.ok(!fs.existsSync(outside), 'must not write through the symlink to an outside path');
                        if (symlinked) {
                            assert.ok(fs.existsSync(path.join(d, 'evil (1).txt')), 'should land under a safe, non-symlink name');
                        }
                        resolve();
                    } catch (e) { reject(e); }
                },
            });
            servers.push(server);
        });
    });

    await asyncTest('zip route streams a zip of the shared directory and rejects traversal', async () => {
        const p = port + 21;
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: p, sharePath: tmpDir, receive: false, clipboard: false, allowZip: true,
                updateClipboardData: null, postUploadRedirectUrl: '', shareAddress: '',
                onStart: async () => {
                    try {
                        const res = await requestRaw('http://127.0.0.1:' + p + '/zip');
                        assert.strictEqual(res.status, 200);
                        assert.ok(res.buf.length > 0, 'zip should not be empty');
                        assert.strictEqual(res.buf.slice(0, 2).toString('latin1'), 'PK', 'response should be a zip');
                        const bad = await request('http://127.0.0.1:' + p + '/zip?path=../../etc');
                        assert.ok(bad.status === 400 || bad.status === 404, 'traversal must be rejected, got ' + bad.status);
                        resolve();
                    } catch (e) { reject(e); }
                },
            });
            servers.push(server);
        });
    });

    await asyncTest('zip skips symlinks (does not disclose their targets)', async () => {
        const p = port + 29;
        const d = path.join(tmpDir, 'ziptest');
        if (!fs.existsSync(d)) fs.mkdirSync(d);
        fs.writeFileSync(path.join(d, 'real.txt'), 'real');
        const linkName = 'ZZLINKZZ';
        try { fs.symlinkSync('/etc/hosts', path.join(d, linkName)); } catch (e) { /* ignore */ }
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: p, sharePath: d, receive: false, clipboard: false, allowZip: true,
                updateClipboardData: null, postUploadRedirectUrl: '', shareAddress: '',
                onStart: async () => {
                    try {
                        const res = await requestRaw('http://127.0.0.1:' + p + '/zip');
                        assert.strictEqual(res.status, 200);
                        assert.strictEqual(res.buf.slice(0, 2).toString('latin1'), 'PK', 'should be a zip');
                        assert.ok(!res.buf.includes(Buffer.from(linkName)), 'symlink name must not appear in the zip');
                        assert.ok(res.buf.includes(Buffer.from('real.txt')), 'real file should be in the zip');
                        resolve();
                    } catch (e) { reject(e); }
                },
            });
            servers.push(server);
        });
    });

    await asyncTest('clipboard page shows text with a copy button and does not serve the cwd', async () => {
        const p = port + 24;
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: p, sharePath: process.cwd(), receive: false, clipboard: true,
                clipboardText: true, getClipboardData: () => ({ isPath: false, text: 'secret clip text' }),
                updateClipboardData: null, postUploadRedirectUrl: '',
                shareAddress: 'http://127.0.0.1:' + p + '/clipboard',
                onStart: async () => {
                    try {
                        const res = await request('http://127.0.0.1:' + p + '/clipboard');
                        assert.strictEqual(res.status, 200);
                        assert.ok(res.data.indexOf('secret clip text') !== -1, 'shows clipboard text');
                        assert.ok(res.data.toLowerCase().indexOf('copy') !== -1, 'has a copy button');
                        const dl = await request('http://127.0.0.1:' + p + '/clipboard.txt');
                        assert.strictEqual(dl.status, 200);
                        assert.strictEqual(dl.data, 'secret clip text');
                        const share = await request('http://127.0.0.1:' + p + '/share/');
                        assert.strictEqual(share.status, 404, 'cwd must not be served');
                        resolve();
                    } catch (e) { reject(e); }
                },
            });
            servers.push(server);
        });
    });

    await asyncTest('text route accepts a snippet and rejects empty input', async () => {
        const p = port + 23;
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: p, sharePath: tmpDir, receive: true, clipboard: false,
                updateClipboardData: null, postUploadRedirectUrl: '', shareAddress: '',
                onStart: async () => {
                    try {
                        const res = await postJson(p, '/text', { text: 'hello from a test (not your clipboard)' });
                        assert.strictEqual(res.status, 200);
                        const empty = await postJson(p, '/text', { text: '' });
                        assert.strictEqual(empty.status, 400);
                        resolve();
                    } catch (e) { reject(e); }
                },
            });
            servers.push(server);
        });
    });

    await asyncTest('a top-level path whose name starts with "share" is reachable', async () => {
        const p = port + 27;
        fs.writeFileSync(path.join(tmpDir, 'sharething.txt'), 'share-prefixed');
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: p, sharePath: tmpDir, receive: false, clipboard: false,
                updateClipboardData: null, postUploadRedirectUrl: '', shareAddress: '',
                onStart: async () => {
                    try {
                        const res = await request('http://127.0.0.1:' + p + '/share/sharething.txt');
                        assert.strictEqual(res.status, 200);
                        assert.strictEqual(res.data, 'share-prefixed');
                        resolve();
                    } catch (e) { reject(e); }
                },
            });
            servers.push(server);
        });
    });

    await asyncTest('capability token gates the share and the zip', async () => {
        const p = port + 28;
        const tok = 'testtoken123';
        await new Promise((resolve, reject) => {
            const server = app.start({
                port: p, sharePath: tmpDir, receive: false, clipboard: false, allowZip: true, token: tok,
                updateClipboardData: null, postUploadRedirectUrl: '', shareAddress: '',
                onStart: async () => {
                    try {
                        const base = 'http://127.0.0.1:' + p;
                        assert.strictEqual((await request(base + '/share/' + tok + '/')).status, 200, 'tokened listing loads');
                        assert.strictEqual((await request(base + '/share/')).status, 404, 'untokened share is 404');
                        assert.strictEqual((await requestRaw(base + '/zip/' + tok)).status, 200, 'tokened zip works');
                        assert.strictEqual((await request(base + '/zip')).status, 404, 'untokened zip is 404');
                        resolve();
                    } catch (e) { reject(e); }
                },
            });
            servers.push(server);
        });
    });

    // Cleanup
    closeServers();
    try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
        try {
            fs.unlinkSync(path.join(tmpDir, 'hello.txt'));
            fs.unlinkSync(path.join(tmpDir, 'File #1.txt'));
            fs.unlinkSync(path.join(tmpDir, 'page.html'));
            trickyNames.forEach((n) => fs.unlinkSync(path.join(tmpDir, n)));
            fs.unlinkSync(path.join(subDir, 'nested.txt'));
            fs.rmdirSync(subDir);
            fs.rmdirSync(tmpDir);
        } catch (e2) { /* ignore */ }
    }
}

integrationTests().then(() => {
    console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed\n');
    if (failed > 0) process.exit(1);
    process.exit(0);
});
