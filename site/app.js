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
  const fabricLookSvgWrap = document.querySelector("#look-svg-wrap");
  const fabricLookTag = document.querySelector("#look-tag");
  const fabricLookTitle = document.querySelector("#look-title");
  const fabricLookNote = document.querySelector("#look-note");
  const fabricLookPills = document.querySelector("#look-pills");
  const fabricLookModelSwitch = document.querySelector("#look-model-switch");
  const fabricLookCollectionSwitch = document.querySelector("#look-collection-switch");
  const fabricLookOccasion = document.querySelector("#look-occasion");
  const fabricLookFinish = document.querySelector("#look-finish");
  const fabricLookColorway = document.querySelector("#look-colorway");
  const fabricDesiGrid = document.querySelector("#desi-grid");
  const fabricSaveLookBtn = document.querySelector("#save-look");
  const fabricSurpriseBtn = document.querySelector("#surprise-look");

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
    "co-ord": "M34 21 L44 13 L56 13 L66 21 L78 31 L72 44 L68 40 L68 70 L32 70 L32 40 L28 44 L22 31 Z M36 74 H64 L70 105 H54 L50 88 L46 105 H30 Z",
    "w-kurta": "M34 20 L42 13 L58 13 L66 20 L79 32 L73 43 L68 39 L68 86 L32 86 L32 39 L27 43 L21 32 Z M37 89 H63 L68 113 H54 L50 100 L46 113 H32 Z",
    "w-anarkali": "M38 14 L44 28 L34 40 L20 113 L80 113 L66 40 L56 28 L62 14 Z",
    "w-salwar": "M34 20 L42 13 L58 13 L66 20 L78 32 L72 43 L68 39 L68 82 L32 82 L32 39 L28 43 L22 32 Z M36 85 H64 L72 113 H54 L50 98 L46 113 H28 Z",
    "w-lehenga": "M38 17 L44 30 L56 30 L62 17 L58 42 L42 42 Z M40 46 H60 L82 113 H18 Z",
    "w-saree": "M38 14 Q50 22 62 14 L66 32 L58 44 L80 113 H20 L42 44 L34 32 Z M62 20 Q82 38 74 78 L66 74 Q72 44 56 28 Z",
    "w-sharara": "M34 20 L42 13 L58 13 L66 20 L76 32 L70 43 L68 39 L68 66 L32 66 L32 39 L30 43 L24 32 Z M36 70 H64 L84 113 H54 L50 86 L46 113 H16 Z",
    "m-kurta": "M34 20 L42 13 L58 13 L66 20 L79 32 L73 43 L68 39 L68 88 L32 88 L32 39 L27 43 L21 32 Z M38 92 H62 L68 113 H54 L50 100 L46 113 H32 Z",
    "m-shalwar": "M34 20 L42 13 L58 13 L66 20 L78 32 L72 43 L68 39 L68 84 L32 84 L32 39 L28 43 L22 32 Z M36 87 H64 L74 113 H54 L50 98 L46 113 H26 Z",
    "m-sherwani": "M34 18 L42 12 L58 12 L66 18 L80 34 L72 44 L68 40 L68 98 L32 98 L32 40 L28 44 L20 34 Z M38 100 H62 L66 113 H54 L50 104 L46 113 H34 Z",
    "m-waistcoat": "M38 17 L46 13 L54 13 L62 17 L64 74 L56 78 L50 70 L44 78 L36 74 Z",
  };

  const GARMENT_LABELS = {
    suit: "Tailored suit",
    blazer: "Soft blazer",
    dress: "Dress",
    shirt: "Relaxed shirt",
    jacket: "Statement jacket",
    trousers: "Wide-leg trousers",
    skirt: "Bias skirt",
    "co-ord": "Co-ord set",
    "w-kurta": "Straight kurta",
    "w-anarkali": "Anarkali",
    "w-salwar": "Salwar kameez",
    "w-lehenga": "Lehenga choli",
    "w-saree": "Saree drape",
    "w-sharara": "Sharara set",
    "m-kurta": "Men's kurta",
    "m-shalwar": "Shalwar kameez",
    "m-sherwani": "Sherwani",
    "m-waistcoat": "Nehru waistcoat",
  };

  const GARMENT_DETAILS = {
    suit: '<path d="M42 13 L50 44 L58 13" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.1" stroke-linecap="round"/><path d="M50 44 V105" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1"/><circle cx="50" cy="61" r="1.5" fill="rgba(255,255,255,.55)"/><circle cx="50" cy="72" r="1.5" fill="rgba(255,255,255,.55)"/>',
    blazer: '<path d="M40 14 L50 42 L60 14" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.1" stroke-linecap="round"/><path d="M50 42 V105" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1"/>',
    dress: '<path d="M39 50 H61" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="1.1"/><path d="M50 15 V50" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>',
    shirt: '<path d="M50 13 V105" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1"/><circle cx="50" cy="46" r="1.4" fill="rgba(255,255,255,.55)"/><circle cx="50" cy="60" r="1.4" fill="rgba(255,255,255,.55)"/><circle cx="50" cy="74" r="1.4" fill="rgba(255,255,255,.55)"/>',
    jacket: '<path d="M50 14 V105" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1"/><path d="M41 14 L50 38 L59 14" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1"/>',
    trousers: '<path d="M50 17 V55" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1"/><path d="M37 28 H63" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1"/>',
    skirt: '<path d="M42 17 L38 105 M58 17 L62 105" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1"/>',
    "co-ord": '<path d="M50 13 V70" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1"/><path d="M34 74 H66" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1"/>',
    "w-kurta": '<path d="M42 13 L50 34 L58 13" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.1" stroke-linecap="round"/><path d="M50 34 V86" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1"/><path d="M34 82 H66" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.4"/>',
    "w-anarkali": '<path d="M42 40 H58" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="1.1"/><path d="M50 14 V113" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/><path d="M24 108 H76" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1.2"/>',
    "w-salwar": '<path d="M42 13 L50 32 L58 13" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.1" stroke-linecap="round"/><path d="M50 32 V82" fill="none" stroke="rgba(255,255,255,.24)" stroke-width="1"/><path d="M34 78 H66" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.2"/>',
    "w-lehenga": '<path d="M40 46 H60" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.3"/><path d="M50 46 L38 113 M50 46 L62 113" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>',
    "w-saree": '<path d="M50 14 Q64 50 56 113" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1.1"/><path d="M40 44 L32 113" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1"/>',
    "w-sharara": '<path d="M42 13 L50 32 L58 13" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.1" stroke-linecap="round"/><path d="M36 70 H64" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.2"/><path d="M46 70 L36 113 M54 70 L64 113" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1"/>',
    "m-kurta": '<path d="M42 13 L50 24 L58 13" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.1" stroke-linecap="round"/><path d="M50 24 V88" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1"/><path d="M34 84 H66" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1.2"/>',
    "m-shalwar": '<path d="M42 13 L50 24 L58 13" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.1" stroke-linecap="round"/><path d="M50 24 V84" fill="none" stroke="rgba(255,255,255,.24)" stroke-width="1"/><path d="M34 80 H66" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1.2"/>',
    "m-sherwani": '<path d="M42 12 L50 30 L58 12" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.1" stroke-linecap="round"/><path d="M50 30 V98" fill="none" stroke="rgba(255,255,255,.24)" stroke-width="1"/><circle cx="50" cy="46" r="1.4" fill="rgba(255,255,255,.58)"/><circle cx="50" cy="58" r="1.4" fill="rgba(255,255,255,.58)"/><circle cx="50" cy="70" r="1.4" fill="rgba(255,255,255,.58)"/>',
    "m-waistcoat": '<path d="M42 13 L50 34 L58 13" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.1" stroke-linecap="round"/><path d="M50 34 V72" fill="none" stroke="rgba(255,255,255,.24)" stroke-width="1"/><circle cx="50" cy="46" r="1.4" fill="rgba(255,255,255,.58)"/><circle cx="50" cy="56" r="1.4" fill="rgba(255,255,255,.58)"/>',
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
  let selectedLook = "suit";
  let lookModel = "her";
  let lookCollection = "modern";
  let lookOccasion = "office";
  let lookFinish = "tailored";
  let lookColorway = "detected";

  function setFabricStatus(message, isError = false) {
    if (!fabricStatus) return;
    fabricStatus.textContent = message;
    fabricStatus.classList.toggle("error", Boolean(isError));
  }

  function setAnalyzeLabel(label) {
    if (!fabricAnalyzeBtn) return;
    fabricAnalyzeBtn.innerHTML = `${label} <span aria-hidden="true">→</span>`;
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
    selectedLook = "suit";
    lookModel = "her";
    lookCollection = "modern";
    lookOccasion = "office";
    lookFinish = "tailored";
    lookColorway = "detected";
    syncLookSwitches();
    if (fabricLookOccasion) fabricLookOccasion.value = lookOccasion;
    if (fabricLookFinish) fabricLookFinish.value = lookFinish;
    if (fabricLookColorway) fabricLookColorway.value = lookColorway;
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
      setAnalyzeLabel("Read this cloth");
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

  function createFabricTexture(sourceCanvas) {
    const size = 144;
    const tile = document.createElement("canvas");
    tile.width = size;
    tile.height = size;
    const context = tile.getContext("2d");
    if (!context) return "";
    const side = Math.max(1, Math.min(sourceCanvas.width, sourceCanvas.height));
    const sx = Math.max(0, (sourceCanvas.width - side) / 2);
    const sy = Math.max(0, (sourceCanvas.height - side) / 2);
    context.drawImage(sourceCanvas, sx, sy, side, side, 0, 0, size, size);
    return tile.toDataURL("image/jpeg", 0.86);
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
    const analysis = analyzeCanvas(context, canvas.width, canvas.height);
    return { ...analysis, textureUrl: createFabricTexture(canvas) };
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
        note: `A ${primary} two-piece with a clean shoulder. Let the ${analysis.pattern.toLowerCase()} surface do the talking.`,
      },
      {
        id: "blazer",
        name: "Soft blazer",
        note: `A soft ${primary} blazer over ${secondary} knitwear — the kind of layer that makes a plain outfit feel considered.`,
      },
      {
        id: "dress",
        name: fluid ? "Column dress" : "A-line dress",
        note: fluid
          ? `A bias-cut ${primary} column that follows the ${analysis.drape.toLowerCase()} fall of the cloth.`
          : `A gently shaped ${primary} dress with ${accent} at the waist or hem.`,
      },
      {
        id: "shirt",
        name: "Relaxed shirt",
        note: `A ${secondary} shirt with a soft collar. The easiest way to wear this cloth every day.`,
      },
      {
        id: "jacket",
        name: structured ? "Cropped jacket" : "Statement jacket",
        note: `A ${primary} jacket that turns the ${analysis.pattern.toLowerCase()} surface into the focal point.`,
      },
      {
        id: "trousers",
        name: "Wide-leg trousers",
        note: `High-waisted ${accent} trousers with a clean crease and a long, easy leg.`,
      },
      {
        id: "skirt",
        name: "Bias skirt",
        note: `A ${primary} bias-cut skirt that lets the ${analysis.drape.toLowerCase()} fall do the work.`,
      },
      {
        id: "co-ord",
        name: "Co-ord set",
        note: `A matching ${primary} top and ${accent} trousers. One decision, done.`,
      },
    ];
  }

  function buildDesiGarments(analysis) {
    const names = analysis.palette.map((color) => color.name.toLowerCase());
    const primary = names[0] || "tonal";
    const secondary = names[1] || primary;
    const accent = names[2] || secondary;
    const surface = analysis.pattern.toLowerCase();

    return [
      {
        id: "w-kurta",
        name: "Straight kurta",
        gender: "her",
        note: `A clean ${primary} straight kurta with side slits, a matching churidar and a soft ${secondary} dupatta.`,
      },
      {
        id: "w-anarkali",
        name: "Anarkali",
        gender: "her",
        note: `A fitted ${primary} bodice that opens into a floor-sweeping anarkali flare; keep the dupatta light.`,
      },
      {
        id: "w-salwar",
        name: "Salwar kameez",
        gender: "her",
        note: `A ${primary} kameez over a relaxed salwar — the most wearable version of this ${surface} cloth.`,
      },
      {
        id: "w-lehenga",
        name: "Lehenga choli",
        gender: "her",
        note: `A ${primary} choli with a full lehenga skirt; let the ${surface} surface do the decoration.`,
      },
      {
        id: "w-saree",
        name: "Saree drape",
        gender: "her",
        note: `A pre-draped ${primary} saree with a ${secondary} blouse and a clean, modern pallu.`,
      },
      {
        id: "w-sharara",
        name: "Sharara set",
        gender: "her",
        note: `A short ${primary} kurta with wide sharara pants — festive, but easy to move in.`,
      },
      {
        id: "m-kurta",
        name: "Men's kurta",
        gender: "him",
        note: `A ${primary} men's kurta with a mandarin collar, side slits and a straight churidar.`,
      },
      {
        id: "m-shalwar",
        name: "Shalwar kameez",
        gender: "him",
        note: `A ${primary} shalwar kameez with a clean collar and a relaxed, traditional cut.`,
      },
      {
        id: "m-sherwani",
        name: "Sherwani",
        gender: "him",
        note: `A ${primary} sherwani with a structured front, tonal buttons and a narrow churidar.`,
      },
      {
        id: "m-waistcoat",
        name: "Nehru waistcoat",
        gender: "him",
        note: `A ${primary} Nehru waistcoat over a ${accent} kurta — an easy layer for weddings and evenings.`,
      },
    ];
  }

  function buildArticle(analysis, garments, title, desiGarments = []) {
    const names = analysis.palette.map((color) => color.name.toLowerCase());
    const primary = names[0] || "tonal";
    const secondary = names[1] || primary;
    const accent = names[2] || secondary;
    const pattern = analysis.pattern.toLowerCase();
    const patternLabel = pattern === "woven texture" ? "woven-texture" : pattern;
    const surfaceWord = pattern === "solid" ? "surface" : pattern === "patterned" ? "motif" : "texture";
    const paragraphs = [
      `This is a ${analysis.tone.toLowerCase()} ${patternLabel} cloth with a ${analysis.drape.toLowerCase()} fall and a ${analysis.weight.toLowerCase()} body. Up close, the palette runs from ${primary} to ${secondary}${names[2] ? `, with a little ${accent} underneath` : ""}. It is ${analysis.saturation > 0.42 ? "confident enough to carry a whole look" : "quiet enough to live with every day"}.`,
      `I would start with a ${garments[0].name.toLowerCase()}. ${garments[0].note} The ${garments[2].name.toLowerCase()} keeps the ${surfaceWord} in a softer shape, and the ${garments[4].name.toLowerCase()} makes it the point.`,
      `The rest of the rail: ${garments[1].name.toLowerCase()}, ${garments[3].name.toLowerCase()}, ${garments[5].name.toLowerCase()}, ${garments[6].name.toLowerCase()} and ${garments[7].name.toLowerCase()}. The through-line is ${analysis.drape === "Structured" ? "clean lines and a little structure" : "soft volume and an easy hand-feel"} — let the cloth be the loudest thing in the look.`,
    ];
    if (desiGarments.length) {
      paragraphs.push(`For a desi wardrobe, the same ${primary} cloth also reads as a ${desiGarments[0].name.toLowerCase()}, a ${desiGarments[1].name.toLowerCase()} or a ${desiGarments[2].name.toLowerCase()}. Keep the dupatta in ${secondary} and let the ${surfaceWord} stay visible at the hem and cuffs.`);
    }
    const note = `A small styling note: keep the palette close — ${primary} with ${secondary}${names[2] ? ` and a little ${accent}` : ""}. Let one piece carry the surface; the rest can be plain.`;
    return { heading: "A note on the cloth", paragraphs, note };
  }

  function buildBrief(analysis, sourceName) {
    const primary = analysis.palette[0];
    const secondary = analysis.palette[1] || primary;
    const title = `A study in ${primary.name.toLowerCase()}`;
    const summary = `A ${analysis.tone.toLowerCase()}, ${analysis.pattern.toLowerCase()} cloth with a ${analysis.drape.toLowerCase()} fall. ${primary.name} leads, with ${secondary.name.toLowerCase()} underneath. I'd use it for ${analysis.drape === "Structured" ? "clean tailoring and outerwear" : analysis.drape === "Fluid" ? "soft dresses, shirts and fluid separates" : "easy separates and relaxed tailoring"}.`;
    const garments = buildGarments(analysis);
    const desiGarments = buildDesiGarments(analysis);
    const article = buildArticle(analysis, garments, title, desiGarments);
    const paletteText = analysis.palette.map((color) => `${color.name} ${color.hex}`).join(", ");
    const plain = [
      "THE CLOTH ROOM — NOTES ON A CLOTH",
      title,
      sourceName ? `Cloth photo: ${sourceName}` : "",
      summary,
      `Palette: ${paletteText}`,
      `Tone: ${analysis.tone} | Surface: ${analysis.pattern} | Fall: ${analysis.drape} | Weight: ${analysis.weight}`,
      "Modern pieces:",
      ...garments.map((garment) => `- ${garment.name}: ${garment.note}`),
      "Desi pieces:",
      ...desiGarments.map((garment) => `- ${garment.name}: ${garment.note}`),
      article.heading,
      ...article.paragraphs,
      article.note,
    ].filter(Boolean).join("\n\n");

    return {
      title,
      summary,
      palette: analysis.palette,
      pattern: analysis.pattern,
      textureUrl: analysis.textureUrl || "",
      facts: [
        { label: "Tone", value: analysis.tone },
        { label: "Surface", value: analysis.pattern },
        { label: "Fall", value: analysis.drape },
        { label: "Weight", value: analysis.weight },
      ],
      garments,
      desiGarments,
      article,
      plain,
      tag: `${analysis.palette.length} colours on the table`,
    };
  }

  function garmentSvg(id, palette, pattern, textureUrl = "") {
    const base = palette[0]?.hex || "#334155";
    const accent = palette[1]?.hex || base;
    const highlight = palette[2]?.hex || accent;
    const uid = `fabric-${id}-${Math.random().toString(36).slice(2, 8)}`;
    const solid = pattern === "Solid";
    const defs = solid
      ? `<linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${highlight}"/><stop offset="0.55" stop-color="${base}"/><stop offset="1" stop-color="${accent}"/></linearGradient>`
      : textureUrl
        ? `<pattern id="${uid}" width="22" height="22" patternUnits="userSpaceOnUse"><image href="${textureUrl}" width="22" height="22" preserveAspectRatio="xMidYMid slice"/></pattern>`
        : `<pattern id="${uid}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${base}"/><path d="M0 0V7" stroke="${accent}" stroke-opacity=".55" stroke-width="1.2"/><path d="M0 0H7" stroke="${highlight}" stroke-opacity=".18" stroke-width="1"/></pattern>`;
    const path = GARMENT_PATHS[id] || GARMENT_PATHS.dress;
    const detailColor = getContrastColor(base);
    const details = (GARMENT_DETAILS[id] || "").replace(
      /rgba\(255,255,255/g,
      detailColor === "#111827" ? "rgba(17,24,39" : "rgba(244,241,232"
    );
    const label = GARMENT_LABELS[id] || id;
    return `<svg viewBox="0 0 100 120" role="img" aria-label="${label} concept"><defs>${defs}</defs><path d="${path}" fill="url(#${uid})" stroke="rgba(45,38,30,.45)" stroke-width="1.2" stroke-linejoin="round"/>${details}</svg>`;
  }

  function hexToRgb(hex) {
    const value = String(hex).replace("#", "");
    const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
    const number = Number.parseInt(full, 16);
    return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
  }

  function colorDistance(hexA, hexB) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  }

  function getContrastColor(hex) {
    const { r, g, b } = hexToRgb(hex);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? "#111827" : "#f4f1e8";
  }

  function getLookColors(palette, colorway) {
    const base = palette[0]?.hex || "#334155";
    const accent = palette[1]?.hex || base;
    const highlight = palette[2]?.hex || accent;
    if (colorway === "monochrome") {
      return { base, accent: base, highlight };
    }
    if (colorway === "contrast") {
      const candidates = palette.map((color) => color.hex).filter((hex) => hex.toLowerCase() !== base.toLowerCase());
      const paletteContrast = candidates.sort((a, b) => colorDistance(b, base) - colorDistance(a, base))[0];
      const contrast = paletteContrast && colorDistance(paletteContrast, base) > 100 ? paletteContrast : getContrastColor(base);
      return { base, accent: contrast, highlight: contrast };
    }
    return { base, accent, highlight };
  }

  function buildLookFigure(model = "her", uid = "look") {
    const her = model === "her";
    const skin = `url(#${uid}-skin)`;
    const limb = `url(#${uid}-limb)`;
    const hair = `url(#${uid}-hair)`;
    const skinShade = "#b97f63";
    const skinLine = "rgba(120,70,50,.28)";
    const lip = "#a95f6a";
    const eye = "#4a2c31";

    const shadow = '<ellipse cx="210" cy="430" rx="92" ry="12" fill="rgba(80,62,45,.18)"/><ellipse cx="210" cy="430" rx="54" ry="6" fill="rgba(80,62,45,.1)"/>';
    const head = her
      ? `<path d="M188 70 Q188 47 210 44 Q232 47 232 70 L230 86 Q225 104 210 108 Q195 104 190 86 Z" fill="${skin}" stroke="rgba(255,255,255,.16)" stroke-width="1.2"/>`
      : `<path d="M186 68 Q186 45 210 42 Q234 45 234 68 L233 84 Q230 100 220 108 Q214 112 210 112 Q206 112 200 108 Q190 100 187 84 Z" fill="${skin}" stroke="rgba(255,255,255,.16)" stroke-width="1.2"/>`;
    const ears = `<path d="M188 76 Q182 78 184 86 Q187 92 191 89" fill="${skin}" stroke="rgba(255,255,255,.1)" stroke-width="1"/><path d="M232 76 Q238 78 236 86 Q233 92 229 89" fill="${skin}" stroke="rgba(255,255,255,.1)" stroke-width="1"/>`;
    const neck = her
      ? `<path d="M201 102 L201 126 Q210 132 219 126 L219 102 Z" fill="${skin}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M201 104 Q210 114 219 104 L219 111 Q210 120 201 111 Z" fill="${skinShade}" opacity=".3"/>`
      : `<path d="M199 102 L199 128 Q210 135 221 128 L221 102 Z" fill="${skin}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M199 104 Q210 115 221 104 L221 112 Q210 122 199 112 Z" fill="${skinShade}" opacity=".3"/>`;
    const torso = her
      ? `<path d="M170 142 Q190 128 210 128 Q230 128 250 142 L258 174 L250 210 L244 240 Q252 260 248 276 Q244 290 236 300 L184 300 Q176 290 172 276 Q168 260 176 240 L170 210 L162 174 Z" fill="${skin}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M184 176 Q196 166 206 184 Q197 198 184 192 Z" fill="rgba(255,255,255,.09)"/><path d="M236 176 Q224 166 214 184 Q223 198 236 192 Z" fill="rgba(255,255,255,.08)"/><path d="M184 202 Q210 216 236 202" fill="none" stroke="${skinLine}" stroke-width="1.1" stroke-linecap="round"/><path d="M174 222 Q188 244 190 300 L184 300 Q180 244 170 224 Z" fill="rgba(2,6,23,.14)"/><path d="M246 222 Q232 244 230 300 L236 300 Q240 244 250 224 Z" fill="rgba(2,6,23,.14)"/><path d="M192 136 Q210 143 228 136" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1" stroke-linecap="round"/><path d="M210 232 V276" fill="none" stroke="${skinLine}" stroke-width="1" stroke-linecap="round" opacity=".65"/>`
      : `<path d="M186 132 Q198 124 210 124 Q222 124 234 132 L246 176 L252 224 L248 300 L172 300 L168 224 L174 176 Z" fill="${skin}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M172 166 Q192 158 208 178 Q194 192 174 184 Z" fill="rgba(255,255,255,.10)"/><path d="M248 166 Q228 158 212 178 Q226 192 246 184 Z" fill="rgba(255,255,255,.09)"/><path d="M210 188 V278" fill="none" stroke="${skinLine}" stroke-width="1.1" stroke-linecap="round"/><path d="M188 208 Q210 216 232 208" fill="none" stroke="${skinLine}" stroke-width="1.1" stroke-linecap="round"/><path d="M188 228 Q210 236 232 228" fill="none" stroke="${skinLine}" stroke-width="1.1" stroke-linecap="round"/><path d="M190 248 Q210 256 230 248" fill="none" stroke="${skinLine}" stroke-width="1.1" stroke-linecap="round"/><path d="M192 266 Q210 272 228 266" fill="none" stroke="${skinLine}" stroke-width="1.1" stroke-linecap="round"/><path d="M158 160 Q166 220 172 300 L184 300 Q176 220 170 160 Z" fill="rgba(2,6,23,.18)"/><path d="M262 160 Q254 220 248 300 L236 300 Q244 220 250 160 Z" fill="rgba(2,6,23,.18)"/><path d="M190 136 Q210 144 230 136" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1" stroke-linecap="round"/>`;
    const arms = her
      ? `<path d="M170 146 Q150 180 154 216 Q158 238 164 252 L176 250 Q170 226 170 208 Q170 184 186 158 Z" fill="${limb}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M250 146 Q270 180 266 216 Q262 238 256 252 L244 250 Q250 226 250 208 Q250 184 234 158 Z" fill="${limb}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M170 160 Q164 178 166 196" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1" stroke-linecap="round"/><path d="M250 160 Q256 178 254 196" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1" stroke-linecap="round"/>`
      : `<path d="M158 146 Q146 186 148 220 Q150 240 156 252 L170 250 Q166 228 164 208 Q164 184 176 158 Z" fill="${limb}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M262 146 Q274 186 272 220 Q270 240 264 252 L250 250 Q254 228 256 208 Q256 184 244 158 Z" fill="${limb}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M160 158 Q150 176 154 194" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1.2" stroke-linecap="round"/><path d="M158 192 Q154 210 160 228" fill="none" stroke="${skinLine}" stroke-width="1" stroke-linecap="round"/><path d="M260 158 Q270 176 266 194" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.2" stroke-linecap="round"/><path d="M262 192 Q266 210 260 228" fill="none" stroke="${skinLine}" stroke-width="1" stroke-linecap="round"/>`;
    const hands = her
      ? `<path d="M164 250 Q158 256 160 264 Q163 271 170 268 L176 258 L174 250 Z" fill="${limb}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M256 250 Q262 256 260 264 Q257 271 250 268 L244 258 L246 250 Z" fill="${limb}" stroke="rgba(255,255,255,.12)" stroke-width="1"/>`
      : `<path d="M154 250 Q147 256 150 266 Q154 274 162 270 L172 258 L170 250 Z" fill="${limb}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M266 250 Q273 256 270 266 Q266 274 258 270 L248 258 L250 250 Z" fill="${limb}" stroke="rgba(255,255,255,.12)" stroke-width="1"/>`;
    const legs = her
      ? `<path d="M184 300 Q178 332 172 366 L178 414 L194 414 L202 366 L204 310 Z" fill="${limb}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M236 300 Q242 332 248 366 L242 414 L226 414 L218 366 L216 310 Z" fill="${limb}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M182 366 Q188 372 194 366" fill="none" stroke="${skinLine}" stroke-width="1" stroke-linecap="round"/><path d="M238 366 Q232 372 226 366" fill="none" stroke="${skinLine}" stroke-width="1" stroke-linecap="round"/>`
      : `<path d="M182 300 Q174 332 168 362 L160 414 L184 414 L196 366 L204 312 Z" fill="${limb}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M238 300 Q246 332 252 362 L260 414 L236 414 L224 366 L216 312 Z" fill="${limb}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path d="M174 362 Q184 368 192 362" fill="none" stroke="${skinLine}" stroke-width="1" stroke-linecap="round"/><path d="M246 362 Q236 368 228 362" fill="none" stroke="${skinLine}" stroke-width="1" stroke-linecap="round"/>`;
    const shoes = her
      ? `<path d="M174 410 L194 410 L198 416 L174 421 L168 416 Z" fill="#0b1220" stroke="rgba(255,255,255,.16)" stroke-width="1"/><path d="M190 419 L194 419 L192 431 L188 431 Z" fill="#0b1220"/><path d="M226 410 L246 410 L252 416 L226 421 L222 416 Z" fill="#0b1220" stroke="rgba(255,255,255,.16)" stroke-width="1"/><path d="M228 419 L232 419 L230 431 L226 431 Z" fill="#0b1220"/>`
      : `<path d="M148 416 Q148 410 158 410 L182 410 L190 420 Q182 426 160 424 L148 420 Z" fill="#0b1220" stroke="rgba(255,255,255,.16)" stroke-width="1"/><path d="M272 416 Q272 410 262 410 L238 410 L230 420 Q238 426 260 424 L272 420 Z" fill="#0b1220" stroke="rgba(255,255,255,.16)" stroke-width="1"/>`;
    const hairBack = her
      ? `<path d="M187 60 Q186 38 210 35 Q234 38 233 60 L239 142 Q238 184 230 192 Q226 170 228 138 L225 100 Q218 112 210 112 Q202 112 195 100 L192 138 Q194 170 190 192 Q182 184 181 142 Z" fill="${hair}"/><path d="M190 108 Q184 144 188 180" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="1.2" stroke-linecap="round"/><path d="M230 108 Q236 144 232 180" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="1.2" stroke-linecap="round"/>`
      : `<path d="M184 68 Q182 40 210 37 Q238 40 236 68 L234 94 Q230 78 210 76 Q190 78 186 94 Z" fill="${hair}"/><path d="M186 68 Q180 80 184 96 L190 92 Q186 80 192 66 Z" fill="${hair}"/><path d="M234 68 Q240 80 236 96 L230 92 Q234 80 228 66 Z" fill="${hair}"/><path d="M190 50 Q204 42 220 48" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1.2" stroke-linecap="round"/>`;
    const hairFront = her
      ? `<path d="M188 72 Q186 46 210 42 Q234 46 232 72 Q228 56 212 54 Q206 66 200 70 Q196 58 188 72 Z" fill="${hair}"/><path d="M188 68 Q184 88 190 104 Q186 86 194 64 Z" fill="${hair}"/><path d="M232 68 Q236 88 230 104 Q234 86 226 64 Z" fill="${hair}"/><path d="M194 52 Q204 46 216 50" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.3" stroke-linecap="round"/><path d="M203 70 Q208 58 216 55" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1" stroke-linecap="round"/><path d="M186 58 Q178 76 184 98 Q180 78 192 60 Z" fill="${hair}"/><path d="M234 58 Q242 76 236 98 Q240 78 228 60 Z" fill="${hair}"/><path d="M196 46 Q208 40 222 46" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1.4" stroke-linecap="round"/>`
      : `<path d="M186 74 Q184 44 210 40 Q236 44 234 74 Q228 58 210 56 Q192 58 186 74 Z" fill="${hair}"/><path d="M187 72 L178 56 L194 62 L189 46 L202 56 L205 40 L214 54 L222 42 L224 58 L236 50 L230 68 Q228 56 218 54 Q204 56 198 70 Q194 58 187 72 Z" fill="${hair}"/><path d="M190 66 Q196 52 210 51 Q204 60 202 72 Q196 62 190 66 Z" fill="rgba(255,255,255,.12)"/><path d="M190 74 Q187 88 192 98 Q188 84 196 68 Z" fill="${hair}"/><path d="M230 74 Q233 88 228 98 Q232 84 224 68 Z" fill="${hair}"/><path d="M196 50 Q206 45 218 49" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1.2" stroke-linecap="round"/><path d="M200 58 Q208 54 216 58" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1" stroke-linecap="round"/>`;
    const earrings = her
      ? '<circle cx="187" cy="87" r="2" fill="none" stroke="#f3c76a" stroke-width="1.2"/><circle cx="233" cy="87" r="2" fill="none" stroke="#f3c76a" stroke-width="1.2"/>'
      : "";
    const eyeR = her ? 3.0 : 2.0;
    const browW = her ? 1.2 : 1.9;
    const lipShape = her ? "M204 98 Q210 101 216 98 Q210 105 204 98 Z" : "M204 99 Q210 101 216 99 Q210 104 204 99 Z";
    const eyeLiner = her
      ? '<path d="M191 74 Q198 67 205 74 L208 71" fill="none" stroke="#2a1a20" stroke-width="1.7" stroke-linecap="round"/><path d="M215 74 Q222 67 229 74 L226 71" fill="none" stroke="#2a1a20" stroke-width="1.7" stroke-linecap="round"/>'
      : "";
    const stubble = her
      ? '<ellipse cx="191" cy="90" rx="5" ry="2.2" fill="#e88b8b" opacity=".22"/><ellipse cx="229" cy="90" rx="5" ry="2.2" fill="#e88b8b" opacity=".22"/>'
      : '<path d="M192 94 Q200 108 210 110 Q220 108 228 94 Q224 104 210 106 Q196 104 192 94 Z" fill="rgba(30,20,20,.08)"/>';
    const face = `
      <path d="M191 79 Q198 70 205 79 Q198 86 191 79 Z" fill="#fff8f2"/>
      <path d="M215 79 Q222 70 229 79 Q222 86 215 79 Z" fill="#fff8f2"/>
      <circle cx="198" cy="79" r="${eyeR}" fill="${eye}"/>
      <circle cx="222" cy="79" r="${eyeR}" fill="${eye}"/>
      <circle cx="198" cy="79" r="${eyeR * 0.55}" fill="#1b1014"/>
      <circle cx="222" cy="79" r="${eyeR * 0.55}" fill="#1b1014"/>
      <circle cx="196.8" cy="77.2" r="1.1" fill="#fff"/>
      <circle cx="220.8" cy="77.2" r="1.1" fill="#fff"/>
      <circle cx="199.6" cy="81" r=".55" fill="#fff" opacity=".8"/>
      <circle cx="223.6" cy="81" r=".55" fill="#fff" opacity=".8"/>
      <path d="M191 75 Q198 68 205 75" fill="none" stroke="#2a1a20" stroke-width="${her ? 1.7 : 1.3}" stroke-linecap="round"/>
      <path d="M215 75 Q222 68 229 75" fill="none" stroke="#2a1a20" stroke-width="${her ? 1.7 : 1.3}" stroke-linecap="round"/>
      <path d="M192 69 Q198 66 204 69" fill="none" stroke="#3a2428" stroke-width="${browW}" stroke-linecap="round"/>
      <path d="M216 69 Q222 66 228 69" fill="none" stroke="#3a2428" stroke-width="${browW}" stroke-linecap="round"/>
      <path d="M210 82 Q208 88 211 91" fill="none" stroke="${skinShade}" stroke-width="1" stroke-linecap="round"/>
      <path d="${lipShape}" fill="${lip}" opacity=".92"/>
      <path d="M206 99 Q210 101 214 99" fill="none" stroke="rgba(255,255,255,.35)" stroke-width=".8" stroke-linecap="round"/>
      ${eyeLiner}
      ${her ? '<circle cx="210" cy="64" r="1.25" fill="#a33b5a"/><circle cx="210" cy="64" r=".45" fill="#f3c76a"/>' : ""}
      ${stubble}
      <path d="M188 56 Q183 70 187 88" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1.1" stroke-linecap="round"/>
    `;
    const rimLight = '<path d="M172 148 Q160 178 162 208" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1.4" stroke-linecap="round"/><path d="M184 306 Q178 342 170 382" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1.2" stroke-linecap="round"/>';

    const headGroup = `<g transform="translate(210 76) scale(${her ? 1.0 : 0.96}) translate(-210 -76)">${hairBack}${head}${ears}${hairFront}${earrings}${face}</g>`;
    const jewelry = her ? '<path d="M197 132 Q210 141 223 132" fill="none" stroke="#f3c76a" stroke-width="1.1" stroke-linecap="round"/><circle cx="210" cy="140" r="1.4" fill="#f3c76a"/><path d="M164 252 Q170 256 176 252" fill="none" stroke="#f3c76a" stroke-width="1" stroke-linecap="round"/>' : '';
    const bodySkin = her ? `${torso}${legs}` : "";
    return `${shadow}${rimLight}${headGroup}${neck}${bodySkin}${jewelry}${arms}${hands}${shoes}`;
  }

  function buildLookSvg(garmentId, palette, pattern, colorway = "detected", model = "her", textureUrl = "") {
    const { base, accent, highlight } = getLookColors(palette, colorway);
    const uid = `look-${garmentId}-${Math.random().toString(36).slice(2, 8)}`;
    const solid = pattern === "Solid";
    const photoFill = textureUrl && !solid ? `url(#${uid}-photo)` : "";
    const fabricFill = photoFill || (solid ? `url(#${uid}-fabric)` : `url(#${uid}-weave)`);
    const accentFill = colorway === "monochrome" ? fabricFill : colorway === "contrast" ? accent : (photoFill || `url(#${uid}-accent)`);
    const bottomFill = colorway === "contrast" ? accentFill : fabricFill;
    const skinFill = `url(#${uid}-skin)`;

    const defs = `
      <linearGradient id="${uid}-bg" x1="0" y1="0" x2="0.85" y2="1">
        <stop stop-color="#f8f2e7"/>
        <stop offset="1" stop-color="#e9dfcf"/>
      </linearGradient>
      <radialGradient id="${uid}-glow" cx="50%" cy="36%" r="62%">
        <stop stop-color="rgba(169, 78, 49, 0.11)"/>
        <stop offset="1" stop-color="rgba(169, 78, 49, 0)"/>
      </radialGradient>
      <linearGradient id="${uid}-fabric" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="${highlight}"/>
        <stop offset="0.55" stop-color="${base}"/>
        <stop offset="1" stop-color="${accent}"/>
      </linearGradient>
      <linearGradient id="${uid}-accent" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="${accent}"/>
        <stop offset="1" stop-color="${base}"/>
      </linearGradient>
      <pattern id="${uid}-weave" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="${base}"/>
        <path d="M0 0V8" stroke="${accent}" stroke-opacity=".55" stroke-width="1.4"/>
        <path d="M0 0H8" stroke="${highlight}" stroke-opacity=".2" stroke-width="1"/>
      </pattern>
      <pattern id="${uid}-texture" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 0V5" stroke="rgba(255,255,255,.22)" stroke-width=".55"/>
        <path d="M0 0H5" stroke="rgba(0,0,0,.18)" stroke-width=".55"/>
      </pattern>
      ${textureUrl ? `<pattern id="${uid}-photo" width="96" height="96" patternUnits="userSpaceOnUse"><image href="${textureUrl}" width="96" height="96" preserveAspectRatio="xMidYMid slice"/></pattern>` : ""}
      <radialGradient id="${uid}-skin" cx="34%" cy="24%" r="84%">
        <stop stop-color="#f8dcc8"/>
        <stop offset=".52" stop-color="#e9b99e"/>
        <stop offset="1" stop-color="#c58a70"/>
      </radialGradient>
      <linearGradient id="${uid}-limb" x1="0" y1="0" x2="1" y2="0">
        <stop stop-color="#f4d2bb"/>
        <stop offset=".55" stop-color="#e2ae92"/>
        <stop offset="1" stop-color="#ba7d66"/>
      </linearGradient>
      <linearGradient id="${uid}-hair" x1="0" y1="0" x2="1" y2="1">
        ${model === "her"
          ? '<stop stop-color="#56394f"/><stop offset=".55" stop-color="#28182b"/><stop offset="1" stop-color="#0c0911"/>'
          : '<stop stop-color="#3a4661"/><stop offset=".55" stop-color="#182034"/><stop offset="1" stop-color="#060911"/>'}
      </linearGradient>
      <radialGradient id="${uid}-floor" cx="50%" cy="50%" r="58%">
        <stop stop-color="rgba(169, 78, 49, 0.16)"/>
        <stop offset=".62" stop-color="rgba(169, 78, 49, 0.06)"/>
        <stop offset="1" stop-color="rgba(169, 78, 49, 0)"/>
      </radialGradient>
      <filter id="${uid}-model-shadow" x="-24%" y="-18%" width="148%" height="148%">
        <feDropShadow dx="0" dy="7" stdDeviation="5" flood-color="#000" flood-opacity=".42"/>
      </filter>
      <clipPath id="${uid}-shirt-chest"><path d="M188 142 L210 242 L232 142 Z"/></clipPath>
      <clipPath id="${uid}-jacket-chest"><path d="M184 142 L210 292 L236 142 Z"/></clipPath>
    `;

    const figure = buildLookFigure(model, uid);

    const jacket = "M158 142 Q210 120 262 142 L266 180 L252 252 L246 248 L246 318 L174 318 L174 248 L168 252 L154 180 Z";
    const trousers = "M170 302 H250 L262 414 H238 L210 342 L182 414 H158 Z";
    const dress = "M180 142 Q210 124 240 142 L248 200 L238 250 L266 410 L154 410 L182 250 L172 200 Z";
    const shirt = "M166 142 Q210 124 254 142 L260 172 L248 180 L248 302 L172 302 L172 180 L160 172 Z";
    const top = "M168 142 Q210 124 252 142 L258 174 L246 182 L246 302 L174 302 L174 182 L162 174 Z";
    const skirt = "M174 300 H246 L264 410 H156 Z";
    const sleeveL = "M166 142 L146 184 L160 192 L180 158 Z";
    const sleeveR = "M254 142 L274 184 L260 192 L240 158 Z";
    const wSleeveL = "M172 144 L154 184 L166 194 L180 160 Z";
    const wSleeveR = "M248 144 L266 184 L254 194 L240 160 Z";
    const sleeveLongL = "M156 144 Q142 186 144 220 Q146 242 152 254 L172 252 Q166 228 164 208 Q164 184 178 156 Z";
    const sleeveLongR = "M264 144 Q278 186 276 220 Q274 242 268 254 L248 252 Q254 228 256 208 Q256 184 242 156 Z";
    const sleeveLongLHer = "M168 142 Q148 158 148 190 Q148 218 160 248 L174 250 Q166 224 166 204 Q168 178 184 156 Z";
    const sleeveLongRHer = "M252 142 Q272 158 272 190 Q272 218 260 248 L246 250 Q254 224 254 204 Q252 178 236 156 Z";
    const wKurta = "M170 142 Q210 124 250 142 L260 172 L252 210 L248 332 L172 332 L168 210 L160 172 Z";
    const wKurtaPants = "M184 332 L178 414 L192 414 L202 344 L218 344 L228 414 L242 414 L236 332 Z";
    const wKurtaDupatta = "M164 144 Q210 116 256 144 L248 170 L210 156 L172 170 Z M246 158 Q282 214 262 358 L248 354 Q264 222 236 168 Z";
    const wAnarkaliTop = "M180 142 Q210 124 240 142 L246 202 L238 252 L174 252 L170 202 Z";
    const wAnarkaliSkirt = "M174 252 L238 252 L278 410 L144 410 Z";
    const wSalwarTop = "M172 142 Q210 124 248 142 L258 172 L250 230 L246 342 L174 342 L170 230 L162 172 Z";
    const wSalwarPants = "M180 342 L162 414 L184 414 L202 350 L218 350 L236 414 L258 414 L240 342 Z";
    const wLehengaTop = "M184 142 Q210 128 236 142 L242 182 L238 232 L182 232 L178 182 Z";
    const wLehengaSkirt = "M182 232 L238 232 L286 410 L134 410 Z";
    const wLehengaDupatta = "M236 150 Q280 206 262 342 L246 338 Q262 214 226 164 Z";
    const wSareeTop = "M186 142 Q210 130 234 142 L240 180 L236 222 L184 222 L180 180 Z";
    const wSareeSkirt = "M184 222 L236 222 L264 410 L156 410 Z";
    const wSareeWrap = "M184 224 Q210 238 236 224 L246 290 L174 290 Z";
    const wSareePallu = "M232 150 Q280 210 264 356 L246 352 Q260 222 220 162 Z";
    const wShararaTop = "M172 142 Q210 124 248 142 L258 172 L250 220 L246 286 L174 286 L170 220 L162 172 Z";
    const wShararaPants = "M180 286 L150 410 L178 410 L202 322 L218 322 L242 410 L270 410 L240 286 Z";
    const mKurta = "M166 142 Q210 124 254 142 L264 172 L256 230 L252 336 L168 336 L164 230 L156 172 Z";
    const mKurtaPants = "M184 336 L180 414 L194 414 L204 348 L216 348 L226 414 L240 414 L236 336 Z";
    const mShalwar = "M180 336 L162 414 L184 414 L204 350 L216 350 L236 414 L258 414 L240 336 Z";
    const mSherwani = "M162 142 Q210 120 258 142 L272 184 L262 240 L258 342 L162 342 L158 240 L148 184 Z";
    const mSherwaniPants = "M184 342 L180 414 L194 414 L204 352 L216 352 L226 414 L240 414 L236 342 Z";
    const mWaistcoat = "M174 148 L198 136 L210 160 L222 136 L246 148 L252 244 L246 252 L244 330 L210 336 L176 330 L174 252 L168 244 Z";
    const stroke = 'stroke="rgba(45,38,30,.38)" stroke-width="1.3" stroke-linejoin="round"';
    const detail = 'fill="none" stroke="rgba(255,250,240,.42)" stroke-width="1.2" stroke-linecap="round"';
    const add = (path, fill) => `<path d="${path}" fill="${fill}" ${stroke}/><path d="${path}" fill="url(#${uid}-texture)" opacity="${solid ? 0.42 : 0.22}"/>`;
    const addSoft = (path, fill, opacity = 0.45) => `<path d="${path}" fill="${fill}" fill-opacity="${opacity}" stroke="rgba(255,255,255,.22)" stroke-width="1"/>`;
    const longSleeves = (fill) => {
      const left = model === "her" ? sleeveLongLHer : sleeveLongL;
      const right = model === "her" ? sleeveLongRHer : sleeveLongR;
      const folds = model === "her"
        ? '<path d="M154 178 Q160 202 156 232" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1.1" stroke-linecap="round"/><path d="M266 178 Q260 202 264 232" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1.1" stroke-linecap="round"/><path d="M160 246 Q166 252 174 248" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1" stroke-linecap="round"/><path d="M260 246 Q254 252 246 248" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1" stroke-linecap="round"/>'
        : '<path d="M146 178 Q152 202 148 232" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1.1" stroke-linecap="round"/><path d="M274 178 Q268 202 272 232" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1.1" stroke-linecap="round"/><path d="M152 250 Q158 256 166 252" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1" stroke-linecap="round"/><path d="M268 250 Q262 256 254 252" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="1" stroke-linecap="round"/>';
      return `${add(left, fill)}${add(right, fill)}${folds}`;
    };
    const absLines = `<path d="M190 158 Q200 152 209 176 Q198 184 187 174 Z" fill="rgba(112,64,46,.18)"/><path d="M190 160 Q198 156 206 174 Q198 180 188 174 Z" fill="rgba(255,255,255,.07)"/><path d="M230 158 Q220 152 211 176 Q222 184 233 174 Z" fill="rgba(112,64,46,.18)"/><path d="M230 160 Q222 156 214 174 Q222 180 232 174 Z" fill="rgba(255,255,255,.06)"/><path d="M210 184 V278" fill="none" stroke="rgba(112,64,46,.44)" stroke-width="1.4" stroke-linecap="round"/><path d="M198 192 Q204 188 209 194 L208 206 Q203 210 198 204 Z" fill="rgba(112,64,46,.22)" stroke="rgba(112,64,46,.46)" stroke-width="1"/><path d="M212 192 Q218 188 223 194 L222 206 Q217 210 212 204 Z" fill="rgba(112,64,46,.22)" stroke="rgba(112,64,46,.46)" stroke-width="1"/><path d="M199 212 Q204 208 209 214 L208 226 Q203 230 199 224 Z" fill="rgba(112,64,46,.20)" stroke="rgba(112,64,46,.42)" stroke-width="1"/><path d="M211 212 Q216 208 221 214 L220 226 Q215 230 211 224 Z" fill="rgba(112,64,46,.20)" stroke="rgba(112,64,46,.42)" stroke-width="1"/><path d="M201 232 Q205 228 209 234 L208 246 Q204 250 201 244 Z" fill="rgba(112,64,46,.17)" stroke="rgba(112,64,46,.36)" stroke-width=".9"/><path d="M211 232 Q215 228 219 234 L218 246 Q214 250 211 244 Z" fill="rgba(112,64,46,.17)" stroke="rgba(112,64,46,.36)" stroke-width=".9"/><path d="M188 182 Q210 196 232 182" fill="none" stroke="rgba(112,64,46,.32)" stroke-width="1.3" stroke-linecap="round"/><path d="M210 148 V184" fill="none" stroke="rgba(112,64,46,.22)" stroke-width="1.1" stroke-linecap="round"/><path d="M194 188 Q202 194 209 204" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.4" stroke-linecap="round"/><path d="M226 188 Q218 194 211 204" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1.3" stroke-linecap="round"/><path d="M188 148 Q200 154 210 152 Q220 154 232 148" fill="none" stroke="rgba(112,64,46,.22)" stroke-width="1.1" stroke-linecap="round"/><path d="M210 270 Q214 272 212 276" fill="none" stroke="rgba(112,64,46,.35)" stroke-width="1.2" stroke-linecap="round"/><path d="M184 142 L210 292 L198 292 L184 142 Z" fill="rgba(2,6,23,.12)"/><path d="M236 142 L210 292 L222 292 L236 142 Z" fill="rgba(2,6,23,.1)"/>`;
    const maleShirtChest = model === "him" ? `<path d="M190 142 L210 166 L230 142 L222 136 L210 148 L198 136 Z" fill="${fabricFill}" ${stroke}/><path d="M210 148 V302" ${detail}/><path d="M198 142 L210 158 L222 142" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1"/><path d="M204 160 L216 160" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1"/>` : "";
    const maleJacketChest = model === "him" ? `<path d="M190 142 L210 180 L230 142 L222 136 L210 154 L198 136 Z" fill="#f4f1e8" opacity=".94"/><path d="M210 154 L205 196 L210 208 L215 196 Z" fill="${accent}" opacity=".95"/><path d="M184 142 L210 230 L202 240 L172 150 Z" fill="${fabricFill}" ${stroke}/><path d="M236 142 L210 230 L218 240 L248 150 Z" fill="${fabricFill}" ${stroke}/><path d="M184 142 L210 230 L198 230 L172 150 Z" fill="rgba(255,255,255,.06)"/><path d="M236 142 L210 230 L222 230 L248 150 Z" fill="rgba(0,0,0,.08)"/>` : "";
    const jacketShade = `<path d="M166 150 Q158 190 164 246 L176 248 Q170 198 178 156 Z" fill="rgba(0,0,0,.20)"/><path d="M254 150 Q262 190 256 246 L244 248 Q250 198 242 156 Z" fill="rgba(0,0,0,.16)"/><path d="M184 258 Q190 290 188 304" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1.2" stroke-linecap="round"/><path d="M236 258 Q230 290 232 304" fill="none" stroke="rgba(0,0,0,.16)" stroke-width="1.2" stroke-linecap="round"/><path d="M196 252 Q210 260 224 252" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1" stroke-linecap="round"/><path d="M176 146 Q186 138 198 140" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1.1" stroke-linecap="round"/><path d="M176 154 Q168 202 174 250" fill="none" stroke="rgba(0,0,0,.26)" stroke-width="1.4" stroke-linecap="round"/><path d="M244 154 Q252 202 246 250" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="1.4" stroke-linecap="round"/>`;
    const dressShade = `<path d="M184 150 Q174 220 164 404 L154 404 Q168 220 178 150 Z" fill="rgba(0,0,0,.18)"/><path d="M236 150 Q246 220 256 404 L266 404 Q252 220 242 150 Z" fill="rgba(0,0,0,.15)"/><path d="M198 254 Q194 330 186 404" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1.2" stroke-linecap="round"/><path d="M222 254 Q226 330 234 404" fill="none" stroke="rgba(0,0,0,.16)" stroke-width="1.2" stroke-linecap="round"/><path d="M210 250 V404" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1.1" stroke-linecap="round"/>`;
    const skirtShade = `<path d="M174 300 Q168 350 160 404 L156 404 Q166 350 170 300 Z" fill="rgba(0,0,0,.16)"/><path d="M246 300 Q252 350 260 404 L264 404 Q254 350 250 300 Z" fill="rgba(0,0,0,.14)"/><path d="M190 304 L180 404 M230 304 L240 404" fill="none" stroke="rgba(0,0,0,.16)" stroke-width="1.1" stroke-linecap="round"/><path d="M210 300 V404" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1.1" stroke-linecap="round"/>`;
    const trouserShade = `<path d="M176 314 L168 406 L160 406 L168 314 Z" fill="rgba(0,0,0,.18)"/><path d="M244 314 L252 406 L260 406 L252 314 Z" fill="rgba(0,0,0,.15)"/><path d="M190 316 L184 406 M230 316 L236 406" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1.1" stroke-linecap="round"/><path d="M210 342 V410" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1" stroke-linecap="round"/>`;
    const topShade = `<path d="M168 150 Q162 190 166 230 L176 232 Q172 190 178 154 Z" fill="rgba(0,0,0,.16)"/><path d="M252 150 Q258 190 254 230 L244 232 Q248 190 242 154 Z" fill="rgba(0,0,0,.14)"/><path d="M210 160 V300" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1" stroke-linecap="round"/>`;
    const kurtaShade = `<path d="M174 150 Q166 220 168 330 L178 332 Q174 230 182 154 Z" fill="rgba(0,0,0,.18)"/><path d="M246 150 Q254 220 252 330 L242 332 Q246 230 238 154 Z" fill="rgba(0,0,0,.15)"/><path d="M192 168 L190 328 M228 168 L230 328" fill="none" stroke="rgba(0,0,0,.12)" stroke-width="1.1" stroke-linecap="round"/><path d="M210 162 V332" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1.1" stroke-linecap="round"/>`;
    const anarkaliShade = `<path d="M180 150 Q172 220 168 250 L174 252 Q180 220 186 150 Z" fill="rgba(0,0,0,.16)"/><path d="M240 150 Q248 220 252 250 L246 252 Q240 220 234 150 Z" fill="rgba(0,0,0,.14)"/><path d="M190 260 Q184 330 174 404 M230 260 Q236 330 246 404" fill="none" stroke="rgba(0,0,0,.16)" stroke-width="1.1" stroke-linecap="round"/><path d="M210 252 V404" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1.1" stroke-linecap="round"/>`;
    const lehengaShade = `<path d="M182 236 Q170 320 150 404 L140 404 Q164 320 178 236 Z" fill="rgba(0,0,0,.16)"/><path d="M238 236 Q250 320 270 404 L280 404 Q256 320 242 236 Z" fill="rgba(0,0,0,.14)"/><path d="M190 246 L174 404 M210 246 V404 M230 246 L246 404" fill="none" stroke="rgba(0,0,0,.15)" stroke-width="1.1" stroke-linecap="round"/>`;
    const sareeShade = `<path d="M184 226 Q176 320 160 404 L156 404 Q174 320 180 226 Z" fill="rgba(0,0,0,.16)"/><path d="M236 226 Q244 320 260 404 L264 404 Q246 320 240 226 Z" fill="rgba(0,0,0,.14)"/><path d="M192 230 L178 400 M210 230 V400 M228 230 L242 400" fill="none" stroke="rgba(0,0,0,.12)" stroke-width="1.1" stroke-linecap="round"/>`;
    const waistcoatShade = `<path d="M176 150 L196 140 L198 244 L176 252 Z" fill="rgba(0,0,0,.14)"/><path d="M244 150 L224 140 L222 244 L244 252 Z" fill="rgba(0,0,0,.12)"/><path d="M210 164 V330" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1.1" stroke-linecap="round"/>`;

    let layers = "";
    if (garmentId === "dress") {
      layers = `${add(dress, fabricFill)}${dressShade}<path d="M184 250 H236" fill="none" stroke="${accent}" stroke-width="2.4" stroke-linecap="round" opacity=".85"/><path d="M210 142 V250" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1"/>`;
    } else if (garmentId === "shirt") {
      layers = `${add(shirt, fabricFill)}${longSleeves(fabricFill)}${add(trousers, accentFill)}${jacketShade}<path d="M210 142 V302" ${detail}/><circle cx="210" cy="186" r="1.8" fill="rgba(255,255,255,.7)"/><circle cx="210" cy="204" r="1.8" fill="rgba(255,255,255,.7)"/><circle cx="210" cy="222" r="1.8" fill="rgba(255,255,255,.7)"/>${maleShirtChest}`;
    } else if (garmentId === "jacket") {
      layers = `${add(jacket, fabricFill)}${longSleeves(fabricFill)}${add(trousers, accentFill)}${jacketShade}<path d="M190 142 L210 185 L230 142" ${detail}/><path d="M210 142 V318" ${detail}/><circle cx="210" cy="224" r="1.8" fill="rgba(255,255,255,.7)"/>${maleJacketChest}`;
    } else if (garmentId === "trousers") {
      layers = `${add(top, accentFill)}${longSleeves(accentFill)}${add(trousers, fabricFill)}${trouserShade}<path d="M210 182 V302" ${detail}/><path d="M210 310 V410" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1"/>`;
    } else if (garmentId === "skirt") {
      layers = `${add(top, accentFill)}${add(sleeveL, accentFill)}${add(sleeveR, accentFill)}${add(skirt, fabricFill)}${skirtShade}<path d="M184 300 H236" ${detail}/><path d="M202 300 L196 410 M218 300 L224 410" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1"/>`;
    } else if (garmentId === "co-ord") {
      layers = `${add(top, fabricFill)}${add(sleeveL, fabricFill)}${add(sleeveR, fabricFill)}${topShade}${add(trousers, bottomFill)}<path d="M210 182 V410" ${detail}/><path d="M184 300 H236" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" opacity=".8"/>`;
    } else if (garmentId === "blazer") {
      layers = `${add(jacket, fabricFill)}${longSleeves(fabricFill)}${add(trousers, accentFill)}${jacketShade}<path d="M190 142 L210 185 L230 142" ${detail}/><circle cx="210" cy="224" r="1.8" fill="rgba(255,255,255,.7)"/>`;
    } else if (garmentId === "w-kurta") {
      layers = `${add(wKurta, fabricFill)}${longSleeves(fabricFill)}${add(wKurtaPants, accentFill)}${kurtaShade}${addSoft(wKurtaDupatta, highlight, 0.48)}<path d="M196 142 L210 162 L224 142" ${detail}/><path d="M210 162 V332" ${detail}/><path d="M174 324 H246" fill="none" stroke="${accent}" stroke-width="2.2" opacity=".9"/><path d="M174 260 H186 M234 260 H246" ${detail}/>`;
    } else if (garmentId === "w-anarkali") {
      layers = `${add(wAnarkaliTop, fabricFill)}${add(wAnarkaliSkirt, fabricFill)}${anarkaliShade}${longSleeves(fabricFill)}<path d="M184 252 H236" fill="none" stroke="${accent}" stroke-width="2.4" opacity=".9"/><path d="M210 142 V410" ${detail}/><path d="M158 404 H262" fill="none" stroke="${accent}" stroke-width="2" opacity=".8"/>`;
    } else if (garmentId === "w-salwar") {
      layers = `${add(wSalwarTop, fabricFill)}${longSleeves(fabricFill)}${add(wSalwarPants, accentFill)}${kurtaShade}${addSoft(wKurtaDupatta, highlight, 0.34)}<path d="M196 142 L210 160 L224 142" ${detail}/><path d="M210 160 V342" ${detail}/><path d="M176 334 H244" fill="none" stroke="${accent}" stroke-width="2" opacity=".85"/><path d="M184 400 H198 M222 400 H236" fill="none" stroke="${accent}" stroke-width="1.6" opacity=".8"/>`;
    } else if (garmentId === "w-lehenga") {
      layers = `${add(wLehengaSkirt, fabricFill)}${add(wLehengaTop, fabricFill)}${add(wSleeveL, fabricFill)}${add(wSleeveR, fabricFill)}${lehengaShade}${addSoft(wLehengaDupatta, highlight, 0.55)}<path d="M182 232 H238" fill="none" stroke="${accent}" stroke-width="2.8" opacity=".9"/><path d="M190 246 L174 404 M210 246 V404 M230 246 L246 404" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="1"/><path d="M140 404 H280" fill="none" stroke="${accent}" stroke-width="2" opacity=".8"/>`;
    } else if (garmentId === "w-saree") {
      layers = `${add(wSareeSkirt, fabricFill)}${add(wSareeTop, fabricFill)}${sareeShade}${addSoft(wSareeWrap, fabricFill, 0.5)}${addSoft(wSareePallu, highlight, 0.58)}<path d="M186 142 Q210 158 234 142" ${detail}/><path d="M166 398 H254" fill="none" stroke="${accent}" stroke-width="2.2" opacity=".8"/><path d="M192 230 L178 400 M210 230 V400 M228 230 L242 400" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1"/>`;
    } else if (garmentId === "w-sharara") {
      layers = `${add(wShararaTop, fabricFill)}${longSleeves(fabricFill)}${add(wShararaPants, accentFill)}${kurtaShade}<path d="M196 142 L210 160 L224 142" ${detail}/><path d="M210 160 V286" ${detail}/><path d="M176 278 H244" fill="none" stroke="${accent}" stroke-width="2" opacity=".85"/><path d="M176 398 H192 M228 398 H244" fill="none" stroke="${accent}" stroke-width="1.6" opacity=".8"/>`;
    } else if (garmentId === "m-kurta") {
      layers = `${add(mKurta, fabricFill)}${longSleeves(fabricFill)}${add(mKurtaPants, accentFill)}${kurtaShade}<path d="M196 142 L210 158 L224 142" ${detail}/><path d="M210 158 V336" ${detail}/><path d="M168 328 H252" fill="none" stroke="${accent}" stroke-width="2" opacity=".85"/><circle cx="210" cy="184" r="1.5" fill="rgba(255,255,255,.6)"/><circle cx="210" cy="198" r="1.5" fill="rgba(255,255,255,.6)"/>`;
    } else if (garmentId === "m-shalwar") {
      layers = `${add(mKurta, fabricFill)}${longSleeves(fabricFill)}${add(mShalwar, accentFill)}${kurtaShade}<path d="M196 142 L210 158 L224 142" ${detail}/><path d="M210 158 V336" ${detail}/><path d="M168 328 H252" fill="none" stroke="${accent}" stroke-width="2" opacity=".85"/><path d="M168 398 H190 M230 398 H252" fill="none" stroke="${accent}" stroke-width="1.6" opacity=".8"/>`;
    } else if (garmentId === "m-sherwani") {
      layers = `${add(mSherwani, fabricFill)}${longSleeves(fabricFill)}${add(mSherwaniPants, accentFill)}${kurtaShade}<path d="M196 142 L210 164 L224 142" ${detail}/><path d="M210 164 V342" ${detail}/><path d="M170 334 H250" fill="none" stroke="${accent}" stroke-width="2.2" opacity=".9"/><circle cx="210" cy="192" r="1.6" fill="rgba(255,255,255,.58)"/><circle cx="210" cy="208" r="1.6" fill="rgba(255,255,255,.58)"/><circle cx="210" cy="224" r="1.6" fill="rgba(255,255,255,.58)"/>`;
    } else if (garmentId === "m-waistcoat") {
      layers = `${add(mKurta, "#f4f1e8")}${longSleeves("#f4f1e8")}${add(mKurtaPants, accentFill)}${kurtaShade}${add(mWaistcoat, fabricFill)}${waistcoatShade}<path d="M196 136 L210 164 L224 136" ${detail}/><path d="M210 164 V330" ${detail}/><path d="M178 250 H196 M224 250 H242" ${detail}/><circle cx="210" cy="196" r="1.5" fill="rgba(255,255,255,.58)"/><circle cx="210" cy="212" r="1.5" fill="rgba(255,255,255,.58)"/><circle cx="210" cy="228" r="1.5" fill="rgba(255,255,255,.58)"/>`;
    } else {
      layers = `${add(jacket, fabricFill)}${longSleeves(fabricFill)}${add(trousers, bottomFill)}<path d="M190 142 L210 185 L230 142" ${detail}/><path d="M210 142 V318" ${detail}/><circle cx="210" cy="224" r="1.8" fill="rgba(255,255,255,.7)"/><path d="M206 146 L214 146 L210 196 Z" fill="${highlight}" opacity=".82"/>${maleJacketChest}`;
    }

    const lookLabel = (GARMENT_LABELS[garmentId] || garmentId).toUpperCase();
    return `<svg viewBox="0 0 420 480" role="img" aria-label="${GARMENT_LABELS[garmentId] || garmentId} Anime-style model study"><defs>${defs}</defs><rect width="420" height="480" fill="url(#${uid}-bg)"/><circle cx="210" cy="220" r="184" fill="url(#${uid}-glow)"/><path d="M92 448 V210 Q92 62 210 62 Q328 62 328 210 V448" fill="none" stroke="rgba(80,62,45,.16)" stroke-width="1.2"/><path d="M112 448 V220 Q112 82 210 82 Q308 82 308 220 V448" fill="none" stroke="rgba(80,62,45,.06)" stroke-width="1"/><path d="M210 70 L120 448 H300 Z" fill="rgba(169,78,49,.035)"/><ellipse cx="210" cy="430" rx="150" ry="28" fill="url(#${uid}-floor)"/><ellipse cx="210" cy="430" rx="106" ry="17" fill="rgba(80,62,45,.14)"/><ellipse cx="210" cy="430" rx="120" ry="22" fill="none" stroke="rgba(80,62,45,.18)" stroke-width="1"/>${figure}<g filter="url(#${uid}-model-shadow)">${layers}</g><path d="M150 448 H270" stroke="rgba(80,62,45,.24)" stroke-width="1.2" stroke-linecap="round"/><text x="210" y="466" text-anchor="middle" fill="rgba(70,58,45,.58)" font-family="Georgia, 'Times New Roman', serif" font-size="8.5" letter-spacing="1.6">THE CLOTH ROOM · MODEL STUDY · ${lookLabel}</text></svg>`;
  }

  function getLookNote(garment, analysis) {
    const names = analysis.palette.map((color) => color.name.toLowerCase());
    const primary = names[0] || "tonal";
    const secondary = names[1] || primary;
    const occasion = {
      office: "For the office, keep the palette close and let one clean accessory do the rest.",
      evening: `For the evening, lean into the ${primary} depth — a small metallic earring or a heel is enough.`,
      weekend: `For the weekend, pair it with ${secondary} separates and flat shoes.`,
      wedding: `For a wedding, let the ${primary} cloth carry the look and keep the jewellery quiet.`,
    }[lookOccasion] || "";
    const finish = {
      tailored: "Cut it with a clean shoulder, a defined waist and a sharp hem.",
      relaxed: "Size it up a little and let the cloth fall away from the body.",
      fluid: "Cut it on the bias and keep the line long.",
    }[lookFinish] || "";
    const colorway = {
      detected: "Colour straight from the cloth.",
      monochrome: "One tone, texture-led.",
      contrast: "Contrast panels and trims.",
    }[lookColorway] || "";
    return `${garment.note} ${occasion} ${finish} ${colorway}`;
  }

  function getLookOptions(brief = fabricLastBrief) {
    if (!brief) return [];
    if (lookCollection === "desi") {
      return brief.desiGarments.filter((item) => item.gender === lookModel);
    }
    return brief.garments.filter((item) => lookModel === "her" || !["dress", "skirt"].includes(item.id));
  }

  function syncLookSwitches() {
    document.querySelectorAll("#look-model-switch [data-model]").forEach((button) => {
      const active = button.dataset.model === lookModel;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("#look-collection-switch [data-collection]").forEach((button) => {
      const active = button.dataset.collection === lookCollection;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setLookModel(model) {
    lookModel = model;
    syncLookSwitches();
    renderLookPreview(fabricLastBrief);
  }

  function setLookCollection(collection) {
    lookCollection = collection;
    syncLookSwitches();
    renderLookPreview(fabricLastBrief);
  }

  function selectLook(id) {
    const brief = fabricLastBrief;
    if (!brief) return;
    const desi = brief.desiGarments.find((item) => item.id === id);
    const modern = brief.garments.find((item) => item.id === id);
    if (desi) {
      lookCollection = "desi";
      lookModel = desi.gender;
    } else if (modern) {
      lookCollection = "modern";
      if (["dress", "skirt"].includes(id)) lookModel = "her";
    }
    selectedLook = id;
    syncLookSwitches();
    renderLookPreview(brief);
  }

  function renderLookPreview(brief = fabricLastBrief) {
    if (!brief || !fabricLookSvgWrap) return;
    const options = getLookOptions(brief);
    const garment = options.find((item) => item.id === selectedLook) || options[0];
    if (!garment) return;
    selectedLook = garment.id;
    fabricLookSvgWrap.innerHTML = buildLookSvg(garment.id, brief.palette, brief.pattern, lookColorway, lookModel, brief.textureUrl);
    if (fabricLookTag) fabricLookTag.textContent = `Model study · ${lookModel === "her" ? "Her" : "Him"} · ${lookCollection === "desi" ? "Desi" : "Modern"}`;
    if (fabricLookTitle) fabricLookTitle.textContent = garment.name;
    if (fabricLookNote) fabricLookNote.textContent = getLookNote(garment, brief);
    if (fabricLookPills) {
      const pillKey = options.map((item) => item.id).join("|");
      if (fabricLookPills.dataset.key !== pillKey) {
        fabricLookPills.innerHTML = options.map((item) => `<button class="look-pill ${item.id === selectedLook ? "active" : ""}" type="button" data-look="${item.id}">${escapeHtml(item.name)}</button>`).join("");
        fabricLookPills.dataset.key = pillKey;
      } else {
        [...fabricLookPills.children].forEach((pill) => {
          pill.classList.toggle("active", pill.dataset.look === selectedLook);
        });
      }
    }
    document.querySelectorAll("#garment-grid .garment-card, #desi-grid .garment-card").forEach((card) => {
      card.classList.toggle("is-selected", card.dataset.look === selectedLook);
    });
    syncLookSwitches();
  }

  function downloadLook() {
    const svg = fabricLookSvgWrap?.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const serialized = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 840;
      canvas.height = 960;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        return;
      }
      context.fillStyle = "#f6f0e4";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) return;
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `cloth-room-${selectedLook}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setFabricStatus("The image didn't save. Try once more.", true);
    };
    image.src = url;
  }

  function surpriseLook() {
    if (!fabricLastBrief) return;
    const options = getLookOptions(fabricLastBrief).filter((item) => item.id !== selectedLook);
    if (options.length) selectedLook = options[Math.floor(Math.random() * options.length)].id;
    const occasions = ["office", "evening", "weekend", "wedding"];
    const finishes = ["tailored", "relaxed", "fluid"];
    const colorways = ["detected", "monochrome", "contrast"];
    lookOccasion = occasions[Math.floor(Math.random() * occasions.length)];
    lookFinish = finishes[Math.floor(Math.random() * finishes.length)];
    lookColorway = colorways[Math.floor(Math.random() * colorways.length)];
    if (fabricLookOccasion) fabricLookOccasion.value = lookOccasion;
    if (fabricLookFinish) fabricLookFinish.value = lookFinish;
    if (fabricLookColorway) fabricLookColorway.value = lookColorway;
    renderLookPreview(fabricLastBrief);
    setFabricStatus(`Turned the page: ${fabricLookTitle?.textContent || "a new piece"}.`);
  }

  function renderBrief(brief) {
    if (!fabricBriefContent) return;
    fabricBriefEmpty.hidden = true;
    fabricBriefContent.hidden = false;
    fabricBriefTitle.textContent = brief.title;
    fabricBriefTag.textContent = brief.tag;
    fabricBriefSummary.textContent = brief.summary;
    selectedLook = getLookOptions(brief)[0]?.id || brief.garments[0]?.id || "suit";
    fabricPalette.innerHTML = brief.palette.map((color) => `<span class="swatch"><i style="background:${color.hex}"></i>${escapeHtml(color.name)} <span>${color.hex}</span></span>`).join("");
    fabricFacts.innerHTML = brief.facts.map((fact) => `<div class="fact"><span>${escapeHtml(fact.label)}</span><strong>${escapeHtml(fact.value)}</strong></div>`).join("");
    fabricGarmentGrid.innerHTML = brief.garments.map((garment) => `<article class="garment-card ${garment.id === selectedLook ? "is-selected" : ""}" data-look="${garment.id}" tabindex="0" role="button" aria-label="Preview ${escapeHtml(garment.name)}"><div class="garment-visual">${garmentSvg(garment.id, brief.palette, brief.pattern, brief.textureUrl)}</div><div class="garment-copy"><h4>${escapeHtml(garment.name)}</h4><p>${escapeHtml(garment.note)}</p></div></article>`).join("");
    if (fabricDesiGrid) {
      fabricDesiGrid.innerHTML = brief.desiGarments.map((garment) => `<article class="garment-card desi-card ${garment.id === selectedLook ? "is-selected" : ""}" data-look="${garment.id}" tabindex="0" role="button" aria-label="Preview ${escapeHtml(garment.name)}"><div class="garment-visual">${garmentSvg(garment.id, brief.palette, brief.pattern, brief.textureUrl)}</div><div class="garment-copy"><span class="desi-gender">${garment.gender === "her" ? "Women" : "Men"}</span><h4>${escapeHtml(garment.name)}</h4><p>${escapeHtml(garment.note)}</p></div></article>`).join("");
    }
    fabricArticle.innerHTML = `<h3>${escapeHtml(brief.article.heading)}</h3>${brief.article.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}<div class="styling-note">${escapeHtml(brief.article.note)}</div>`;
    renderLookPreview(brief);
  }

  async function analyzeFabric() {
    if (!fabricSource || fabricAnalyzing) return;
    fabricAnalyzing = true;
    if (fabricAnalyzeBtn) fabricAnalyzeBtn.disabled = true;
    setAnalyzeLabel("Reading the cloth…");
    setFabricStatus("Reading the colour and the fall…");
    fabricPreview?.classList.add("is-scanning");

    try {
      await new Promise((resolve) => setTimeout(resolve, 850));
      const analysis = readFabricPixels(fabricSource);
      const brief = buildBrief(analysis, fabricSource.name);
      fabricLastBrief = brief;
      renderBrief(brief);
      setFabricStatus("The notes are ready — eight modern pieces, ten desi pieces and a model study.");
    } catch (error) {
      console.error(error);
      setFabricStatus("I could not read that frame. Try a clear photo or another video.", true);
    } finally {
      fabricAnalyzing = false;
      if (fabricAnalyzeBtn) fabricAnalyzeBtn.disabled = !fabricSource;
      setAnalyzeLabel("Read this cloth");
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
    setFabricStatus("Putting the cloth on the table…");

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
      setFabricStatus("The sample could not be prepared. Try a photo instead.", true);
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

  fabricLookPills?.addEventListener("click", (event) => {
    const pill = event.target.closest("[data-look]");
    if (!pill) return;
    selectLook(pill.dataset.look);
  });

  [fabricGarmentGrid, fabricDesiGrid].forEach((grid) => {
    grid?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-look]");
      if (!card) return;
      selectLook(card.dataset.look);
    });

    grid?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest("[data-look]");
      if (!card) return;
      event.preventDefault();
      selectLook(card.dataset.look);
    });
  });

  fabricLookModelSwitch?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-model]");
    if (!button) return;
    setLookModel(button.dataset.model);
  });

  fabricLookCollectionSwitch?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-collection]");
    if (!button) return;
    setLookCollection(button.dataset.collection);
  });

  fabricLookOccasion?.addEventListener("change", () => {
    lookOccasion = fabricLookOccasion.value;
    renderLookPreview(fabricLastBrief);
  });

  fabricLookFinish?.addEventListener("change", () => {
    lookFinish = fabricLookFinish.value;
    renderLookPreview(fabricLastBrief);
  });

  fabricLookColorway?.addEventListener("change", () => {
    lookColorway = fabricLookColorway.value;
    renderLookPreview(fabricLastBrief);
  });

  fabricSaveLookBtn?.addEventListener("click", downloadLook);
  fabricSurpriseBtn?.addEventListener("click", surpriseLook);

  fabricCopyBtn?.addEventListener("click", async () => {
    if (!fabricLastBrief) return;
    try {
      await navigator.clipboard.writeText(fabricLastBrief.plain);
      fabricCopyBtn.textContent = "Copied";
      setTimeout(() => {
        fabricCopyBtn.textContent = "Copy the notes";
      }, 1600);
    } catch {
      setFabricStatus("Couldn't copy. Select the notes and copy them by hand.", true);
    }
  });
})();
