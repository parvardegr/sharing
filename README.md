# sharing

**Instantly move files, folders, and clipboard text between your computer and any phone — no app, no account, no cloud. Just run a command and scan the QR code.**

![Sharing screenshot](/doc/sharing-banner.svg?raw=true "Sharing a directory")

```sh
npx easy-sharing ~/Photos      # share a folder — scan the QR on your phone — done
```

That's the whole idea. Your phone opens a normal web page over your own Wi-Fi. Nothing to install on the other device, nothing leaves your network.

## Why `sharing`?

If you've ever tried to get a file from your laptop to your phone, you know the options are all a little painful: cloud uploads are slow and nosy, AirDrop is Apple-only, and "real" tools want an app installed on *both* ends. `sharing` takes the simplest path that always works: **a tiny web server and a QR code.** Any phone with a browser can use it.

| | **sharing** | `python -m http.server` | `npx serve` | qrcp | AirDrop / LocalSend |
|---|:---:|:---:|:---:|:---:|:---:|
| No app on the phone | ✅ | ✅ | ✅ | ✅ | ❌ (app both ends) |
| QR code to connect | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Receive** files from the phone | ✅ | ❌ | ❌ | ✅ | ✅ |
| Receive **multiple** files / drag-drop | ✅ | ❌ | ❌ | ➖ | ✅ |
| Download a whole folder as **.zip** | ✅ | ❌ | ❌ | ✅ | ➖ |
| Share **clipboard** text *and* receive text back | ✅ | ❌ | ❌ | ➖ | ✅ |
| Built-in auth **and** HTTPS | ✅ | ❌ | ➖ | ➖ | ✅ |
| One-flag private share (`--secure`) | ✅ | ❌ | ❌ | ❌ | ✅ |
| Picks the **right** network address automatically | ✅ | ❌ | ➖ | ✅ | ✅ |

`sharing` is the one that does **all** of it from a single command, in a browser, with nothing to install on the device in your hand.

## Getting Started

**Requirements:** Node.js v14.17 or later.

### Try it without installing

```sh
npx easy-sharing /path/to/file-or-directory
```

### Install globally

```sh
npm install -g easy-sharing
```

> **macOS users:** macOS already ships a built-in `/usr/sbin/sharing` command, so use **`easy-sharing`** instead of `sharing`.
> Example: `easy-sharing /path/to/file`

### Quick Start

```sh
# Share a file or directory
sharing /path/to/file-or-directory

# Share clipboard content
sharing -c

# Receive files from another device
sharing /destination/directory --receive

# Share privately — secret link + password + HTTPS, in one flag
sharing /path/to/file-or-directory --secure
```

Scan the QR code shown in your terminal with your phone. Both devices just need to be on the same Wi-Fi.

**QR code won't scan?** (Some Windows terminals and unicode paths can't draw it.) Open the link the terminal prints, or run with `--open` to pop the QR up in a browser window on your computer — then scan that.

## Features

### 📤 Share anything

- **Files and directories** over your local network, with a clean browsable listing.
- **Download a whole folder as a single `.zip`** — one tap on the phone instead of saving files one by one.
- **Clipboard text** (`-c`) opens on the phone with a one-tap **Copy** button.

### 📥 Receive just as easily

- Turn your machine into a drop target with `--receive`.
- **Multiple files at once**, with **drag-and-drop** and a live progress bar.
- **Send a note or link back** from the phone straight to your terminal (and your clipboard).

### 🔒 Private when you need it

- `--secure` — the easy button: a secret unguessable link **+** an auto-generated password **+** HTTPS, all at once.
- Or mix and match: `-U`/`-P` for a password, `--token` for a secret link, `-S` for HTTPS.
- **Auto HTTPS:** `-S` now generates a certificate for you — no more fiddling with OpenSSL. (Bring your own with `-C`/`-K` if you prefer.)

### ⏱️ Ephemeral by choice

- `--once` — stop sharing automatically after the first transfer.
- `--timeout 10m` — auto-stop after a set time (`30s`, `10m`, `1h`).

### 🎯 It just works

- **Smart network detection:** `sharing` advertises your real Wi-Fi address and skips Docker/VPN/WSL adapters — the #1 reason "the QR scans but the page won't load." Pin one explicitly with `--interface en0` or `--ip`.
- **QR fallback:** `--open` shows the QR as an image in a browser for terminals that can't render it.
- **Internet sharing:** `--tunnel` walks you through exposing a share beyond your LAN.

