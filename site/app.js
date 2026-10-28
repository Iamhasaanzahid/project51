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

const scrollBar = document.querySelector("#scroll-bar");

function updateScrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const progress = max > 0 ? Math.min((window.scrollY / max) * 100, 100) : 0;
  if (scrollBar) scrollBar.style.width = `${progress}%`;
}

window.addEventListener(
  "scroll",
  () => {
    nav?.classList.toggle("scrolled", window.scrollY > 24);
    updateScrollProgress();
  },
  { passive: true }
);

updateScrollProgress();

const consoleTabs = document.querySelectorAll(".console-tab");
const consolePanels = document.querySelectorAll(".console-panel");

consoleTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.panel;
    consoleTabs.forEach((item) => item.classList.toggle("active", item === tab));
    consolePanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === target));
  });
});

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

(() => {
  const fabricFileInput = document.querySelector("#fabric-file");
  const fabricDropZone = document.querySelector("#drop-zone");
  const fabricPreview = document.querySelector("#fabric-preview");
  const fabricImage = document.querySelector("#fabric-image");
  const fabricVideo = document.querySelector("#fabric-video");
  const fabricPreviewName = document.querySelector("#preview-name");
  const fabricAnalyzeBtn = document.querySelector("#analyze-btn");
  const fabricRemoveBtn = document.querySelector("#remove-file");
  const fabricChangeBtn = document.querySelector("#change-file");
  const fabricStatus = document.querySelector("#fabric-status");
  const fabricBriefEmpty = document.querySelector("#brief-empty");
  const fabricBriefContent = document.querySelector("#brief-content");
  const fabricBriefTitle = document.querySelector("#brief-title");
  const fabricBriefTag = document.querySelector("#brief-tag");
  const fabricBriefSummary = document.querySelector("#brief-summary");
  const fabricPalette = document.querySelector("#palette");
  const fabricFacts = document.querySelector("#fabric-facts");
  const fabricGarmentGrid = document.querySelector("#garment-grid");
  const fabricArticle = document.querySelector("#fabric-article");
  const fabricCopyBtn = document.querySelector("#copy-brief");
  const fabricSampleButtons = document.querySelectorAll("[data-sample]");

  if (!fabricDropZone || !fabricFileInput) return;

  const NAMED_COLORS = [
    ["Ink", 17, 24, 39], ["Charcoal", 55, 65, 81], ["Graphite", 71, 85, 105],
    ["Slate", 100, 116, 139], ["Stone", 168, 162, 158], ["Sand", 214, 199, 161],
    ["Oat", 231, 219, 195], ["Ivory", 248, 245, 235], ["Camel", 176, 137, 104],
    ["Chestnut", 146, 94, 64], ["Rust", 180, 83, 9], ["Terracotta", 194, 65, 12],
    ["Burgundy", 127, 29, 29], ["Rose", 225, 29, 72], ["Coral", 251, 113, 133],
    ["Blush", 251, 207, 232], ["Indigo", 55, 48, 163], ["Cobalt", 29, 78, 216],
    ["Denim", 47, 79, 122], ["Navy", 30, 58, 95], ["Steel", 92, 124, 158],
    ["Chambray", 107, 141, 181], ["Sky", 56, 189, 248], ["Teal", 15, 118, 110],
    ["Sage", 132, 169, 140], ["Olive", 77, 124, 15], ["Forest", 20, 83, 45],
    ["Lime", 163, 230, 53], ["Mustard", 202, 138, 4], ["Violet", 124, 58, 237],
    ["Plum", 107, 33, 168], ["Aubergine", 59, 31, 67], ["Wine", 76, 29, 58],
    ["Mauve", 192, 132, 252], ["Black", 2, 6, 23], ["White", 248, 250, 252],
    ["Silver", 203, 213, 225], ["Mocha", 120, 83, 66],
  ];

  const GARMENT_PATHS = {
    suit: "M31 23 L42 13 L58 13 L69 23 L82 40 L73 49 L71 105 L29 105 L27 49 L18 40 Z",
    blazer: "M29 23 L40 14 L60 14 L71 23 L84 44 L74 51 L72 105 L28 105 L26 51 L16 44 Z",
    dress: "M38 15 L43 33 L39 50 L23 105 L77 105 L61 50 L57 33 L62 15 Z",
    shirt: "M34 21 L44 13 L56 13 L66 21 L82 31 L74 45 L69 40 L69 105 L31 105 L31 40 L26 45 L18 31 Z",
    jacket: "M28 23 L39 14 L61 14 L72 23 L85 47 L74 53 L71 105 L29 105 L26 53 L15 47 Z",
    trousers: "M34 17 H66 L73 105 H55 L50 55 L45 105 H27 Z",
    skirt: "M36 17 H64 L79 105 H21 Z",
  };

  const GARMENT_LABELS = {
    suit: "Tailored suit",
    blazer: "Soft blazer",
    dress: "Dress",
    shirt: "Relaxed shirt",
    jacket: "Statement jacket",
    trousers: "Wide-leg trousers",
    skirt: "Skirt",
  };

  const GARMENT_DETAILS = {
    suit: '<path d="M42 13 L50 44 L58 13" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.1" stroke-linecap="round"/><path d="M50 44 V105" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1"/><circle cx="50" cy="61" r="1.5" fill="rgba(255,255,255,.55)"/><circle cx="50" cy="72" r="1.5" fill="rgba(255,255,255,.55)"/>',
    blazer: '<path d="M40 14 L50 42 L60 14" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.1" stroke-linecap="round"/><path d="M50 42 V105" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1"/>',
    dress: '<path d="M39 50 H61" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="1.1"/><path d="M50 15 V50" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>',
    shirt: '<path d="M50 13 V105" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1"/><circle cx="50" cy="46" r="1.4" fill="rgba(255,255,255,.55)"/><circle cx="50" cy="60" r="1.4" fill="rgba(255,255,255,.55)"/><circle cx="50" cy="74" r="1.4" fill="rgba(255,255,255,.55)"/>',
    jacket: '<path d="M50 14 V105" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1"/><path d="M41 14 L50 38 L59 14" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1"/>',
    trousers: '<path d="M50 17 V55" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1"/><path d="M37 28 H63" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1"/>',
    skirt: '<path d="M42 17 L38 105 M58 17 L62 105" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1"/>',
  };

  const SAMPLES = {
    linen: {
      name: "Linen sample",
      base: "#d8c6a3",
      light: "rgba(255, 248, 230, 0.5)",
      dark: "rgba(120, 90, 50, 0.2)",
      line: "rgba(110, 80, 40, 0.18)",
    },
    denim: {
      name: "Indigo denim sample",
      base: "#243a5e",
      light: "rgba(100, 140, 190, 0.34)",
      dark: "rgba(5, 15, 35, 0.42)",
      line: "rgba(178, 212, 255, 0.5)",
    },
    silk: {
      name: "Silk sample",
      base: "#2b1836",
      light: "rgba(150, 80, 140, 0.28)",
      dark: "rgba(10, 5, 20, 0.4)",
      line: "rgba(255, 180, 240, 0.22)",
    },
  };

  let fabricSource = null;
  let fabricLastBrief = null;
  let fabricAnalyzing = false;

  function setFabricStatus(message, isError = false) {
    if (!fabricStatus) return;
    fabricStatus.textContent = message;
    fabricStatus.classList.toggle("error", Boolean(isError));
  }

  function setAnalyzeLabel(label) {
    if (!fabricAnalyzeBtn) return;
    fabricAnalyzeBtn.innerHTML = `${label} <span aria-hidden="true">✦</span>`;
  }

  function waitForMedia(element, eventName, timeout = 12000) {
    return new Promise((resolve, reject) => {
      let timer = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        element.removeEventListener(eventName, onReady);
        element.removeEventListener("error", onError);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`media ${eventName} failed`));
      };
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`media ${eventName} timed out`));
      }, timeout);
      element.addEventListener(eventName, onReady, { once: true });
      element.addEventListener("error", onError, { once: true });
    });
  }

  function stopVideo() {
    if (!fabricVideo) return;
    fabricVideo.pause();
    fabricVideo.removeAttribute("src");
    fabricVideo.load();
  }

  function releaseFabricSource() {
    if (fabricSource?.objectUrl) URL.revokeObjectURL(fabricSource.objectUrl);
    stopVideo();
    fabricSource = null;
  }

  function resetBrief() {
    if (fabricBriefEmpty) fabricBriefEmpty.hidden = false;
    if (fabricBriefContent) fabricBriefContent.hidden = true;
    fabricLastBrief = null;
  }

  function resetStudio() {
    releaseFabricSource();
    resetBrief();
    fabricPreview?.classList.remove("is-scanning");
    if (fabricPreview) fabricPreview.hidden = true;
    if (fabricDropZone) fabricDropZone.hidden = false;
    if (fabricImage) {
      fabricImage.hidden = true;
      fabricImage.removeAttribute("src");
    }
    if (fabricVideo) {
      fabricVideo.hidden = true;
      fabricVideo.removeAttribute("src");
    }
    if (fabricPreviewName) fabricPreviewName.textContent = "fabric.jpg";
    if (fabricAnalyzeBtn) {
      fabricAnalyzeBtn.disabled = true;
      setAnalyzeLabel("Generate fashion brief");
    }
    setFabricStatus("");
  }

  function clamp(value, min = 0, max = 255) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  function toHex(color) {
    return `#${[color.r, color.g, color.b]
      .map((value) => clamp(value).toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function rgbDistance(a, b) {
    return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  }

  function nearestColorName(color) {
    let best = NAMED_COLORS[0];
    let bestDistance = Infinity;
    NAMED_COLORS.forEach((entry) => {
      const distance = Math.hypot(color.r - entry[1], color.g - entry[2], color.b - entry[3]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entry;
      }
    });
    return best[0];
  }

  function shiftColor(color, amount) {
    return {
      r: clamp(color.r + amount),
      g: clamp(color.g + amount),
      b: clamp(color.b + amount),
    };
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character]));
  }

  function analyzeCanvas(context, width, height) {
    const { data } = context.getImageData(0, 0, width, height);
    const buckets = new Map();
    const step = Math.max(2, Math.round(Math.max(width, height) / 150));
    let count = 0;
    let lumSum = 0;
    let lumSq = 0;
    let satSum = 0;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const index = (y * width + x) * 4;
        if (data[index + 3] < 160) continue;

        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const saturation = max === 0 ? 0 : (max - min) / max;

        count += 1;
        lumSum += luminance;
        lumSq += luminance * luminance;
        satSum += saturation;

        const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
        const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        bucket.n += 1;
        buckets.set(key, bucket);
      }
    }

    if (!count) throw new Error("empty image");

    const sorted = [...buckets.values()]
      .map((bucket) => ({
        r: Math.round(bucket.r / bucket.n),
        g: Math.round(bucket.g / bucket.n),
        b: Math.round(bucket.b / bucket.n),
        n: bucket.n,
      }))
      .sort((a, b) => b.n - a.n);

    const palette = [];
    for (const color of sorted) {
      if (palette.length >= 5) break;
      if (palette.every((existing) => rgbDistance(existing, color) > 42)) {
        palette.push({ r: color.r, g: color.g, b: color.b });
      }
    }

    if (palette.length === 1) {
      palette.push(shiftColor(palette[0], 34), shiftColor(palette[0], -34));
    }

    const averageLum = lumSum / count;
    const variance = Math.max(lumSq / count - averageLum * averageLum, 0);
    const contrast = Math.sqrt(variance);
    const saturation = satSum / count;
    const pattern = contrast > 42 ? "Patterned" : contrast > 10 ? "Woven texture" : "Solid";
    const tone = averageLum > 198 ? "Light" : averageLum > 130 ? "Mid-tone" : averageLum > 76 ? "Deep" : "Dark";
    const drape = contrast > 26
      ? "Structured"
      : contrast > 9 && averageLum < 120 && saturation < 0.56
        ? "Structured"
        : saturation > 0.5 && averageLum > 80
          ? "Fluid"
          : "Soft";
    const weight = drape === "Structured" ? "Mid-weight" : drape === "Fluid" ? "Lightweight" : "Soft mid-weight";

    const usedNames = new Set();
    const mappedPalette = palette.map((color) => {
      let name = nearestColorName(color);
      if (usedNames.has(name)) name = `${name} tone`;
      usedNames.add(name);
      return { ...color, hex: toHex(color), name };
    });

    return { palette: mappedPalette, contrast, saturation, averageLum, pattern, tone, drape, weight };
  }

  function readFabricPixels(source) {
    const element = source.element;
    const width = element.videoWidth || element.naturalWidth || element.width || 0;
    const height = element.videoHeight || element.naturalHeight || element.height || 0;

    if (!width || !height) throw new Error("no media dimensions");
    if (source.kind === "video" && element.readyState < 2) throw new Error("video frame is not ready");

    const maxSide = 340;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("canvas is unavailable");
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    return analyzeCanvas(context, canvas.width, canvas.height);
  }

  function buildGarments(analysis) {
    const names = analysis.palette.map((color) => color.name.toLowerCase());
    const primary = names[0] || "tonal";
    const secondary = names[1] || primary;
    const accent = names[2] || secondary;
    const fluid = analysis.drape === "Fluid";
    const structured = analysis.drape === "Structured";

    return [
      {
        id: "suit",
        name: "Tailored suit",
        note: `A ${primary} two-piece with a clean shoulder; let the ${analysis.pattern.toLowerCase()} surface lead.`,
      },
      {
        id: "blazer",
        name: "Soft blazer",
        note: `Relaxed ${primary} tailoring, easy over ${secondary} knitwear or a simple tank.`,
      },
      {
        id: "dress",
        name: fluid ? "Column dress" : "A-line dress",
        note: fluid
          ? `A bias-cut ${primary} column that moves with the ${analysis.drape.toLowerCase()} drape.`
          : `A gently shaped ${primary} dress with ${accent} accents at the waist or hem.`,
      },
      {
        id: "shirt",
        name: "Relaxed shirt",
        note: `A ${secondary} shirt with a soft collar — the easiest way to wear the cloth every day.`,
      },
      {
        id: "jacket",
        name: structured ? "Cropped jacket" : "Statement jacket",
        note: `A ${primary} jacket that turns the ${analysis.pattern.toLowerCase()} surface into the focal point.`,
      },
      {
        id: "trousers",
        name: "Wide-leg trousers",
        note: `High-waisted ${accent} trousers with a clean crease and an easy, long line.`,
      },
    ];
  }

  function buildArticle(analysis, garments, title) {
    const names = analysis.palette.map((color) => color.name.toLowerCase());
    const primary = names[0] || "tonal";
    const secondary = names[1] || primary;
    const accent = names[2] || secondary;
    const pattern = analysis.pattern.toLowerCase();
    const patternLabel = pattern === "woven texture" ? "woven-texture" : pattern;
    const surfaceWord = pattern === "solid" ? "surface" : pattern === "patterned" ? "motif" : "texture";
    const paragraphs = [
      `This ${analysis.tone.toLowerCase()} ${patternLabel} cloth reads as a ${analysis.drape.toLowerCase()} fabric with a ${analysis.weight.toLowerCase()} body. Its palette moves from ${primary} to ${secondary}${names[2] ? ` and ${accent}` : ""}, which gives the collection a ${analysis.saturation > 0.42 ? "confident, saturated" : "quiet, tonal"} direction.`,
      `The most direct first piece is a ${garments[0].name.toLowerCase()}. ${garments[0].note} ${garments[2].name} keeps the same ${surfaceWord} in a softer silhouette, while a ${garments[4].name.toLowerCase()} turns the cloth into an outerwear statement.`,
      `For the rest of the wardrobe, ${garments[1].name.toLowerCase()}, ${garments[3].name.toLowerCase()} and ${garments[5].name.toLowerCase()} round out the board. The through-line is ${analysis.drape === "Structured" ? "clean lines and a little structure" : "soft volume and an easy hand-feel"} — the fabric should stay the loudest thing in the look.`,
    ];
    const note = `Styling note. Keep the palette close: ${primary} with ${secondary}${names[2] ? ` and a small ${accent} accent` : ""}. Let one silhouette carry the texture; everything else can stay quiet.`;
    return { heading: `${title}: the story`, paragraphs, note };
  }

  function buildBrief(analysis, sourceName) {
    const primary = analysis.palette[0];
    const secondary = analysis.palette[1] || primary;
    const title = `${primary.name} ${analysis.pattern === "Solid" ? "minimal" : analysis.pattern === "Patterned" ? "statement" : "textured"} edit`;
    const summary = `A ${analysis.tone.toLowerCase()}, ${analysis.pattern.toLowerCase()} fabric with a ${analysis.drape.toLowerCase()} hand-feel. ${primary.name} leads the palette, with ${secondary.name.toLowerCase()} tones underneath. The studio reads it as a ${analysis.weight.toLowerCase()} cloth for ${analysis.drape === "Structured" ? "clean tailoring and outerwear" : analysis.drape === "Fluid" ? "soft dresses, shirts and fluid separates" : "easy separates and relaxed tailoring"}.`;
    const garments = buildGarments(analysis);
    const article = buildArticle(analysis, garments, title);
    const paletteText = analysis.palette.map((color) => `${color.name} ${color.hex}`).join(", ");
    const plain = [
      `AI FABRIC BRIEF — ${title}`,
      sourceName ? `Source: ${sourceName}` : "",
      summary,
      `Palette: ${paletteText}`,
      `Tone: ${analysis.tone} | Surface: ${analysis.pattern} | Drape: ${analysis.drape} | Weight: ${analysis.weight}`,
      "Garment directions:",
      ...garments.map((garment) => `- ${garment.name}: ${garment.note}`),
      article.heading,
      ...article.paragraphs,
      article.note,
    ].filter(Boolean).join("\n\n");

    return {
      title,
      summary,
      palette: analysis.palette,
      pattern: analysis.pattern,
      facts: [
        { label: "Tone", value: analysis.tone },
        { label: "Surface", value: analysis.pattern },
        { label: "Drape", value: `${analysis.drape} hand-feel` },
        { label: "Suggested weight", value: analysis.weight },
      ],
      garments,
      article,
      plain,
      tag: `${analysis.palette.length} colour read`,
    };
  }

  function garmentSvg(id, palette, pattern) {
    const base = palette[0]?.hex || "#334155";
    const accent = palette[1]?.hex || base;
    const highlight = palette[2]?.hex || accent;
    const uid = `fabric-${id}-${Math.random().toString(36).slice(2, 8)}`;
    const solid = pattern === "Solid";
    const defs = solid
      ? `<linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${highlight}"/><stop offset="0.55" stop-color="${base}"/><stop offset="1" stop-color="${accent}"/></linearGradient>`
      : `<pattern id="${uid}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${base}"/><path d="M0 0V7" stroke="${accent}" stroke-opacity=".55" stroke-width="1.2"/><path d="M0 0H7" stroke="${highlight}" stroke-opacity=".18" stroke-width="1"/></pattern>`;
    const path = GARMENT_PATHS[id] || GARMENT_PATHS.dress;
    const details = GARMENT_DETAILS[id] || "";
    const label = GARMENT_LABELS[id] || id;
    return `<svg viewBox="0 0 100 120" role="img" aria-label="${label} concept"><defs>${defs}</defs><path d="${path}" fill="url(#${uid})" stroke="rgba(255,255,255,.28)" stroke-width="1.2" stroke-linejoin="round"/>${details}</svg>`;
  }

  function renderBrief(brief) {
    if (!fabricBriefContent) return;
    fabricBriefEmpty.hidden = true;
    fabricBriefContent.hidden = false;
    fabricBriefTitle.textContent = brief.title;
    fabricBriefTag.textContent = brief.tag;
    fabricBriefSummary.textContent = brief.summary;
    fabricPalette.innerHTML = brief.palette.map((color) => `<span class="swatch"><i style="background:${color.hex}"></i>${escapeHtml(color.name)} <span>${color.hex}</span></span>`).join("");
    fabricFacts.innerHTML = brief.facts.map((fact) => `<div class="fact"><span>${escapeHtml(fact.label)}</span><strong>${escapeHtml(fact.value)}</strong></div>`).join("");
    fabricGarmentGrid.innerHTML = brief.garments.map((garment) => `<article class="garment-card"><div class="garment-visual">${garmentSvg(garment.id, brief.palette, brief.pattern)}</div><div class="garment-copy"><h4>${escapeHtml(garment.name)}</h4><p>${escapeHtml(garment.note)}</p></div></article>`).join("");
    fabricArticle.innerHTML = `<h3>${escapeHtml(brief.article.heading)}</h3>${brief.article.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}<div class="styling-note">${escapeHtml(brief.article.note)}</div>`;
  }

  async function analyzeFabric() {
    if (!fabricSource || fabricAnalyzing) return;
    fabricAnalyzing = true;
    if (fabricAnalyzeBtn) fabricAnalyzeBtn.disabled = true;
    setAnalyzeLabel("Reading fabric…");
    setFabricStatus("Reading colour, surface and drape…");
    fabricPreview?.classList.add("is-scanning");

    try {
      await new Promise((resolve) => setTimeout(resolve, 850));
      const analysis = readFabricPixels(fabricSource);
      const brief = buildBrief(analysis, fabricSource.name);
      renderBrief(brief);
      fabricLastBrief = brief;
      setFabricStatus("Brief ready — six garment directions and a styling article.");
    } catch (error) {
      console.error(error);
      setFabricStatus("I could not read that frame. Try a clear photo or another video.", true);
    } finally {
      fabricAnalyzing = false;
      if (fabricAnalyzeBtn) fabricAnalyzeBtn.disabled = !fabricSource;
      setAnalyzeLabel("Generate fashion brief");
      fabricPreview?.classList.remove("is-scanning");
    }
  }

  async function loadFabricFile(file) {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      setFabricStatus("Please choose a photo or a short video.", true);
      return;
    }
    if (file.size > 80 * 1024 * 1024) {
      setFabricStatus("Please choose a file under 80 MB.", true);
      return;
    }

    releaseFabricSource();
    resetBrief();
    if (fabricPreview) fabricPreview.hidden = true;
    if (fabricDropZone) fabricDropZone.hidden = false;
    setFabricStatus("Loading your fabric…");

    const objectUrl = URL.createObjectURL(file);
    try {
      if (isVideo) {
        if (fabricImage) fabricImage.hidden = true;
        if (fabricVideo) {
          fabricVideo.hidden = false;
          const ready = waitForMedia(fabricVideo, "loadeddata");
          fabricVideo.src = objectUrl;
          fabricVideo.load();
          await ready;
          if (Number.isFinite(fabricVideo.duration) && fabricVideo.duration > 0) {
            fabricVideo.currentTime = Math.min(0.2, Math.max(0.01, fabricVideo.duration * 0.25));
            await waitForMedia(fabricVideo, "seeked", 4000).catch(() => undefined);
          }
          fabricVideo.play().catch(() => undefined);
        }
        fabricSource = { kind: "video", element: fabricVideo, name: file.name, objectUrl };
      } else {
        if (fabricVideo) fabricVideo.hidden = true;
        if (fabricImage) {
          fabricImage.hidden = false;
          const ready = waitForMedia(fabricImage, "load");
          fabricImage.src = objectUrl;
          await ready;
        }
        fabricSource = { kind: "image", element: fabricImage, name: file.name, objectUrl };
      }

      if (fabricPreviewName) fabricPreviewName.textContent = file.name;
      if (fabricPreview) fabricPreview.hidden = false;
      if (fabricDropZone) fabricDropZone.hidden = true;
      if (fabricAnalyzeBtn) fabricAnalyzeBtn.disabled = false;
      await analyzeFabric();
    } catch (error) {
      console.error(error);
      URL.revokeObjectURL(objectUrl);
      releaseFabricSource();
      if (fabricPreview) fabricPreview.hidden = true;
      if (fabricDropZone) fabricDropZone.hidden = false;
      if (fabricAnalyzeBtn) fabricAnalyzeBtn.disabled = true;
      setFabricStatus("That file could not be read. Try a JPG, PNG, WEBP or a short MP4/WEBM.", true);
    }
  }

  function createSampleFabric(kind) {
    const sample = SAMPLES[kind] || SAMPLES.linen;
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    if (!context) return { dataUrl: "", name: sample.name };

    context.fillStyle = sample.base;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const wash = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    wash.addColorStop(0, sample.light);
    wash.addColorStop(1, sample.dark);
    context.globalAlpha = 0.7;
    context.fillStyle = wash;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalAlpha = 1;

    context.save();
    if (kind === "denim") {
      for (let x = -canvas.height; x < canvas.width; x += 7) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x + canvas.height, canvas.height);
        context.strokeStyle = sample.line;
        context.lineWidth = 1.6;
        context.stroke();
      }
      for (let y = 0; y < canvas.height; y += 9) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvas.width, y);
        context.strokeStyle = "rgba(160, 200, 255, 0.11)";
        context.lineWidth = 1;
        context.stroke();
      }
    } else if (kind === "silk") {
      for (let band = 0; band < 6; band += 1) {
        context.beginPath();
        for (let x = 0; x <= canvas.width; x += 12) {
          const y = 72 + band * 64 + Math.sin(x * 0.012 + band) * 18;
          if (x === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.strokeStyle = sample.line;
        context.lineWidth = 1.2;
        context.stroke();
      }
    } else {
      for (let y = 0; y < canvas.height; y += 5) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvas.width, y + Math.sin(y * 0.12) * 2);
        context.strokeStyle = sample.line;
        context.lineWidth = 1;
        context.stroke();
      }
      for (let x = 0; x < canvas.width; x += 5) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x + Math.sin(x * 0.15) * 2, canvas.height);
        context.strokeStyle = sample.line;
        context.lineWidth = 1;
        context.stroke();
      }
    }
    context.restore();

    for (let i = 0; i < 900; i += 1) {
      context.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
      context.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1.5, 1.5);
    }

    return { dataUrl: canvas.toDataURL("image/png"), name: sample.name };
  }

  async function loadSample(kind) {
    if (fabricAnalyzing) return;
    const sample = createSampleFabric(kind);
    if (!sample.dataUrl) {
      setFabricStatus("The sample could not be prepared. Please upload a photo instead.", true);
      return;
    }

    releaseFabricSource();
    resetBrief();
    if (fabricVideo) fabricVideo.hidden = true;
    if (fabricImage) {
      fabricImage.hidden = false;
      const ready = waitForMedia(fabricImage, "load");
      fabricImage.src = sample.dataUrl;
      await ready;
    }
    fabricSource = { kind: "image", element: fabricImage, name: sample.name, objectUrl: null };
    if (fabricPreviewName) fabricPreviewName.textContent = sample.name;
    if (fabricPreview) fabricPreview.hidden = false;
    if (fabricDropZone) fabricDropZone.hidden = true;
    if (fabricAnalyzeBtn) fabricAnalyzeBtn.disabled = false;
    await analyzeFabric();
  }

  fabricDropZone.addEventListener("click", () => fabricFileInput.click());
  fabricDropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fabricFileInput.click();
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    fabricDropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      fabricDropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    fabricDropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      fabricDropZone.classList.remove("dragover");
    });
  });

  fabricDropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) void loadFabricFile(file);
  });

  fabricFileInput.addEventListener("change", () => {
    const file = fabricFileInput.files?.[0];
    fabricFileInput.value = "";
    if (file) void loadFabricFile(file);
  });

  fabricChangeBtn?.addEventListener("click", () => fabricFileInput.click());
  fabricRemoveBtn?.addEventListener("click", resetStudio);
  fabricAnalyzeBtn?.addEventListener("click", () => void analyzeFabric());

  fabricSampleButtons.forEach((button) => {
    button.addEventListener("click", () => void loadSample(button.dataset.sample));
  });

  fabricCopyBtn?.addEventListener("click", async () => {
    if (!fabricLastBrief) return;
    try {
      await navigator.clipboard.writeText(fabricLastBrief.plain);
      fabricCopyBtn.textContent = "Copied ✓";
      setTimeout(() => {
        fabricCopyBtn.textContent = "Copy brief";
      }, 1600);
    } catch {
      setFabricStatus("Clipboard was blocked. Select the brief text to copy it manually.", true);
    }
  });
})();
