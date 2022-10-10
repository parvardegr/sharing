#! /usr/bin/env node
const fs = require('fs')
const express = require("express");
const app = express();
var path = require('path');
const yargs = require("yargs");
const os = require('node:os');
const nunjucks = require('nunjucks');

const usage = "\nUsage: sharing <directory-path>";
const options = yargs
        .usage(usage)  
        .option("p", { default: 7478, alias: 'port', describe: "Change default port", type: "integer", demandOption: false })
        .option("ip", { describe: "Your machine public ip address", type: "string", demandOption: false })                                                                                             
        .help(true)
        .argv;

let choosenPath = 'C:\\Users\\leona\\Desktop\\projects' //options._[0];

if (!choosenPath) {
    console.log('Specify directory or file path.');
    return;
}

if (!fs.existsSync(choosenPath)) {
    console.log('Directory or file not found.');
    return;
}

const isFile = fs.lstatSync(choosenPath).isFile();
let fileName = undefined;
if (isFile) {
    const directoryPath = choosenPath.substring(0, choosenPath.lastIndexOf("/") + 1);
    fileName = choosenPath.substring(choosenPath.lastIndexOf("/") + 1, choosenPath.length);
    choosenPath = directoryPath;
}

// Middleware for static files serving
app.use(express.static(choosenPath));

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
    let usageMessage = 'Scan the QR-Code to access \''+ choosenPath +'\' directory on your phone';
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
// app.set('view engine', 'njk');
nunjucks.configure('src/templates', {
    express: app
});

const nunjucksVariables = {
    documentTitle: 'Sharing',
    directories: [],
}

app.get('/', function(req, res) {
    fs.readdir(choosenPath, function (err, files) {
        //handling error
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        } 
        //listing all files using forEach
        nunjucksVariables.directories = files;
        res.render('index.njk', nunjucksVariables);
    });
});