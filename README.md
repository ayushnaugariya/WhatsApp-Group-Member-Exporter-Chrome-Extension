# WhatsApp Group Member Exporter — Chrome Extension

Export all member **names** and **phone numbers** from any WhatsApp Web group to Excel (.xlsx) — works reliably even for groups with 1000+ members.

---

## Installation (Developer Mode — no Chrome Web Store needed)

1. **Download / unzip** this folder to any location on your PC (e.g. `C:\Users\You\wa-exporter`).
2. Open Chrome and go to: `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **"Load unpacked"**.
5. Select the folder containing `manifest.json` (this folder).
6. The extension icon (green circle) appears in your toolbar. **Pin it** for easy access.

---

## How to Use

1. Go to **[web.whatsapp.com](https://web.whatsapp.com)** and log in.
2. Open the **group chat** you want to export.
3. Click the **group name** at the top to open the Group Info panel — make sure the **member list is visible** on screen.
4. Click the extension icon in the Chrome toolbar.
5. Click **"🔍 Scan Group Members"**.
6. Wait — the extension auto-scrolls through the entire member list (for large groups this may take 20–60 seconds).
7. When done, click **"📥 Export to Excel"** — the file downloads instantly.

---

## Features

- ✅ Handles **1000+ member groups** via automatic scroll detection
- ✅ Deduplicates members — no repeated rows
- ✅ Exports **Name** + **Phone Number** + a "Has Number" flag
- ✅ Works on virtual/lazy-loaded lists (WhatsApp only renders visible rows)
- ✅ No external servers — everything runs locally in your browser
- ✅ No API key or login required

---

## Output Format

| # | Name        | Phone Number  | Has Number |
|---|-------------|---------------|------------|
| 1 | John Smith  | +919876543210 | Yes        |
| 2 | Priya K     | +917001234567 | Yes        |
| 3 | ~Unknown    |               | No         |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Could not find participants panel" | Click the group name at the top first to open Group Info, then scan |
| Some members missing phone numbers | WhatsApp hides numbers if you haven't saved them — this is a WhatsApp limitation |
| Extension not working after WA update | WhatsApp periodically changes its HTML — re-install the extension update when available |
| Scan stops early | Scroll to the bottom of the member list manually first, then re-scan |

---

## Privacy

This extension **never sends any data anywhere**. All processing happens locally in your browser. No analytics, no tracking, no external calls.

---

## File Structure

```
whatsapp-exporter/
├── manifest.json      — Extension config
├── content.js         — Runs on WhatsApp Web, scrapes members
├── popup.html         — Extension popup UI
├── popup.js           — Popup logic + Excel export
├── icons/             — Extension icons
└── README.md          — This file
```
