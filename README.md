# WebRTC Full-Stack Chat Application

A complete real-time chat application with WebRTC support for text messaging, audio calls, and video calls. Built with **Next.js** (frontend) and **Node.js + Express + MongoDB** (backend).

## Features

✅ **Real-time Text Messaging** - Instant chat with Socket.IO  
✅ **Audio Calls** - WebRTC-powered voice communication  
✅ **Video Calls** - High-quality video conferencing  
✅ **User Authentication** - Secure signup and login  
✅ **Multiple Chat Rooms** - Create and join different rooms  
✅ **Call Controls** - Mute/unmute audio, enable/disable video  
✅ **Call Timer** - Track call duration  
✅ **Responsive Design** - Works on desktop and mobile  
✅ **Modern UI** - Silver, blue, and purple themed interface

## Tech Stack

### Frontend

- **Next.js** - React framework
- **Tailwind CSS** - Styling
- **Socket.IO Client** - Real-time communication
- **WebRTC** - Peer-to-peer audio/video
- **Axios** - HTTP requests
- **React Icons** - UI icons
- **date-fns** - Date formatting

### Backend

- **Node.js** - Runtime environment
- **Express** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM for MongoDB
- **Socket.IO** - WebSocket server
- **JWT** - Authentication
- **bcryptjs** - Password hashing

## Project Structure

```
webRTC/
├── backend/
│   ├── config/
│   │   └── db.js                 # MongoDB connection
│   ├── models/
│   │   ├── User.js               # User model
│   │   ├── Room.js               # Room model
│   │   └── Message.js            # Message model
│   ├── routes/
│   │   ├── auth.js               # Authentication routes
│   │   └── rooms.js              # Room management routes
│   ├── middleware/
│   │   └── auth.js               # JWT authentication middleware
│   ├── socket/
│   │   └── index.js              # Socket.IO & WebRTC signaling
│   ├── server.js                 # Entry point
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── pages/
│   │   ├── _app.js               # App wrapper
│   │   ├── _document.js          # HTML document
│   │   ├── index.js              # Landing page
│   │   ├── login.js              # Login page
│   │   ├── signup.js             # Signup page
│   │   ├── rooms.js              # Rooms list
│   │   └── chat/
│   │       └── [id].js           # Chat room with WebRTC
│   ├── contexts/
│   │   └── AuthContext.js        # Authentication context
│   ├── utils/
│   │   ├── api.js                # API client
│   │   ├── socket.js             # Socket.IO utilities
│   │   └── webrtc.js             # WebRTC manager
│   ├── styles/
│   │   └── globals.css           # Global styles
│   ├── package.json
│   └── next.config.js
│
└── README.md
```

## Prerequisites

Before running the application, ensure you have:

- **Node.js** (v16 or higher)
- **MongoDB** (running locally or cloud instance)
- **npm** or **yarn**

## Installation & Setup

### 1. Clone the Repository

```bash
cd "/media/awais/New Volume/Client project/webRTC"
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env file with your MongoDB URI and JWT secret
# .env should contain:
# PORT=5000
# MONGODB_URI=mongodb://localhost:27017/webrtc-chat
# JWT_SECRET=your-secret-key-change-this-in-production
# NODE_ENV=development
```

### 3. Frontend Setup

```bash
# Navigate to frontend directory (from project root)
cd frontend

# Install dependencies
npm install

# The .env.local file is already created with:
# NEXT_PUBLIC_API_URL=http://localhost:5000
```

### 4. Start MongoDB

Make sure MongoDB is running on your system:

```bash
# If using MongoDB locally
mongod

# Or if using MongoDB as a service
sudo systemctl start mongodb
```

### 5. Run the Application

**Terminal 1 - Backend:**

```bash
cd backend
npm run dev
```

The backend server will start on `http://localhost:5000`

**Terminal 2 - Frontend:**

```bash
cd frontend
npm run dev
```

The frontend will start on `http://localhost:3000`

## Usage

### 1. Create an Account

- Navigate to `http://localhost:3000`
- Click "Sign up" to create a new account
- Fill in username, email, and password

### 2. Login

