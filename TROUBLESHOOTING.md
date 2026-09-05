# Troubleshooting Guide

Common issues and their solutions for the WebRTC Chat Application.

---

## Installation Issues

### Backend Dependencies Won't Install

**Problem:** `npm install` fails in backend directory

**Solutions:**

```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install

# If still failing, try with legacy peer deps
npm install --legacy-peer-deps
```

### Frontend Dependencies Won't Install

**Problem:** `npm install` fails in frontend directory

**Solutions:**

```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json .next

# Reinstall
npm install

# If still failing, update npm
npm install -g npm@latest
```

---

## MongoDB Issues

### MongoDB Connection Failed

**Problem:** `Error connecting to MongoDB`

**Solutions:**

1. **Check if MongoDB is running:**

```bash
# Check status
sudo systemctl status mongodb

# Start MongoDB
sudo systemctl start mongodb

# Or run manually
mongod
```

2. **Check MongoDB connection string in `.env`:**

```env
# Default local connection
MONGODB_URI=mongodb://localhost:27017/webrtc-chat

# If MongoDB is on different port
MONGODB_URI=mongodb://localhost:27018/webrtc-chat
```

3. **Check MongoDB logs:**

```bash
# View MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log
```

4. **Test connection manually:**

```bash
# Connect with mongo shell
mongo --eval "db.runCommand({ ping: 1 })"
```

### MongoDB Permission Denied

**Problem:** Permission errors when accessing database

**Solutions:**

```bash
# Fix permissions on MongoDB data directory
sudo chown -R mongodb:mongodb /var/lib/mongodb
sudo chown mongodb:mongodb /tmp/mongodb-27017.sock

# Restart MongoDB
sudo systemctl restart mongodb
```

---

## Backend Issues

### Port Already in Use

**Problem:** `Error: listen EADDRINUSE: address already in use :::5000`

**Solutions:**

1. **Find and kill the process using port 5000:**

```bash
# Find process
lsof -i :5000

# Kill process (replace PID with actual process ID)
kill -9 <PID>
```

2. **Change port in backend `.env`:**

```env
PORT=5001
```

### JWT Token Errors

**Problem:** `Token is not valid` or authentication failures

**Solutions:**

1. **Clear localStorage in browser:**

```javascript
// Open browser console (F12) and run:
localStorage.clear();
```

2. **Check JWT_SECRET in `.env`:**

```env
JWT_SECRET=your-secret-key-change-this-in-production
```

3. **Login again** - Old tokens may be expired

### CORS Errors

**Problem:** `Access to XMLHttpRequest blocked by CORS policy`

**Solutions:**

1. **Check backend CORS configuration in `server.js`:**

```javascript
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);
```

2. **Ensure frontend is running on correct URL**

   - Default: http://localhost:3000

3. **Check browser console** for specific CORS error details

---

## Frontend Issues

### Page Won't Load

**Problem:** Blank page or loading forever

**Solutions:**

1. **Check browser console** (F12) for errors

2. **Clear Next.js cache:**

```bash
rm -rf .next
npm run dev
```

3. **Check if backend is running:**

```bash
curl http://localhost:5000/health
```

### Socket.IO Connection Failed

**Problem:** `Socket connection error` in console

**Solutions:**

1. **Verify backend is running** on correct port

2. **Check `NEXT_PUBLIC_API_URL` in `.env.local`:**

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

3. **Check browser console** for detailed error message

4. **Restart both servers:**

```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev
```

### Images or Styles Not Loading

**Problem:** Broken styling or missing assets

**Solutions:**

1. **Rebuild Tailwind CSS:**

```bash
# In frontend directory
npm run dev
```

2. **Check `globals.css` is imported in `_app.js`**

3. **Clear browser cache:**
   - Chrome: Ctrl+Shift+Delete
   - Firefox: Ctrl+Shift+Delete

---

## WebRTC Issues

### Camera/Microphone Not Working

**Problem:** `getUserMedia` fails or permission denied

**Solutions:**

1. **Check browser permissions:**

   - Chrome: Click padlock icon → Site settings → Camera/Microphone
   - Firefox: Click shield icon → Permissions

