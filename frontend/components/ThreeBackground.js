import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Ambient "Blue Sea" backdrop for the messaging screen:
 * a slow field of rising bubbles over a gently undulating wave mesh.
 *
 * Design constraints this component holds itself to:
 *  - it must never compete with the messages, so everything is low contrast
 *    and slow (nothing moves faster than a bubble drifting upward),
 *  - it must cost nothing when it is not visible: the loop stops on tab
 *    hide and on `prefers-reduced-motion`, where a single frame is drawn,
 *  - it must clean up after itself; WebGL contexts are a limited resource
 *    and a chat app navigates between rooms constantly.
 */
const BUBBLE_COUNT = 220;
const WAVE_SEGMENTS = 48;

/** Soft radial sprite, generated so the component ships no image asset. */
const createBubbleTexture = () => {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.35, "rgba(140, 220, 255, 0.45)");
  gradient.addColorStop(1, "rgba(0, 120, 200, 0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
};

const ThreeBackground = ({ opacity = 0.55, className = "" }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // A browser without WebGL should simply get the plain background
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
      });
    } catch (error) {
      console.debug("WebGL unavailable, skipping background:", error);
      return;
    }

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05203a, 0.055);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 0, 14);

    /* ---------------------------- bubbles ---------------------------- */
    const bubbleTexture = createBubbleTexture();
    const positions = new Float32Array(BUBBLE_COUNT * 3);
    const speeds = new Float32Array(BUBBLE_COUNT);
    const drifts = new Float32Array(BUBBLE_COUNT);

    for (let i = 0; i < BUBBLE_COUNT; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 34;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 18 - 4;

      speeds[i] = 0.25 + Math.random() * 0.7;
      drifts[i] = (Math.random() - 0.5) * 0.35;
    }

    const bubbleGeometry = new THREE.BufferGeometry();
    bubbleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );

    const bubbleMaterial = new THREE.PointsMaterial({
      map: bubbleTexture,
      size: 0.55,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(0x7fd8ff),
    });

    const bubbles = new THREE.Points(bubbleGeometry, bubbleMaterial);
    scene.add(bubbles);

    /* ----------------------------- waves ----------------------------- */
    const waveGeometry = new THREE.PlaneGeometry(
      60,
      36,
      WAVE_SEGMENTS,
      WAVE_SEGMENTS
    );
    const waveMaterial = new THREE.MeshBasicMaterial({
      color: 0x00b3fd,
      wireframe: true,
      transparent: true,
      opacity: 0.13,
    });

    const waves = new THREE.Mesh(waveGeometry, waveMaterial);
    waves.rotation.x = -Math.PI / 2.35;
    waves.position.set(0, -7.5, -6);
    scene.add(waves);

    const waveBase = Float32Array.from(
      waveGeometry.attributes.position.array
    );

    /* --------------------------- interaction -------------------------- */
    // A whisper of parallax: enough to feel alive, not enough to distract.
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

    const handlePointerMove = (event) => {
      pointer.targetX = (event.clientX / window.innerWidth - 0.5) * 1.2;
      pointer.targetY = (event.clientY / window.innerHeight - 0.5) * 0.8;
    };

    /* ------------------------------ loop ------------------------------ */
    const clock = new THREE.Clock();
    let frameId = null;
    let running = true;

    const renderFrame = () => {
      const elapsed = clock.getElapsedTime();
      const positionAttr = bubbleGeometry.attributes.position;

      for (let i = 0; i < BUBBLE_COUNT; i += 1) {
        const yIndex = i * 3 + 1;
        positionAttr.array[yIndex] += speeds[i] * 0.012;
        positionAttr.array[i * 3] +=
          Math.sin(elapsed * 0.4 + i) * 0.0035 * drifts[i] * 10;

        // Recycle a bubble that has floated off the top
        if (positionAttr.array[yIndex] > 13) {
          positionAttr.array[yIndex] = -13;
          positionAttr.array[i * 3] = (Math.random() - 0.5) * 34;
        }
      }
      positionAttr.needsUpdate = true;

      const wavePos = waveGeometry.attributes.position;
      for (let i = 0; i < wavePos.count; i += 1) {
        const x = waveBase[i * 3];
        const y = waveBase[i * 3 + 1];
        wavePos.array[i * 3 + 2] =
          Math.sin(x * 0.28 + elapsed * 0.55) * 0.85 +
          Math.cos(y * 0.32 + elapsed * 0.4) * 0.65;
      }
      wavePos.needsUpdate = true;

      pointer.x += (pointer.targetX - pointer.x) * 0.04;
      pointer.y += (pointer.targetY - pointer.y) * 0.04;
      camera.position.x = pointer.x;
      camera.position.y = -pointer.y;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    const animate = () => {
      if (!running) return;
      renderFrame();
      frameId = requestAnimationFrame(animate);
    };

    if (reduceMotion) {
      // One static frame: the texture without the motion
      renderFrame();
    } else {
      window.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
      animate();
    }

    /* --------------------------- responsiveness ------------------------ */
    const handleResize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(handleResize)
        : null;
    resizeObserver?.observe(mount);
    window.addEventListener("resize", handleResize);

    // Burning GPU on a tab nobody is looking at is pure waste
    const handleVisibility = () => {
      if (reduceMotion) return;
      if (document.visibilityState === "hidden") {
        running = false;
        if (frameId) cancelAnimationFrame(frameId);
        frameId = null;
      } else if (!running) {
        running = true;
        clock.getDelta();
        animate();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    /* ------------------------------ cleanup ---------------------------- */
    return () => {
      running = false;
      if (frameId) cancelAnimationFrame(frameId);

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      resizeObserver?.disconnect();

      bubbleGeometry.dispose();
      bubbleMaterial.dispose();
      bubbleTexture.dispose();
      waveGeometry.dispose();
      waveMaterial.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ opacity }}
    />
  );
};

export default ThreeBackground;
