**Sharing** directory and files from CLI to ios and android devices without the need for an extra client app

## Usage
1. install
    - `npm install -g easy-sharing`
2. share a file or directory
    - `sharing /directory-or-file-to-share`
3. scan the QR-Code with your phone
    -  both devices must connect to the same wifi or if you have public ip address use --ip parameter.
        - `sharing --ip your-public-ip-address /directory-or-file-to-share`
4. Tada! just browse the directory and download any file you want

## Screen-shots
#### sharing a directory and generate access QR-Code:
![Sharing screenshot](/doc/sharing-screenshot.jpeg?raw=true "Sharing a directory")

#### Browsing the shared directory and download files on phone:
![Sharing screenshot](/doc/sharing-on-phone-screenshot.jpeg?raw=true "Browsing the shared directory")

## TODO
- clipboard copy (peyman idea)
