# Test scripts

Both scripts assume the backend is running on `http://localhost:5000` and talk to
the database configured in `backend/.env`. They create throwaway users on every
run.

## `e2e-api-test.mjs` — REST + Socket.IO end-to-end

No extra dependencies. Covers auth, room authorization, text messages, typing,
read receipts, every attachment type, upload rejection paths, static file
serving, pagination, the full call signalling state machine, call logs and
presence.

```bash
cd frontend
node scripts/e2e-api-test.mjs
```

## `e2e-browser-test.mjs` — real browsers, real WebRTC

Drives two Chrome profiles with fake camera/microphone devices and asserts that
audio and video tracks actually flow between them, plus messaging, typing,
attachments and hang-up.

Requires Chrome at `/usr/bin/google-chrome`, a dev server on port 3100
(`npx next dev -p 3100`, with the backend started as
`FRONTEND_URL=http://localhost:3100 node server.js` so CORS allows it), and:

```bash
cd frontend
npm i -D playwright-core
node scripts/e2e-browser-test.mjs
```
