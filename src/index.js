#! /usr/bin/env node
const fs = require('fs')
const os = require('node:os');
var path = require('path');
const yargs = require("yargs");
const nunjucks = require('nunjucks');
const express = require("express");
const app = express();

const usage = "\nUsage: sharing <full-directory-path>";
const options = yargs
        .usage(usage)  
        .option("p", { default: 7478, alias: 'port', describe: "Change default port", type: "integer", demandOption: false })
        .option("ip", { describe: "Your machine public ip address", type: "string", demandOption: false })                                                                                             
        .help(true)
        .argv;

let rootPath = options._[0];

if (!rootPath) {
    console.log('Specify directory or file path.');
    return;
}

if (!fs.existsSync(rootPath)) {
    console.log('Directory or file not found.');
    return;
}

const isFile = fs.lstatSync(rootPath).isFile();
let fileName = undefined;
if (isFile) {
    const directoryPath = rootPath.substring(0, rootPath.lastIndexOf("/") + 1);
    fileName = rootPath.substring(rootPath.lastIndexOf("/") + 1, rootPath.length);
    rootPath = directoryPath;
}

// Middleware for static files serving
app.use(express.static(rootPath));

var networkInterfaces = os.networkInterfaces();
var getNetworkAddress = () => {
    for (const interfaceDetails of Object.values(networkInterfaces)) {
        if (!interfaceDetails)
            continue;
        for (const details of interfaceDetails) {
            const { address, family, internal } = details;
            if (family === "IPv4" && !internal)
                return address;
        }
    }
};

// Starts listening on desired port (or default 7478)
app.listen(options.port, () => {
    let usageMessage = 'Scan the QR-Code to access \''+ rootPath +'\' directory on your phone';
    let file = '';
    if (isFile) {
        usageMessage = 'Scan the QR-Code to access \''+ fileName +'\' file on your phone';
        file = '/' + fileName;
    }

    let shareAddress = undefined;
    if (options.ip) {
        shareAddress = 'http://' + options.ip + ':' + options.port + file;
    } else {
        shareAddress = 'http://' + getNetworkAddress() + ':' + options.port + file;
    }
    
    console.log(usageMessage);

    var qrcode = require('qrcode-terminal');
    qrcode.generate(shareAddress, { small: true });

    console.log('Press ctrl+c to stop sharing')
  });

// Middleware for nunjucks templating engine
nunjucks.configure('src/templates', {
    express: app
});

// Should come before the catch-all route
app.get('/:slug?/download', function(req, res) {
    let currentPath = rootPath

    const slug = req.params.slug || undefined;
    if (slug) {
        currentPath = path.join(rootPath, slug);
    }

    const file = path.join(currentPath, req.query.file);
    if (fs.lstatSync(file).isFile()) {
        res.download(file);  
    }
})

// Catch-all route
app.get('/*', function(req, res) {
    const pathname = path.join(rootPath, req.url);
    let nunjucksVariables = {
        documentTitle: 'Sharing',
        directories: [{href: `/download?file=${req.url}${fileName}`, text: fileName}],
    }
    if (!isFile) {
        fs.readdir(pathname, function (err, files) {
            //handling error
            if (err) {
                return console.log('Unable to scan directory: ' + err);
            } 
            nunjucksVariables.directories = [...files.map(file => {
                const filePath = pathname + '/' + file;
                let href;
                if (fs.lstatSync(filePath).isDirectory()) {
                    href = `${req.url}${file}`;
                } else if ((fs.lstatSync(filePath).isFile())) {
                    href = `/download?file=${req.url}${file}`;
                }
                return {href, text: file}
            })]
            res.render('index.njk', nunjucksVariables);
        });
    } else {
        res.render('index.njk', nunjucksVariables);
    }
});