const express = require('express');
const fileUpload = require('express-fileupload');
const basicAuth = require('express-basic-auth');
const handler = require('serve-handler');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const utils = require('./utils');

const receiveFormHtml = fs.readFileSync(path.join(__dirname, 'receive-form.html'), 'utf8');

// serve-handler's directory listing HTML-encodes file names (e.g. '/' -> '&#47;',
// '&' -> '&#38;') but never URL-encodes them, and it is unaware that we mount it
// under /share. The result is links that 404 (missing prefix) or 400/404 on any
// name containing '#', '%', '?', '&', spaces, unicode, etc. We rebuild each link
// into a valid URL: decode the entities serve-handler emits, percent-encode every
// path segment, and re-add the mount prefix.
// The exact set of entities serve-handler's encodeHTML produces.
const HTML_ENTITIES = {
    '&#38;': '&', '&#60;': '<', '&#62;': '>', '&#34;': '"', '&#39;': "'", '&#47;': '/',
};

const decodeServeHandlerEntities = (str) =>
    str.replace(/&#(?:38|60|62|34|39|47);/g, (m) => HTML_ENTITIES[m] || m);

// Percent-encode a root-absolute path one segment at a time, preserving the
// slashes that delimit segments (and any leading/trailing slash).
const encodePathSegments = (decodedPath) =>
    decodedPath.split('/').map((segment) => encodeURIComponent(segment)).join('/');

// Rewrite the links in a serve-handler directory listing so they are valid,
// routable URLs under the given mount prefix.
const fixListingLinks = (html, mountPath) =>
    html.replace(/href="([^"]*)"/g, (match, rawHref) => {
        const decodedPath = decodeServeHandlerEntities(rawHref);
        // serve-handler only ever emits root-absolute links; anything else is
        // left untouched so we never mangle unexpected markup.
        if (!decodedPath.startsWith('/')) {
            return match;
        }
        return 'href="' + mountPath + encodePathSegments(decodedPath) + '"';
    });

// Escape a string for safe interpolation into HTML text/attributes.
const escapeHtml = (s) =>
    String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

// Strip terminal control characters (except tab/newline/carriage-return) so that
// text submitted from a phone cannot inject escape sequences into the terminal.
// eslint-disable-next-line no-control-regex
const stripControlChars = (s) =>
    String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

// Resolve a destination for an uploaded file using only its basename (any path
// components in the supplied name are discarded, so a crafted "../" name cannot
// escape the share directory). Never overwrites an existing file, never reuses a
// name already reserved in this request (so two same-named files in one upload
// don't clobber each other), and never writes through a symlink (a dangling or
// real symlink at the target would otherwise let a write escape the share dir).
const destForUpload = (root, rawName, reserved) => {
    const base = path.basename(String(rawName).replace(/\\/g, '/'));
    if (!base || base === '.' || base === '..') return null;
    const isSymlink = (p) => {
        try { return fs.lstatSync(p).isSymbolicLink(); }
        catch (e) { return false; } // ENOENT -> no entry, safe
    };
    const taken = (p) => reserved.has(p) || fs.existsSync(p) || isSymlink(p);
    let dest = path.join(root, base);
    if (!taken(dest)) {
        reserved.add(dest);
        return dest;
    }
    const ext = path.extname(base);
    const stem = path.basename(base, ext);
    let i = 1;
    do {
        dest = path.join(root, stem + ' (' + i + ')' + ext);
        i++;
    } while (taken(dest));
    reserved.add(dest);
    return dest;
};

// Recursively add a directory's *regular files* to an archive, skipping symlinks
// (which serve-handler also refuses to follow) so their outside-the-share targets
// are never disclosed or followed.
const addDirToArchive = (archive, dir, base) => {
    let names;
    try { names = fs.readdirSync(dir); } catch (e) { return; }
    for (const name of names) {
        const abs = path.join(dir, name);
        let st;
        try { st = fs.lstatSync(abs); } catch (e) { continue; }
        if (st.isSymbolicLink()) continue;
        const rel = base ? base + '/' + name : name;
        if (st.isDirectory()) addDirToArchive(archive, abs, rel);
        else if (st.isFile()) archive.file(abs, { name: rel });
    }
};

