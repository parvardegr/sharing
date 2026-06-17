# sharing

Instantly share files, directories, and clipboard content from your terminal to any device with a browser — no apps required.

![Sharing screenshot](/doc/sharing-banner.svg?raw=true "Sharing a directory")

### Features

- Share files and directories over your local network
- Share clipboard content
- Receive files from other devices
- Protect shares with basic authentication
- HTTPS support via custom SSL certificates
- Expose shares over the internet with tunnel services

## Getting Started

**Requirements:** Node.js v14 or later

### Install

```sh
npm install -g easy-sharing
```

> **macOS users:** use the `easy-sharing` command instead of `sharing`.
> Example: `easy-sharing /path/to/file`

### Quick Start

```sh
# Share a file or directory
sharing /path/to/file-or-directory

# Share clipboard content
sharing -c

# Receive files from another device
sharing /destination/directory --receive
```

Scan the QR code displayed in your terminal with your phone to access the shared content. Both devices must be on the same network, or you can use the `--ip` flag to specify a public IP address:

```sh
sharing --ip <your-public-ip> /path/to/file-or-directory
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

  Share over HTTPS
  $ sharing /path/to/file-or-directory -S -C cert.pem -K key.pem

Options:
      --version                     Show version number                [boolean]
      --debug                       Enable debug logging
                                                      [boolean] [default: false]
  -p, --port                        Set the server port (default: auto-assigned)
                                                                        [number]
      --ip                          Specify your machine's public IP address
                                                                        [string]
  -c, --clipboard                   Share clipboard content            [boolean]
  -t, --tmpdir                      Set temporary directory for clipboard files
                                                                        [string]
  -w, --on-windows-native-terminal  Enable QR code rendering in Windows native
                                    terminal                           [boolean]
  -r, --receive                     Receive files from another device  [boolean]
  -q, --receive-port                Set the port for receiving files    [number]
  -U, --username                    Set username for basic authentication
                                                      [string] [default: "user"]
  -P, --password                    Set password for basic authentication
                                                                        [string]
  -S, --ssl                         Enable HTTPS                       [boolean]
  -C, --cert                        Path to SSL certificate file        [string]
  -K, --key                         Path to SSL private key file        [string]
      --tunnel                      Show guide for sharing over the internet via
                                    tunnel services                    [boolean]
      --help                        Show help                          [boolean]
```

## Sharing Over the Internet (Tunneling)

If you want to share files with someone who is **not** on your local network, you can use a tunnel service to make your share accessible over the internet — no public IP address required.

Run `sharing --tunnel` for a quick setup guide, or follow these steps:

1. Start sharing as usual: `sharing /path/to/files`
2. In a separate terminal, run one of the tunnel commands below
3. Share the public URL provided by the tunnel service

| Service | Command | Documentation |
|---|---|---|
| **ngrok** | `ngrok http 7478` | [Getting started](https://ngrok.com/docs/getting-started/) |
| **localtunnel** | `npx localtunnel --port 7478` | [Docs](https://theboroer.github.io/localtunnel-www/) |
| **cloudflared** | `cloudflared tunnel --url http://localhost:7478` | [Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) |
| **SSH** | `ssh -R 80:localhost:7478 your-server` | — |

> Replace `7478` with the port shown when you start sharing.

## License

[MIT](LICENSE)
