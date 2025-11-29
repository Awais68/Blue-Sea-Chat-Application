# Quick Start Guide - WebRTC Chat Application

Follow these steps to get the application running on your local machine.

## Step 1: Prerequisites Check

Ensure you have installed:

- [ ] Node.js (v16+): `node --version`
- [ ] npm: `npm --version`
- [ ] MongoDB: `mongod --version`

## Step 2: Start MongoDB

```bash
# Option 1: If MongoDB is installed as a service
sudo systemctl start mongodb

# Option 2: If running manually
mongod

# Verify MongoDB is running
mongo --eval "db.runCommand({ ping: 1 })"
```

## Step 3: Backend Setup

```bash
# Navigate to backend directory
cd "/media/awais/New Volume/Client project/webRTC/backend"

# Install dependencies
npm install

# Create .env file from example
cp .env.example .env

# IMPORTANT: Edit .env file if needed
# Default values should work for local development
nano .env
```

**Default .env contents:**

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/webrtc-chat
JWT_SECRET=your-secret-key-change-this-in-production
NODE_ENV=development
```

```bash
# Start backend server
npm run dev
```

✅ Backend should be running on http://localhost:5000

## Step 4: Frontend Setup

**Open a new terminal window**

```bash
# Navigate to frontend directory
cd "/media/awais/New Volume/Client project/webRTC/frontend"

# Install dependencies
npm install

# Start frontend server
npm run dev
```

✅ Frontend should be running on http://localhost:3000

## Step 5: Test the Application

1. Open browser to http://localhost:3000
2. Click "Sign up" to create an account
3. Fill in:
   - Username: `testuser`
   - Email: `test@example.com`
   - Password: `password123`
4. You'll be automatically logged in and redirected to Rooms page
5. Click "Create Room"
6. Enter room name: `Test Room`
7. Click "Create"
8. Click on the room to enter
9. Type a message and press Enter

## Step 6: Test WebRTC (Audio/Video)

**For testing, open two browser windows:**

**Window 1:**

1. Login as first user
2. Join or create a room

**Window 2 (Incognito/Private mode):**

1. Create a second account (different email)
2. Login
3. Join the same room

**Test Calls:**

- In Window 1: Click 📞 (phone icon) for audio call
- In Window 2: Accept the incoming call
- Test mute/unmute, and end call
- Repeat with 📹 (video icon) for video call

## Troubleshooting

### Backend won't start

- **Check MongoDB**: Ensure MongoDB is running
- **Port in use**: Change PORT in `.env` to 5001
- **Dependencies**: Delete `node_modules` and run `npm install` again

### Frontend won't start

- **Port in use**: Next.js will auto-assign next available port
- **Dependencies**: Delete `node_modules` and run `npm install` again
- **Clear cache**: Delete `.next` folder

### Camera/Mic not working

- **Browser permissions**: Check browser settings
- **HTTPS required**: Use localhost (already HTTP exception) or enable HTTPS
- **Browser support**: Use Chrome, Firefox, or Edge (recommended)

### Socket.IO connection fails

- **Backend not running**: Check if backend is on port 5000
- **CORS error**: Verify backend CORS settings allow http://localhost:3000
- **Check console**: Open browser DevTools → Console for errors

### MongoDB connection error

```bash
# Check if MongoDB is running
sudo systemctl status mongodb

# Or check the process
ps aux | grep mongod

# Restart MongoDB
sudo systemctl restart mongodb
```

## Default Ports

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5000
- **MongoDB**: mongodb://localhost:27017

## Stopping the Application

Press `Ctrl + C` in each terminal to stop the servers.

## File Structure Verification

Ensure your directory structure looks like this:

```
webRTC/
├── backend/
│   ├── config/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── socket/
│   ├── node_modules/
│   ├── package.json
│   ├── server.js
│   └── .env
│
├── frontend/
│   ├── pages/
│   ├── contexts/
│   ├── utils/
│   ├── styles/
│   ├── node_modules/
│   ├── package.json
│   └── .env.local
│
└── README.md
```

## Next Steps

✅ Create multiple users  
✅ Create multiple rooms  
✅ Test text messaging  
✅ Test audio calls  
✅ Test video calls  
✅ Test call controls (mute, video on/off)

## Production Deployment

For production deployment:

1. Set secure `JWT_SECRET` in backend .env
2. Use production MongoDB instance (MongoDB Atlas)
3. Update `NEXT_PUBLIC_API_URL` in frontend to production backend URL
4. Build frontend: `npm run build`
5. Deploy backend to Heroku/Railway/DigitalOcean
6. Deploy frontend to Vercel/Netlify

## Support

If you encounter issues:

1. Check all services are running (MongoDB, backend, frontend)
2. Review browser console for errors
3. Check backend terminal for error logs
4. Verify all environment variables are set correctly

---

**Happy coding! 🚀**
