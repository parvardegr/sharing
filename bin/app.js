const express = require('express');
const fileUpload = require('express-fileupload');
const basicAuth = require('express-basic-auth');
const handler = require('serve-handler');
const fs = require('fs');
const _path = require("path");

const config = require('./config');
const utils = require('./utils');


const start = ({ port, path, receive, onStart, postUploadRedirectUrl }) => {
    const app = express();

    // Basic Auth
    if (config.auth.username && config.auth.password) {
        app.use(basicAuth({
            challenge: true,
            realm: 'sharing',
            users: { [config.auth.username]: config.auth.password }
        }));
    }

    // Routing
    if (receive) {
        app.use(fileUpload());

        app.get('/receive', (req, res) => {
            const form = fs.readFileSync(`${__dirname}/receive-form.html`);
            res.send(form.toString());
        });

        app.post('/upload', (req, res) => {
            if (!req.files || Object.keys(req.files).length === 0) {
                res.status(400).send('No files were received.');
                return;
            }

            const selectedFile = req.files.selected;

            const uploadPath = _path.resolve(__dirname, path) + '/' + selectedFile.name;
            utils.debugLog(`upload path: ${uploadPath}`);

            selectedFile.mv(uploadPath).then(err => {
                if (err) {
                    return res.status(500).send(err);
                }

                console.log(`File recevied: ${uploadPath}`)

                res.send(`
                    <script>
                        window.alert('Shared at ${uploadPath}');
                        window.location.href = '${postUploadRedirectUrl}';
                    </script>
                `);
            });
        });
    }

    app.get('/share/*', (req, res) => {
        handler(req, res, { public: path, etag: true, prefix: '/share' });
    });

    // Listen
    config.ssl.protocolModule.createServer(config.ssl.option, app).listen(port, onStart);

}

module.exports = { 
    start
};