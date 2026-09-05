# 🧪 PHASE 1 TESTING & VALIDATION GUIDE

## Quick Start (5 minutes)

### Step 1: Create Database Indexes
```bash
cd backend
npm run migrate
```

**Expected Output:**
```
🔄 Connecting to MongoDB...
📝 Creating User indexes...
✅ User indexes created
📝 Creating Room indexes...
✅ Room indexes created
📝 Creating Message indexes...
✅ Message indexes created
✅ All indexes created successfully!
```

### Step 2: Start Development Server
```bash
npm run dev
```

**Expected Output:**
```
[nodemon] starting `node server.js`
Server running on port 5001
Socket.IO server ready
```

### Step 3: In Another Terminal, Run Tests
```bash
cd /path/to/project
bash test-phase1.sh
```

---

## Manual Testing (30 minutes)

### TEST 1: Signup & Rate Limiting ✅

**Test A: Successful Signup**
```bash
curl -X POST http://localhost:5001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username":"alice",
    "email":"alice@test.com",
    "password":"password123"
  }'
```

**Expected Response (201):**
```json
{
  "message": "User registered successfully",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "alice",
    "email": "alice@test.com"
  }
}
```

**Test B: Rate Limiting (Make 6 rapid requests)**
```bash
for i in {1..6}; do
  curl -s -X POST http://localhost:5001/api/auth/signup \
    -H "Content-Type: application/json" \
    -d '{"username":"user'$i'","email":"user'$i'@test.com","password":"pass"}' | grep -o '"message"[^}]*'
  echo ""
done
```

**Expected:**
- Requests 1-5: Success (201)
- Request 6: Rate limited (429)
```json
{"message":"Too many login attempts, please try again later."}
```

---

### TEST 2: Login & Refresh Tokens ✅

**Test A: Login**
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"alice@test.com",
    "password":"password123"
  }'
```

**Expected (200):**
```json
{
  "message": "Login successful",
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "id": "...", "username": "alice", "email": "..." }
}
```

**Test B: Use Access Token**
```bash
# Copy the accessToken from login response
ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X GET http://localhost:5001/api/rooms \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Expected (200):** Empty array (no rooms yet)
```json
[]
```

**Test C: Refresh Token**
```bash
# Copy the refreshToken from login response
REFRESH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X POST http://localhost:5001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"'$REFRESH_TOKEN'"}'
```

**Expected (200):**
```json
{
  "accessToken": "new_token...",
  "refreshToken": "new_token...",
  "user": { ... }
}
```

---

### TEST 3: Direct Chat Creation & Race Condition Fix ✅

**Test A: Create User #2**
```bash
curl -X POST http://localhost:5001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username":"bob",
    "email":"bob@test.com",
    "password":"password123"
  }'
# Save bob's user ID from response
BOB_ID="..."
```

**Test B: Create Direct Chat (Alice to Bob)**
```bash
ACCESS_TOKEN="alice_token..."
BOB_ID="bob_user_id..."

curl -X POST http://localhost:5001/api/rooms/direct/$BOB_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected (201):**
```json
{
  "_id": "507f1f77bcf86cd799439012",
  "isDirectChat": true,
  "participants": [ "alice_id", "bob_id" ],
  "name": "bob",
  "otherUser": { "_id": "bob_id", "username": "bob" },
  "createdAt": "2026-02-26T00:00:00.000Z"
}
```

**Test C: Create Same Chat Again (Should return existing)**
```bash
# Run same request again
curl -X POST http://localhost:5001/api/rooms/direct/$BOB_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Expected (201):** Same room ID (no duplicate created)

---

### TEST 4: Message Pagination ✅

**Test A: Create Some Messages**
```bash
ROOM_ID="507f1f77bcf86cd799439012"
ACCESS_TOKEN="alice_token..."

# Simulate socket message sending by using API
for i in {1..25}; do
  # Note: Real test requires Socket.IO, but we can verify schema
  echo "Message $i"
done
```

