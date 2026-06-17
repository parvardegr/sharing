# easy-sharing — Product Roadmap

> Instantly move files between your computer and your phone — zero setup, no app, just a QR code.

## Where we are

`easy-sharing` does one thing beautifully: run a command, scan a QR, and a folder, file, or your
clipboard is on your phone — over your own Wi-Fi, with no app to install on either side. It has
earned **1,834 GitHub stars** on that promise.

Yet it sees only **~577 npm installs/year**. The idea resonates; daily reach-for-it adoption
hasn't followed. Our research (27 competing tools, this repo's issue/PR history, and community
threads) says the gap is **not missing breadth** — it's *reliability* on the first run and a few
*table-stakes* transfer capabilities. The fix is sharpening what we already are, not bolting on a
file manager.

## The one insight that orders everything

The magic moment is the **first scan**. When it fails, the user never comes back. The most common
failure across this entire category isn't a missing feature — it's **"the QR scans but the page
won't load."** It happens because the tool advertises the wrong network address (a Docker/VPN/WSL
virtual adapter). We have exactly this bug today: `getNetworkAddress()` returns the *first*
non-internal IPv4 it finds. **Reliability is therefore Priority Zero.** Everything else is built on
the assumption that the first scan always works.

## Principles (what keeps this product *itself*)

The maintainer's stated philosophy (issue #28) is our north star, and the research validates it:

1. **Terminal-first.** The CLI is the product. The browser pages stay minimal — no SPA, no framework.
2. **Zero-setup, no app.** Our wedge vs. LocalSend/PairDrop/croc is "nothing to install on the phone."
3. **It just works.** We optimize the 10-second path: command → scan → done.
4. **Minimal dependencies.** Every new dep must earn its place. We are not a NAS web UI.
5. **Safe by default, without friction.** Security should be a default, not a chore.

---

## The roadmap — five themes

Each item shows **impact / effort** (S = hours, M = ~a day, L = a few days) and is grounded in
evidence (a competitor that has it and/or a request in our own tracker).

### Theme 1 — "It just works": every scan reaches the page  *(Reliability — Priority Zero)*

