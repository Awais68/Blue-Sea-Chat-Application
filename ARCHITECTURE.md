# Architecture Diagram

Visual representation of the WebRTC Full-Stack Application architecture.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Next.js Frontend                               │   │
│  │                   (localhost:3000)                                │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │                                                                    │   │
│  │  Pages:                      Contexts:                            │   │
│  │  • index.js                  • AuthContext                        │   │
│  │  • login.js                                                       │   │
│  │  • signup.js                 Utils:                               │   │
│  │  • rooms.js                  • api.js (Axios)                     │   │
│  │  • chat/[id].js              • socket.js (Socket.IO)              │   │
│  │                              • webrtc.js (WebRTC)                 │   │
│  │                                                                    │   │
│  │  Styling:                                                         │   │
│  │  • Tailwind CSS (Silver, Blue, Purple theme)                     │   │
│  │  • Responsive Grid Layout                                        │   │
│  │                                                                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│         │                        │                        │               │
│         │ HTTP/REST              │ WebSocket              │ WebRTC        │
│         │ (Axios)                │ (Socket.IO)            │ (P2P)         │
│         ▼                        ▼                        ▼               │
└─────────────────────────────────────────────────────────────────────────┘
         │                        │                        │
         │                        │                        │
┌────────┴────────────────────────┴────────────────────────┴──────────────┐
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                  Node.js + Express Backend                        │   │
│  │                    (localhost:5000)                               │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │                                                                    │   │
│  │  REST API:                   Socket.IO Server:                    │   │
│  │  • POST /api/auth/signup     • join-room                          │   │
│  │  • POST /api/auth/login      • leave-room                         │   │
│  │  • GET  /api/rooms           • send-message                       │   │
│  │  • POST /api/rooms           • new-message                        │   │
│  │  • GET  /api/rooms/:id/msg   • webrtc-offer                       │   │
│  │                              • webrtc-answer                       │   │
│  │  Middleware:                 • webrtc-ice-candidate               │   │
│  │  • auth.js (JWT)             • initiate-call                      │   │
│  │  • CORS                      • accept-call / reject-call          │   │
│  │                              • end-call                            │   │
│  │  Models:                                                          │   │
│  │  • User                                                           │   │
│  │  • Room                                                           │   │
│  │  • Message                                                        │   │
│  │                                                                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│         │                                                                 │
│         │ Mongoose ODM                                                   │
│         ▼                                                                 │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      MongoDB Database                             │   │
│  │                   (localhost:27017)                               │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │                                                                    │   │
│  │  Collections:                                                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │   users     │  │   rooms     │  │  messages   │              │   │
│  │  ├─────────────┤  ├─────────────┤  ├─────────────┤              │   │
│  │  │ • username  │  │ • name      │  │ • room      │              │   │
│  │  │ • email     │  │ • desc      │  │ • sender    │              │   │
│  │  │ • password  │  │ • createdBy │  │ • content   │              │   │
│  │  │ • createdAt │  │ • particip. │  │ • timestamp │              │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │   │
│  │                                                                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════

                          WebRTC P2P Connection Flow

┌────────────┐                                              ┌────────────┐
│  Client A  │                                              │  Client B  │
│ (Browser)  │                                              │ (Browser)  │
└────────────┘                                              └────────────┘
      │                                                            │
      │ 1. Click "Start Call"                                     │
      │                                                            │
      │ 2. getUserMedia()                                         │
      ├──────────────────────────────┐                           │
      │ Request camera/mic access     │                           │
      │◄─────────────────────────────┘                           │
      │                                                            │
      │ 3. Create RTCPeerConnection                               │
      │                                                            │
      │ 4. Create Offer (SDP)                                     │
      │                                                            │
      │ 5. Send offer via Socket.IO                               │
      │───────────────────────────────────────────────────────────▶│
      │           { type: 'offer', sdp: '...' }                   │
      │                                                            │
      │                                    6. Receive offer        │
      │                                                            │
      │                        7. Create RTCPeerConnection        │
      │                                                            │
      │                              8. Create Answer (SDP)       │
      │                                                            │
      │                   9. Send answer via Socket.IO            │
      │◄───────────────────────────────────────────────────────────│
      │           { type: 'answer', sdp: '...' }                  │
      │                                                            │
      │ 10. Receive answer                                        │
      │                                                            │
      │ ════════════ ICE Candidate Exchange ════════════          │
      │                                                            │
      │ 11. ICE candidates                                        │
      │◄──────────────────────────────────────────────────────────▶│
      │              { candidate: '...' }                         │
      │                                                            │
      │ ════════════ P2P Connection Established ════════════      │
      │                                                            │
      │ 12. Direct audio/video stream                             │
      │◄═══════════════════════════════════════════════════════════▶│
      │         (Peer-to-peer, no server involved)                │
      │                                                            │
      │ 13. Call in progress                                      │
      │    • Audio/Video streaming                                │
      │    • Call controls (mute, video toggle)                   │
      │    • Call timer                                           │
      │                                                            │
      │ 14. End call                                              │
      │───────────────────────────────────────────────────────────▶│
      │           { type: 'end-call' }                            │
      │                                                            │
      │ 15. Close RTCPeerConnection                               │
      │                                                            │
      │ 16. Stop media streams                                    │
      │                                                            │
└────────────┘                                              └────────────┘


═══════════════════════════════════════════════════════════════════════════

                        Authentication Flow

