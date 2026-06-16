const express = require('express');
const fileUpload = require('express-fileupload');
const basicAuth = require('express-basic-auth');
const handler = require('serve-handler');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const utils = require('./utils');

const receiveFormHtml = fs.readFileSync(path.join(__dirname, 'receive-form.html'), 'utf8');

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
        // Strip the /share prefix so serve-handler resolves files from the root of sharePath
        const originalUrl = req.url;
        req.url = req.url.replace(/^\/share/, '') || '/';
        handler(req, res, { public: sharePath, etag: true });
        req.url = originalUrl;
    });

    // Listen
    const server = config.ssl.protocolModule.createServer(config.ssl.option, app).listen(port, onStart);
    return server;
};

module.exports = { start };
