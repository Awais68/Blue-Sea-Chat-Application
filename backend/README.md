# WebRTC Backend

Backend server for WebRTC chat application with Socket.IO and MongoDB.

## Quick Start

```bash
# Install dependencies
npm install

# Create .env file from example
cp .env.example .env

# Edit .env with your settings
nano .env

# Start development server
npm run dev

# Start production server
npm start
```

## Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=5000

JWT_SECRET=your-secret-key-change-this-in-production
NODE_ENV=development
CLIENT_URL=http://localhost:3000
```

## Scripts

- `npm run dev` - Start server with nodemon (auto-restart on changes)
- `npm start` - Start production server

## Database Schema

### User

```javascript
{
  username: String (unique, required),
  email: String (unique, required),
  password: String (hashed, required),
  createdAt: Date
}
```

### Room

```javascript
{
  name: String (unique, required),
  description: String,
  createdBy: ObjectId (User),
  participants: [ObjectId (User)],
  createdAt: Date
}
```

### Message

```javascript
{
  room: ObjectId (Room),
  sender: ObjectId (User),
  senderName: String,
  content: String,
  timestamp: Date
}
```

## API Documentation

All routes except `/api/auth/*` require JWT authentication via `Authorization: Bearer <token>` header.

### Health Check

- `GET /health` - Server health status

### Authentication

- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user

### Rooms

- `GET /api/rooms` - Get all rooms
- `POST /api/rooms` - Create new room
- `GET /api/rooms/:roomId/messages` - Get room messages

## Socket.IO Events

### Client → Server

- `join-room`: Join a chat room
- `leave-room`: Leave a chat room
- `send-message`: Send chat message
- `webrtc-offer`: Send WebRTC offer
- `webrtc-answer`: Send WebRTC answer
- `webrtc-ice-candidate`: Exchange ICE candidates
- `initiate-call`: Start audio/video call
- `accept-call`: Accept incoming call
- `reject-call`: Reject incoming call
- `end-call`: End active call

### Server → Client

- `new-message`: New message received
- `user-joined`: User joined room
- `user-left`: User left room
- `room-participants`: Updated participant list
- `webrtc-offer`: Received WebRTC offer
- `webrtc-answer`: Received WebRTC answer
- `webrtc-ice-candidate`: Received ICE candidate
- `incoming-call`: Incoming call notification
- `call-accepted`: Call was accepted
- `call-rejected`: Call was rejected
- `call-ended`: Call ended by peer

## Authentication Flow

1. User signs up or logs in
2. Server generates JWT token
3. Client stores token in localStorage
4. Client includes token in API requests and Socket.IO handshake
5. Server validates token for protected routes

## WebRTC Signaling

The server acts as a signaling server for WebRTC:

1. Peers connect via Socket.IO
2. Caller creates offer and sends via `webrtc-offer`
3. Server forwards offer to callee
4. Callee creates answer and sends via `webrtc-answer`
5. Server forwards answer to caller
6. ICE candidates exchanged via `webrtc-ice-candidate`
7. Direct P2P connection established

## Dependencies

- `express` - Web framework
- `mongoose` - MongoDB ODM
- `socket.io` - WebSocket server
- `jsonwebtoken` - JWT authentication
- `bcryptjs` - Password hashing
- `cors` - CORS middleware
- `dotenv` - Environment variables
- `express-validator` - Request validation
