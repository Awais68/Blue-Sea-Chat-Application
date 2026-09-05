# WebRTC Audio/Video Call - Debugging Guide

## 🎯 Quick Debugging Checklist

When calls fail, check these in order:

### 1. Media Permissions ✅
```javascript
// Check browser permissions
navigator.permissions.query({ name: 'microphone' }).then(result => {
  console.log('Microphone:', result.state);
});
navigator.permissions.query({ name: 'camera' }).then(result => {
  console.log('Camera:', result.state);
});
```

**Common Issues:**
- Permission denied → User must allow in browser settings
- Device not found → Check if mic/camera is connected
- Device in use → Close other apps using the device

### 2. Socket Connection 🔌
```javascript
const socket = getSocket();
console.log('Socket connected:', socket?.connected);
console.log('Socket ID:', socket?.id);
```

**Common Issues:**
- Socket not connected → Check backend server is running
- Authentication failed → Verify JWT token is valid
- Network issues → Check firewall/network settings

### 3. ICE Connection State ❄️
```javascript
peerConnection.oniceconnectionstatechange = () => {
  console.log('ICE State:', peerConnection.iceConnectionState);
};
```

**States & Meanings:**
- `new` → Initial state
- `checking` → Looking for connection path
- `connected` → ✅ Connection established!
- `completed` → ✅ All checks done
- `failed` → ❌ Cannot connect (NAT/firewall issue)
- `disconnected` → ⚠️ Temporary disconnect
- `closed` → Connection ended

**If stuck on "checking":**
- Add TURN servers (not just STUN)
- Check firewall is allowing UDP traffic
- Verify network allows WebRTC

### 4. Audio Issues 🔊

#### Problem: "I can't hear the other person"
```javascript
// Check remote audio element
console.log('Remote audio element:', remoteAudioRef.current);
console.log('Remote audio srcObject:', remoteAudioRef.current?.srcObject);
console.log('Remote audio volume:', remoteAudioRef.current?.volume);
console.log('Remote audio muted:', remoteAudioRef.current?.muted);

// Check remote stream
const remoteStream = webrtcManager.remoteStreams.get(userId);
if (remoteStream) {
  const audioTracks = remoteStream.getAudioTracks();
  console.log('Audio tracks:', audioTracks.length);
  audioTracks.forEach(track => {
    console.log('Track:', {
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      label: track.label
    });
  });
}
```

**Solutions:**
1. Ensure separate `<audio>` element for remote audio
2. Set `volume = 1.0` on audio element
3. Set `autoplay = true`
4. Ensure tracks are `enabled = true`
5. Call `.play()` explicitly after setting srcObject

#### Problem: "The other person can't hear me"
```javascript
// Check local stream
if (webrtcManager.localStream) {
  const audioTracks = webrtcManager.localStream.getAudioTracks();
  console.log('Local audio tracks:', audioTracks.length);
  audioTracks.forEach(track => {
    console.log('Track:', {
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      label: track.label
    });
  });
}

// Check if tracks were added to peer connection
const senders = peerConnection.getSenders();
console.log('RTC Senders:', senders.map(s => s.track?.kind));
```

**Solutions:**
1. Ensure microphone access granted
2. Check track is `enabled = true`
3. Verify track added to peer connection with `addTrack()`
4. Check track `readyState` is "live"

### 5. Video Issues 📹

#### Problem: "Video not showing"
```javascript
// Check video element
console.log('Video element:', videoRef.current);
console.log('Video srcObject:', videoRef.current?.srcObject);
console.log('Video paused:', videoRef.current?.paused);

// Check video tracks
const videoTracks = stream.getVideoTracks();
console.log('Video tracks:', videoTracks.length);
videoTracks.forEach(track => {
  console.log('Track:', {
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState,
    settings: track.getSettings()
  });
});
```

**Solutions:**
1. Ensure camera access granted
2. Call `videoElement.play()` after setting srcObject
3. Set `autoplay` and `playsinline` attributes
4. Check video track is `enabled = true`
5. Verify constraints are not too restrictive

### 6. Signaling Issues 📡

#### Check offer/answer exchange:
```javascript
// In backend socket logs, look for:
console.log('Offer flow:');
// 1. initiate-call received
// 2. webrtc-offer sent
// 3. webrtc-answer received
// 4. ICE candidates exchanged

// In frontend, verify:
console.log('Local description:', peerConnection.localDescription?.type);
console.log('Remote description:', peerConnection.remoteDescription?.type);
console.log('Signaling state:', peerConnection.signalingState);
```

