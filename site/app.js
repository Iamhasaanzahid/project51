const canvas = document.querySelector("#fabric-canvas");
const nav = document.querySelector("#nav");
const ampInput = document.querySelector("#amp");
const speedInput = document.querySelector("#speed");
const hueInput = document.querySelector("#hue");

let amp = 1;
let speed = 1;
let hue = 186;

ampInput?.addEventListener("input", () => {
  amp = Number(ampInput.value);
});

speedInput?.addEventListener("input", () => {
  speed = Number(speedInput.value);
});

hueInput?.addEventListener("input", () => {
  hue = Number(hueInput.value);
  applyHue();
});

function applyHue() {
  const color = `hsl(${hue} 92% 62%)`;
  const soft = `hsl(${hue} 92% 62% / 0.12)`;
  document.documentElement.style.setProperty("--cyan", color);
  document.documentElement.style.setProperty("--cyan-soft", soft);
}

window.addEventListener(
  "scroll",
  () => {
    nav?.classList.toggle("scrolled", window.scrollY > 24);
  },
  { passive: true }
);

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
);

document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

function animateCount(element) {
  const target = Number(element.dataset.count || 0);
  const duration = 1200;
  let start = null;

  function frame(timestamp) {
    if (start === null) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = String(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

const countObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      animateCount(entry.target);
      countObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.8 }
);

document.querySelectorAll("[data-count]").forEach((element) => countObserver.observe(element));

function startFallbackFabric() {
  if (!canvas) return;
  canvas.classList.add("fallback");
  const context = canvas.getContext("2d");
  if (!context) return;

  let width = 0;
  let height = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  resize();
  window.addEventListener("resize", resize);

  let start = performance.now();

  const draw = (now) => {
    const t = (now - start) / 1000;
    context.clearRect(0, 0, width, height);

    for (let layer = 0; layer < 5; layer += 1) {
      context.beginPath();
      for (let x = -20; x <= width + 20; x += 8) {
        const y =
          height * 0.42 +
          layer * 26 +
          Math.sin(x * 0.018 + t * 0.9 + layer) * (18 + amp * 9) +
          Math.cos(x * 0.009 - t * 0.6) * 14;
        if (x === -20) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = `hsla(${hue + layer * 14}, 90%, 66%, ${0.2 - layer * 0.025})`;
      context.lineWidth = 1;
      context.stroke();
    }

    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
}

async function initFabric() {
  if (!canvas) return;
  applyHue();

  try {
    const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js");

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070f, 0.08);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.35, 7.2);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const group = new THREE.Group();
    group.rotation.x = -0.18;
    group.rotation.z = -0.26;
    scene.add(group);

    const geometry = new THREE.PlaneGeometry(7.7, 5.2, 80, 54);
    geometry.rotateX(-Math.PI / 2.65);

    const clothMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(hue / 360, 0.92, 0.62),
      wireframe: true,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
    });

    const cloth = new THREE.Mesh(geometry, clothMaterial);
    group.add(cloth);

    const pointMaterial = new THREE.PointsMaterial({
      color: new THREE.Color().setHSL((hue + 42) / 360, 0.9, 0.72),
      size: 0.026,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, pointMaterial);
    group.add(points);

    const particleGeometry = new THREE.BufferGeometry();
    const particleCount = 260;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
    }
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const particleMaterial = new THREE.PointsMaterial({
      color: new THREE.Color().setHSL(258 / 360, 0.9, 0.72),
      size: 0.018,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const particleField = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleField);

    const pointer = { x: 0, y: 0 };
    const visual = canvas.parentElement;

    visual?.addEventListener("pointermove", (event) => {
      const rect = visual.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    });

    visual?.addEventListener("pointerleave", () => {
      pointer.x = 0;
      pointer.y = 0;
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    if (visual) resizeObserver.observe(visual);

    const clock = new THREE.Clock();
    const positionAttribute = geometry.attributes.position;
    let frameTime = 0;

    const animate = () => {
      requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      frameTime += 0.016;

      for (let i = 0; i < positionAttribute.count; i += 1) {
        const x = positionAttribute.getX(i);
        const y = positionAttribute.getY(i);
        const wave =
          Math.sin(x * 1.35 + elapsed * speed) * 0.34 * amp +
          Math.cos(y * 1.7 + elapsed * 0.72 * speed) * 0.2 * amp +
          Math.sin((x + y) * 0.82 + elapsed * 0.45 * speed) * 0.08 * amp;
        positionAttribute.setZ(i, wave);
      }
      positionAttribute.needsUpdate = true;

      group.rotation.y = Math.sin(elapsed * 0.24) * 0.2 + pointer.x * 0.18;
      group.rotation.x = -0.18 + pointer.y * 0.11;
      group.rotation.z = -0.26 + Math.sin(elapsed * 0.18) * 0.035;
      particleField.rotation.y = elapsed * 0.022;
      particleField.rotation.x = Math.sin(elapsed * 0.08) * 0.05;

      const currentHue = hue / 360;
      clothMaterial.color.setHSL(currentHue, 0.92, 0.62);
      pointMaterial.color.setHSL((hue + 42) / 360, 0.9, 0.72);

      renderer.render(scene, camera);
    };

    animate();
  } catch (error) {
    startFallbackFabric();
  }
}

initFabric();
