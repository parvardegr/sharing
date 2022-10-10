# sharing

**Share** directories and files from the CLI to iOS and Android devices without the need of an extra client app

![Sharing screenshot](/doc/sharing-banner.svg?raw=true "Sharing a directory")

- share directory and file
- share your clipboard
- receive file (Soon!)
- enjoyable! 😉

## Usage
*sharing is depend on node v16.x or later*
1. Install
    - `npm install -g easy-sharing`
2. Share a file or directory
    - `sharing /directory-or-file-to-share`
3. Scan the QR-Code with your phone
    -  both devices must connect to the same Wi-Fi or, if you have a public IP address, use the `--ip` parameter.
        - `sharing --ip your-public-ip-address /directory-or-file-to-share`
4. Tada! Just browse the directory and download any file you want

```
$ sharing --help

Usage:
• Share file or directory
$ sharing /path/to/file-or-directory

• Share clipboard
$ sharing -c

• Receive file (Soon!)
$ sharing /destination/directory --receive

Options:
      --version                     Show version number                [boolean]
      --debug                       enable debuging logs
  -p, --port                        Change default port
      --ip                          Your machine public ip address
  -c, --clipboard                   Share Clipboard
  -w, --on-windows-native-terminal  Enable QR-Code support for windows native
                                    terminal
      --help                        Show help                          [boolean]
```

## TODO
- upload file from phone
