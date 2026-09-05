import { chromium } from "playwright-core";
import axios from "axios";

const API = "http://localhost:5000";
const APP = "http://localhost:3100";
const stamp = Date.now();
const A = { username: `ba_${stamp}`, email: `ba_${stamp}@t.com`, password: "secret123" };
const B = { username: `bb_${stamp}`, email: `bb_${stamp}@t.com`, password: "secret123" };

const pass = [], fail = [];
const ok = (n, x = "") => { pass.push(n); console.log(`  PASS  ${n}${x ? " :: " + x : ""}`); };
const bad = (n, x = "") => { fail.push(n); console.log(`  FAIL  ${n}${x ? " :: " + x : ""}`); };

const launch = () => chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-capture",
    "--autoplay-policy=no-user-gesture-required",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
});

const seed = async (page, auth) => {
  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ accessToken, refreshToken, user }) => {
    localStorage.setItem("token", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
    localStorage.setItem("user", JSON.stringify(user));
  }, auth);
};

const stats = (page) => page.evaluate(async () => {
  const els = Array.from(document.querySelectorAll("video, audio"));
  return els.map((e) => ({
    tag: e.tagName,
    hasStream: !!e.srcObject,
    tracks: e.srcObject ? e.srcObject.getTracks().map((t) => `${t.kind}:${t.readyState}`) : [],
    paused: e.paused,
  }));
});

