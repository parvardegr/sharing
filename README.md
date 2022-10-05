# sharing

**Share** directories and files from the CLI to iOS and Android devices without the need of an extra client app

## Usage
1. Install
    - `npm install -g easy-sharing`
2. Share a file or directory
    - `sharing /directory-or-file-to-share`
3. Scan the QR-Code with your phone
    -  both devices must connect to the same Wi-Fi or, if you have a public IP address, use the `--ip` parameter.
        - `sharing --ip your-public-ip-address /directory-or-file-to-share`
4. Tada! Just browse the directory and download any file you want

## Screen-shots
#### Sharing a directory and generate access QR-Code:
![Sharing screenshot](/doc/sharing-screenshot.jpeg?raw=true "Sharing a directory")

#### Browsing the shared directory and download files on phone:
![Sharing screenshot](/doc/sharing-on-phone-screenshot.jpeg?raw=true "Browsing the shared directory")

## TODO
- clip board copy (peyman idea)
