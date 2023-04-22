const express = require('express');
const fileUpload = require('express-fileupload');
const basicAuth = require('express-basic-auth');
const handler = require('serve-handler');
const fs = require('fs');
const _path = require("path");

const config = require('./config');
const utils = require('./utils');

/**
 * @desc move file in request
 */
const mvFiles = async (path, files) => {
    const selectedFiles = Array.isArray(files) ? files : [files];
    let mvTask = [];
    for (let i = 0; i < selectedFiles.length; i++) {
        const selectedFile = selectedFiles[i];
        const selectedFileName = new Buffer(selectedFile.name, 'ascii').toString('utf8');
        const uploadPath = _path.resolve(__dirname, path) + '/' + selectedFileName;
        utils.debugLog(`upload path: ${uploadPath}`);
        mvTask.push(new Promise((resolve, reject) => {
            selectedFile.mv(uploadPath).then((err) => err ? reject({ uploadPath, err }) : resolve({ uploadPath }));
        }));
    }
    const mvRes = await Promise.allSettled(mvTask);
    const fulfilledList = mvRes.filter(({ status }) => status === 'fulfilled');
    const rejectedList = mvRes.filter(({ status }) => status === 'rejected');
    return { fulfilledList, rejectedList };
}

const start = ({ port, path, receive, onStart, postUploadRedirectUrl, shareAddress }) => {
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
            res.send(form.toString().replace(/\{shareAddress\}/, shareAddress));
        });

        app.post('/upload', async (req, res) => {
            if (!req.files || Object.keys(req.files).length === 0) {
                res.status(400).send('No files were received.');
                return;
            }
            const { fulfilledList, rejectedList } = await mvFiles(path, req.files.selected);
            const fulfilledMsg = fulfilledList.map(({ value: { uploadPath } }) => uploadPath).join(',\n');
            const rejectedMsg = rejectedList.map(({ reason: { uploadPath } }) => uploadPath).join(',\n');
            const successMsg = fulfilledList.length !== 0 ? `Shared at \n ${fulfilledMsg}` : ""
            const errorMsg = rejectedList.length !== 0 ? `${successMsg ? `\n\r`: ""}Sharing failed: \n ${rejectedMsg}` : "";
            res.send(`
                <script>
                    window.alert(\`${successMsg}${errorMsg}\`);
                    window.location.href = '${postUploadRedirectUrl}';
                </script>
            `);
        });
    }
    
    app.use('/share', (req, res) => {
        handler(req, res, { public: path, etag: true, prefix: '/share' });
    });

    // Listen
    config.ssl.protocolModule.createServer(config.ssl.option, app).listen(port, onStart);

}

module.exports = { 
    start
};
