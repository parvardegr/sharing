#! /usr/bin/env node

const yargs = require("yargs");
const usage = "\nUsage: sharing <directory-path>";
const options = yargs
    .usage(usage)
    .option("p", {
        default: 7478,
        alias: "port",
        describe: "Change default port",
        type: "integer",
        demandOption: false,
    })
    .option("ip", {
        describe: "Your machine public ip address",
        type: "string",
        demandOption: false,
    })
    .help(true).argv;

let path = options._[0];
if (!path) {
    console.log("Specify directory or file path.");
    return;
}

const fs = require("fs");
if (!fs.existsSync(path)) {
    console.log("Directory or file not found.");
    return;
}

const isFile = fs.lstatSync(path).isFile();
let fileName = undefined;
if (isFile) {
    const directoryPath = path.substring(0, path.lastIndexOf("/") + 1);
    fileName = path.substring(path.lastIndexOf("/") + 1, path.length);
    path = directoryPath;
}

// Actual Serving use serve

const handler = require("serve-handler");
const http = require("http");

const server = http.createServer((request, response) => {
    // More details here: https://github.com/vercel/serve-handler#options
    return handler(request, response, { public: path });
});

const os = require("node:os");

var networkInterfaces = os.networkInterfaces();
var getNetworkAddress = () => {
    for (const interfaceDetails of Object.values(networkInterfaces)) {
        if (!interfaceDetails) continue;
        for (const details of interfaceDetails) {
            const { address, family, internal } = details;
            if (family === "IPv4" && !internal) return address;
        }
    }
};

server.listen(options.port, () => {
    let usageMessage =
        "Scan the QR-Code to access '" + path + "' directory on your phone";
    let file = "";
    if (isFile) {
        usageMessage =
            "Scan the QR-Code to access '" + fileName + "' file on your phone";
        file = "/" + fileName;
    }

    let shareAddress = undefined;
    if (options.ip) {
        shareAddress = "http://" + options.ip + ":" + options.port + file;
    } else {
        shareAddress =
            "http://" + getNetworkAddress() + ":" + options.port + file;
    }

    console.log(usageMessage);

    // Adding support for `localtunnel`
    const localtunnel = require("localtunnel");

    console.log(`Tunneling via localtunnel...`);
    (async () => {
        const tunnel = await localtunnel({ port: options.port });

        // the assigned public url for your tunnel
        // i.e. https://abcdefgjhij.localtunnel.me
        tunnel.url;

        console.log(`localtunnel URL: ${tunnel.url}`);

        var qrcode = require("qrcode-terminal");
        qrcode.generate(tunnel.url, { small: true });

        console.log("Press ctrl+c to stop sharing");
        tunnel.on("close", () => {
            // tunnels are closed
        });
    })();
});