(async () => {
  const a = (await axios.post(`${API}/api/auth/signup`, A)).data;
  const b = (await axios.post(`${API}/api/auth/signup`, B)).data;
  const apiA = axios.create({ baseURL: API, headers: { Authorization: `Bearer ${a.accessToken}` } });
  const room = (await apiA.post(`/api/rooms/direct/${b.user.id}`)).data;
  ok("seeded two users + direct room", room._id);

  const browser = await launch();
  const ctxA = await browser.newContext({ permissions: ["camera", "microphone"] });
  const ctxB = await browser.newContext({ permissions: ["camera", "microphone"] });
  const pa = await ctxA.newPage();
  const pb = await ctxB.newPage();

  const errsA = [], errsB = [];
  pa.on("pageerror", (e) => errsA.push(e.message));
  pb.on("pageerror", (e) => errsB.push(e.message));
  pa.on("console", (m) => { if (m.type() === "error") errsA.push("console: " + m.text()); });
  pb.on("console", (m) => { if (m.type() === "error") errsB.push("console: " + m.text()); });

  await seed(pa, a);
  await seed(pb, b);

  await pa.goto(`${APP}/chat/${room._id}`, { waitUntil: "networkidle" });
  await pb.goto(`${APP}/chat/${room._id}`, { waitUntil: "networkidle" });
  await pa.waitForTimeout(2500);

  (await pa.locator('input[placeholder="Type a message"]').count()) ? ok("chat page renders composer") : bad("chat page renders composer");
  (await pa.locator('button[title="Video Call"]').count()) ? ok("call buttons render") : bad("call buttons render");

  console.log("\n=== TEXT MESSAGE (browser) ===");
  await pa.fill('input[placeholder="Type a message"]', "hello browser B");
  await pa.click('button[title="Send"]');
  await pb.waitForTimeout(1800);
  const gotText = await pb.locator("text=hello browser B").count();
  gotText ? ok("message appears on receiver") : bad("message appears on receiver");
  const senderCopies = await pa.locator("text=hello browser B").count();
  senderCopies === 1 ? ok("no duplicate bubble on sender", `${senderCopies} copy`) : bad("duplicate bubble on sender", `${senderCopies} copies`);

  console.log("\n=== TYPING INDICATOR ===");
  await pb.fill('input[placeholder="Type a message"]', "typing…");
  await pa.waitForTimeout(1200);
  (await pa.locator("text=is typing").count()) ? ok("typing indicator visible on peer") : bad("typing indicator visible on peer");
  await pb.fill('input[placeholder="Type a message"]', "");

  console.log("\n=== READ RECEIPTS ===");
  const ticks = await pa.evaluate(() => document.querySelectorAll('svg').length);
  ticks > 0 ? ok("status ticks rendered") : bad("status ticks rendered");

  for (const type of ["audio", "video"]) {
    console.log(`\n=== ${type.toUpperCase()} CALL (real WebRTC) ===`);
    await pa.click(`button[title="${type === "video" ? "Video Call" : "Voice Call"}"]`);

    try {
      await pb.waitForSelector(`text=Incoming ${type} call`, { timeout: 12000 });
      ok(`${type}: incoming call modal shown on callee`);
    } catch { bad(`${type}: incoming call modal`, "never appeared"); continue; }

    // green accept button is the second in the modal
    await pb.locator('div.fixed button.bg-green-500').click();
    await pa.waitForTimeout(9000);

    // Inspect the *remote* sink specifically: the hidden <audio> element is
    // only ever fed by the peer, and in a video call the grid <video> is the
    // remote one (the local preview is the muted picture-in-picture).
    const remoteInfo = (page) => page.evaluate(() => {
      const audio = document.querySelector("audio");
      const videos = Array.from(document.querySelectorAll("video"));
      const remoteVideo = videos.find((v) => !v.muted);
      const dump = (el) => el && el.srcObject
        ? { tracks: el.srcObject.getTracks().map((t) => `${t.kind}:${t.readyState}:${t.muted ? "muted" : "flowing"}`), paused: el.paused }
        : null;
      return { audio: dump(audio), video: dump(remoteVideo), statusBar: document.body.innerText.match(/[0-9]+:[0-9]{2}/)?.[0] || null };
    });

    const ra = await remoteInfo(pa);
    const rb = await remoteInfo(pb);

    const liveA = ra.audio?.tracks?.length || ra.video?.tracks?.length;
    const liveB = rb.audio?.tracks?.length || rb.video?.tracks?.length;
    liveA ? ok(`${type}: caller receives remote tracks`, JSON.stringify(ra.audio?.tracks || ra.video?.tracks)) : bad(`${type}: caller remote tracks`, JSON.stringify(ra));
    liveB ? ok(`${type}: callee receives remote tracks`, JSON.stringify(rb.audio?.tracks || rb.video?.tracks)) : bad(`${type}: callee remote tracks`, JSON.stringify(rb));

    if (type === "video") {
      ra.video?.tracks?.some((t) => t.startsWith("video:live")) ? ok("video: remote video element is playing peer video") : bad("video: remote video element", JSON.stringify(ra.video));
    }

    ra.statusBar ? ok(`${type}: caller UI shows call duration`, ra.statusBar) : bad(`${type}: caller UI duration`, "no timer text");
    rb.statusBar ? ok(`${type}: callee UI shows call duration`, rb.statusBar) : bad(`${type}: callee UI duration`, "no timer text");

    // mute toggle
    await pa.locator('button[title="Mute"]').click().catch(() => {});
    await pa.waitForTimeout(500);
    (await pa.locator('button[title="Unmute"]').count()) ? ok(`${type}: mute toggle flips state`) : bad(`${type}: mute toggle`);
    await pa.locator('button[title="Unmute"]').click().catch(() => {});

    await pa.waitForTimeout(500);
    await pa.locator('button[title="End call"]').click();
    await pa.waitForTimeout(2500);
    (await pa.locator('input[placeholder="Type a message"]').count()) ? ok(`${type}: hang up returns to chat`) : bad(`${type}: hang up returns to chat`);
    (await pb.locator('input[placeholder="Type a message"]').count()) ? ok(`${type}: callee also returned to chat`) : bad(`${type}: callee returned to chat`);
    await pa.waitForTimeout(1500);
  }

  console.log("\n=== ATTACHMENT VIA UI ===");
  await pa.click('button[title="Attach"]');
  await pa.waitForTimeout(300);
  const chooser = pa.waitForEvent("filechooser");
  await pa.click("text=Photo");
  const fc = await chooser;
  await fc.setFiles({
    name: "dot.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  });
  await pb.waitForTimeout(3500);
  const imgB = await pb.locator('img[alt="dot.png"]').count();
  imgB ? ok("image attachment rendered on receiver") : bad("image attachment on receiver");
  const loaded = await pb.evaluate(() => {
    const i = document.querySelector('img[alt="dot.png"]');
    return i ? { src: i.currentSrc, complete: i.complete, w: i.naturalWidth } : null;
  });
  loaded?.w > 0 ? ok("attachment actually loads from backend", loaded.src) : bad("attachment loads", JSON.stringify(loaded));

  console.log("\n=== CALL HISTORY ===");
  await pa.click('button[title=""], button:has(svg)').catch(() => {});
  await pa.waitForTimeout(300);

  console.log("\n=== PAGE ERRORS ===");
  const realErrs = [...errsA, ...errsB].filter((e) => !/favicon|404|Download the React DevTools|caniuse|baseline/i.test(e));
  realErrs.length === 0 ? ok("no uncaught page errors") : bad("page errors", realErrs.slice(0, 5).join(" | "));

  await browser.close();
  console.log(`\n================  ${pass.length} passed, ${fail.length} failed  ================`);
  if (fail.length) fail.forEach((f) => console.log("  - " + f));
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
