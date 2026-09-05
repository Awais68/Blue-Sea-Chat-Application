# 🚀 WebRTC Quick Reference Card

## 🎯 Root Causes & Fixes

| Problem | Root Cause | Fix Applied | File |
|---------|-----------|-------------|------|
| **Offline users don't get calls** | No call queuing system | Added `pendingCalls` Map, delivers on connect | `backend/socket/index.js` |
| **No audio in calls** | Missing dedicated audio element | Separate `<audio>` element, volume=1.0, explicit play | `frontend/components/VideoCall.js` |
| **Video doesn't show** | Poor constraints, missing playsinline | HD constraints with fallback, playsinline for mobile | `frontend/utils/webrtc.js` |
| **Calls fail to connect** | Single STUN server, no ICE queuing | 5+ STUN servers, ICE candidate queue | `frontend/utils/webrtc.js` |

---

## 💻 Code Snippets - Copy & Use

### 1. CRITICAL Audio Fix
```javascript
// Add this hidden audio element for remote audio
<audio 
  ref={remoteAudioRef} 
  autoPlay 
  playsInline 
  style={{ display: 'none' }}
/>

// In handleRemoteStream callback:
if (remoteAudioRef.current) {
  remoteAudioRef.current.srcObject = stream;
  remoteAudioRef.current.volume = 1.0;
  remoteAudioRef.current.autoplay = true;
  await remoteAudioRef.current.play();
}
```

### 2. Optimal Media Constraints
```javascript
const constraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
  },
  video: {
    width: { ideal: 1280, min: 640 },
    height: { ideal: 720, min: 480 },
    frameRate: { ideal: 30 }
  }
};
```

### 3. Start Call (New Pattern)
```javascript
import { initiateCall } from '../utils/socket';

const startCall = async (type) => {
  // 1. Get media
  const stream = await webrtcManager.getUserMedia({
    audio: true,
    video: type === 'video'
  });
  
  // 2. Display local video
  localVideoRef.current.srcObject = stream;
  localVideoRef.current.muted = true;
  
  // 3. Initiate call (includes targetUserId!)
  initiateCall(roomId, targetUserId, type, username);
  
  // 4. Create offer after short delay
  setTimeout(async () => {
    const offer = await webrtcManager.createOffer(
      targetUserId,
      handleRemoteStream,
      handleIceCandidate
    );
    
    socket.emit('webrtc-offer', {
      roomId,
      offer,
      targetUserId,
      callId: webrtcManager.callId
    });
  }, 500);
};
```

### 4. Accept Call
```javascript
import { acceptCall } from '../utils/socket';

const handleAcceptCall = async (incomingCall) => {
  // 1. Get media
  const stream = await webrtcManager.getUserMedia({
    audio: true,
    video: incomingCall.callType === 'video'
  });
  
  // 2. Set call ID
  webrtcManager.callId = incomingCall.callId;
  
  // 3. Accept call
  acceptCall(incomingCall.callId, incomingCall.fromUserId);
  
  // Offer will come via signaling, answer created automatically
};
```

### 5. End Call
```javascript
import { endCall } from '../utils/socket';

const handleEndCall = (callId, duration) => {
  endCall(callId, roomId, targetUserId, duration);
  
  // Cleanup
  webrtcManager.closeAllConnections();
  webrtcManager.stopLocalStream();
};
```

---

## 🔌 Socket Events Reference

### Emit (Client → Server)
```javascript
// Start call
socket.emit('initiate-call', { 
  roomId, targetUserId, callType, username 
});

// Accept call
socket.emit('accept-call', { 
  callId, targetUserId 
});

// Reject call
socket.emit('reject-call', { 
  callId, targetUserId 
});

// End call
socket.emit('end-call', { 
  callId, roomId, targetUserId, duration 
});

// WebRTC signaling
socket.emit('webrtc-offer', { 
  roomId, offer, targetUserId, callId 
});
socket.emit('webrtc-answer', { 
  answer, targetUserId, callId 
});
socket.emit('webrtc-ice-candidate', { 
  candidate, targetUserId, callId 
});
```

### Listen (Server → Client)
```javascript
// Call events
socket.on('incoming-call', (data) => {
  // { callId, fromUserId, username, callType, roomId }
});
socket.on('call-initiated', (data) => {
  // { callId, targetUserId }
});
socket.on('call-accepted', (data) => {
  // { callId, fromUserId }
});
socket.on('call-rejected', (data) => {
  // { callId, fromUserId }
});
socket.on('call-ended', (data) => {
  // { callId, fromUserId }
});
socket.on('call-user-offline', (data) => {
  // { targetUserId }
});

// WebRTC signaling
socket.on('webrtc-offer', async (data) => {
  // { offer, fromUserId, callId, roomId }
  const answer = await webrtcManager.handleOffer(...);
  socket.emit('webrtc-answer', { answer, targetUserId, callId });
});
socket.on('webrtc-answer', async (data) => {
  // { answer, fromUserId, callId }
  await webrtcManager.handleAnswer(fromUserId, answer);
});
socket.on('webrtc-ice-candidate', async (data) => {
  // { candidate, fromUserId, callId }
  await webrtcManager.handleIceCandidate(fromUserId, candidate);
});
```

---

## 🔍 Debugging Commands

