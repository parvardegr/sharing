# sharing

**Share** directories and files from the CLI to iOS and Android devices without the need of an extra client app

![Sharing screenshot](/doc/sharing-banner.svg?raw=true "Sharing a directory")

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

## Available Options:
| Command           | Description                    | Defaults |
|-------------------|--------------------------------|----------|
| --version         | Show version number            |          |
| -p or --port      | Change default port            | 7478     |
| --ip              | Your machine public ip address | 0.0.0.0  |
| -c or --clipboard | Share Clipboard                | false    |
| --help            | Show help                      |          |

## TODO
- upload file from phone
