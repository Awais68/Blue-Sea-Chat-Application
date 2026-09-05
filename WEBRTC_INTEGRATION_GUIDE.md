# WebRTC Call Integration Guide

## 🚀 Quick Start - Using the Fixed Code

### 1. Backend Integration (Already Fixed)

The backend Socket.IO signaling in `/backend/socket/index.js` now includes:

✅ Offline user support - calls delivered when user comes online  
✅ Call state management with CallLog database  
✅ Automatic call timeouts (60 seconds)  
✅ Enhanced error handling  
✅ Proper ICE candidate relay  

**No changes needed** - it's ready to use!

---

### 2. Frontend WebRTC Manager (Already Fixed)

The WebRTC manager in `/frontend/utils/webrtc.js` now includes:

✅ Optimized audio constraints for clear sound  
✅ HD video with adaptive quality  
✅ Multiple STUN servers for reliability  
✅ Pending ICE candidate queue  
✅ Comprehensive error messages  
✅ Connection diagnostics  

**No changes needed** - it's ready to use!

---

### 3. Using the VideoCall Component

#### Option A: Direct Integration (Recommended)

```javascript
import VideoCall from '../components/VideoCall';
import { useAuth } from '../contexts/AuthContext';

function ChatPage() {
  const { user } = useAuth();
  const [selectedUser, setSelectedUser] = useState(null);
  const roomId = 'your-room-id';

  return (
    <div>
      {/* Your existing chat UI */}
      <div className="messages">
        {/* Messages here */}
      </div>

      {/* Add the VideoCall component */}
      {selectedUser && (
        <VideoCall
          currentUser={{ 
            id: user.id, 
            username: user.username 
          }}
          targetUser={{ 
            id: selectedUser.id, 
            username: selectedUser.username 
          }}
          roomId={roomId}
        />
      )}
    </div>
  );
}
```

#### Option B: Update Existing Chat Component

If you already have call functionality in `/frontend/pages/chat/[id].js`, update it:

**Replace imports:**
```javascript
// OLD imports - remove these
import { getSocket, joinRoom, ... } from "../../utils/socket";

// NEW imports - use these
import { 
  getSocket, 
  joinRoom, 
  initiateCall,    // NEW
  acceptCall,      // NEW
  rejectCall,      // NEW
  endCall,         // NEW
  onIncomingCall,  // NEW
  onCallAccepted,  // NEW
  onCallEnded      // NEW
} from "../../utils/socket";
```

**Replace startCall function:**
```javascript
// OLD - Remove this
const startCall = async (type) => {
  // ... old code
  socket.emit("initiate-call", { roomId, callType: type, username });
  // ...
};

// NEW - Use this
const startCall = async (type) => {
  try {
    setCallType(type);
    
    // 1. Get user media with optimized constraints
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
      video: type === "video" ? {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
      } : false,
    };

    const stream = await webrtcManagerRef.current.getUserMedia(constraints);
    
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.muted = true;
    }

    setInCall(true);
    
    // 2. Initiate call with new helper (includes targetUserId!)
    initiateCall(roomId, otherUserId, type, user.username);

    // 3. Wait for call ID, then create offer
    setTimeout(async () => {
      const offer = await webrtcManagerRef.current.createOffer(
        otherUserId,
        handleRemoteStream,
        (candidate, userId) => {
          const socket = getSocket();
          socket.emit("webrtc-ice-candidate", {
            candidate,
            targetUserId: userId,
            callId: webrtcManagerRef.current.callId
          });
        }
      );

      const socket = getSocket();
      socket.emit("webrtc-offer", {
        roomId,
        offer,
        targetUserId: otherUserId,
        callId: webrtcManagerRef.current.callId
      });
    }, 500);

  } catch (error) {
    console.error("Error starting call:", error);
    alert(error.message);
  }
};
```

**CRITICAL: Fix handleRemoteStream for audio:**
```javascript
// OLD - This is why audio didn't work!
const handleRemoteStream = (stream, userId) => {
  setRemoteStreams(prev => {
    const newMap = new Map(prev);
    newMap.set(userId, stream);
    return newMap;
  });
  // Missing: setting audio element!
};

// NEW - This fixes audio!
const handleRemoteStream = (stream, userId) => {
  console.log("📹 Remote stream received:", stream.getTracks());
  
  // Update state
  setRemoteStreams(prev => {
    const newMap = new Map(prev);
    newMap.set(userId, stream);
    return newMap;
  });

  // CRITICAL: Set remote audio element for audio calls
  if (remoteAudioRef.current) {
    remoteAudioRef.current.srcObject = stream;
    remoteAudioRef.current.volume = 1.0;
    remoteAudioRef.current.autoplay = true;
    
    remoteAudioRef.current.play()
      .then(() => console.log("✅ Remote audio playing!"))
      .catch(e => console.error("Audio play error:", e));
  }

  // Set remote video element for video calls
  if (remoteVideoRef.current && stream.getVideoTracks().length > 0) {
    remoteVideoRef.current.srcObject = stream;
    remoteVideoRef.current.play()
      .catch(e => console.log("Video play error:", e));
  }
};
```