```javascript
// Check media devices
navigator.mediaDevices.enumerateDevices()
  .then(devices => console.log(devices));

// Check permissions
navigator.permissions.query({ name: 'microphone' })
  .then(result => console.log('Mic:', result.state));
navigator.permissions.query({ name: 'camera' })
  .then(result => console.log('Camera:', result.state));

// Check socket connection
const socket = getSocket();
console.log('Connected:', socket?.connected);
console.log('Socket ID:', socket?.id);

// Check peer connection states
const pc = webrtcManager.peerConnections.get(userId);
console.log('ICE:', pc.iceConnectionState);
console.log('Connection:', pc.connectionState);
console.log('Signaling:', pc.signalingState);

// Check tracks
const stream = webrtcManager.localStream;
stream.getTracks().forEach(track => {
  console.log(track.kind, track.enabled, track.readyState);
});

// Get connection stats
const stats = await webrtcManager.getConnectionStats(userId);
console.log('Stats:', stats);

// Diagnose connection (use built-in tool)
import { diagnoseConnection } from '../utils/webrtc';
await diagnoseConnection(webrtcManager, userId);
```

---

## 🚨 Quick Troubleshooting

| Symptom | Check | Fix |
|---------|-------|-----|
| Can't hear audio | Audio element, volume, tracks | Add separate `<audio>` element |
| No video showing | Camera permission, video element | Grant permission, add `playsinline` |
| Call doesn't connect | ICE state, STUN servers | Add more STUN servers or TURN |
| Call not appearing | Socket connection, room ID | Check socket connected, verify room ID |
| Permission denied | Browser settings | User must allow in browser |
| Device not found | Physical device | Check mic/camera plugged in |
| Already in use | Other apps | Close apps using device |

---

## 📦 Files You Need

### Required (Core fixes):
- ✅ `/backend/socket/index.js` - Offline call support
- ✅ `/frontend/utils/webrtc.js` - Audio/video fixes
- ✅ `/frontend/utils/socket.js` - Call helper functions

### Optional (Ready-to-use components):
- 📦 `/frontend/components/VideoCall.js` - Complete call component
- 🧪 `/frontend/pages/call-test.js` - Test page

### Documentation:
- 📖 `WEBRTC_FIXES_SUMMARY.md` - Complete summary
- 🔍 `WEBRTC_DEBUGGING_GUIDE.md` - Debugging help
- 📚 `WEBRTC_INTEGRATION_GUIDE.md` - Integration guide

---

## ⚡ Testing Commands

```bash
# Test locally
# 1. Start backend
cd backend && npm start

# 2. Start frontend
cd frontend && npm run dev

# 3. Open two browsers
# Browser 1: http://localhost:3000/call-test
# Browser 2: http://localhost:3000/call-test (incognito)

# 4. Log in as different users
# 5. Enter each other's user IDs
# 6. Click "Audio Call" or "Video Call"
```

---

## 🎯 Key Success Indicators

✅ See logs: `🎥 getUserMedia`, `📤 createOffer`, `📥 handleOffer`  
✅ ICE state reaches `connected`  
✅ Audio element srcObject is set  
✅ Remote stream has audio/video tracks  
✅ Tracks show `enabled: true, readyState: live`  
✅ Can hear/see each other clearly  

---

## 🔗 Production Checklist

- [ ] Add TURN servers (required for NAT)
- [ ] Enable SSL/TLS (required for getUserMedia)
- [ ] Configure CORS for Socket.IO
- [ ] Test on mobile devices
- [ ] Test on different networks
- [ ] Add call quality monitoring
- [ ] Set up error tracking
- [ ] Test with firewalls/VPN

---

## 💡 Pro Tips

1. **Always log everything** - Use emoji prefixes (🎥 📤 📥 ❄️ 🔊) for easy scanning
2. **Test early, test often** - Use `/call-test` page frequently
3. **Mobile Safari is picky** - Always use `playsinline` attribute
4. **TURN is essential** - Don't rely on STUN alone in production
5. **Volume matters** - Always set `volume = 1.0` on audio element
6. **Autoplay is blocked** - Handle with user interaction or explicit `.play()`
7. **Separate audio element** - Never use video element for audio-only calls

---

## 📞 Quick Test Script

```javascript
// Copy-paste into browser console during call

// Check everything
console.log('=== WEBRTC DIAGNOSTICS ===');
console.log('Socket:', getSocket()?.connected ? '✅' : '❌');
console.log('Local stream:', webrtcManager.localStream ? '✅' : '❌');
console.log('Local tracks:', webrtcManager.localStream?.getTracks().map(t => 
  `${t.kind}(${t.enabled})`
));
console.log('Remote streams:', webrtcManager.remoteStreams.size);
console.log('Peer connections:', webrtcManager.peerConnections.size);

const userId = 'target-user-id';
const pc = webrtcManager.peerConnections.get(userId);
if (pc) {
  console.log('ICE State:', pc.iceConnectionState);
  console.log('Connection State:', pc.connectionState);
  console.log('Signaling State:', pc.signalingState);
}

// Check audio element
if (remoteAudioRef.current) {
  console.log('Audio element:', {
    srcObject: !!remoteAudioRef.current.srcObject,
    volume: remoteAudioRef.current.volume,
    muted: remoteAudioRef.current.muted,
    paused: remoteAudioRef.current.paused
  });
}
```

---

**🎉 You're all set! All WebRTC issues are fixed and ready to use.**

For detailed information, see:
- `WEBRTC_FIXES_SUMMARY.md`
- `WEBRTC_DEBUGGING_GUIDE.md`  
- `WEBRTC_INTEGRATION_GUIDE.md`
