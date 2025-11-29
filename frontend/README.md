# WebRTC Frontend

Next.js frontend for WebRTC chat application with real-time messaging and video calls.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

The `.env.local` file should contain:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

For production, update to your backend URL.

## Project Structure

```
frontend/
├── pages/
│   ├── _app.js           # App wrapper with AuthProvider
│   ├── _document.js      # Custom document
│   ├── index.js          # Landing/redirect page
│   ├── login.js          # Login page
│   ├── signup.js         # Signup page
│   ├── rooms.js          # Room list page
│   └── chat/
│       └── [id].js       # Chat room with WebRTC
├── contexts/
│   └── AuthContext.js    # Authentication state management
├── utils/
│   ├── api.js            # Axios API client
│   ├── socket.js         # Socket.IO utilities
│   └── webrtc.js         # WebRTC manager class
├── styles/
│   └── globals.css       # Global styles and theme
└── package.json
```

## Features

### Authentication

- **Signup**: Create new account with username, email, password
- **Login**: Authenticate with email and password
- **Protected Routes**: Automatic redirect if not authenticated
- **Persistent Session**: JWT stored in localStorage

### Chat Rooms

- **Browse Rooms**: View all available chat rooms
- **Create Room**: Create new room with name and description
- **Join Room**: Click any room to enter
- **Real-time Messages**: Instant message delivery
- **Message History**: Previous messages loaded on join

### WebRTC Calls

- **Audio Calls**: Voice-only communication
- **Video Calls**: Video + audio communication
- **Call Controls**: Mute/unmute, video on/off, hang up
- **Call Timer**: Track call duration
- **Picture-in-Picture**: Local video overlay
- **Incoming Calls**: Accept/reject notifications

## Component Overview

### Pages

**index.js**

- Landing page that redirects to `/rooms` or `/login`

**login.js**

- Login form with email and password
- Error handling and validation
- Redirect to rooms on success

**signup.js**

- Signup form with username, email, password
- Password confirmation
- Redirect to rooms on success

**rooms.js**

- Display all chat rooms in grid
- Create new room modal
- Room statistics (participants, creator)
- Logout button

**chat/[id].js**

- Main chat interface
- WebRTC video/audio calls
- Message list with auto-scroll
- Call controls and timer
- Incoming call modal

### Contexts

**AuthContext.js**

- User authentication state
- Login/signup/logout functions
- Token management
- Socket.IO initialization

### Utils

**api.js**

- Axios instance with auth interceptor
- API endpoints for auth and rooms
- Automatic token injection

**socket.js**

- Socket.IO connection management
- Room join/leave functions
- Message sending
- Event listeners setup

**webrtc.js**

- WebRTCManager class
- Peer connection management
- Media stream handling
- Offer/answer creation
- ICE candidate handling
- Audio/video toggle

## WebRTC Flow

1. **Initiate Call**

   - User clicks audio/video button
   - `getUserMedia()` requests camera/mic access
   - Local stream displayed in local video element
   - `initiate-call` event sent to room

2. **Create Offer**

   - For each participant, create RTCPeerConnection
   - Create SDP offer with `createOffer()`
   - Set local description
   - Send offer via Socket.IO

3. **Handle Offer (Callee)**

   - Receive offer via Socket.IO
   - Create RTCPeerConnection
   - Set remote description
   - Create answer with `createAnswer()`
   - Set local description
   - Send answer back

4. **Handle Answer (Caller)**

   - Receive answer via Socket.IO
   - Set remote description on peer connection

5. **ICE Candidate Exchange**

   - Both peers collect ICE candidates
   - Send candidates via Socket.IO
   - Add received candidates to peer connection

6. **Connection Established**
   - P2P connection established
   - Remote stream received via `ontrack` event
   - Display in remote video element

## Styling

### Theme Colors

- **Primary Blue**: `#4A90E2`
- **Primary Purple**: `#9B59B6`
- **Silver**: `#C0C0C0`
- **Dark Background**: `#1a1a2e`
- **Dark Card**: `#16213e`
- **Dark Hover**: `#0f3460`

### Tailwind Configuration

Custom colors defined in `tailwind.config.js`:

- `primary-blue`, `primary-purple`, `primary-silver`
- `dark-bg`, `dark-card`, `dark-hover`

## State Management

- **AuthContext**: Global authentication state
- **Local State**: Component-level state with `useState`
- **Refs**: Video elements and WebRTC manager with `useRef`

## Browser Permissions

The app requires:

- **Camera** - For video calls
- **Microphone** - For audio/video calls

Permissions are requested when starting a call.

## Responsive Design

- Mobile-first approach
- Flexible grid layouts
- Touch-friendly buttons
- Responsive video containers

## Performance

- Lazy loading with Next.js
- Optimized re-renders
- Proper cleanup in `useEffect`
- Stream cleanup on unmount

## Debugging

Check browser console for:

- Socket.IO connection status
- WebRTC connection states
- Media stream errors
- API request errors

## Dependencies

- `react` & `react-dom` - UI framework
- `next` - React framework
- `socket.io-client` - WebSocket client
- `axios` - HTTP client
- `react-icons` - Icon library
- `date-fns` - Date formatting
- `tailwindcss` - Utility-first CSS
