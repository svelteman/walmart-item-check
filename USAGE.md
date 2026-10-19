# Walmart Order Checker - Complete Setup & Usage Guide

## ✅ What's Working

- ✅ Server running on all IPv4 and IPv6 addresses
- ✅ Frontend page loads properly (no longer blank!)
- ✅ Process management commands (start/stop/restart/status)
- ✅ Responsive design for iPhone, iPad, and Galaxy tablets
- ✅ REST API for creating and managing checklists
- ✅ Userscript for parsing Walmart order pages

## 📱 Quick Start

### 1. Start the Server

**Development (foreground, shows output):**
```bash
npm run dev
```

**Production (background):**
```bash
npm start
```

The server will display output like:
```
🚀 Walmart Item Check Server Started

📱 Access from your device:
   http://192.168.3.167:3000
   http://192.168.2.20:3000
   http://[2607:fb92:2985:7b08:143a:7d4a:2f51:4940]:3000
```

### 2. Access on Your Device

Copy **any** of the IP addresses (IPv4 or IPv6) and open it in your device's browser:
- iPhone: `http://192.168.3.167:3000` (or any IPv6 address)
- iPad: Same as above
- Galaxy: Same as above

You should see a welcome page!

### 3. Install the Userscript

On your **computer** browser:

1. **Install userscript manager:**
   - Chrome/Edge: [Tampermonkey](https://www.tampermonkey.net/)
   - Firefox: [Tampermonkey](https://www.tampermonkey.net/) or [Greasemonkey](https://addons.mozilla.org/firefox/addon/greasemonkey/)

2. **Install the userscript:**
   - Visit: `http://localhost:3000/userscript.js`
   - Click "Install" in the extension popup

### 4. Use It!

1. Navigate to a Walmart order on any device/browser
2. A blue "📱 Send to Checker" button appears in bottom-right
3. Click it
4. You get a notification with a link to your checklist
5. Open the link on your phone/tablet/iPad
6. Check off items as you receive them!

## 🛠️ Available Commands

```bash
npm run dev       # Run server in foreground (development)
npm start         # Start server in background
npm stop          # Stop the background server
npm restart       # Rebuild frontend and restart server
npm status        # Check if server is running
npm logs          # Watch live server output
```

## 🌐 Network Details

### IPv4 vs IPv6

- **IPv4** (traditional): `192.168.x.x:3000`
  - Works on most devices
  - Try these first

- **IPv6** (modern): `[2607:fb92:...]:3000` 
  - Works on iOS, newer Android, and Windows 11+
  - Format: `[ADDRESS]:3000` (note the brackets!)

### Connection Issues?

If you can't connect:

1. **Check server is running:**
   ```bash
   npm run status
   ```

2. **Verify device is on same WiFi**

3. **Try different IP addresses** (IPv4 and IPv6)

4. **Check firewall** isn't blocking port 3000

5. **Restart server:**
   ```bash
   npm run restart
   ```

## 🔧 Project Structure

```
walmart-item-check/
├── server.js                    # Express backend
├── bin/manager.js               # Process management
├── src/
│   ├── public/
│   │   ├── App.svelte          # Main Svelte app
│   │   ├── ChecklistView.svelte # Checklist component
│   │   ├── index.html          # HTML entry point
│   │   └── main.js             # JS entry point
│   └── userscript/
│       └── walmart-checker.user.js  # Tampermonkey script
├── dist/                       # Built frontend (generated)
├── vite.config.js             # Build configuration
├── package.json               # Dependencies
└── README.md                  # Full documentation
```

## 📊 How It Works

```
Your Computer          WiFi Network          Your Device
    ↓                      ↓                      ↓
[Walmart.com]  ←─  Userscript parses  ──→  [Sends to server]
    ↓                                           ↓
Tampermonkey                                   Sends item list
    ↓                                           ↓
  Button                                    [Server stores]
    ↓                                           ↓
Click → Parses items → Sends to server ←──  [Checklist created]
                            ↓
                      Generate checklist ID
                            ↓
                      Returns link to device
                            ↓
                      Device opens checklist
                            ↓
                    Check items off as received
                            ↓
                      Real-time progress updates
```

## 🐛 Troubleshooting

### Page is still blank after opening the URL

1. **Hard refresh your browser:**
   - iPhone: Swipe up from bottom → swipe up on Safari
   - iPad: Same as iPhone
   - Android: Menu → Close all tabs → Reopen

2. **Check browser console** (press F12 on computer):
   - Look for red errors
   - Report them

3. **Verify server is actually running:**
   ```bash
   npm run status
   ```

### Userscript button doesn't appear on Walmart page

1. Verify Tampermonkey is installed AND enabled
2. Check you're on `walmart.com/account/orders/...` (not just walmart.com)
3. Refresh the page
4. Check browser console for errors

### Can't reach server from device

1. Try all IP addresses (both IPv4 and IPv6)
2. Restart server: `npm run restart`
3. Restart your device's WiFi
4. Check if your device is on the same network as your computer

## 📝 Development Notes

### Modifying the Frontend

Edit files in `src/public/`:
- `App.svelte` - Main component
- `ChecklistView.svelte` - Checklist display & interaction

Then rebuild:
```bash
npm run build:svelte
```

And restart:
```bash
npm run restart
```

### Modifying the Userscript

Edit `src/userscript/walmart-checker.user.js` and reload on Walmart page.

### Modifying the Server

Edit `server.js` and run:
```bash
npm run restart
```

## 🎯 Next Steps (Optional)

- [ ] Add database persistence (currently uses in-memory storage)
- [ ] Add user accounts
- [ ] Add order history
- [ ] Deploy to actual server (AWS, Heroku, etc.)
- [ ] Make it work with other retailers

## 📞 Support

Check the full README.md for more details!

---

**Ready to use!** Start with `npm start` 🚀
