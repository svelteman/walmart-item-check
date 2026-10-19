# Quick Start Guide

## Running the App

### 1. Start the Server
```bash
npm run dev
```

The server will display all the IP addresses it can be reached from:
```
🚀 Walmart Item Check Server Started

📱 Access from your device:
   http://192.168.3.167:3000
   http://192.168.2.20:3000
   http://192.168.3.20:3000
```

### 2. Install the Userscript

1. **On your computer**, install a userscript manager:
   - [Tampermonkey](https://www.tampermonkey.net/) (recommended, available for all browsers)
   - [Greasemonkey](https://addons.mozilla.org/firefox/addon/greasemonkey/) (Firefox)

2. **Visit the userscript URL** in your browser:
   ```
   http://localhost:3000/userscript.js
   ```
   (Or use your local IP if accessing from another machine)

3. **Click "Install"** in the extension popup

### 3. Parse Walmart Orders

1. **On your phone/tablet/iPad**, navigate to a Walmart order page:
   - Open Walmart app or go to walmart.com
   - Go to your account → Orders
   - Click on any order

2. **Click the blue button** "📱 Send to Checker" that appears in the bottom-right corner

3. **A notification will appear** with a link to your checklist, or you'll see a pop-up with the URL

### 4. Check Off Items

1. **Open the checklist URL** from the notification or pop-up
2. **Tap items** to mark them as received
3. **Watch the progress bar** fill up
4. **Get a celebratory message** when all items are checked! 🎉

## Troubleshooting

### Can't find the "Send to Checker" button?
- Make sure you're on a Walmart order details page (not just the orders list)
- Try refreshing the page
- Check that Tampermonkey is enabled in your browser

### Server says "Cannot find module"?
```bash
npm install
```

### Want to run in production without rebuild?
```bash
npm start
```

## Development Notes

- **Frontend**: Edit files in `src/public/` (App.svelte, ChecklistView.svelte)
- **Backend**: Edit `server.js` for API changes
- **Userscript**: Edit `src/userscript/walmart-checker.user.js` for parsing logic
- **Build**: Run `npm run build:svelte` to rebuild the frontend
- **Watch mode**: Run `npm run watch:svelte` in one terminal, then `npm start` in another

## Device Compatibility

- ✅ iPhone (iOS 12+)
- ✅ iPad (all sizes)
- ✅ Galaxy & Android tablets
- ✅ Desktop browsers

The app uses responsive design and safe-area insets to handle notches and irregular screens.