2. **Ensure you're using localhost or HTTPS:**

   - WebRTC requires secure context
   - `http://localhost` is allowed
   - `http://192.168.x.x` is NOT allowed (use HTTPS)

3. **Check if camera/mic is being used by another app:**

```bash
# Linux - check processes using camera
lsof /dev/video0
```

4. **Try different browser:**

   - Chrome/Edge usually has best WebRTC support

5. **Check hardware:**

```bash
# List video devices
ls -l /dev/video*

# Test camera with webcam app
cheese  # or any webcam app
```

### Video Shows Black Screen

**Problem:** Video element is black or frozen

**Solutions:**

1. **Check if video track is enabled:**

   - Look for muted icon in browser tab

2. **Restart the call:**

   - End call and start new one

3. **Check video constraints:**

```javascript
// In webrtc.js, verify constraints
{ audio: true, video: true }
```

4. **Check browser console** for WebRTC errors

### No Remote Video/Audio

**Problem:** Can't see/hear remote participant

**Solutions:**

1. **Check peer connection state:**

   - Open browser console
   - Look for "Connection state" logs

2. **Verify both users accepted call**

3. **Check ICE candidate exchange:**

   - Look for ICE candidate logs in console
   - Ensure candidates are being sent/received

4. **Try different network:**

   - Some corporate networks block WebRTC
   - Try mobile hotspot or home network

5. **Check firewall settings:**

```bash
# Ensure UDP ports are open for WebRTC
# WebRTC typically uses ports 1024-65535
```

### Audio Echo or Feedback

**Problem:** Hearing echo during calls

**Solutions:**

1. **Use headphones** instead of speakers

   - Prevents microphone from picking up speaker audio

2. **Lower speaker volume**

3. **Enable echo cancellation** (browser should do this automatically)

4. **Check for multiple browser tabs:**
   - Close duplicate tabs that might be capturing audio

### Poor Video Quality

**Problem:** Choppy or low-quality video

**Solutions:**

1. **Check internet connection:**

```bash
# Test connection speed
speedtest-cli
```

2. **Close bandwidth-heavy applications:**

   - Stop downloads/uploads
   - Close streaming apps

3. **Reduce video quality** (would require code changes):

```javascript
// Lower resolution constraints
video: { width: 640, height: 480 }
```

---

## Authentication Issues

### Can't Login

**Problem:** Login fails with valid credentials

**Solutions:**

1. **Check backend logs** for error messages

2. **Verify user exists in database:**

```bash
# Connect to MongoDB
mongo

# Switch to database
use webrtc-chat

# Find user
db.users.find({ email: "your@email.com" })
```

3. **Try password reset** (create new account if needed)

4. **Clear browser cache and cookies**

### Session Expires Immediately

**Problem:** Logged out right after login

**Solutions:**

1. **Check JWT_SECRET** in backend `.env`

2. **Check token expiration** in `backend/routes/auth.js`:

```javascript
jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
  expiresIn: "7d", // Should be 7 days
});
```

3. **Check browser localStorage:**

```javascript
// In browser console
console.log(localStorage.getItem("token"));
```

---

## General Issues

### Application Slow or Unresponsive

**Solutions:**

1. **Check system resources:**

```bash
# Monitor CPU and memory
htop

# Check disk space
df -h
```

2. **Restart servers:**

   - Stop both backend and frontend
   - Start fresh

3. **Check database performance:**

```bash
# MongoDB stats
mongo --eval "db.stats()"
```

4. **Close unused browser tabs**

5. **Clear browser cache**

### Console Shows Many Errors

**Solutions:**

1. **Note the error type:**

   - Network errors → Check backend connection
   - React errors → Check component code
   - WebRTC errors → Check permissions

2. **Take screenshot of error** for reference

3. **Check specific error message:**
   - Google the exact error
   - Check this troubleshooting guide

### Can't Create Room

**Problem:** Create room button doesn't work

**Solutions:**

1. **Check if logged in:**

   - Refresh page
   - Login again