**Add hidden audio element to JSX:**
```javascript
{/* CRITICAL: Hidden audio element for remote audio */}
<audio
  ref={remoteAudioRef}
  autoPlay
  playsInline
  style={{ display: 'none' }}
/>
```

---

### 4. Key Fixes Applied

#### ❌ Problem 1: Offline users don't receive calls
**✅ Fixed:** Backend now stores pending calls and delivers them when user connects

#### ❌ Problem 2: No audio in calls
**✅ Fixed:** 
- Separate `<audio>` element for remote audio
- Volume set to 1.0
- Autoplay enabled
- Explicit `.play()` call
- Audio tracks forced to `enabled = true`

#### ❌ Problem 3: Video doesn't show
**✅ Fixed:**
- Proper video constraints (HD with fallbacks)
- `playsinline` attribute for mobile
- Track enabled verification
- Connection state monitoring

#### ❌ Problem 4: Calls fail to connect
**✅ Fixed:**
- Multiple STUN servers for redundancy
- ICE candidate queuing for early arrivals
- Enhanced error handling
- Connection state monitoring
- Automatic ICE restart on failure

---

### 5. Environment Variables

Add TURN server configuration (optional but recommended for production):

```env
# .env.local (frontend)
NEXT_PUBLIC_STUN_SERVER_1=stun:stun.l.google.com:19302
NEXT_PUBLIC_STUN_SERVER_2=stun:stun1.l.google.com:19302
NEXT_PUBLIC_TURN_SERVER=turn:your-turn-server.com:3478
NEXT_PUBLIC_TURN_USERNAME=username
NEXT_PUBLIC_TURN_PASSWORD=password
```

Then update `webrtc.js`:
```javascript
const rtcConfig = {
  iceServers: [
    { urls: process.env.NEXT_PUBLIC_STUN_SERVER_1 || "stun:stun.l.google.com:19302" },
    { urls: process.env.NEXT_PUBLIC_STUN_SERVER_2 || "stun:stun1.l.google.com:19302" },
    ...(process.env.NEXT_PUBLIC_TURN_SERVER ? [{
      urls: process.env.NEXT_PUBLIC_TURN_SERVER,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_PASSWORD
    }] : [])
  ]
};
```

---

### 6. Testing Your Implementation

#### Test Audio Calls:
1. Open two browser windows
2. Log in as different users
3. Start an audio call
4. Verify you can hear each other
5. Test mute/unmute
6. End call and verify cleanup

#### Test Video Calls:
1. Same as audio test
2. Verify both video streams show
3. Test video enable/disable
4. Check picture-in-picture for local video

#### Test Offline Users:
1. User A starts call to User B (offline)
2. User B logs in
3. Verify call notification appears
4. Accept and verify call works

#### Test Error Handling:
1. Deny camera/mic permission → verify error message
2. Disconnect network → verify reconnection attempt
3. End call abruptly → verify proper cleanup

---

### 7. Production Checklist

Before deploying:

- [ ] Add TURN servers (required for NAT traversal)
- [ ] Configure proper CORS for Socket.IO
- [ ] Set up SSL/TLS (required for getUserMedia in production)
- [ ] Add call recording (optional)
- [ ] Implement call quality feedback
- [ ] Add network quality indicators
- [ ] Set up monitoring/analytics
- [ ] Test on mobile devices
- [ ] Test on different networks
- [ ] Add call history UI
- [ ] Implement push notifications for offline calls

---

### 8. Quick Reference - Socket Events

**Client → Server:**
- `initiate-call` - Start a call
- `accept-call` - Accept incoming call
- `reject-call` - Reject incoming call
- `end-call` - End active call
- `webrtc-offer` - Send SDP offer
- `webrtc-answer` - Send SDP answer
- `webrtc-ice-candidate` - Send ICE candidate

**Server → Client:**
- `incoming-call` - Receive call notification
- `call-initiated` - Call started confirmation
- `call-accepted` - Call was accepted
- `call-rejected` - Call was rejected
- `call-ended` - Call ended by other user
- `call-user-offline` - Target user offline
- `call-missed` - Call timed out
- `webrtc-offer` - Receive SDP offer
- `webrtc-answer` - Receive SDP answer
- `webrtc-ice-candidate` - Receive ICE candidate

---

### 9. Troubleshooting

If issues persist:

1. Open browser console (F12)
2. Look for logs with these prefixes:
   - 🎥 getUserMedia
   - 📤 createOffer
   - 📥 handleOffer
   - ❄️ ICE
   - 🔊 Audio
3. Click the 🔍 debug button during call
4. Check `chrome://webrtc-internals/`
5. Refer to `WEBRTC_DEBUGGING_GUIDE.md`

---

### 10. Support

For issues:
1. Check console logs
2. Review `WEBRTC_DEBUGGING_GUIDE.md`
3. Test with the standalone `VideoCall` component
4. Verify backend Socket.IO is receiving events
5. Check network/firewall settings

---

## 🎉 You're Ready!

All the code fixes are in place. Just integrate the `VideoCall` component or update your existing call code with the patterns shown above. Audio, video, and offline calls will now work reliably!
