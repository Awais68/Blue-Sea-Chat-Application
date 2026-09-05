import axios from "axios";
import { io } from "socket.io-client";

const API = "http://localhost:5000";
const stamp = Date.now();
const A = { username: `a_${stamp}`, email: `a_${stamp}@t.com`, password: "secret123" };
const B = { username: `b_${stamp}`, email: `b_${stamp}@t.com`, password: "secret123" };

const pass = [], fail = [];
const ok = (n, extra = "") => { pass.push(n); console.log(`  PASS  ${n}${extra ? " :: " + extra : ""}`); };
const bad = (n, e) => { fail.push(n); console.log(`  FAIL  ${n} :: ${e}`); };

const waitFor = (sock, event, ms = 8000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for "${event}"`)), ms);
    sock.once(event, (d) => { clearTimeout(t); res(d); });
  });

const signup = async (u) => (await axios.post(`${API}/api/auth/signup`, u)).data;

const connect = (token) =>
  new Promise((res, rej) => {
    const s = io(API, { auth: { token }, transports: ["websocket"] });
    s.on("connect", () => res(s));
    s.on("connect_error", rej);
  });

(async () => {
  console.log("\n=== AUTH ===");
  const a = await signup(A); ok("signup user A");
  const b = await signup(B); ok("signup user B");

  const apiA = axios.create({ baseURL: API, headers: { Authorization: `Bearer ${a.accessToken}` } });
  const apiB = axios.create({ baseURL: API, headers: { Authorization: `Bearer ${b.accessToken}` } });

  const login = await axios.post(`${API}/api/auth/login`, { email: A.email, password: A.password });
  login.data.user.password ? bad("login does not leak password", "password present") : ok("login does not leak password");

  console.log("\n=== ROOMS ===");
  const users = (await apiA.get("/api/rooms/users")).data;
  const target = users.find((u) => u.email === B.email);
  target ? ok("user list contains B") : bad("user list contains B", "not found");
  if (target.password) bad("user list does not leak password", "password present");
  else ok("user list does not leak password");

  const room = (await apiA.post(`/api/rooms/direct/${target._id}`)).data;
  ok("create direct chat", room._id);

  console.log("\n=== SOCKETS ===");
  const sa = await connect(a.accessToken); ok("socket connect A");
  const sb = await connect(b.accessToken); ok("socket connect B");

  sa.emit("join-room", { roomId: room._id, username: A.username });
  sb.emit("join-room", { roomId: room._id, username: B.username });
  await waitFor(sa, "room-participants").then(() => ok("join-room accepted (member)"));

  // unauthorized room join
  const errP = waitFor(sb, "error", 4000).catch(() => null);
  sb.emit("join-room", { roomId: "507f1f77bcf86cd799439011", username: B.username });
  const err = await errP;
  err ? ok("join-room rejects non-member", err.message) : bad("join-room rejects non-member", "no error emitted");

  console.log("\n=== MESSAGES ===");
  const recvP = waitFor(sb, "new-message");
  const sentP = waitFor(sa, "message-sent");
  sa.emit("send-message", { roomId: room._id, content: "hello from A", username: A.username, messageType: "text", tempId: "t1" });
  const recv = await recvP;
  const sent = await sentP;
  recv.content === "hello from A" ? ok("text message delivered", recv.content) : bad("text message delivered", JSON.stringify(recv));
  sent.tempId === "t1" && sent._id ? ok("message-sent ack carries tempId + _id", sent.status) : bad("message-sent ack", JSON.stringify(sent));
  recv.tempId === "t1" ? ok("new-message echoes tempId (no duplicate bubble)") : bad("new-message echoes tempId", String(recv.tempId));

  // typing
  const typP = waitFor(sb, "user-typing", 4000);
  sa.emit("typing", { roomId: room._id, username: A.username });
  await typP.then((d) => ok("typing indicator relayed", d.username)).catch((e) => bad("typing indicator", e.message));

  // read receipt
  const readP = waitFor(sa, "messages-read", 4000);
  sb.emit("mark-read", { roomId: room._id });
  await readP.then(() => ok("read receipt relayed")).catch((e) => bad("read receipt", e.message));

  console.log("\n=== ATTACHMENTS ===");
  const uploadOne = async (bytes, name, type, extra = {}) => {
    const fd = new FormData();
    fd.append("file", new Blob([bytes], { type }), name);
    for (const [k, v] of Object.entries(extra)) fd.append(k, String(v));
    return (await apiA.post("/api/upload", fd)).data;
  };

  // 1x1 PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const img = await uploadOne(png, "pic.png", "image/png");
  img.messageType === "image" && img.mediaUrl.startsWith("/uploads/") ? ok("upload image", img.mediaUrl) : bad("upload image", JSON.stringify(img));

  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
  const doc = await uploadOne(pdf, "notes.pdf", "application/pdf");
  doc.messageType === "file" && doc.fileName === "notes.pdf" ? ok("upload document", `${doc.fileName} ${doc.fileSize}B`) : bad("upload document", JSON.stringify(doc));

  const voice = await uploadOne(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]), "vn.webm", "audio/webm", { messageType: "voice-note", duration: 7 });
  voice.messageType === "voice-note" && voice.duration === 7 ? ok("upload voice note", `${voice.duration}s`) : bad("upload voice note", JSON.stringify(voice));

  const mp4 = await uploadOne(Buffer.alloc(64, 1), "clip.mp4", "video/mp4");
  mp4.messageType === "video" ? ok("upload video") : bad("upload video", JSON.stringify(mp4));

  try {
    await uploadOne(Buffer.from("<?php ?>"), "shell.php", "application/x-httpd-php");
    bad("upload rejects unsupported mime", "accepted!");
  } catch (e) { ok("upload rejects unsupported mime", e.response?.data?.message); }

  try {
    await apiA.post("/api/upload", new FormData());
    bad("upload rejects empty body", "accepted");
  } catch (e) { ok("upload rejects empty body", e.response?.data?.message); }

  try {
    await axios.post(`${API}/api/upload`, new FormData());
    bad("upload requires auth", "accepted");
  } catch (e) { ok("upload requires auth", `HTTP ${e.response?.status}`); }

  // static serve
  const served = await axios.get(`${API}${img.mediaUrl}`, { responseType: "arraybuffer" });
  served.data.byteLength === png.length ? ok("uploaded file served over HTTP", `${served.data.byteLength}B`) : bad("static serve", `${served.data.byteLength}`);

  // send attachments as messages
  for (const [label, meta] of [["image", img], ["file", doc], ["voice-note", voice], ["video", mp4]]) {
    const p = waitFor(sb, "new-message");
    sa.emit("send-message", {
      roomId: room._id, content: "", username: A.username,
      messageType: meta.messageType, mediaUrl: meta.mediaUrl, fileName: meta.fileName,
      fileSize: meta.fileSize, mimeType: meta.mimeType, duration: meta.duration, tempId: `att_${label}`,
    });
    const m = await p;
    m.messageType === meta.messageType && m.mediaUrl === meta.mediaUrl
      ? ok(`send ${label} message`, m.mediaUrl)
      : bad(`send ${label} message`, JSON.stringify(m));
  }

  // attachment without mediaUrl must be rejected
  const meP = waitFor(sa, "message-error", 4000).catch(() => null);
  sa.emit("send-message", { roomId: room._id, content: "", username: A.username, messageType: "image", mediaUrl: null, tempId: "bad1" });
  const me = await meP;
  me ? ok("attachment without mediaUrl rejected", me.message) : bad("attachment without mediaUrl rejected", "accepted");

  console.log("\n=== HISTORY / PAGINATION ===");
  const hist = (await apiA.get(`/api/rooms/${room._id}/messages`, { params: { limit: 50 } })).data;
  Array.isArray(hist.messages) ? ok("GET messages returns array", `${hist.messages.length} msgs`) : bad("GET messages", JSON.stringify(hist).slice(0, 200));
  hist.pagination && typeof hist.pagination.totalMessages === "number" && typeof hist.pagination.hasNextPage === "boolean"
    ? ok("pagination fields correct", JSON.stringify(hist.pagination))
    : bad("pagination fields", JSON.stringify(hist.pagination));
  const leaked = hist.messages.find((m) => m.sender?.password || m.sender?.refreshTokens);
  leaked ? bad("message history does not leak sender password", "leak!") : ok("message history does not leak sender password");

  try {
    await axios.get(`${API}/api/rooms/${room._id}/messages`, { headers: { Authorization: `Bearer ${(await signup({ username: `c_${stamp}`, email: `c_${stamp}@t.com`, password: "secret123" })).accessToken}` } });
    bad("messages route blocks non-members", "allowed");
  } catch (e) { ok("messages route blocks non-members", `HTTP ${e.response?.status}`); }

  console.log("\n=== CALLS ===");
  for (const type of ["audio", "video"]) {
    const incP = waitFor(sb, "incoming-call");
    const initP = waitFor(sa, "call-initiated");
    sa.emit("initiate-call", { roomId: room._id, targetUserId: target._id, callType: type, username: A.username });
    const inc = await incP, init = await initP;
    inc.callType === type ? ok(`${type} call rings the callee`, `callId=${inc.callId}`) : bad(`${type} call rings`, JSON.stringify(inc));
    init.callId === inc.callId && init.targetUserId === target._id
      ? ok(`${type} call-initiated resolves callee`, `online=${init.online}`)
      : bad(`${type} call-initiated`, JSON.stringify(init));

    const accP = waitFor(sa, "call-accepted");
    sb.emit("accept-call", { callId: inc.callId, targetUserId: a.user.id });
    const acc = await accP;
    acc.callId === inc.callId ? ok(`${type} call accepted (caller notified)`) : bad(`${type} call accepted`, JSON.stringify(acc));

    // SDP relay: caller -> callee
    const offP = waitFor(sb, "webrtc-offer");
    sa.emit("webrtc-offer", { roomId: room._id, offer: { type: "offer", sdp: "v=0-fake" }, targetUserId: target._id, callId: inc.callId });
    const off = await offP;
    off.offer.sdp === "v=0-fake" && off.fromUserId === a.user.id ? ok(`${type} SDP offer relayed`) : bad(`${type} offer relay`, JSON.stringify(off));

    const ansP = waitFor(sa, "webrtc-answer");
    sb.emit("webrtc-answer", { answer: { type: "answer", sdp: "v=0-ans" }, targetUserId: a.user.id, callId: inc.callId });
    const ans = await ansP;
    ans.answer.sdp === "v=0-ans" ? ok(`${type} SDP answer relayed`) : bad(`${type} answer relay`, JSON.stringify(ans));

    const iceP = waitFor(sb, "webrtc-ice-candidate");
    sa.emit("webrtc-ice-candidate", { candidate: { candidate: "cand-1" }, targetUserId: target._id, callId: inc.callId });
    const ice = await iceP;
    ice.candidate.candidate === "cand-1" ? ok(`${type} ICE candidate relayed`) : bad(`${type} ICE relay`, JSON.stringify(ice));

    const endP = waitFor(sb, "call-ended");
    sa.emit("end-call", { callId: inc.callId, roomId: room._id, targetUserId: target._id, duration: 12 });
    await endP.then(() => ok(`${type} call ended cleanly`)).catch((e) => bad(`${type} call end`, e.message));
    await new Promise((r) => setTimeout(r, 400));
  }

  // reject flow
  const incP2 = waitFor(sb, "incoming-call");
  sa.emit("initiate-call", { roomId: room._id, targetUserId: target._id, callType: "audio", username: A.username });
  const inc2 = await incP2;
  const rejP = waitFor(sa, "call-rejected");
  sb.emit("reject-call", { callId: inc2.callId, targetUserId: a.user.id });
  await rejP.then(() => ok("call reject flow")).catch((e) => bad("call reject", e.message));

  await new Promise((r) => setTimeout(r, 600));
  const logs = (await apiA.get(`/api/rooms/${room._id}/calls`)).data;
  logs.length >= 3 ? ok("call logs persisted", `${logs.length} logs: ${logs.map((l) => `${l.callType}/${l.status}`).join(", ")}`) : bad("call logs", JSON.stringify(logs).slice(0, 300));
  logs.every((l) => l.startTime) ? ok("call logs expose startTime (UI date field)") : bad("call logs startTime", "missing");
  const answered = logs.find((l) => l.status === "ended" || l.status === "answered");
  answered && answered.duration > 0 ? ok("call duration recorded", `${answered.duration}s`) : bad("call duration", JSON.stringify(answered));

  console.log("\n=== PRESENCE ===");
  const statusP = waitFor(sa, "user-status", 6000).catch(() => null);
  sb.close();
  const st = await statusP;
  st && st.status === "offline" ? ok("offline presence broadcast", st.status) : bad("offline presence", JSON.stringify(st));

  sa.close();
  console.log(`\n================  ${pass.length} passed, ${fail.length} failed  ================`);
  if (fail.length) { console.log("FAILED:"); fail.forEach((f) => console.log("  - " + f)); }
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("\nFATAL:", e.response?.status, e.response?.data || e.message); process.exit(1); });
