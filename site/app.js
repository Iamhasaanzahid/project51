import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

(() => {
  /* ============================================================
     THE CLOTH ROOM — REAL 3D TRY-ON
     Real human avatars (glTF), fabric mapped onto 3D garments,
     real-world scenes, drape + folds, on-device style analysis.
     ============================================================ */

  const $ = (id) => document.getElementById(id);

  const stageCanvas = $("stage-canvas");
  const stageWrap = $("stage-wrap");
  const stageOverlay = $("stage-overlay");
  const renderBtn = $("render-look");
  const saveBtn = $("save-look");
  const pipelineStatus = $("pipeline-status");
  const aiStatus = $("ai-status");

  const metaModel = $("meta-model");
  const metaScene = $("meta-scene");
  const metaGarment = $("meta-garment");
  const metaBottom = $("meta-bottom");
  const metaFabric = $("meta-fabric");

  const styleScore = $("style-score");
  const styleBar = $("style-bar");
  const styleNote = $("style-note");
  const styleTips = $("style-tips");

  const navItems = document.querySelectorAll(".nav-item");
  const views = document.querySelectorAll(".view");
  const viewTitle = $("view-title");

  const modelGrid = $("model-grid");
  const garmentGrid = $("garment-grid");
  const bottomRow = $("bottom-row");
  const toneRow = $("tone-row");
  const fitRow = $("fit-row");
  const sceneGrid = $("scene-grid");
  const lookGrid = $("look-grid");

  const dropZone = $("drop-zone");
  const fabricFileInput = $("fabric-file");
  const fabricPreviewCanvas = $("fabric-preview-canvas");
  const fabricStatus = $("fabric-status");
  const sampleChips = document.querySelectorAll(".sample-chip");

  const garmentDrop = $("garment-drop");
  const garmentFileInput = $("garment-file");
  const garmentPreview = $("garment-preview");
  const garmentStatus = $("garment-status");

  const W = 720;
  const H = 900;

  /* ---------------- Data ---------------- */
  const MODELS = [
    {
      id: "male-athletic", name: "Rohan", tag: "Athletic fit · 3D", gender: "him", garment: "shirt",
      image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=75",
    },
    {
      id: "male-tall", name: "Arman", tag: "Kurta · 3D", gender: "him", garment: "kurta",
      image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&q=75",
    },
    {
      id: "female-1", name: "Zara", tag: "Fitted set · 3D", gender: "her", garment: "set",
      image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&q=75",
    },
    {
      id: "female-2", name: "Sana", tag: "Saree drape · 3D", gender: "her", garment: "saree",
      image: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&q=75",
    },
  ];

  const SCENES = [
    { id: "street", name: "City street", mood: "cool", lum: 0.34, note: "dusk light", image: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1600&q=80" },
    { id: "cafe", name: "Modern cafe", mood: "warm", lum: 0.5, note: "amber interior", image: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1600&q=80" },
    { id: "park", name: "Outdoor park", mood: "cool", lum: 0.64, note: "green daylight", image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1600&q=80" },
    { id: "bazaar", name: "Street bazaar", mood: "warm", lum: 0.48, note: "golden hour", image: "https://images.unsplash.com/photo-1533900298318-6b8da08a523e?w=1600&q=80" },
    { id: "boutique", name: "Designer boutique", mood: "neutral", lum: 0.55, note: "soft retail light", image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1600&q=80" },
    { id: "mall", name: "Luxury mall", mood: "cool", lum: 0.52, note: "polished interior", image: "https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?w=1600&q=80" },
    { id: "beach", name: "Coastal resort", mood: "cool", lum: 0.8, note: "sunset", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=80" },
    { id: "citydusk", name: "City at dusk", mood: "cool", lum: 0.3, note: "blue hour", image: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1600&q=80" },
  ];

  const GARMENTS = {
    him: [
      { id: "shirt", name: "Fitted shirt", note: "Modern", bottom: "trousers", separable: true, occasion: "smart-casual days", styling: "tan loafers and a slim belt", fit: 88 },
      { id: "overshirt", name: "Overshirt", note: "Layered", bottom: "trousers", separable: true, occasion: "weekend city walks", styling: "a plain tee and white sneakers", fit: 87 },
      { id: "kurta", name: "Kurta", note: "Longline", bottom: "churidar", separable: true, occasion: "evening gatherings and Eid", styling: "an embroidered shawl", fit: 89 },
      { id: "pathani", name: "Pathani suit", note: "Classic", bottom: "trousers", separable: true, occasion: "daytime family events", styling: "a leather sandal and a slim watch", fit: 90 },
      { id: "shalwar", name: "Shalwar kameez", note: "Traditional", bottom: "shalwar", separable: true, occasion: "Eid and family lunches", styling: "an embroidered shawl and mojaris", fit: 92 },
      { id: "sherwani", name: "Sherwani", note: "Occasion", bottom: "churidar", separable: true, occasion: "weddings and receptions", styling: "a pocket square and mojaris", fit: 94 },
      { id: "bandhgala", name: "Bandhgala", note: "Formal", bottom: "churidar", separable: true, occasion: "receptions and formal dinners", styling: "a silk pocket square", fit: 93 },
      { id: "blazer", name: "Suit blazer", note: "Tailored", bottom: "trousers", separable: true, occasion: "office days and dinners", styling: "a crisp shirt and leather loafers", fit: 92 },
      { id: "waistcoat", name: "Nehru vest", note: "Layer", bottom: "trousers", separable: true, occasion: "layered festive looks", styling: "a crisp white kurta", fit: 87 },
    ],
    her: [
      { id: "set", name: "Fitted set", note: "Top + leggings", bottom: "leggings", separable: true, occasion: "studio fittings and casual outings", styling: "a cropped jacket", fit: 88 },
      { id: "kurti", name: "Kurti", note: "Short", bottom: "leggings", separable: true, occasion: "daytime errands and brunch", styling: "a slim palazzo and jhumkas", fit: 89 },
      { id: "kurta", name: "Kurta", note: "Longline", bottom: "churidar", separable: true, occasion: "evening gatherings and Eid", styling: "a statement earring", fit: 90 },
      { id: "shalwar", name: "Shalwar kameez", note: "Traditional", bottom: "shalwar", separable: true, occasion: "Eid and family lunches", styling: "a dupatta and jhumkas", fit: 92 },
      { id: "anarkali", name: "Anarkali", note: "Flared", bottom: "included", separable: false, occasion: "weddings and festive evenings", styling: "a maang tikka and a gold clutch", fit: 95 },
      { id: "lehenga", name: "Lehenga", note: "Flared", bottom: "included", separable: false, occasion: "weddings and festive evenings", styling: "a maang tikka and a gold clutch", fit: 94 },
      { id: "saree", name: "Saree drape", note: "Classic", bottom: "included", separable: false, occasion: "classic evening functions", styling: "jhumkas and a potli bag", fit: 94 },
      { id: "dress", name: "Column gown", note: "Fluid", bottom: "included", separable: false, occasion: "dinner reservations and gallery openings", styling: "a sculptural heel", fit: 90 },
      { id: "sharara", name: "Sharara set", note: "Flared", bottom: "included", separable: false, occasion: "festive evenings and mehndi", styling: "a choker and a potli bag", fit: 93 },
    ],
  };

  const BOTTOMS = {
    him: [
      { id: "auto", name: "Outfit default", note: "As designed" },
      { id: "trousers", name: "Trousers", note: "Tailored straight leg" },
      { id: "jeans", name: "Jeans", note: "Slim denim" },
      { id: "churidar", name: "Churidar", note: "Fitted, ankle bunching" },
      { id: "shalwar", name: "Shalwar", note: "Wide, draped leg" },
    ],
    her: [
      { id: "auto", name: "Outfit default", note: "As designed" },
      { id: "leggings", name: "Leggings", note: "Second-skin fit" },
      { id: "trousers", name: "Trousers", note: "Tailored straight leg" },
      { id: "jeans", name: "Jeans", note: "Slim denim" },
      { id: "churidar", name: "Churidar", note: "Fitted, ankle bunching" },
      { id: "shalwar", name: "Shalwar", note: "Wide, draped leg" },
      { id: "skirt", name: "Midi skirt", note: "A-line drape" },
    ],
  };

  const FIT = { slim: 0.94, regular: 1, relaxed: 1.08 };

  const BOTTOM_TONES = [
    { id: "auto", name: "Auto" },
    { id: "match", name: "Match fabric" },
    { id: "charcoal", name: "Charcoal", color: 0x2e2c29 },
    { id: "navy", name: "Navy", color: 0x1f2c45 },
    { id: "ecru", name: "Ecru", color: 0xcbb894 },
    { id: "denim", name: "Denim", color: 0x2b4166 },
    { id: "black", name: "Black", color: 0x141312 },
  ];

  const GARMENT_PATHS = {
    shirt: "M34 21 L44 13 L56 13 L66 21 L82 31 L74 45 L69 40 L69 105 L31 105 L31 40 L26 45 L18 31 Z",
    overshirt: "M34 21 L44 13 L56 13 L66 21 L82 31 L74 45 L69 40 L69 105 L31 105 L31 40 L26 45 L18 31 Z M44 16 L50 48 L56 16",
    kurta: "M34 20 L42 13 L58 13 L66 20 L79 32 L73 43 L68 39 L68 86 L32 86 L32 39 L27 43 L21 32 Z M37 89 H63 L68 113 H54 L50 100 L46 113 H32 Z",
    pathani: "M34 20 L42 13 L58 13 L66 20 L79 32 L73 43 L68 39 L68 80 L32 80 L32 39 L27 43 L21 32 Z M37 83 H63 L68 113 H54 L50 98 L46 113 H32 Z",
    shalwar: "M34 18 L42 12 L58 12 L66 18 L76 30 L70 42 L66 38 L66 78 L34 78 L34 38 L30 42 L24 30 Z M36 82 H46 L48 112 H40 L38 92 L36 112 H28 Z M54 82 H64 L72 112 H64 L62 92 L60 112 H52 Z",
    sherwani: "M34 18 L42 12 L58 12 L66 18 L80 34 L72 44 L68 40 L68 98 L32 98 L32 40 L28 44 L20 34 Z M38 100 H62 L66 113 H54 L50 104 L46 113 H34 Z",
    bandhgala: "M34 18 L42 12 L58 12 L66 18 L80 34 L72 44 L68 40 L68 88 L32 88 L32 40 L28 44 L20 34 Z M38 90 H62 L66 113 H54 L50 100 L46 113 H34 Z",
    blazer: "M34 21 L44 13 L56 13 L66 21 L82 31 L74 45 L69 40 L69 102 L31 102 L31 40 L26 45 L18 31 Z M44 16 L50 52 L56 16",
    waistcoat: "M38 17 L46 13 L54 13 L62 17 L64 74 L56 78 L50 70 L44 78 L36 74 Z",
    set: "M40 22 L48 14 L56 14 L64 22 L76 30 L70 42 L66 38 L66 60 L34 60 L34 38 L30 42 L24 30 Z M38 64 H62 L64 108 H52 L50 80 L46 108 H34 Z",
    kurti: "M34 20 L42 13 L58 13 L66 20 L79 32 L73 43 L68 39 L68 70 L32 70 L32 39 L27 43 L21 32 Z M36 73 H64 L66 108 H52 L50 88 L46 108 H34 Z",
    anarkali: "M38 15 L43 33 L38 52 L18 105 L82 105 L62 52 L57 33 L62 15 Z M42 16 Q50 24 58 16",
    lehenga: "M38 17 L44 30 L56 30 L62 17 L58 42 L42 42 Z M40 46 H60 L82 113 H18 Z",
    saree: "M38 14 Q50 22 62 14 L66 32 L58 44 L80 113 H20 L42 44 L34 32 Z M62 20 Q82 38 74 78 L66 74 Q72 44 56 28 Z",
    dress: "M38 15 L43 33 L39 50 L23 105 L77 105 L61 50 L57 33 L62 15 Z",
    sharara: "M34 18 L42 12 L58 12 L66 18 L76 30 L70 42 L66 38 L66 70 L34 70 L34 38 L30 42 L24 30 Z M38 74 H46 L50 112 H40 L38 90 L36 112 H26 Z M54 74 H62 L74 112 H64 L62 90 L60 112 H50 Z",
  };

  const state = {
    gender: "him",
    model: MODELS[0],
    garment: "shirt",
    bottom: "auto",
    bottomTone: "auto",
    fit: "regular",
    scene: SCENES[0],
    fabric: null,
  };

  const looks = [];

  /* ---------------- Three.js setup ---------------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, W / H, 0.1, 100);
  camera.position.set(0, 2.02, 8.6);
  camera.lookAt(0, 1.92, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas: stageCanvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  scene.add(new THREE.HemisphereLight(0xfff4e2, 0x2b2118, 0.55));

  const key = new THREE.DirectionalLight(0xfff2dc, 2.4);
  key.position.set(-3.2, 6.2, 5.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -1;
  key.shadow.bias = -0.0015;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xdce8ff, 0.75);
  fill.position.set(4.5, 3, 3.5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffd6a8, 1.1);
  rim.position.set(1.5, 4.5, -5);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.ShadowMaterial({ color: 0x1d130b, opacity: 0.34 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  /* ---------------- Materials ---------------- */
  const avatarFabricMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.0,
    side: THREE.FrontSide,
  });

  const overlayMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const bottomMat = new THREE.MeshStandardMaterial({
    color: 0x2e2c29,
    roughness: 0.92,
    metalness: 0.0,
  });

  const bottomOverlayMat = new THREE.MeshStandardMaterial({
    color: 0x2e2c29,
    roughness: 0.94,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const footwearMat = new THREE.MeshStandardMaterial({
    color: 0x2a2622,
    roughness: 0.62,
    metalness: 0.05,
  });

  let fabricTexture = null;

  function setFabricTexture(img) {
    if (fabricTexture) fabricTexture.dispose();
    fabricTexture = new THREE.Texture(img);
    fabricTexture.colorSpace = THREE.SRGBColorSpace;
    fabricTexture.wrapS = THREE.RepeatWrapping;
    fabricTexture.wrapT = THREE.RepeatWrapping;
    fabricTexture.repeat.set(2, 2);
    fabricTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    fabricTexture.needsUpdate = true;

    avatarFabricMat.map = fabricTexture;
    avatarFabricMat.bumpMap = fabricTexture;
    avatarFabricMat.bumpScale = 0.006;
    avatarFabricMat.needsUpdate = true;

    overlayMat.map = fabricTexture;
    overlayMat.bumpMap = fabricTexture;
    overlayMat.bumpScale = 0.012;
    overlayMat.needsUpdate = true;
  }

  /* ---------------- Avatar ---------------- */
  const loader = new GLTFLoader();
  const AVATAR_URL = { him: "models/thanh.glb", her: "models/tham.glb" };
  const avatarCache = {};
  let avatar = null;
  let overlayGroup = null;
  let loadToken = 0;

  function poseAvatar(root) {
    const bones = {};
    root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    if (bones.LeftArm) bones.LeftArm.rotation.set(1.25, 0, 0);
    if (bones.RightArm) bones.RightArm.rotation.set(1.25, 0, 0);
    if (bones.LeftForeArm) bones.LeftForeArm.rotation.set(0.12, 0, 0);
    if (bones.RightForeArm) bones.RightForeArm.rotation.set(0.12, 0, 0);
  }

  function prepareAvatar(root) {
    poseAvatar(root);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (o.name === "Wolf3D_Glasses") o.visible = false;
      if (o.name === "Wolf3D_Outfit_Footwear") o.material = footwearMat;
      if (o.name === "Wolf3D_Outfit_Top") o.userData.role = "top";
      if (o.name === "Wolf3D_Outfit_Bottom") o.userData.role = "bottom";
      if (o.userData.role) {
        o.userData.originalMat = o.material;
        o.userData.originalScale = o.scale.clone();
      }
    });
    root.scale.setScalar(2.0);
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
  }

  async function ensureAvatar(gender) {
    if (avatarCache[gender]) return avatarCache[gender];
    const gltf = await loader.loadAsync(AVATAR_URL[gender]);
    const root = gltf.scene;
    prepareAvatar(root);
    avatarCache[gender] = root;
    return root;
  }

  async function setModel(model) {
    state.model = model;
    state.gender = model.gender;
    state.garment = model.garment;
    state.bottom = "auto";
    state.bottomTone = "auto";
    state.fit = "regular";
    metaModel.textContent = `${model.name} · ${model.tag}`;
    metaGarment.textContent = garmentLabel(state.garment);
    metaBottom.textContent = bottomLabel("auto");
    renderModelGrid();
    renderGarmentGrid();
    renderBottomRow();
    renderToneRow();
    syncFitRow();

    const token = ++loadToken;
    stageOverlay.hidden = false;
    stageOverlay.textContent = "Loading 3D model…";
    setStatus("Loading 3D model…");

    try {
      const root = await ensureAvatar(model.gender);
      if (token !== loadToken) return;
      if (avatar) scene.remove(avatar);
      avatar = root;
      scene.add(avatar);
      styleAvatar();
      buildOverlay();
      stageOverlay.hidden = false;
      updateOverlay();
      updateStyle();
      setStatus("Live 3D");
    } catch (err) {
      if (token !== loadToken) return;
      stageOverlay.textContent = "Could not load the 3D model.";
      setStatus("Model failed to load");
    }
  }

  function styleAvatar() {
    if (!avatar) return;
    const b = effectiveBottom();
    const fittedBottom = ["trousers", "jeans", "churidar", "leggings"].includes(b);
    const af = avatarFit();
    const mats = bottomMaterials();
    avatar.traverse((o) => {
      if (!o.isMesh || !o.userData.role) return;
      const base = o.userData.originalScale;
      if (o.userData.role === "top") {
        o.material = avatarFabricMat;
        if (base) o.scale.set(base.x * af, base.y, base.z * af);
      } else if (o.userData.role === "bottom") {
        if (b === "included") {
          o.visible = false;
          return;
        }
        o.visible = true;
        o.material = fittedBottom ? mats.mesh : o.userData.originalMat;
        if (base) {
          const s = fittedBottom ? af : 1;
          o.scale.set(base.x * s, base.y, base.z * s);
        }
      }
    });
  }

  /* ---------------- Drape geometry ---------------- */
  function drapedCylinder(rTop, rBottom, height, radial = 48, hseg = 14, folds = 9, depth = 0.012, gap = 0) {
    const geo = new THREE.CylinderGeometry(rTop, rBottom, height, radial, hseg, true, gap / 2, Math.PI * 2 - gap);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const t = (v.y + height / 2) / height;
      const ang = Math.atan2(v.z, v.x);
      const r = Math.hypot(v.x, v.z);
      const wave = Math.sin(ang * folds + t * 2.4) * depth * (0.35 + 0.65 * (1 - t));
      const nr = r + wave;
      v.x = Math.cos(ang) * nr;
      v.z = Math.sin(ang) * nr;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function drapedLathe(profile, folds = 9, depth = 0.008) {
    const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(pts, 64);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const yMin = profile[0][1];
    const yMax = profile[profile.length - 1][1];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const ang = Math.atan2(v.z, v.x);
      const r = Math.hypot(v.x, v.z);
      const t = (v.y - yMin) / (yMax - yMin);
      const wave = Math.sin(ang * folds + t * 2.4) * depth * (0.35 + 0.65 * (1 - t));
      const nr = r + wave;
      v.x = Math.cos(ang) * nr;
      v.z = Math.sin(ang) * nr;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function addOverlayMesh(group, geo, pos, scale, rot, mat = overlayMat) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  }

  function addBand(group, radius, y, zScale, thickness = 0.016, mat = overlayMat) {
    addOverlayMesh(
      group,
      new THREE.TorusGeometry(radius, thickness, 10, 40),
      [0, y, 0],
      [1, 1, zScale],
      [Math.PI / 2, 0, 0],
      mat
    );
  }

  function buildOverlay() {
    if (!avatar) return;
    if (overlayGroup) { avatar.remove(overlayGroup); overlayGroup = null; }
    overlayGroup = new THREE.Group();
    avatar.add(overlayGroup);

    const g = state.garment;
    const her = state.gender === "her";
    const fs = fitScale();
    const b = effectiveBottom();
    const mats = bottomMaterials();

    const top = (rTop, rBottom, height, y, zs, folds, depth, gap = 0) => {
      addOverlayMesh(
        overlayGroup,
        drapedCylinder(rTop * fs, rBottom * fs, height, 48, 18, folds, depth, gap),
        [0, y, 0],
        [1, 1, zs]
      );
    };
    const band = (r, y, zs) => addBand(overlayGroup, r * fs, y, zs, 0.008);
    const collar = (r, y) => addOverlayMesh(
      overlayGroup,
      new THREE.TorusGeometry(r * fs, 0.016, 10, 24, Math.PI),
      [0, y, 0.02],
      null,
      [Math.PI / 2, 0, 0]
    );
    const lapels = (y) => {
      addOverlayMesh(overlayGroup, new THREE.BoxGeometry(0.055 * fs, 0.24, 0.012), [-0.072 * fs, y, 0.17], null, [0, 0, -0.18]);
      addOverlayMesh(overlayGroup, new THREE.BoxGeometry(0.055 * fs, 0.24, 0.012), [0.072 * fs, y, 0.17], null, [0, 0, 0.18]);
    };
    const tunic = (profile, zs, folds = 9, depth = 0.008) => {
      const scaled = profile.map(([r, y]) => [r * fs, y]);
      addOverlayMesh(overlayGroup, drapedLathe(scaled, folds, depth), null, [1, 1, zs]);
    };

    if (!her) {
      if (g === "overshirt") {
        top(0.205, 0.225, 0.64, 1.10, 0.76, 7, 0.007, 0.62);
        lapels(1.30);
        collar(0.095, 1.43);
      } else if (g === "shirt") {
        tunic([[0.19, 0.86], [0.19, 0.98], [0.195, 1.10], [0.205, 1.24], [0.21, 1.36], [0.1, 1.38]], 0.75, 8, 0.005);
        collar(0.075, 1.37);
      } else if (g === "kurta") {
        tunic([[0.255,0.47],[0.235,0.70],[0.215,0.95],[0.205,1.20],[0.21,1.36],[0.205,1.44]], 0.74, 9, 0.009);
        collar(0.09, 1.44);
      } else if (g === "pathani") {
        tunic([[0.245,0.61],[0.225,0.80],[0.21,1.00],[0.205,1.20],[0.21,1.36],[0.205,1.44]], 0.75, 8, 0.008);
        collar(0.09, 1.44);
      } else if (g === "shalwar") {
        tunic([[0.25,0.66],[0.23,0.82],[0.21,1.00],[0.205,1.20],[0.21,1.36],[0.205,1.44]], 0.75, 8, 0.008);
        collar(0.09, 1.44);
      } else if (g === "sherwani") {
        tunic([[0.26,0.345],[0.245,0.55],[0.22,0.80],[0.21,1.00],[0.205,1.20],[0.215,1.36],[0.21,1.44]], 0.73, 10, 0.009);
        collar(0.092, 1.45);
        lapels(1.28);
      } else if (g === "bandhgala") {
        tunic([[0.245,0.505],[0.23,0.70],[0.21,0.90],[0.205,1.10],[0.21,1.30],[0.205,1.44]], 0.74, 9, 0.008);
        collar(0.09, 1.44);
      } else if (g === "blazer") {
        top(0.21, 0.235, 0.74, 1.06, 0.76, 7, 0.007, 0.92);
        lapels(1.30);
        collar(0.095, 1.43);
      } else if (g === "waistcoat") {
        top(0.20, 0.19, 0.46, 1.21, 0.74, 6, 0.005);
        collar(0.10, 1.44);
      }
    } else {
      if (g === "set") {
        tunic([[0.185, 0.97], [0.19, 1.06], [0.2, 1.2], [0.205, 1.32], [0.2, 1.36]], 0.8, 8, 0.005);
        collar(0.07, 1.35);
      } else if (g === "kurti") {
        tunic([[0.235,0.86],[0.215,1.02],[0.205,1.20],[0.21,1.36],[0.205,1.44]], 0.76, 7, 0.007);
        collar(0.088, 1.44);
      } else if (g === "kurta") {
        tunic([[0.245,0.50],[0.225,0.70],[0.21,0.90],[0.205,1.10],[0.21,1.30],[0.205,1.44]], 0.74, 9, 0.009);
        collar(0.088, 1.44);
      } else if (g === "shalwar") {
        tunic([[0.24,0.69],[0.225,0.84],[0.21,1.00],[0.205,1.20],[0.21,1.36],[0.205,1.44]], 0.76, 8, 0.008);
        collar(0.088, 1.44);
      } else if (g === "anarkali") {
        top(0.19, 0.205, 0.42, 1.19, 0.78, 6, 0.005);
        top(0.205, 0.42, 0.94, 0.57, 0.9, 12, 0.014);
        band(0.205, 1.02, 0.9);
        collar(0.086, 1.44);
      } else if (g === "lehenga") {
        top(0.215, 0.44, 0.86, 0.55, 0.9, 12, 0.014);
        band(0.215, 0.98, 0.9);
      } else if (g === "saree") {
        top(0.205, 0.34, 0.88, 0.54, 0.9, 11, 0.012);
        band(0.205, 0.98, 0.9);
        addOverlayMesh(overlayGroup, new THREE.BoxGeometry(0.11 * fs, 0.62, 0.03), [0.105, 1.13, 0.13], null, [0, 0, 0.22]);
      } else if (g === "dress") {
        top(0.205, 0.36, 1.26, 0.70, 0.82, 11, 0.010);
        band(0.205, 1.33, 0.82);
      } else if (g === "sharara") {
        tunic([[0.235,0.82],[0.22,0.98],[0.21,1.16],[0.21,1.36],[0.205,1.44]], 0.76, 8, 0.008);
        for (const side of [-1, 1]) {
          addOverlayMesh(overlayGroup, drapedCylinder(0.12 * fs, 0.21 * fs, 0.84, 30, 14, 6, 0.009), [side * 0.105, 0.535, 0], [1, 1, 0.95]);
        }
      }
    }

    if (b === "shalwar") {
      for (const side of [-1, 1]) {
        addOverlayMesh(
          overlayGroup,
          drapedCylinder(0.088 * fs, 0.096 * fs, 0.84, 30, 14, 6, 0.008),
          [side * 0.115, 0.535, 0],
          [1, 1, 0.94],
          null,
          mats.overlay
        );
      }
    } else if (b === "skirt") {
      addOverlayMesh(
        overlayGroup,
        drapedCylinder(0.20 * fs, 0.31 * fs, 0.64, 48, 18, 10, 0.012),
        [0, 0.66, 0],
        [1, 1, 0.92],
        null,
        mats.overlay
      );
      addBand(overlayGroup, 0.20 * fs, 0.98, 0.92, 0.008, mats.overlay);
    } else if (b === "trousers" || b === "jeans") {
      const slim = b === "jeans";
      const rTop = (her ? (slim ? 0.066 : 0.070) : (slim ? 0.068 : 0.072)) * fs;
      const rBottom = (her ? (slim ? 0.056 : 0.060) : (slim ? 0.058 : 0.062)) * fs;
      const cx = her ? 0.095 : 0.10;
      for (const side of [-1, 1]) {
        addOverlayMesh(
          overlayGroup,
          drapedCylinder(rTop, rBottom, 0.84, 26, 12, 4, 0.004),
          [side * cx, 0.535, 0],
          [1, 1, 0.98],
          null,
          mats.overlay
        );
      }
    } else if (her && b === "churidar") {
      for (const side of [-1, 1]) {
        addOverlayMesh(
          overlayGroup,
          drapedCylinder(0.074 * fs, 0.058 * fs, 0.86, 26, 12, 5, 0.005),
          [side * 0.092, 0.53, 0],
          [1, 1, 0.98],
          null,
          mats.overlay
        );
      }
    }
  }

  function resolveBottomTone() {
    if (state.bottomTone !== "auto") return state.bottomTone;
    const b = effectiveBottom();
    if (b === "jeans") return "denim";
    if (b === "trousers") return "charcoal";
    return "match";
  }

  function bottomMaterials() {
    const tone = resolveBottomTone();
    if (tone === "match") return { mesh: avatarFabricMat, overlay: overlayMat };
    const def = BOTTOM_TONES.find((t) => t.id === tone);
    const color = def?.color ?? 0x2e2c29;
    bottomMat.color.setHex(color);
    bottomMat.map = null;
    bottomMat.bumpMap = null;
    bottomMat.needsUpdate = true;
    bottomOverlayMat.color.setHex(color);
    bottomOverlayMat.map = null;
    bottomOverlayMat.bumpMap = null;
    bottomOverlayMat.needsUpdate = true;
    return { mesh: bottomMat, overlay: bottomOverlayMat };
  }

  function effectiveBottom() {
    if (state.bottom !== "auto") return state.bottom;
    const g = garmentById(state.garment);
    return g.bottom || "trousers";
  }

  function fitScale() {
    return FIT[state.fit] || 1;
  }

  function avatarFit() {
    return 1 + (fitScale() - 1) * 0.5;
  }

  function bottomLabel(id) {
    if (id === "auto") {
      const g = garmentById(state.garment);
      if (g.bottom === "included") return "Included in outfit";
      const b = (BOTTOMS[state.gender] || []).find((x) => x.id === (g.bottom || "trousers"));
      return b ? `Auto · ${b.name}` : "Auto";
    }
    return (BOTTOMS[state.gender] || []).find((x) => x.id === id)?.name || id;
  }

  function renderBottomRow() {
    if (!bottomRow) return;
    const list = BOTTOMS[state.gender] || [];
    bottomRow.innerHTML = list.map((b) => `
      <button class="chip ${state.bottom === b.id ? "is-active" : ""}" data-bottom="${b.id}" title="${b.note}">${b.name}</button>
    `).join("");
    bottomRow.querySelectorAll("[data-bottom]").forEach((btn) => {
      btn.onclick = () => applyBottom(btn.dataset.bottom);
    });
  }

  function renderToneRow() {
    if (!toneRow) return;
    toneRow.innerHTML = BOTTOM_TONES.map((t) => `
      <button class="chip ${state.bottomTone === t.id ? "is-active" : ""}" data-tone="${t.id}">${t.name}</button>
    `).join("");
    toneRow.querySelectorAll("[data-tone]").forEach((btn) => {
      btn.onclick = () => {
        state.bottomTone = btn.dataset.tone;
        renderToneRow();
        styleAvatar();
        buildOverlay();
        setStatus(`Bottom tone: ${btn.textContent}.`);
      };
    });
  }

  function syncFitRow() {
    if (!fitRow) return;
    fitRow.querySelectorAll("[data-fit]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.fit === state.fit);
    });
  }

  function applyBottom(id) {
    const g = garmentById(state.garment);
    if (id !== "auto" && !g.separable) {
      state.garment = state.gender === "her"
        ? (id === "churidar" || id === "shalwar" ? "kurta" : "set")
        : (id === "churidar" || id === "shalwar" ? "kurta" : "shirt");
      metaGarment.textContent = garmentLabel(state.garment);
    }
    state.bottom = id;
    metaBottom.textContent = bottomLabel(id);
    renderGarmentGrid();
    renderBottomRow();
    styleAvatar();
    buildOverlay();
    updateStyle();
    setStatus(`${bottomLabel(id)} applied.`);
  }

  function applyGarment(id) {
    state.garment = id;
    state.bottom = "auto";
    metaGarment.textContent = garmentLabel(id);
    metaBottom.textContent = bottomLabel("auto");
    styleAvatar();
    buildOverlay();
    renderGarmentGrid();
    renderBottomRow();
    updateStyle();
  }

  function garmentLabel(id) {
    const all = [...GARMENTS.him, ...GARMENTS.her];
    return all.find((g) => g.id === id)?.name || id;
  }

  function garmentById(id) {
    const all = [...GARMENTS.him, ...GARMENTS.her];
    return all.find((g) => g.id === id) || GARMENTS.him[0];
  }

  /* ---------------- Scene background ---------------- */
  function setScene(sceneId) {
    const s = SCENES.find((x) => x.id === sceneId) || SCENES[0];
    state.scene = s;
    stageWrap.style.setProperty("--scene-image", `url("${s.image}")`);
    metaScene.textContent = s.name;
    updateOverlay();
    renderSceneGrid();
    updateStyle();
  }

  function updateOverlay() {
    if (!avatar) return;
    stageOverlay.hidden = false;
    stageOverlay.textContent = state.fabric
      ? `Live 3D · drag to rotate · ${state.fabric.name}`
      : "Live 3D · drag to rotate";
  }

  /* ---------------- Colour + style analysis ---------------- */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s, l };
  }

  function hueName(h) {
    if (h < 15 || h >= 345) return "rust";
    if (h < 40) return "ochre";
    if (h < 65) return "olive";
    if (h < 100) return "sage";
    if (h < 160) return "teal";
    if (h < 200) return "denim blue";
    if (h < 240) return "indigo";
    if (h < 275) return "violet";
    if (h < 315) return "plum";
    return "rose";
  }

  function colorName(h, s, l) {
    if (l < 0.1) return "ink black";
    if (s < 0.08) return l > 0.82 ? "ivory" : l > 0.55 ? "stone grey" : "charcoal";
    const hue = hueName(h);
    if (l > 0.84) return `pale ${hue}`;
    if (l < 0.26) return `deep ${hue}`;
    if (l > 0.66) return `soft ${hue}`;
    return hue;
  }

  function analyzeImage(src) {
    const s = 48;
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.clearRect(0, 0, s, s);
    x.drawImage(src, 0, 0, s, s);
    const d = x.getImageData(0, 0, s, s).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 30) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    if (!n) { r = 210; g = 196; b = 168; n = 1; }
    r /= n; g /= n; b /= n;

    let grad = 0, gn = 0;
    for (let y = 1; y < s - 1; y++) {
      for (let xx = 1; xx < s - 1; xx++) {
        const i = (y * s + xx) * 4;
        if (d[i + 3] < 30) continue;
        const j = (y * s + xx + 1) * 4;
        grad += Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]);
        gn++;
      }
    }
    const busy = gn ? Math.min(1, grad / (gn * 3 * 90)) : 0;
    const hsl = rgbToHsl(r, g, b);
    return {
      r, g, b, h: hsl.h, s: hsl.s, l: hsl.l, busy,
      colorName: colorName(hsl.h, hsl.s, hsl.l),
      hex: `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`,
    };
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function updateStyle() {
    const g = garmentById(state.garment);
    const s = state.scene;
    const f = state.fabric?.analysis || { h: 35, s: 0.3, l: 0.7, busy: 0.15, colorName: "oat" };

    const warmFabric = f.h < 65 || f.h > 320;
    const warmScene = s.mood === "warm";
    const harmony = warmFabric === warmScene ? 90 : 76;
    const contrast = Math.min(100, Math.round(Math.abs(f.l - s.lum) * 160 + 40));
    const texture = f.busy > 0.34 ? 82 : 92;
    const score = Math.round(clamp(0.34 * harmony + 0.24 * contrast + 0.18 * texture + 0.24 * g.fit, 68, 97));

    styleScore.textContent = String(score);
    styleBar.style.width = `${score}%`;

    const harmonyLine = harmony >= 85
      ? `${cap(f.colorName)} sits in tune with the ${s.mood} light of the ${s.name.toLowerCase()}.`
      : `${cap(f.colorName)} makes a deliberate contrast against the ${s.mood} ${s.name.toLowerCase()}.`;

    styleNote.textContent = `${harmonyLine} Colour harmony ${harmony}/100, contrast ${contrast}/100.`;

    const tips = [
      `Best for ${g.occasion} — finish with ${g.styling}.`,
      f.busy > 0.34
        ? "The print is expressive; keep jewellery and hardware quiet."
        : "The surface is calm; one metallic accessory will lift it.",
      contrast < 55
        ? "The palette is close in value — add a belt or shoe in a deeper tone for definition."
        : "The value contrast is strong, so the silhouette reads clearly on camera.",
    ];

    styleTips.innerHTML = tips.map((t) => `<li>${t}</li>`).join("");
  }

  /* ---------------- Image helpers ---------------- */
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image failed"));
      img.src = url;
    });
  }

  function cutoutGarment(img) {
    const size = 480;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const x = c.getContext("2d", { willReadFrequently: true });
    const s = Math.min(size / img.width, size / img.height);
    const w = Math.round(img.width * s), h = Math.round(img.height * s);
    x.clearRect(0, 0, size, size);
    x.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

    const data = x.getImageData(0, 0, size, size);
    const px = data.data;
    const at = (a, b) => (b * size + a) * 4;
    const corners = [at(3, 3), at(size - 4, 3), at(3, size - 4), at(size - 4, size - 4)];
    const avg = [0, 1, 2].map((k) => corners.reduce((sum, i) => sum + px[i + k], 0) / corners.length);
    const spread = Math.max(...corners.map((i) => Math.max(
      Math.abs(px[i] - avg[0]), Math.abs(px[i + 1] - avg[1]), Math.abs(px[i + 2] - avg[2])
    )));
    if (spread > 38) return c;

    const tol = 34;
    const seen = new Uint8Array(size * size);
    const stack = [];
    for (let a = 0; a < size; a++) stack.push(a, 0, a, size - 1, 0, a, size - 1, a);
    while (stack.length) {
      const b = stack.pop();
      const a = stack.pop();
      if (a < 0 || b < 0 || a >= size || b >= size) continue;
      const k = b * size + a;
      if (seen[k]) continue;
      seen[k] = 1;
      const i = k * 4;
      if (px[i + 3] === 0) continue;
      if (Math.abs(px[i] - avg[0]) > tol || Math.abs(px[i + 1] - avg[1]) > tol || Math.abs(px[i + 2] - avg[2]) > tol) continue;
      px[i + 3] = 0;
      stack.push(a + 1, b, a - 1, b, a, b + 1, a, b - 1);
    }
    x.putImageData(data, 0, 0);
    return c;
  }

  function drawPreview(canvas, img) {
    canvas.hidden = false;
    const x = canvas.getContext("2d");
    x.clearRect(0, 0, canvas.width, canvas.height);
    const s = Math.min(canvas.width / img.width, canvas.height / img.height);
    const w = img.width * s, h = img.height * s;
    x.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }

  /* ---------------- Fabric + garment uploads ---------------- */
  dropZone.addEventListener("click", () => fabricFileInput.click());
  dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fabricFileInput.click(); }
  });
  fabricFileInput.addEventListener("change", () => {
    const file = fabricFileInput.files?.[0];
    fabricFileInput.value = "";
    if (file) loadFabricFile(file);
  });

  garmentDrop.addEventListener("click", () => garmentFileInput.click());
  garmentDrop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); garmentFileInput.click(); }
  });
  garmentFileInput.addEventListener("change", () => {
    const file = garmentFileInput.files?.[0];
    garmentFileInput.value = "";
    if (file) loadGarmentFile(file);
  });

  async function loadFabricFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      applyFabric(img, file.name.replace(/\.[^.]+$/, ""));
      fabricStatus.textContent = "Textile mapped onto the 3D garment.";
    } catch {
      fabricStatus.textContent = "Could not read that image.";
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function loadGarmentFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const cut = cutoutGarment(img);
      drawPreview(garmentPreview, cut);
      const name = file.name.replace(/\.[^.]+$/, "");
      applyFabric(cut, name);
      const a = state.fabric.analysis;
      garmentStatus.textContent = `Garment read: ${a.colorName}${a.busy > 0.34 ? " · patterned" : " · solid"}.`;
    } catch {
      garmentStatus.textContent = "Could not read that garment.";
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function applyFabric(img, name) {
    const analysis = analyzeImage(img);
    state.fabric = { name, img, analysis };
    drawPreview(fabricPreviewCanvas, img);
    setFabricTexture(img);
    styleAvatar();
    buildOverlay();
    metaFabric.textContent = `${name} · ${analysis.colorName}`;
    updateOverlay();
    updateStyle();
  }

  sampleChips.forEach((chip) => {
    chip.addEventListener("click", () => loadSample(chip.dataset.sample));
  });

  function makeSampleCanvas(kind) {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 512;
    const x = c.getContext("2d");
    const base = kind === "denim" ? "#243a5e" : kind === "silk" ? "#2b1836" : kind === "block" ? "#c46a3a" : "#d8c4a0";
    x.fillStyle = base;
    x.fillRect(0, 0, 512, 512);
    const line = kind === "denim" ? "rgba(178,212,255,.45)"
      : kind === "silk" ? "rgba(255,180,240,.25)"
      : kind === "block" ? "rgba(250,238,210,.75)"
      : "rgba(110,80,40,.22)";
    x.strokeStyle = line;
    x.lineWidth = 1.4;

    if (kind === "denim") {
      for (let i = -512; i < 512; i += 7) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 512, 512); x.stroke(); }
      for (let y = 0; y < 512; y += 9) { x.beginPath(); x.moveTo(0, y); x.lineTo(512, y); x.stroke(); }
    } else if (kind === "silk") {
      for (let b = 0; b < 7; b++) {
        x.beginPath();
        for (let px = 0; px <= 512; px += 10) {
          const py = 60 + b * 64 + Math.sin(px * 0.012 + b) * 16;
          px === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.stroke();
      }
    } else if (kind === "block") {
      x.lineWidth = 3;
      for (let gy = 0; gy < 4; gy++) {
        for (let gx = 0; gx < 4; gx++) {
          const cx = 64 + gx * 128, cy = 64 + gy * 128;
          x.beginPath(); x.arc(cx, cy, 26, 0, Math.PI * 2); x.stroke();
          x.beginPath(); x.arc(cx, cy, 10, 0, Math.PI * 2); x.stroke();
          x.beginPath();
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            x.moveTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34);
            x.lineTo(cx + Math.cos(a) * 48, cy + Math.sin(a) * 48);
          }
          x.stroke();
        }
      }
    } else {
      for (let y = 0; y < 512; y += 5) { x.beginPath(); x.moveTo(0, y); x.lineTo(512, y + Math.sin(y * 0.12) * 2); x.stroke(); }
      for (let px = 0; px < 512; px += 5) { x.beginPath(); x.moveTo(px, 0); x.lineTo(px + Math.sin(px * 0.15) * 2, 512); x.stroke(); }
    }
    return c;
  }

  function loadSample(kind) {
    const name = kind === "denim" ? "Indigo twill"
      : kind === "silk" ? "Plum silk"
      : kind === "block" ? "Block print"
      : "Oat linen";
    const canvas = makeSampleCanvas(kind);
    applyFabric(canvas, name);
    fabricStatus.textContent = `${name} mapped onto the 3D garment.`;
  }

  /* ---------------- UI grids ---------------- */
  function renderModelGrid() {
    modelGrid.innerHTML = MODELS.map((m) => `
      <div class="card ${state.model.id === m.id ? "is-selected" : ""}" data-model="${m.id}">
        <div class="card-media">
          <img src="${m.image}" alt="${m.name}" loading="lazy" />
          <span class="card-tag">${m.gender === "her" ? "Women" : "Men"}</span>
        </div>
        <div class="card-copy"><h3>${m.name}</h3><p>${m.tag}</p></div>
      </div>
    `).join("");
    modelGrid.querySelectorAll("[data-model]").forEach((card) => {
      card.onclick = () => setModel(MODELS.find((m) => m.id === card.dataset.model));
    });
  }

  function renderGarmentGrid() {
    const list = GARMENTS[state.gender] || [];
    garmentGrid.innerHTML = list.map((g) => `
      <div class="card ${state.garment === g.id ? "is-selected" : ""}" data-garment="${g.id}">
        <div class="card-media garment-visual">
          <svg width="86" height="108" viewBox="0 0 420 480" style="color:#786d5d">
            <path d="${GARMENT_PATHS[g.id] || GARMENT_PATHS.shirt}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="card-copy"><h3>${g.name}</h3><p>${g.note}</p></div>
      </div>
    `).join("");
    garmentGrid.querySelectorAll("[data-garment]").forEach((card) => {
      card.onclick = () => applyGarment(card.dataset.garment);
    });
  }

  function renderSceneGrid() {
    sceneGrid.innerHTML = SCENES.map((s) => `
      <div class="card ${state.scene.id === s.id ? "is-selected" : ""}" data-scene="${s.id}">
        <div class="card-media">
          <img src="${s.image}" alt="${s.name}" loading="lazy" />
          <span class="card-tag">${s.mood} · ${s.note}</span>
        </div>
        <div class="card-copy"><h3>${s.name}</h3><p>Real backdrop · soft depth of field</p></div>
      </div>
    `).join("");
    sceneGrid.querySelectorAll("[data-scene]").forEach((card) => {
      card.onclick = () => setScene(card.dataset.scene);
    });
  }

  function renderLooks() {
    if (!looks.length) {
      lookGrid.innerHTML = '<p class="empty">No saved looks yet. Press “Save PNG” to keep one here.</p>';
      return;
    }
    lookGrid.innerHTML = looks.map((l, i) => `
      <div class="card" data-look="${i}">
        <div class="card-media"><img src="${l.url}" alt="${l.title}" /></div>
        <div class="card-copy"><h3>Look ${looks.length - i}</h3><p>${l.title}</p></div>
      </div>
    `).join("");
    lookGrid.querySelectorAll("[data-look]").forEach((card) => {
      card.onclick = () => {
        const a = document.createElement("a");
        a.download = `cloth-room-look-${card.dataset.look}.png`;
        a.href = looks[+card.dataset.look].url;
        a.click();
      };
    });
  }

  /* ---------------- Render loop ---------------- */
  let autoRotate = true;
  let userRot = 0;
  let dragging = false;
  let lastX = 0;
  let pointerId = null;

  stageCanvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    autoRotate = false;
    pointerId = e.pointerId;
    lastX = e.clientX;
    stageCanvas.setPointerCapture(e.pointerId);
  });
  stageCanvas.addEventListener("pointermove", (e) => {
    if (!dragging || pointerId !== e.pointerId) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    userRot += dx * 0.01;
  });
  stageCanvas.addEventListener("pointerup", () => {
    dragging = false;
    pointerId = null;
    autoRotate = true;
  });
  stageCanvas.addEventListener("pointercancel", () => {
    dragging = false;
    pointerId = null;
    autoRotate = true;
  });

  function animate() {
    requestAnimationFrame(animate);
    const t = performance.now() * 0.001;
    if (avatar) {
      if (autoRotate) userRot += (Math.sin(t * 0.45) * 0.5 - userRot) * 0.03;
      avatar.rotation.y = userRot;
    }
    renderer.render(scene, camera);
  }

  /* ---------------- Save ---------------- */
  async function saveLook() {
    if (!avatar) { setStatus("Model is still loading."); return; }
    try {
      const bg = await loadImage(state.scene.image);
      const out = document.createElement("canvas");
      out.width = 840; out.height = 1050;
      const c = out.getContext("2d");
      const scale = Math.max(out.width / bg.width, out.height / bg.height);
      const bw = bg.width * scale, bh = bg.height * scale;
      c.filter = "blur(2.5px) saturate(1.05) brightness(0.94)";
      c.drawImage(bg, (out.width - bw) / 2, (out.height - bh) / 2, bw, bh);
      c.filter = "none";

      const grd = c.createRadialGradient(out.width / 2, out.height * 0.36, out.width * 0.18, out.width / 2, out.height * 0.5, out.width * 0.78);
      grd.addColorStop(0, "rgba(15,10,6,0)");
      grd.addColorStop(1, "rgba(15,10,6,0.38)");
      c.fillStyle = grd;
      c.fillRect(0, 0, out.width, out.height);

      c.drawImage(renderer.domElement, 0, 0, out.width, out.height);
      const dataUrl = out.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `cloth-room-${state.gender}-${state.garment}.png`;
      link.href = dataUrl;
      link.click();
      looks.unshift({
        url: dataUrl,
        title: `${state.model.name} · ${garmentLabel(state.garment)} · ${state.scene.name}`,
      });
      renderLooks();
      setStatus("Look saved to My Looks.");
    } catch {
      setStatus("Could not save. Try again.");
    }
  }

  function setStatus(msg) {
    pipelineStatus.textContent = msg;
  }

  /* ---------------- Navigation ---------------- */
  navItems.forEach((b) => {
    b.addEventListener("click", () => {
      navItems.forEach((x) => x.classList.toggle("active", x === b));
      const v = b.dataset.view;
      views.forEach((view) => { view.hidden = view.id !== `view-${v}`; });
      const titles = { models: "Models", clothing: "Clothing", scenes: "Scenes", looks: "My looks" };
      viewTitle.textContent = titles[v] || v;
    });
  });

  renderBtn.addEventListener("click", () => {
    if (!state.fabric) { setStatus("Upload a fabric first."); return; }
    setStatus("Applying fabric…");
    styleAvatar();
    buildOverlay();
    updateStyle();
    setTimeout(() => setStatus("Fabric applied."), 220);
  });

  saveBtn.addEventListener("click", saveLook);

  fitRow.querySelectorAll("[data-fit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.fit = btn.dataset.fit;
      syncFitRow();
      styleAvatar();
      buildOverlay();
      setStatus(`Fit: ${state.fit}.`);
    });
  });

  /* ---------------- Init ---------------- */
  setScene("street");
  renderModelGrid();
  renderSceneGrid();
  renderGarmentGrid();
  renderToneRow();
  renderLooks();
  loadSample("linen");
  aiStatus.textContent = "3D engine ready";
  setModel(MODELS[0]);
  animate();

  window.__cloth = {
    scene, camera, renderer, state,
    get avatar() { return avatar; },
    get overlay() { return overlayGroup; },
  };
})();