const start = ({
    port,
    sharePath,
    receive,
    clipboard,
    updateClipboardData,
    onStart,
    postUploadRedirectUrl,
    shareAddress,
    // Optional capabilities (default off -> behaviour identical to before):
    allowZip,         // expose the zip route and inject a "Download as .zip" link into listings
    clipboardText,    // serve the clipboard copy page instead of a file download
    getClipboardData, // () => { isPath, text } — re-read live on each request
    once,             // stop the server after the first completed transfer
    onFinish,         // called when --once completes a transfer (the caller owns process exit)
} = {}) => {
    const app = express();

    // Basic Auth
    if (config.auth.username && config.auth.password) {
        app.use(basicAuth({
            challenge: true,
            realm: 'sharing',
            users: { [config.auth.username]: config.auth.password },
        }));
    }

    let server;
    let onceDone = false;
    const finishOnce = (reason) => {
        if (!once || onceDone) return;
        onceDone = true;
        console.log('\nTransfer complete (' + reason + '). Stopping share.');
        // app.js stays a pure server module: it closes the listener and hands control
        // back to the caller via onFinish (which owns whether to exit the process).
        let done = false;
        const finish = () => { if (done) return; done = true; if (onFinish) onFinish(reason); };
        if (server) server.close(finish); else finish();
        // Safety net in case a keep-alive socket keeps the server open.
        setTimeout(finish, 1500).unref();
    };

    // QR fallback page: renders the share (and upload) URL as a scannable image,
    // for terminals that cannot draw the QR (Windows native terminal, unicode paths).
    app.get('/qr', async (req, res) => {
        let QRCode;
        try {
            QRCode = require('qrcode');
        } catch (e) {
            return res.status(501).type('text').send('QR image support is not installed (npm install qrcode).');
        }
        const targets = [];
        if (receive) targets.push({ label: 'Scan to upload a file', url: postUploadRedirectUrl });
        if (shareAddress) targets.push({ label: clipboard ? 'Scan to open the clipboard' : 'Scan to open the share', url: shareAddress });
        try {
            const blocks = await Promise.all(targets.map(async (t) => {
                const dataUrl = await QRCode.toDataURL(t.url, { margin: 2, width: 320 });
                return '<section><h2>' + escapeHtml(t.label) + '</h2>' +
                    '<img alt="QR code" src="' + dataUrl + '" />' +
                    '<p><a href="' + escapeHtml(t.url) + '">' + escapeHtml(t.url) + '</a></p></section>';
            }));
            res.type('html').send(
                '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
                '<meta name="viewport" content="width=device-width, initial-scale=1">' +
                '<title>sharing — QR</title><style>' +
                'body{font-family:system-ui,sans-serif;margin:0;padding:24px;text-align:center;' +
                'background:#0f1020;color:#eee}section{margin:24px auto;max-width:360px}' +
                'img{width:100%;max-width:320px;height:auto;background:#fff;padding:12px;border-radius:12px}' +
                'a{color:#8ab4ff;word-break:break-all}h1{font-weight:600}</style></head>' +
                '<body><h1>📷 Scan with your phone</h1>' + blocks.join('') + '</body></html>'
            );
        } catch (err) {
            res.status(500).type('text').send('Could not render QR: ' + (err.message || String(err)));
        }
    });

    // Routing
    if (receive) {
        app.use(fileUpload());

        app.get('/receive', (req, res) => {
            res.send(
                receiveFormHtml
                    .replace(/\{shareAddress\}/g, shareAddress)
                    .replace(/\{postUploadRedirectUrl\}/g, postUploadRedirectUrl)
            );
        });

        app.post('/upload', (req, res) => {
            if (!req.files || Object.keys(req.files).length === 0) {
                return res.status(400).send('No files were received.');
            }

            // express-fileupload returns a single object for one file and an array
            // when several files share the field name ("selected"); normalise to an array.
            const files = [].concat(req.files.selected).filter(Boolean);
            if (files.length === 0) {
                return res.status(400).send('No files were received.');
            }

            const root = path.resolve(sharePath);
            const saved = [];
            // Reserve each destination synchronously as we iterate, so several files
            // sharing a basename in one request each get a distinct, fresh name.
            const reserved = new Set();
            const tasks = files.map((file) => {
                const decodedName = Buffer.from(file.name, 'ascii').toString('utf8');
                const dest = destForUpload(root, decodedName, reserved);
                if (!dest) return Promise.reject(new Error('Invalid file name: ' + file.name));
                utils.debugLog('upload path: ' + dest);
                return file.mv(dest).then(() => { saved.push(dest); });
            });

            Promise.all(tasks)
                .then(() => {
                    saved.forEach((p) => console.log('File received: ' + p));
                    res.type('text').send(
                        saved.length === 1
                            ? 'File shared successfully at ' + saved[0]
                            : saved.length + ' files shared successfully.'
                    );
                    finishOnce('upload');
                })
                .catch((err) => {
                    res.status(500).send(err.message || String(err));
                });
        });

        // Receive a short text/URL snippet from the phone: print it (sanitised) and
        // best-effort copy it to the host clipboard.
        app.post('/text', express.json({ limit: '5mb' }), express.urlencoded({ extended: false, limit: '5mb' }), (req, res) => {
            const text = (req.body && (req.body.text != null ? req.body.text : '')) || '';
            if (!String(text).length) return res.status(400).type('text').send('No text received.');
            const clean = stripControlChars(text);
            console.log('\nText received from device:\n' + clean + '\n');
            // Best-effort copy to the host clipboard (skipped under tests so the
            // suite never clobbers the developer's clipboard).
            if (!process.env.SHARING_TEST) {
                try {
                    const clipboardy = require('clipboardy');
                    clipboardy.writeSync(String(text));
                    console.log('(copied to this computer\'s clipboard)');
                } catch (e) { /* best-effort only */ }
            }
            res.type('text').send('Text received.');
            finishOnce('text');
        });
    }

    // Clipboard share: present the text on a styled page with a one-tap Copy button
    // instead of forcing a file download.
    if (clipboardText) {
        const clipboardPageHtml = fs.readFileSync(path.join(__dirname, 'clipboard-page.html'), 'utf8');
        const currentText = () => {
            if (getClipboardData) {
                const d = getClipboardData();
                return (d && d.text) || '';
            }
            return '';
        };
        app.get(['/', '/clipboard'], (req, res) => {
            res.type('html').send(
                clipboardPageHtml
                    .replace(/\{clipboardText\}/g, escapeHtml(currentText()))
                    .replace(/\{downloadUrl\}/g, '/clipboard.txt')
            );
        });
        app.get('/clipboard.txt', (req, res) => {
            res.on('finish', () => { if (res.statusCode === 200) finishOnce('download'); });
            res.attachment('clipboard.txt');
            res.type('text/plain').send(currentText());
        });
    }

    // Download an entire shared directory (or a sub-folder via ?path=) as a zip.
    if (allowZip) {
        app.get('/zip', (req, res) => {
            const root = path.resolve(sharePath);
            let target = root;
            if (req.query.path) {
                const rel = String(req.query.path).replace(/^[/\\]+/, '');
                const resolved = path.resolve(root, rel);
                if (resolved !== root && !resolved.startsWith(root + path.sep)) {
                    return res.status(400).type('text').send('Invalid path.');
                }
                target = resolved;
            }
            if (!fs.existsSync(target) || !fs.lstatSync(target).isDirectory()) {
                return res.status(404).type('text').send('Not a directory.');
            }
            let archiver;
            try {
                archiver = require('archiver');
            } catch (e) {
                return res.status(501).type('text').send('Zip support is not installed (npm install archiver).');
            }
            res.attachment((path.basename(target) || 'share') + '.zip');
            const archive = archiver('zip', { zlib: { level: 6 } });
            archive.on('error', (err) => {
                // Once headers/body are out, we can't switch to an error page without
                // producing a corrupt-but-200 zip; abort the connection instead.
                if (!res.headersSent) res.status(500).type('text').end(String(err && err.message || err));
                else res.destroy(err);
            });
            res.on('finish', () => finishOnce('download'));
            archive.pipe(res);
            addDirToArchive(archive, target, '');
            archive.finalize();
        });
    }

    // In clipboard-text mode there is no real shared directory (sharePath points at
    // the working directory only to satisfy the API), so mounting serve-handler here
    // would leak the cwd. Skip the share mount entirely in that mode.
    if (!clipboardText) app.use('/share', (req, res) => {
        if (clipboard && updateClipboardData) {
            updateClipboardData();
        }
        // serve-handler is unaware that it is mounted under /share. Express has
        // already stripped that prefix from req.url, so serve-handler resolves
        // files from the root of sharePath (good) but also builds every
        // directory-listing link as root-absolute *without* the /share prefix
        // (e.g. "/file.txt", "/subdir/", "/"). Browsing or downloading by
        // clicking those links then navigates to a path Express does not route,
        // producing a 404. The mount prefix is req.baseUrl ('/share').
        const mountPath = req.baseUrl || '/share';
        const originalUrl = req.url;
        req.url = req.url.replace(/^\/share/, '') || '/';
        // The directory currently being listed, relative to sharePath — used to
        // point the injected "Download as .zip" link at this exact folder.
        const listingDir = decodeURIComponent((req.url.split('?')[0]) || '/');

        // Whether this response was the directory listing (vs. an actual file
        // download). Used by --once so browsing a folder doesn't count as a transfer.
        let wasListing = false;

        // Rewrite the generated directory-listing links before sending them so
        // they are valid URLs that route back through /share (see fixListingLinks),
        // and inject a "Download as .zip" link when zip support is enabled. Gated on
        // serve-handler's listing signature ('id="files"') so it never touches the
        // contents of an actual shared .html file.
        const originalEnd = res.end.bind(res);
        res.end = function (body, ...rest) {
            const contentType = res.getHeader('content-type');
            const isHtml = contentType && String(contentType).includes('text/html');
            if (typeof body === 'string' && isHtml && body.includes('id="files"')) {
                wasListing = true;
                body = fixListingLinks(body, mountPath);
                if (allowZip) {
                    const zipHref = '/zip?path=' + encodeURIComponent(listingDir);
                    const bar = '<div style="padding:10px 14px;background:#005bff;text-align:center">' +
                        '<a href="' + zipHref + '" style="color:#fff;font-family:system-ui,sans-serif;font-weight:600;text-decoration:none">' +
                        '📦 Download this folder as .zip</a></div>';
                    body = body.replace(/(<body[^>]*>)/i, '$1' + bar);
                }
            }
            return originalEnd(body, ...rest);
        };

        // --once: a GET that served an actual file (not the listing) counts as the
        // transfer that ends the share. A 200 is a whole-file download; a 206 only
        // counts once the final byte has been delivered, so range-requesting media
        // players (which probe with small ranges) don't end the share prematurely.
        if (once) {
            res.on('finish', () => {
                if (req.method !== 'GET' || wasListing) return;
                if (res.statusCode === 200) {
                    finishOnce('download');
                } else if (res.statusCode === 206) {
                    const cr = String(res.getHeader('content-range') || '');
                    const m = cr.match(/bytes\s+\d+-(\d+)\/(\d+)/);
                    if (m && (parseInt(m[1], 10) + 1) >= parseInt(m[2], 10)) {
                        finishOnce('download');
                    }
                }
            });
        }

        // cleanUrls defaults to true in serve-handler, which makes it answer a
        // request for an .html file with a 301 to the extension-less path. That
        // redirect target is built from the prefix-stripped URL, so it both
        // drops /share (-> 404) and is unwanted for a file server: we want files
        // served and downloaded as-is. Disabling it avoids the broken redirect.
        handler(req, res, { public: sharePath, etag: true, cleanUrls: false });
        req.url = originalUrl;
    });

    // Listen
    server = config.ssl.protocolModule.createServer(config.ssl.option, app).listen(port, onStart);
    return server;
};

module.exports = { start };