| Bet | Impact / Effort | Why & evidence | Where it lives |
|---|---|---|---|
| **Smart network-interface auto-detect + `--interface` flag** | **High / S** | The #1 category failure ("QR scans, page unreachable"). Today we pick the *first* non-internal IPv4 → loses to Docker/VPN/WSL/Hyper-V NICs. qrcp's most-praised differentiator is exactly interface selection (#164, #196, #206). | `bin/utils.js`: rank candidates, prefer RFC-1918 LAN ranges, de-prioritize `docker/veth/vEthernet/wsl/utun/tun/tap`; add `getNetworkInterfaces()`. `bin/index.js`: add `--interface`; on ambiguity print the candidate list (non-interactive). `--ip` remains the override. |
| **Robust QR + browser-QR fallback** | **High / M** | Terminal QR is unscannable on Windows native terminals and with unicode/long paths (#17, #20, #46, #37). qrcp's `--open` sidesteps this. | `bin/index.js`: optional `--qr-image` / auto-open. `bin/app.js`: `GET /qr` serving a tiny page with the QR as an `<img>` data URI — reuse the `receiveFormHtml` read+template+serve pattern. Keep terminal QR the default. |
| **Firewall pre-flight hint** | Med / M | Host firewall silently blocks the random port; users blame the tool. qrcp guides warn about this explicitly. | `bin/index.js` startup: detect likely-blocked bind and print a one-line, OS-aware hint. |

### Theme 2 — "Move a pile, not a file": batch transfer, both directions  *(Core capability)*

| Bet | Impact / Effort | Why & evidence | Where it lives |
|---|---|---|---|
| **Multi-file (and folder) receive** — finish PR #45 | **High / M** | Our **oldest open request** (PR #45, untouched since 2023) and qrcp #131. Receiving a batch of phone photos is the dominant real-world receive job. | `bin/receive-form.html`: add `multiple` to the input, loop `this.files` into the *existing* XHR + progress bar. `bin/app.js`: normalize `req.files.selected` to an array (`express-fileupload` already returns an array for a repeated field) and `Promise.all(.mv())`. **Add a basename guard** (reject `../`) before `mv` — multi-file amplifies the existing path-traversal exposure. |
| **Download a shared folder as one `.zip`** | **High / M** | Universal across rivals (miniserve `--enable-zip`, dufs `--allow-archive`, qrcp `--zip`, woof). One tap to grab everything on a phone, vs. saving files one by one. | `bin/app.js`: new `GET /zip` route streaming via `archiver` (one focused, streaming dep — justified) with `Content-Disposition: attachment`; confine strictly to `sharePath` (traversal/symlink guard). Inject a "Download all as .zip" link by extending the existing `res.end` + `fixListingLinks` shim. Reuses basic-auth ordering for free. |

### Theme 3 — "Close the loop": clipboard & text, both ways  *(Delight)*

| Bet | Impact / Effort | Why & evidence | Where it lives |
|---|---|---|---|
| **Clipboard share page with one-tap "Copy"** | Med / M | The job of `-c` is to land text on the *other* device's clipboard, yet today we only serve a `.clipboard-tmp` download. croc/KDE Connect/PairDrop all do one-tap copy. | New `bin/clipboard-page.html` (styled like the receive form), read once in `bin/app.js`; when `clipboard` is set, render it with the text injected (HTML-escaped) and a `navigator.clipboard.writeText` button + textarea fallback. Note: one-tap copy needs a secure context → pairs naturally with auto-HTTPS below. |
| **Send text/paste from the phone → terminal** | Med / S | A loved croc/KDE Connect/PairDrop pattern; we share clipboard *to* the phone but have no reverse path. | `bin/receive-form.html`: small textarea + Send (reuse the XHR pattern). `bin/app.js` inside the `receive` block: `POST /text` that prints it and optionally `clipboardy.writeSync()` (already a dep). Sanitize control chars before `console.log`. |

### Theme 4 — "Safe without friction": trust by default  *(Security)*

| Bet | Impact / Effort | Why & evidence | Where it lives |
|---|---|---|---|
| **Auto-generated self-signed HTTPS** (one flag) | Med / S | Today `-S` requires a user-supplied cert/key. A `--https` that mints a self-signed cert removes the chore — and unlocks one-tap clipboard copy on LAN. | `bin/index.js` / `bin/config.js`: generate an in-memory cert when no `-C/-K` given. |
| **Ephemeral shares: `--once` and `--timeout`** | Med / S | We run until ctrl-C — no serve-once, no expiry. woof self-destructs after N downloads; qrcp exits after one transfer by default. | `bin/app.js`: close the server after first successful download / after a TTL. |
| **Capability-URL token + `--secure` preset** | Low–Med / S | Path is the predictable `/share/`; anyone on the Wi-Fi can browse. A random URL token (and a `--secure` flag bundling token + password + HTTPS) makes the share unguessable. Warn when binding `0.0.0.0`. | `bin/app.js`: mount under `/share/<random>/`; `bin/index.js`: `--secure` preset + a one-line open-by-default warning. |

### Theme 5 — "Easy to reach for": adoption  *(Growth)*

| Bet | Impact / Effort | Why & evidence | Where it lives |
|---|---|---|---|
| **Promote `npx easy-sharing <path>` in the README** | Low / S — *quick win* | Removes the global-install commitment (and macOS EACCES pain) for the try-it-once user. Already works today via the `bin` map. | `README.md`: add a "Try without installing" snippet above `npm install -g`. Use `easy-sharing` (not `sharing`) to dodge the macOS `/usr/sbin/sharing` collision. |
| **Homebrew tap and/or single binary** | Med / M | Stars-vs-installs gap is partly install friction; rivals ship single binaries (qrcp, croc) and `brew`. | New release tooling (Node SEA / `pkg` / `bun compile`) on GitHub Releases; a Homebrew tap. No source changes to `bin/`. |

---

## Sequenced phases (recommended order)

- **Phase 1 — Priority Zero + quick win:** smart interface detect + `--interface`; promote `npx` in README. *Highest ROI; turns silent first-run failures into successes.*
- **Phase 2 — Core batch:** multi-file/folder receive (finish PR #45); folder-as-zip download.
- **Phase 3 — Robust QR + delight:** browser-QR fallback; clipboard copy page + reverse text.
- **Phase 4 — Trust:** auto self-signed HTTPS; `--once`/`--timeout`; capability-URL token + `--secure`.
- **Phase 5 — Growth:** Homebrew tap / single-binary distribution.

## What we will **not** build (and why)

Saying no protects the product. The research surfaced these; we decline them to stay terminal-first
and minimal:

- **Full in-browser file manager** — delete / rename / mkdir / move (dufs, filebrowser). That's a NAS UI; we're a transfer tool.
- **In-browser previews / thumbnails, search, column sort, breadcrumbs** beyond the bare listing (Copyparty, filebrowser). Out of scope for "move it, don't manage it."
- **Cross-network P2P / relay** with codephrase pairing (croc, magic-wormhole). Different product; our wedge is LAN + browser, no phone app. We already point to tunnels via `--tunnel`.
- **Config files / named profiles**, resumable Range transfers, per-file checkbox-select zips. Complexity without matching demand for *this* tool.
- **Renaming the primary command.** Already mitigated by the `easy-sharing` alias; a rename churns existing users.

---

## How we'll validate each shipped bet

When bets are greenlit and built, validate end-to-end:

1. **Existing tests:** `node test/test.js` (the repo's dependency-free suite) must stay green; extend it for new `bin/utils.js` interface-ranking logic and the `/zip`, `/text`, multi-file `/upload` routes.
2. **Reliability bet (manual, the important one):** on a machine with Docker/VPN active, run `sharing <dir>` and confirm the QR points to the real LAN IP (not `172.x`/VPN); scan from a phone and confirm the page loads. Verify `--interface` override and the printed candidate list.
3. **Batch transfer:** receive several files + a folder in one go from a phone; confirm all land in `sharePath` with correct (unicode) names and that `../`-crafted names are rejected. Click "Download all as .zip" and verify the archive opens and matches the tree.
4. **Delight/trust:** `-c` shows text with a working Copy button (over `--https`); phone→terminal text prints/copies; `--once` exits after one download; `--timeout` auto-shuts; tokened URL is required.
5. **Cross-platform smoke:** Windows native terminal (QR fallback), macOS, Linux.

---

*This roadmap is a proposal for review. Greenlight the bets you want and we'll scope implementation per phase.*
