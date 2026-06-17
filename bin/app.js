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

const start = ({ port, sharePath, receive, clipboard, updateClipboardData, onStart, postUploadRedirectUrl, shareAddress }) => {
    const app = express();

    // Basic Auth
    if (config.auth.username && config.auth.password) {
        app.use(basicAuth({
            challenge: true,
            realm: 'sharing',
            users: { [config.auth.username]: config.auth.password },
        }));
    }

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

            const selectedFile = req.files.selected;
            const selectedFileName = Buffer.from(selectedFile.name, 'ascii').toString('utf8');
            const uploadPath = path.join(path.resolve(sharePath), selectedFileName);
            utils.debugLog('upload path: ' + uploadPath);

            selectedFile.mv(uploadPath)
                .then(() => {
                    console.log('File received: ' + uploadPath);
                    res.type('text').send('File shared successfully at ' + uploadPath);
                })
                .catch((err) => {
                    res.status(500).send(err.message || String(err));
                });
        });
    }

    app.use('/share', (req, res) => {
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

        // Rewrite the generated directory-listing links before sending them so
        // they are valid URLs that route back through /share (see fixListingLinks).
        // Gated on serve-handler's listing signature ('id="files"') so it never
        // touches the contents of an actual shared .html file.
        const originalEnd = res.end.bind(res);
        res.end = function (body, ...rest) {
            const contentType = res.getHeader('content-type');
            const isHtml = contentType && String(contentType).includes('text/html');
            if (typeof body === 'string' && isHtml && body.includes('id="files"')) {
                body = fixListingLinks(body, mountPath);
            }
            return originalEnd(body, ...rest);
        };

        // cleanUrls defaults to true in serve-handler, which makes it answer a
        // request for an .html file with a 301 to the extension-less path. That
        // redirect target is built from the prefix-stripped URL, so it both
        // drops /share (-> 404) and is unwanted for a file server: we want files
        // served and downloaded as-is. Disabling it avoids the broken redirect.
        handler(req, res, { public: sharePath, etag: true, cleanUrls: false });
        req.url = originalUrl;
    });

    // Listen
    const server = config.ssl.protocolModule.createServer(config.ssl.option, app).listen(port, onStart);
    return server;
};

module.exports = { start };