2. **Check backend logs** for errors

3. **Verify room name is unique**

4. **Check network tab** in browser DevTools:
   - Look for failed POST request to `/api/rooms`

---

## Development Issues

### Hot Reload Not Working

**Problem:** Changes don't appear after saving files

**Solutions:**

**Frontend (Next.js):**

```bash
# Stop server (Ctrl+C)
# Clear cache
rm -rf .next
# Restart
npm run dev
```

**Backend (Nodemon):**

```bash
# Check if nodemon is installed
npm list nodemon

# Reinstall if needed
npm install --save-dev nodemon

# Restart
npm run dev
```

### Environment Variables Not Loading

**Problem:** `.env` variables are undefined

**Solutions:**

**Backend:**

1. Ensure file is named exactly `.env`
2. Restart server after changes
3. Check no spaces around `=`
   ```env
   PORT=5000          # Correct
   PORT = 5000        # Wrong
   ```

**Frontend:**

1. Ensure file is named `.env.local`
2. Prefix with `NEXT_PUBLIC_`
3. Restart server after changes

---

## Platform-Specific Issues

### Linux

**MongoDB won't start:**

```bash
# Check if MongoDB service exists
sudo systemctl list-units --type=service | grep mongo

# If not found, start manually
mongod --dbpath ~/data/db
```

**Permission errors:**

```bash
# Fix permissions
sudo chown -R $USER:$USER .
```

### Windows

**MongoDB not found:**

- Ensure MongoDB is installed
- Add MongoDB bin to PATH
- Use MongoDB Compass for GUI

**Port issues:**

```bash
# Find process on port (PowerShell)
netstat -ano | findstr :5000

# Kill process
taskkill /PID <PID> /F
```

### macOS

**MongoDB issues:**

```bash
# Install MongoDB with Homebrew
brew tap mongodb/brew
brew install mongodb-community

# Start MongoDB
brew services start mongodb-community
```

---

## Getting Help

If issues persist:

1. **Check logs:**

   - Backend terminal output
   - Browser console (F12)
   - MongoDB logs

2. **Gather information:**

   - Operating system
   - Node.js version (`node -v`)
   - npm version (`npm -v`)
   - Browser and version
   - Exact error message

3. **Debug steps:**

   - Restart everything
   - Check all services are running
   - Verify environment variables
   - Test with another browser

4. **Common quick fixes:**

```bash
# Nuclear option - reset everything
cd backend
rm -rf node_modules package-lock.json
npm install

cd ../frontend
rm -rf node_modules package-lock.json .next
npm install

# Restart MongoDB
sudo systemctl restart mongodb

# Start fresh
cd backend && npm run dev
# In new terminal
cd frontend && npm run dev
```

---

## Debugging Tips

### Enable Verbose Logging

**Backend:**
Add to `server.js`:

```javascript
// Log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
```

**Frontend:**
Add to page:

```javascript
useEffect(() => {
  console.log("Current state:", { user, rooms, messages });
}, [user, rooms, messages]);
```

### Test Components Individually

1. **Test backend only:**

```bash
curl http://localhost:5000/health
```

2. **Test MongoDB only:**

```bash
mongo --eval "db.runCommand({ ping: 1 })"
```

3. **Test frontend only:**
   - Check if page loads
   - Check console for errors

### Network Debugging

**Check API calls:**

1. Open DevTools (F12)
2. Go to Network tab
3. Refresh page
4. Look for failed requests (red)
5. Click request → Response tab

**Check WebSocket:**

1. Open DevTools
2. Network tab → WS filter
3. Should see Socket.IO connection
4. Click to see messages

---

## Still Stuck?

1. Review the README.md
2. Check QUICKSTART.md
3. Review FEATURES.md
4. Double-check all environment variables
5. Ensure all prerequisites are installed
6. Try the setup script: `./setup.sh`

**Remember:** Most issues are caused by:

- Services not running (MongoDB, backend, frontend)
- Wrong ports or URLs
- Missing environment variables
- Browser cache or localStorage issues
- WebRTC permissions not granted

---

Happy debugging! 🐛🔧