┌────────────┐                ┌────────────┐              ┌────────────┐
│  Browser   │                │  Express   │              │  MongoDB   │
│            │                │  Backend   │              │            │
└────────────┘                └────────────┘              └────────────┘
      │                             │                           │
      │ 1. POST /api/auth/signup    │                           │
      │────────────────────────────▶│                           │
      │    { username, email, pwd } │                           │
      │                             │                           │
      │                             │ 2. Hash password          │
      │                             │    (bcrypt)               │
      │                             │                           │
      │                             │ 3. Save user              │
      │                             │──────────────────────────▶│
      │                             │                           │
      │                             │ 4. User created           │
      │                             │◄──────────────────────────│
      │                             │                           │
      │                             │ 5. Generate JWT token     │
      │                             │                           │
      │ 6. Response                 │                           │
      │◄────────────────────────────│                           │
      │    { token, user }          │                           │
      │                             │                           │
      │ 7. Store token in           │                           │
      │    localStorage             │                           │
      │                             │                           │
      │ 8. Initialize Socket.IO     │                           │
      │    with token               │                           │
      │◄═══════════════════════════▶│                           │
      │                             │                           │
      │ 9. Authenticated requests   │                           │
      │    include JWT token        │                           │
      │────────────────────────────▶│                           │
      │    Authorization: Bearer... │                           │
      │                             │                           │
      │                             │ 10. Verify token          │
      │                             │                           │
      │ 11. Protected data          │                           │
      │◄────────────────────────────│                           │
      │                             │                           │
└────────────┘                ┌────────────┘              └────────────┘


═══════════════════════════════════════════════════════════════════════════

                     Real-Time Messaging Flow

┌────────────┐                ┌────────────┐              ┌────────────┐
│  User A    │                │ Socket.IO  │              │  User B    │
│  Browser   │                │  Server    │              │  Browser   │
└────────────┘                └────────────┘              └────────────┘
      │                             │                           │
      │ 1. join-room                │                           │
      │────────────────────────────▶│                           │
      │    { roomId, username }     │                           │
      │                             │                           │
      │                             │ 2. user-joined            │
      │                             │──────────────────────────▶│
      │                             │    { userId, username }   │
      │                             │                           │
      │ 3. Type message             │                           │
      │                             │                           │
      │ 4. send-message             │                           │
      │────────────────────────────▶│                           │
      │    { roomId, content }      │                           │
      │                             │                           │
      │                             │ 5. Save to MongoDB        │
      │                             │                           │
      │                             │ 6. Broadcast to room      │
      │ 7. new-message              │ 7. new-message            │
      │◄────────────────────────────│──────────────────────────▶│
      │    { sender, content }      │    { sender, content }    │
      │                             │                           │
      │ 8. Display message          │ 8. Display message        │
      │                             │                           │
      │                             │                           │
      │ 9. leave-room               │                           │
      │────────────────────────────▶│                           │
      │                             │                           │
      │                             │ 10. user-left             │
      │                             │──────────────────────────▶│
      │                             │                           │
└────────────┘                └────────────┘              └────────────┘


═══════════════════════════════════════════════════════════════════════════

                        Component Hierarchy

┌─────────────────────────────────────────────────────────────────┐
│                         _app.js                                  │
│                    (AuthProvider)                                │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        ┌─────▼────┐    ┌────▼────┐    ┌────▼────┐
        │ index.js │    │login.js │    │signup.js│
        │(Landing) │    │         │    │         │
        └──────────┘    └─────────┘    └─────────┘
                              │
                        ┌─────▼──────┐
                        │  rooms.js  │
                        │ (Room List)│
                        └────────────┘
                              │
                        ┌─────▼──────────┐
                        │ chat/[id].js   │
                        │ (Chat Room)    │
                        └────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        ┌─────▼────┐    ┌────▼────┐    ┌────▼─────┐
        │ Messages │    │  Video  │    │  Call    │
        │   List   │    │Streams  │    │ Controls │
        └──────────┘    └─────────┘    └──────────┘


═══════════════════════════════════════════════════════════════════════════

                         Data Flow Diagram

    User Action → Component → Context/Utility → API/Socket → Backend
                                                                  │
                                                             ┌────▼────┐
                                                             │MongoDB  │
                                                             └─────────┘

Example: Send Message

    Click Send → chat/[id].js → socket.sendMessage() → Socket.IO Server
                                                              │
                                                         Save to DB
                                                              │
                                             Broadcast to room participants
                                                              │
                     Display in UI ← new-message event ◄─────┘


═══════════════════════════════════════════════════════════════════════════

                      Technology Integration

┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Next.js │  │  React   │  │ Tailwind │  │  WebRTC  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│       │             │              │              │             │
│  ┌────▼─────────────▼──────────────▼──────────────▼────┐       │
│  │                Socket.IO Client                      │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                   WebSocket / HTTP
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                        Backend Layer                             │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                Socket.IO Server                      │       │
│  └──────────────────────────────────────────────────────┘       │
│       │             │              │              │             │
│  ┌────▼────┐  ┌────▼────┐  ┌─────▼────┐  ┌──────▼─────┐      │
│  │ Express │  │   JWT   │  │  bcrypt  │  │  Mongoose  │      │
│  └─────────┘  └─────────┘  └──────────┘  └────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                              │
                         Mongoose ODM
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                       Database Layer                             │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                     MongoDB                          │       │
│  │  Collections: users, rooms, messages                 │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════
```

This architecture diagram shows:

1. **Client-Server Architecture** with clear separation
2. **WebRTC P2P Flow** for direct peer connections
3. **Authentication Flow** with JWT
4. **Real-time Messaging** via Socket.IO
5. **Component Hierarchy** in React/Next.js
6. **Data Flow** from user to database
7. **Technology Integration** across layers

The system is designed for scalability, maintainability, and real-time performance.