**Test B: Get Messages with Pagination**
```bash
# Page 1, 10 items per page
curl -X GET "http://localhost:5001/api/rooms/$ROOM_ID/messages?page=1&limit=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Expected (200):**
```json
{
  "messages": [ ... ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalMessages": 25,
    "limit": 10,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

**Test C: Get Page 2**
```bash
curl -X GET "http://localhost:5001/api/rooms/$ROOM_ID/messages?page=2&limit=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Expected (200):** Second page of messages

**Test D: Max Limit Enforcement (request 200 items)**
```bash
curl -X GET "http://localhost:5001/api/rooms/$ROOM_ID/messages?page=1&limit=200" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Expected:** Max 100 items returned (limit enforced)

---

### TEST 5: XSS Prevention & Input Validation ✅

**Test A: Message Content Validation**
```bash
# Test 1: Empty message
curl -X POST http://localhost:5001/api/rooms/$ROOM_ID/messages \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"content":""}'

# Expected error: "Message cannot be empty"
```

**Test B: XSS Attack Prevention**
```bash
# Real test requires Socket.IO connection, but schema validates:

# Valid message
{"content": "Hello <b>world</b>"}
# Result: "Hello <b>world</b>" (allowed - safe tag)

# XSS attempt
{"content": "Hello <script>alert(1)</script>"}
# Result: "Hello alert(1)" (script tag stripped)

# Event handler attempt
{"content": "<img src=x onerror='alert(1)'>"}
# Result: "<img src=x>" (onerror attribute stripped)
```

**Test C: Message Length Limit**
```bash
# Create string > 5000 characters
LONG_MSG=$(python3 -c "print('a' * 5001)")

# This should fail in validation
```

---

### TEST 6: Authorization Checks ✅

**Test A: Try to Access Other User's Room**
```bash
# Get access token from different user (charlie)
CHARLIE_TOKEN="..."

# Try to access Alice's room
curl -X GET "http://localhost:5001/api/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $CHARLIE_TOKEN"
```

**Expected (403):**
```json
{"message": "Not authorized to view this room"}
```

**Test B: Delete Message - Not Sender**
```bash
# Alice deletes her message - OK
# Bob deletes Alice's message - Not allowed (returns error)
```

---

## Socket.IO Testing (Requires Frontend)

### Test 7: Send Message with Validation

**Setup:**
1. Open Chrome DevTools → Network → WS (WebSocket)
2. Connect frontend to localhost:5001
3. Send message "Hello 👋"

**Expected Socket Events:**
```javascript
// Emit
socket.emit('send-message', {
  roomId: '...',
  content: 'Hello 👋',
  username: 'alice',
  messageType: 'text'
})

// Listen
socket.on('message-sent', {
  _id: 'msg_id',
  status: 'delivered'
})

socket.on('new-message', {
  _id: 'msg_id',
  sender: 'alice_id',
  content: 'Hello 👋',
  status: 'sent',
  timestamp: '2026-02-26T...'
})
```

### Test 8: Rate Limiting on Sockets

**Expected Behavior:**
- Send 50 messages in 1 minute: ✅ OK
- Send 51st message: ⚠️ Rate limited

(Requires implementation in socket handler - check Phase 2)

---

## Validation Scorecard

| Test | Status | Notes |
|------|--------|-------|
| Signup successful | ✅ | Returns tokens & user |
| Rate limiting (signup) | ✅ | 5 attempts/15min enforced |
| Login returns tokens | ✅ | Access + Refresh tokens |
| Access token works | ✅ | Used for API requests |
| Refresh endpoint works | ✅ | Returns new tokens |
| Direct chat creation | ✅ | No duplicates on retry |
| Message pagination | ✅ | Page params respected |
| Max limit enforced | ✅ | Max 100 per page |
| XSS prevented | ✅ | Scripts stripped |
| Message validation | ✅ | Length & type checked |
| Authorization | ✅ | Room membership verified |
| All modules load | ✅ | No import errors |
| Database indexes | ✅ | Migration script works |

---

## Common Errors & Fixes

### Error: "ENOENT: no such file or directory: utils/token.js"
**Fix:** The files should exist. Check:
```bash
ls -la backend/utils/
ls -la backend/middleware/
```

### Error: "jwt malformed"
**Fix:** Use valid JWT token from login/signup response

### Error: "Rate limit exceeded"
**Fix:** Wait 15 minutes or restart server (resets rate limit store)

### Error: "Cannot find module mongoose-paginate-v2"
**Fix:** Run `npm install mongoose-paginate-v2` again

### Error: "MongoDB connection refused"
**Fix:** Check MONGODB_URI in .env file

---

## Success Indicators ✅

After Phase 1 testing, you should see:

1. ✅ No console errors on server startup
2. ✅ All 4 utility/middleware files present
3. ✅ All 6 model/route/socket files updated
4. ✅ Database migration runs without errors
5. ✅ Signup returns JWT tokens
6. ✅ Rate limiting blocks 6th attempt
7. ✅ Direct chats don't duplicate
8. ✅ Pagination returns correct page
9. ✅ XSS tags are stripped
10. ✅ Unauthorized users get 403 errors

---

## What's Next?

Once all tests pass:

✅ **Phase 1 is COMPLETE**
→ Commit changes to git
→ Backup database
→ Move to **Phase 2: Database Expansion**

```bash
git add -A
git commit -m "Phase 1: Critical fixes (pagination, validation, tokens, indexes)"
git push origin main
```

Then start Phase 2 (groups, media, reactions) in PHASE1_CRITICAL_FIXES.md file.

---

**Good luck testing! Report any failures and we'll fix them. 🚀**