- Use your credentials to log in
- You'll be redirected to the rooms page

### 3. Create or Join a Room

- Click "Create Room" to make a new chat room
- Or click on an existing room to join

### 4. Chat

- Type messages in the input box
- Press Enter or click Send

### 5. Start Audio/Video Calls

- Click the **phone icon** for audio call
- Click the **video icon** for video call
- Other participants will receive call notification
- Accept to join the call

### 6. Call Controls

- **Mute/Unmute** - Toggle microphone
- **Video On/Off** - Toggle camera
- **End Call** - Hang up

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user

### Rooms

- `GET /api/rooms` - Get all rooms (requires auth)
- `POST /api/rooms` - Create new room (requires auth)
- `GET /api/rooms/:roomId/messages` - Get room messages (requires auth)

### Socket.IO Events

**Client to Server:**

- `join-room` - Join a chat room
- `leave-room` - Leave a chat room
- `send-message` - Send text message
- `webrtc-offer` - Send WebRTC offer
- `webrtc-answer` - Send WebRTC answer
- `webrtc-ice-candidate` - Send ICE candidate
- `initiate-call` - Start a call
- `accept-call` - Accept incoming call
- `reject-call` - Reject incoming call
- `end-call` - End active call

**Server to Client:**

- `new-message` - Receive new message
- `user-joined` - User joined room
- `user-left` - User left room
- `room-participants` - List of participants
- `incoming-call` - Incoming call notification
- `call-accepted` - Call was accepted
- `call-rejected` - Call was rejected
- `call-ended` - Call ended

## WebRTC Architecture

The application uses WebRTC for peer-to-peer audio/video communication:

1. **Signaling**: Socket.IO handles signaling between peers
2. **ICE Servers**: Google STUN servers for NAT traversal
3. **Media Streams**: getUserMedia API for camera/microphone access
4. **Peer Connections**: RTCPeerConnection for each participant

## Color Theme

The application uses a modern dark theme with:

- **Silver**: `#C0C0C0` - Secondary text and accents
- **Blue**: `#4A90E2` - Primary actions and highlights
- **Purple**: `#9B59B6` - Gradient accents and secondary actions
- **Dark Background**: `#1a1a2e` - Main background
- **Dark Card**: `#16213e` - Card backgrounds
- **Dark Hover**: `#0f3460` - Hover states

## Troubleshooting

### MongoDB Connection Issues

- Ensure MongoDB is running: `sudo systemctl status mongodb`
- Check MongoDB URI in `.env` file
- Verify MongoDB is accessible on port 27017

### WebRTC Issues

- **Camera/Mic not working**: Check browser permissions
- **No video/audio**: Ensure HTTPS or localhost (WebRTC requirement)
- **Connection fails**: Check firewall settings

### Socket.IO Connection Issues

- Verify backend is running on port 5000
- Check CORS settings in `backend/server.js`
- Ensure `NEXT_PUBLIC_API_URL` matches backend URL

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari (iOS 11+)
- Opera

**Note**: WebRTC requires HTTPS in production or localhost for development.

## Production Deployment

### Backend

1. Set environment variables
2. Use production MongoDB instance
3. Enable HTTPS
4. Set `NODE_ENV=production`

### Frontend

1. Update `NEXT_PUBLIC_API_URL` to production backend URL
2. Build: `npm run build`
3. Deploy to Vercel/Netlify or run: `npm start`

## Security Considerations

- Change `JWT_SECRET` in production
- Use HTTPS for all connections
- Implement rate limiting
- Validate all user inputs
- Use environment variables for sensitive data

## Future Enhancements

- [ ] Screen sharing
- [ ] File sharing
- [ ] Group video calls (multi-peer)
- [ ] Chat history persistence
- [ ] User profiles with avatars
- [ ] Private messaging
- [ ] Message reactions
- [ ] Typing indicators
- [ ] Read receipts

## License

MIT License - feel free to use this project for learning and development.

## Support

For issues or questions, please check:

- MongoDB connection
- Node.js version (v16+)
- Browser console for errors
- Backend logs for API errors

---

**Enjoy real-time communication with WebRTC! 🎥📞💬**
