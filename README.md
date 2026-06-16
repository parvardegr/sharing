# sharing

**Share** directories and files from the CLI to iOS and Android devices without the need of an extra client app

![Sharing screenshot](/doc/sharing-banner.svg?raw=true "Sharing a directory")

- share directory and file
- share your clipboard
- receive file
- support basic authentication
- support ssl

## Usage
*sharing works with Node.js v14 or later*
1. Install
    - `npm install -g easy-sharing`
2. Share a file or directory
    - `sharing /directory-or-file-to-share`
3. Scan the QR-Code with your phone
    -  both devices must connect to the same Wi-Fi or, if you have a public IP address, use the `--ip` parameter.
        - `sharing --ip your-public-ip-address /directory-or-file-to-share`
4. Tada! Just browse the directory and download any file you want

*note: macos users should use `easy-sharing` binary instead of `sharing`*

example: `easy-sharing /file-or-directory`

```
$ sharing --help

Usage:
• Share file or directory
$ sharing /path/to/file-or-directory

• Share clipboard
$ sharing -c

• Receive file
$ sharing /destination/directory --receive;

• Share file with Basic Authentication
$ sharing /path/to/file-or-directory -U user -P password  # also works with
--receive

Options:
      --version                     Show version number                [boolean]
      --debug                       enable debuging logs
  -p, --port                        Change default port
      --ip                          Your machine public ip address
  -c, --clipboard                   Share Clipboard
  -t, --tmpdir                      Clipboard Temporary files directory
  -w, --on-windows-native-terminal  Enable QR-Code support for windows native
                                    terminal
  -r, --receive                     Receive files
  -q, --receive-port                change receive default port
  -U, --username                    set basic authentication username
                                                               [default: "user"]
  -P, --password                    set basic authentication password
      --tunnel                      Show guide for exposing your share over the
                                    internet using tunnel services
      --help                        Show help                          [boolean]
```

## Sharing Over the Internet (Tunneling)

If you are on a local network (home Wi-Fi, office, hotel, etc.) and want to share files with someone who is **not** on the same network — for example, sharing photos from your laptop with a friend across the city — you can use a tunnel service to make your share accessible over the internet, without needing a public IP address.

Run `sharing --tunnel` for a quick setup guide, or follow the steps below:

1. Start sharing as usual: `sharing /path/to/files`
2. In a separate terminal, run one of the tunnel commands below
3. Share the public URL the tunnel service gives you

- **ngrok**: `ngrok http 7478` — [Getting started](https://ngrok.com/docs/getting-started/)
- **localtunnel**: `npx localtunnel --port 7478` — [Docs](https://theboroer.github.io/localtunnel-www/)
- **cloudflared**: `cloudflared tunnel --url http://localhost:7478` — [Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- **ssh**: `ssh -R 80:localhost:7478 your-server`

Replace `7478` with the port shown when you start sharing.

## TODO
- zip the file before transferring it (sharing --zip /path/to/file)
- self-signed certificate creation
- new banner screenshot (also show the --receive functionality)