## Usage examples

```sh
# Receive a batch of photos from your phone (multi-file + drag & drop)
sharing ~/Downloads --receive

# Share a folder and let the recipient grab it all as one zip
sharing ~/project        # the listing shows a "Download as .zip" button

# Copy a snippet to your phone, or send a link from the phone to your terminal
sharing -c               # then use the Copy button on the page
sharing ~/x --receive    # the upload page also has a "Send text" box

# A private, self-destructing share
sharing report.pdf --secure --once

# Pick a specific network interface (multi-homed / VPN machines)
sharing ~/x --interface en0

# Share over HTTPS with your own certificate
sharing ~/x -S -C cert.pem -K key.pem
```

## Options

```
$ sharing --help

sharing — quickly share files, directories, and clipboard content from your
terminal to any device with a browser.

Examples:

  Share file or directory
  $ sharing /path/to/file-or-directory

  Share clipboard content
  $ sharing -c

  Receive files from another device
  $ sharing /destination/directory --receive

  Share with basic authentication
  $ sharing /path/to/file-or-directory -U user -P password

  Share privately (secret link + password + HTTPS)
  $ sharing /path/to/file-or-directory --secure

  Share over HTTPS
  $ sharing /path/to/file-or-directory -S -C cert.pem -K key.pem

Options:
      --version                     Show version number                [boolean]
      --debug                       Enable debug logging  [boolean] [default: false]
  -p, --port                        Set the server port (default: auto-assigned) [number]
      --ip                          Specify your machine's public IP address [string]
  -i, --interface                   Network interface/adapter name to advertise
                                    (e.g. en0, eth0)                    [string]
  -c, --clipboard                   Share clipboard content            [boolean]
  -w, --on-windows-native-terminal  Enable QR code rendering in Windows native terminal [boolean]
      --open                        Open the QR code in a browser window on this computer [boolean]
  -r, --receive                     Receive files from another device  [boolean]
  -q, --receive-port                Set the port for receiving files    [number]
  -U, --username                    Set username for basic authentication
                                                      [string] [default: "user"]
  -P, --password                    Set password for basic authentication [string]
  -S, --ssl                         Enable HTTPS (auto self-signed cert when
                                    -C/-K are not given)               [boolean]
  -C, --cert                        Path to SSL certificate file        [string]
  -K, --key                         Path to SSL private key file        [string]
      --token                       Add a secret token to the share URL so it is
                                    unguessable                        [boolean]
      --secure                      Private share preset: secret link +
                                    generated password + HTTPS         [boolean]
      --once                        Stop sharing after the first completed transfer [boolean]
      --timeout                     Auto-stop the share after a duration (e.g.
                                    30s, 10m, 1h)                       [string]
      --tunnel                      Show guide for sharing over the internet via
                                    tunnel services                    [boolean]
      --help                        Show help                          [boolean]
```

## A note on security

By default a share is open to everyone on your Wi-Fi — perfect for your own devices at home, less so on a café or office network. `sharing` reminds you of this on startup and gives you one-flag protection:

```sh
sharing ~/private --secure
```

This generates a **secret link** (so the share isn't browsable by IP alone), a **random password**, and turns on **HTTPS** — printed for you when the server starts.

## Sharing Over the Internet (Tunneling)

To share with someone who is **not** on your local network, pair `sharing` with a tunnel service — no public IP required.

Run `sharing --tunnel` for a quick setup guide, or:

1. Start sharing as usual: `sharing /path/to/files`
2. In a separate terminal, run one of the tunnel commands below
3. Share the public URL the tunnel gives you

| Service | Command | Documentation |
|---|---|---|
| **ngrok** | `ngrok http 7478` | [Getting started](https://ngrok.com/docs/getting-started/) |
| **localtunnel** | `npx localtunnel --port 7478` | [Docs](https://theboroer.github.io/localtunnel-www/) |
| **cloudflared** | `cloudflared tunnel --url http://localhost:7478` | [Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) |
| **SSH** | `ssh -R 80:localhost:7478 your-server` | — |

> Replace `7478` with the port shown when you start sharing.

## Development

```sh
npm test    # runs the test suite (no external test framework)
```

## License

[MIT](LICENSE)