**Expected Flow:**
1. Caller: `setLocalDescription(offer)` → signaling state: "have-local-offer"
2. Callee: `setRemoteDescription(offer)` → "have-remote-offer"
3. Callee: `setLocalDescription(answer)` → "stable"
4. Caller: `setRemoteDescription(answer)` → "stable"

### 7. NAT/Firewall Issues 🛡️

If ICE connection fails, you likely need TURN servers:

```javascript
// Add to rtcConfig in webrtc.js
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // Add TURN server (required for NAT traversal)
    {
      urls: "turn:your-turn-server.com:3478",
      username: "username",
      credential: "password"
    }
  ]
};
```

**Free TURN Server Options:**
- Twilio STUN/TURN (with account)
- Metered.ca (free tier available)
- Run your own with Coturn

### 8. Browser Compatibility 🌐

**Supported Browsers:**
- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ⚠️ Requires `playsinline` for video
- Mobile Safari: ⚠️ Requires user interaction for audio

**Safari-specific fixes:**
```javascript
// Add to video elements
<video autoPlay playsInline muted /> // for local
<video autoPlay playsInline />       // for remote
```

---

## 🔍 Using the Built-in Diagnostic Tool

The VideoCall component includes a debug button (🔍) that logs:
- Connection states
- ICE candidates
- Track information
- Stream statistics

Click it anytime during a call to see detailed connection info in console.

---

## 📊 Monitoring Connection Quality

```javascript
// Get real-time stats
const stats = await webrtcManager.getConnectionStats(userId);
console.log('Connection stats:', stats);

// Monitor continuously
setInterval(async () => {
  const stats = await webrtcManager.getConnectionStats(userId);
  console.log('Packets received:', stats.tracks);
  console.log('Bytes received:', stats.candidates);
}, 5000);
```

**Key Metrics:**
- `packetsLost` → Higher = poor connection
- `bytesReceived` → Should continuously increase
- `jitter` → Lower is better for audio quality

---

## 🚨 Common Error Messages & Fixes

### "NotAllowedError"
→ User denied permission. Ask them to allow in browser settings.

### "NotFoundError"
→ No camera/mic found. Check device is connected.

### "NotReadableError"
→ Device in use by another app. Close other apps.

### "OverconstrainedError"
→ Constraints too strict. Lower video quality requirements.

### "No remote description set"
→ ICE candidate arrived before offer/answer. This is now handled automatically.

### "Failed to set remote description"
→ Signaling state issue. Ensure offer/answer flow is correct.

---

## 🎓 Best Practices for Production

1. **Always use TURN servers** for NAT traversal
2. **Handle autoplay blocks** with user interaction
3. **Implement reconnection logic** for network drops
4. **Show connection quality indicators** to users
5. **Add bandwidth adaptation** for poor connections
6. **Log everything** with clear markers for debugging
7. **Test on multiple networks** (home, mobile, corporate)
8. **Handle simultaneous calls** gracefully
9. **Implement call timeouts** to prevent hanging states
10. **Add call recording** (with user consent)

---

## 📝 Testing Checklist

- [ ] Audio call works (both directions)
- [ ] Video call works (both directions)
- [ ] Mute/unmute audio works
- [ ] Enable/disable video works
- [ ] Call while user offline (shows when online)
- [ ] Call rejection works
- [ ] Call ending works
- [ ] Network disconnect/reconnect
- [ ] Multiple browser tabs
- [ ] Different networks (WiFi, mobile, VPN)
- [ ] Different browsers
- [ ] Mobile devices
- [ ] Firewall/corporate network

---

## 🆘 Still Having Issues?

1. Open browser console (F12)
2. Look for logs starting with:
   - 🎥 [getUserMedia]
   - 📤 [createOffer]
   - 📥 [handleOffer]
   - ❄️ [ICE]
   - 🔊 [Audio]
3. Copy error messages
4. Check ICE connection state
5. Verify STUN/TURN servers are reachable
6. Test with chrome://webrtc-internals/

---

## 📚 Additional Resources

- [WebRTC Troubleshooting Guide](https://webrtc.org/getting-started/testing)
- [MDN WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Chrome WebRTC Internals](chrome://webrtc-internals/)
- [Firefox about:webrtc](about:webrtc)
