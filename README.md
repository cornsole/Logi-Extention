# YouTube Horizontal Wheel Seek

**Language:** **English** | [한국어](README.ko.md)

A Chrome and Firefox extension that lets horizontal-wheel mice such as the Logitech MX Master seek through YouTube videos.

> Once you try it, it is genuinely convenient. Hehe.

## Features

- Supports standard videos, Shorts, `youtube.com/embed`, and `youtube-nocookie.com/embed`
- Seeks proportionally to horizontal-wheel movement
- Defaults to `2 seconds / 100px`, adjustable from `1–20 seconds / 100px` in the popup
- Direction inversion is enabled by default and can be changed in the popup
- Preserves the current playback state while seeking
- Shows the target time and progress immediately while paused, independently of media loading
- Preserves the volume slider's native horizontal-wheel behavior
- Clamps VOD, ad, and DVR live-stream seeking to the actual seekable range

## Quick install

Node.js 18 or later is required. No external npm packages are installed.

```bash
git clone https://github.com/cornsole/Logi-Extention.git
cd Logi-Extention
npm run package
```

The command creates these directories:

- Chrome: `dist/chrome`
- Firefox: `dist/firefox`

### Chrome

1. Open `chrome://extensions` in the address bar.
2. Enable **Developer mode** in the upper-right corner.
3. Select **Load unpacked**.
4. Select this project's `dist/chrome` directory.
5. Reload any YouTube tabs that were already open.

### Firefox 140 or later

1. Open `about:debugging#/runtime/this-firefox` in the address bar.
2. Select **Load Temporary Add-on**.
3. Select `dist/firefox/manifest.json`.
4. Reload any YouTube tabs that were already open.

Temporary add-ons are removed when Firefox exits. Permanent installation requires Mozilla signing.

## Usage

1. Open a YouTube video.
2. Place the mouse pointer over the player.
3. With the default settings, rotate the horizontal wheel right to seek backward and left to seek forward.
4. Select the extension icon in the browser toolbar to change sensitivity and direction.

| Setting | Default | Description |
|---|---:|---|
| Seek sensitivity | 2 seconds / 100px | Controls how much playback time changes for the same wheel movement. |
| Invert horizontal-wheel direction | On | Swaps the left and right seek directions. |

Settings are stored in the browser's synchronized storage and are applied immediately to open YouTube tabs.

Both wheels can adjust the sensitivity slider while the pointer is over it:

- Standard wheel: scroll up to increase sensitivity and down to decrease it
- Horizontal wheel: adjust left or right, with the **Invert horizontal-wheel direction** setting applied

## Input conflict prevention

- The extension does not handle horizontal-wheel events over the volume slider.
- Standard vertical-wheel behavior is unchanged outside the popup sensitivity slider.
- Horizontal-wheel behavior outside the player is unchanged.
- Diagonal input with a larger vertical component is treated as vertical scrolling.
- Input is ignored for live streams that do not expose a seekable range.

## Troubleshooting

### The horizontal wheel does nothing

1. In Logitech Options+, confirm that the browser's thumb wheel is assigned to **Horizontal scrolling**.
2. Confirm that the extension is enabled in Chrome or Firefox's extension manager.
3. Reload the YouTube tab after installing or reloading the extension.
4. Confirm that the pointer is inside the YouTube player.
5. For live video, confirm that the stream supports DVR rewind.

### The direction or seek distance feels wrong

Select the extension icon in the browser toolbar, then adjust **Seek sensitivity** and **Invert horizontal-wheel direction**. The wheel delta produced by the device can vary with the operating system and Logitech Options+ settings.

## Permissions and privacy

| Permission | Purpose |
|---|---|
| `storage` | Stores sensitivity and direction settings in the browser's synchronized storage. |
| `youtube.com`, `youtube-nocookie.com` | Handles horizontal-wheel events inside YouTube players. |

The extension does not collect or transmit usage data or personal information.

## Development and verification

```bash
npm test
npm run package
```

- `npm test`: tests wheel-unit conversion, sensitivity, direction, and seek ranges
- `npm run package`: creates the Chrome and Firefox distribution directories

## Project structure

- `src/content/wheel-normalizer.js`: normalizes `WheelEvent` units and calculates seek ranges
- `src/content/paused-seeker.js`: prevents overlapping paused seeks and accumulates the target time
- `src/content/progress-preview.js`: previews paused-seek progress and target time
- `src/content/settings.js`: synchronized settings storage
- `src/content/youtube-wheel.js`: YouTube player event handling
- `src/popup/wheel-input.js`: standard- and horizontal-wheel direction mapping for the sensitivity slider
- `src/popup`: sensitivity and direction settings UI
- `scripts/package.mjs`: creates browser-specific distributions
