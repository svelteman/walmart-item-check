# Walmart Item Check

A web app to verify all items from a Walmart order were received.

## How It Works

1. **Server** - Node.js/Express backend that:
   - Displays all local IP addresses it can be reached at
   - Serves the Svelte frontend
   - Manages order checklists via REST API

2. **Userscript** - Browser extension that:
   - Automatically detects Walmart order pages
   - Parses the order items
   - Sends them to the server with one click

3. **Frontend** - Svelte app that:
   - Displays items from the order
   - Allows marking items as received
   - Shows progress with a visual progress bar
   - Fully responsive for mobile/tablet use

## Setup

### Prerequisites
- Node.js 16+
- npm
- Browser with Tampermonkey/Greasemonkey extension (for userscript)

### Installation

1. Clone/navigate to the project:
```bash
cd /Users/tonyf/git/walmart-item-check
```

2. Install dependencies (already done):
```bash
npm install
```

3. Build Svelte frontend:
```bash
npm run build:svelte
```

## Running

### Development
```bash
npm run dev
```
This will build the Svelte app and start the server. The server will show all IP addresses.

### Production
```bash
npm start
```

## Installing the Userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) or Greasemonkey extension
2. Visit `http://<server-ip>:3000/userscript.js`
3. Click "Install" in the extension popup
4. Navigate to any Walmart order details page
5. Click the blue "📱 Send to Checker" button
6. A checklist will be created; tap **Open checklist** in the on-page panel.

The script uses the server it was installed from. Use **Server** in the panel to change it; full URLs, IPv4, and IPv6 addresses are supported and saved. On the first send, Tampermonkey may ask to connect to that server; choose **Always allow** for the displayed checker server. When upgrading an existing installation, revisit `/userscript.js`, accept the Tampermonkey update, and reload the Walmart tab.

## API Endpoints

### Create Checklist
```
POST /api/checklist/create
{
  "items": [
    { "name": "Item Name", "quantity": 1 },
    ...
  ],
  "orderUrl": "https://walmart.com/..."
}
```

### Get Checklist
```
GET /api/checklist/:id
```

### Update Item Status
```
PATCH /api/checklist/:id/item/:itemId
{
  "received": true
}
```

## Development Tips

- The userscript supports `/orders/<id>` and `/account/orders/<id>` on both `www.walmart.com` and `walmart.com`. It loads across the site to handle navigation without a full page reload; its panel appears only on order details pages.
- Run userscript regression tests with `node --test tests/userscript.test.cjs`.
- Modify selectors in `src/userscript/walmart-checker.user.js` if Walmart page structure changes
- Svelte frontend is in `src/App.svelte` and `src/ChecklistView.svelte`
- Server code is in `server.js`

## File Structure

```
walmart-item-check/
├── server.js                           # Express server
├── package.json                        # Dependencies
├── vite.config.js                      # Vite build config
├── src/
│   ├── App.svelte                      # Main Svelte app
│   ├── ChecklistView.svelte            # Checklist component
│   ├── main.js                         # Svelte entry point
│   ├── public/
│   │   ├── index.html                  # HTML entry point
│   │   └── dist/                       # Built Svelte app (generated)
│   └── userscript/
│       └── walmart-checker.user.js     # Tampermonkey userscript
```

## Troubleshooting

### Userscript doesn't parse items
- Check browser console (F12) for errors
- Verify you're on a Walmart order details page
- If Walmart changed their page structure, update the selectors in `walmart-checker.user.js`

### Can't reach server from device
- Make sure device is on same WiFi network
- Check firewall isn't blocking port 3000
- Verify the IP address from the server startup message

### Items not showing up
- Make sure the userscript successfully sent data (check notification)
- Try copying the checklist URL directly to your device

## Notes

- Checklists are persisted on disk and survive server restarts
- Each server instance keeps its own checklist store, but the landing page lists recent checklists and refreshes automatically as they change
- Duplicate checklist submissions for the same order/items reuse the original checklist instead of creating a second one
