import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { initSocket, getSocket } from "../utils/socket";
import VideoCall from "../components/VideoCall";

/**
 * =====================================================
 * WEBRTC CALL TEST PAGE
 * =====================================================
 * 
 * Use this page to test WebRTC calls in isolation.
 * Navigate to: /call-test
 * 
 * Instructions:
 * 1. Open in two browser windows
 * 2. Log in as different users
 * 3. Enter target user ID
 * 4. Test audio and video calls
 */

export default function CallTest() {
  const router = useRouter();
  const { user, isAuthenticated, token } = useAuth();
  const [targetUserId, setTargetUserId] = useState("");
  const [targetUsername, setTargetUsername] = useState("");
  const [roomId, setRoomId] = useState("test-room-123");
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.push("/login");
      return;
    }

    // Initialize socket
    const socket = initSocket(token);
    
    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
      setSocketConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
      setSocketConnected(false);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
    };
  }, [isAuthenticated, user, token, router]);

  const handleStartTest = () => {
    if (!targetUserId.trim() || !targetUsername.trim()) {
      alert("Please enter target user ID and username");
      return;
    }
  };

  if (!isAuthenticated || !user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="test-container">
      <div className="header">
        <h1>🧪 WebRTC Call Test Page</h1>
        <div className="user-info">
          <span>Logged in as: <strong>{user.username}</strong> (ID: {user.id})</span>
          <span className={socketConnected ? "status-online" : "status-offline"}>
            {socketConnected ? "🟢 Socket Connected" : "🔴 Socket Disconnected"}
          </span>
        </div>
      </div>

      <div className="test-controls">
        <h2>Test Configuration</h2>
        
        <div className="form-group">
          <label>Room ID:</label>
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="test-room-123"
          />
          <small>Both users must use the same room ID</small>
        </div>

        <div className="form-group">
          <label>Target User ID:</label>
          <input
            type="text"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            placeholder="Enter other user's ID"
          />
        </div>

        <div className="form-group">
          <label>Target Username:</label>
          <input
            type="text"
            value={targetUsername}
            onChange={(e) => setTargetUsername(e.target.value)}
            placeholder="Enter other user's username"
          />
        </div>

        <button onClick={handleStartTest} className="start-btn">
          Initialize Test
        </button>
      </div>

      {targetUserId && targetUsername && (
        <div className="call-area">
          <h2>Call Controls</h2>
          <VideoCall
            currentUser={{
              id: user.id,
              username: user.username
            }}
            targetUser={{
              id: targetUserId,
              username: targetUsername
            }}
            roomId={roomId}
          />
        </div>
      )}

      <div className="instructions">
        <h3>📋 Test Instructions</h3>
        <ol>
          <li>Open this page in <strong>two browser windows</strong> (or incognito)</li>
          <li>Log in as <strong>different users</strong> in each window</li>
          <li>In Window 1: Enter Window 2's user ID and username</li>
          <li>In Window 2: Enter Window 1's user ID and username</li>
          <li>Both windows should use the <strong>same Room ID</strong></li>
          <li>Click "Initialize Test" in both windows</li>
          <li>Click "Audio Call" or "Video Call" to start</li>
        </ol>

        <h3>✅ What to Test</h3>
        <ul>
          <li>Audio call - can you hear each other?</li>
          <li>Video call - can you see each other?</li>
          <li>Mute/unmute functionality</li>
          <li>Video on/off functionality</li>
          <li>Call while other user is "offline" (refresh their page after call initiated)</li>
          <li>Call rejection</li>
          <li>Ending calls properly</li>
        </ul>

        <h3>🔍 Debugging</h3>
        <ul>
          <li>Open browser console (F12) to see detailed logs</li>
          <li>Look for logs with emojis: 🎥 📤 📥 ❄️ 🔊</li>
          <li>Click the 🔍 button during call for diagnostics</li>
          <li>Check <code>chrome://webrtc-internals/</code> for detailed stats</li>
        </ul>

        <h3>🚨 Common Issues</h3>
        <ul>
          <li><strong>No audio:</strong> Check volume, ensure separate audio element exists</li>
          <li><strong>No video:</strong> Grant camera permission, check constraints</li>
          <li><strong>Can't connect:</strong> Check ICE connection state, may need TURN server</li>
          <li><strong>Call doesn't appear:</strong> Verify both users in same room ID</li>
        </ul>

        <h3>📚 Documentation</h3>
        <ul>
          <li><code>WEBRTC_DEBUGGING_GUIDE.md</code> - Complete debugging guide</li>
          <li><code>WEBRTC_INTEGRATION_GUIDE.md</code> - Integration instructions</li>
          <li><code>components/VideoCall.js</code> - Full component source</li>
        </ul>
      </div>

      <style jsx>{`
        .test-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        }

        .header {
          background: linear-gradient(135deg, #00b3fd 0%, #0090cc 100%);
          color: white;
          padding: 30px;
          border-radius: 12px;
          margin-bottom: 30px;
        }

        .header h1 {
          margin: 0 0 15px 0;
          font-size: 32px;
        }

        .user-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
        }

        .status-online {
          background: rgba(255, 255, 255, 0.2);
          padding: 6px 12px;
          border-radius: 20px;
        }

        .status-offline {
          background: rgba(255, 0, 0, 0.3);
          padding: 6px 12px;
          border-radius: 20px;
        }

        .test-controls {
          background: white;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          margin-bottom: 30px;
        }

        .test-controls h2 {
          margin: 0 0 20px 0;
          font-size: 24px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          font-weight: 600;
          margin-bottom: 8px;
          color: #333;
        }

        .form-group input {
          width: 100%;
          padding: 12px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 16px;
          box-sizing: border-box;
        }

        .form-group input:focus {
          outline: none;
          border-color: #00b3fd;
        }

        .form-group small {
          display: block;
          margin-top: 6px;
          color: #666;
          font-size: 13px;
        }

        .start-btn {
          width: 100%;
          padding: 14px;
          background: #00b3fd;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .start-btn:hover {
          background: #0090cc;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 179, 253, 0.3);
        }

        .call-area {
          background: white;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          margin-bottom: 30px;
        }

        .call-area h2 {
          margin: 0 0 20px 0;
          font-size: 24px;
        }

        .instructions {
          background: #f8f9fa;
          padding: 30px;
          border-radius: 12px;
          border-left: 4px solid #00b3fd;
        }

        .instructions h3 {
          margin: 30px 0 15px 0;
          font-size: 20px;
          color: #333;
        }

        .instructions h3:first-child {
          margin-top: 0;
        }

        .instructions ol, .instructions ul {
          margin: 0;
          padding-left: 25px;
        }

        .instructions li {
          margin-bottom: 10px;
          line-height: 1.6;
        }

        .instructions code {
          background: #e0e0e0;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          font-size: 14px;
        }

        .instructions strong {
          color: #00b3fd;
        }

        @media (max-width: 768px) {
          .test-container {
            padding: 10px;
          }

          .header h1 {
            font-size: 24px;
          }

          .user-info {
            flex-direction: column;
            gap: 10px;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
