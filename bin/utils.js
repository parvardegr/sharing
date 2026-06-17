const os = require('os');
const config = require('./config');

// Interface-name fragments that indicate a virtual / non-LAN adapter (Docker,
// VPNs, WSL/Hyper-V, VirtualBox, Tailscale/ZeroTier, Apple AWDL, etc.). These
// are the real cause of the category's most common failure — "the QR scans but
// the page won't load" — because a naive "first non-internal IPv4" pick often
// lands on one of these adapters, whose address a phone on the Wi-Fi cannot reach.
const VIRTUAL_NAME_PATTERN = /(docker|veth|virbr|vmnet|vboxnet|vethernet|hyper-?v|wsl|tailscale|^zt|utun|^tun|^tap|ppp|llw|awdl|bridge|^br-)/i;

// Collect every non-internal IPv4 address together with its interface name.
const getNetworkInterfaces = () => {
    const interfaces = os.networkInterfaces();
    const result = [];
    for (const name of Object.keys(interfaces)) {
        const details = interfaces[name];
        if (!details) continue;
        for (const detail of details) {
            // Node >= 18 reports family as the string 'IPv4'; older as the number 4.
            const isIPv4 = detail.family === 'IPv4' || detail.family === 4;
            if (isIPv4 && !detail.internal) {
                result.push({ name: name, address: detail.address });
            }
        }
    }
    return result;
};

// Score a candidate so the most-likely-reachable LAN address wins (higher is
// better). Private LAN ranges are preferred; 172.16/12 ranks lower because
// Docker's default bridge lives there, and virtual adapter names are penalised.
const scoreInterface = ({ name, address }) => {
    let score = 0;
    if (VIRTUAL_NAME_PATTERN.test(name)) score -= 100;
    if (/^192\.168\./.test(address)) score += 50;
    else if (/^10\./.test(address)) score += 40;
    else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) score += 20;
    else if (/^169\.254\./.test(address)) score -= 50; // link-local / APIPA: not useful
    else score += 10; // routable / public or otherwise
    return score;
};

// Return the best LAN address. If `preferred` (an interface name) is given,
// return that interface's IPv4 address when present. Falls back to 127.0.0.1.
const getNetworkAddress = (preferred) => {
    const candidates = getNetworkInterfaces();
    if (preferred) {
        const match = candidates.find((c) => c.name === preferred);
        if (match) return match.address;
        // Preferred interface not found — fall through to best-effort selection.
    }
    if (candidates.length === 0) return '127.0.0.1';
    const ranked = candidates
        .map((c) => ({ c: c, s: scoreInterface(c) }))
        .sort((a, b) => b.s - a.s);
    return ranked[0].c.address;
};

const debugLog = (log) => {
    if (config.debug) {
        console.log(log);
    }
};

module.exports = {
    getNetworkAddress,
    getNetworkInterfaces,
    scoreInterface,
    debugLog,
};
