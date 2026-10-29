(() => {
  const CANVAS_SIZE = { width: 720, height: 900 };

  const stageCanvas = document.getElementById("stage-canvas");
  const ctx = stageCanvas.getContext("2d");
  const stageOverlay = document.getElementById("stage-overlay");

  const metaModel = document.getElementById("meta-model");
  const metaScene = document.getElementById("meta-scene");
  const metaGarment = document.getElementById("meta-garment");
  const metaFabric = document.getElementById("meta-fabric");

  const renderBtn = document.getElementById("render-look");
  const saveBtn = document.getElementById("save-look");

  const pipelineStatus = document.getElementById("pipeline-status");

  const navItems = document.querySelectorAll(".nav-item");
  const views = document.querySelectorAll(".view");

  const dropZone = document.getElementById("drop-zone");
  const fabricFileInput = document.getElementById("fabric-file");
  const fabricPreviewCanvas = document.getElementById("fabric-preview-canvas");
  const fabricStatus = document.getElementById("fabric-status");
  const sampleChips = document.querySelectorAll(".sample-chip");

  const modelGrid = document.getElementById("model-grid");
  const garmentGrid = document.getElementById("garment-grid");
  const sceneGrid = document.getElementById("scene-grid");
  const lookGrid = document.getElementById("look-grid");

  const MODELS = [
    { id: "woman-1", name: "Zara — mid-length coat", image: "https://picsum.photos/seed/model-woman-1/500/650", gender: "her" },
    { id: "woman-2", name: "Sana — saree drape", image: "https://picsum.photos/seed/model-woman-2/500/650", gender: "her" },
    { id: "woman-3", name: "Maya — dress fit", image: "https://picsum.photos/seed/model-woman-3/500/650", gender: "her" },
    { id: "man-1", name: "Arman — sherwani fit", image: "https://picsum.photos/seed/model-man-1/500/650", gender: "him" },
    { id: "man-2", name: "Omar — kurta fit", image: "https://picsum.photos/seed/model-man-2/500/650", gender: "him" },
    { id: "man-3", name: "Rehan — blazer fit", image: "https://picsum.photos/seed/model-man-3/500/650", gender: "him" },
  ];

  const SCENES = [
    { id: "street", name: "City street", image: "https://picsum.photos/seed/scene-street/800/600" },
    { id: "cafe", name: "Modern cafe", image: "https://picsum.photos/seed/scene-cafe/800/600" },
    { id: "park", name: "Outdoor park", image: "https://picsum.photos/seed/scene-park/800/600" },
    { id: "bazaar", name: "Street bazaar", image: "https://picsum.photos/seed/scene-bazaar/800/600" },
  ];

  const GARMENTS = [
    { id: "suit", name: "Tailored suit", gender: "him" },
    { id: "blazer", name: "Soft blazer", gender: "him" },
    { id: "jacket", name: "Statement jacket", gender: "him" },
    { id: "shirt", name: "Relaxed shirt", gender: "him" },
    { id: "trousers", name: "Wide-leg trousers", gender: "him" },
    { id: "dress", name: "Column dress", gender: "her" },
    { id: "skirt", name: "Bias skirt", gender: "her" },
    { id: "co-ord", name: "Co-ord set", gender: "her" },
    { id: "kurta", name: "Men's kurta", gender: "him" },
    { id: "shalwar", name: "Shalwar kameez", gender: "him" },
    { id: "sherwani", name: "Sherwani", gender: "him" },
    { id: "waistcoat", name: "Nehru waistcoat", gender: "him" },
    { id: "w-kurta", name: "Straight kurta", gender: "her" },
    { id: "anarkali", name: "Anarkali", gender: "her" },
    { id: "salwar", name: "Salwar kameez", gender: "her" },
    { id: "lehenga", name: "Lehenga choli", gender: "her" },
    { id: "saree", name: "Saree drape", gender: "her" },
    { id: "sharara", name: "Sharara set", gender: "her" },
  ];

  let state = {
    model: null,
    scene: null,
    garment: null,
    fabric: null, // { dataUrl, name, image }
    view: "models",
  };

  function setStatus(msg) {
    if (pipelineStatus) pipelineStatus.textContent = msg;
  }

  function switchView(viewName) {
    state.view = viewName;
    navItems.forEach((b) => {
      b.classList.toggle("active", b.dataset.view === viewName);
    });
    views.forEach((v) => {
      v.hidden = v.id !== `view-${viewName}`;
      if (!v.hidden) v.scrollIntoView({ behavior: "instant", block: "start" });
    });
    const titleMap = {
      models: "Choose a model",
      clothing: "Clothing & fabric",
      scenes: "Real-world scenes",
      looks: "My looks",
    };
    const t = document.getElementById("view-title");
    if (t) t.textContent = titleMap[viewName] || viewName;
    renderCardGrids();
  }

  navItems.forEach((b) => {
    b.addEventListener("click", () => switchView(b.dataset.view));
  });

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`failed to load ${url}`));
      img.src = url;
    });
  }

  function drawImageFit(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = img.width * scale;
    const sh = img.height * scale;
    const dx = x + (w - sw) / 2;
    const dy = y + (h - sh) / 2;
    ctx.drawImage(img, dx, dy, sw, sh);
  }

  function renderStage() {
    const W = CANVAS_SIZE.width;
    const H = CANVAS_SIZE.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#e9e1d1";
    ctx.fillRect(0, 0, W, H);

    if (!state.scene && !state.model && !state.garment && !state.fabric) {
      stageOverlay.textContent = "Pick a model and a scene to begin";
      stageOverlay.hidden = false;
      return;
    }
    stageOverlay.hidden = true;

    // 1. Scene background (full frame)
    if (state.scene && state.scene.img) {
      drawImageFit(ctx, state.scene.img, 0, 0, W, H);
    }

    // 2. Model photo (centered, full height torso-up)
    if (state.model && state.model.img) {
      const mx = 0;
      const my = H * 0.08;
      const mw = W;
      const mh = H * 0.82;
      ctx.save();
      // Slight vignette over model edges to blend
      drawImageFit(ctx, state.model.img, mx, my, mw, mh);
      ctx.restore();
    }

    // 3. Garment silhouette filled with fabric, drawn over model torso
    if (state.garment && state.fabric && state.fabric.img) {
      const gx = W * 0.18;
      const gy = H * 0.22;
      const gw = W * 0.64;
      const gh = H * 0.56;

      ctx.save();
      ctx.translate(gx, gy);
      ctx.scale(gw / 420, gh / 480);

      // Pattern fill from fabric image
      const pattern = ctx.createPattern(state.fabric.img, "repeat");
      ctx.fillStyle = pattern;

      const path = GARMENT_PATHS[state.garment.id] || GARMENT_PATHS.dress;
      ctx.beginPath();
      // path coords are in 0-420 / 0-480 space
      const p = path;
      // Move-to / line commands parse
      const tokens = p.matchAll(/([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi);
      let first = true;
      let cx = 0, cy = 0;
      for (const t of tokens) {
        const cmd = t[1].toUpperCase();
        const nums = t[2].match(/-?\d*\.?\d+/g);
        if (!nums) continue;
        const n = nums.map(Number);
        if (cmd === "M") {
          ctx.moveTo(n[0], n[1]); cx = n[0]; cy = n[1]; first = false;
        } else if (cmd === "L") {
          ctx.lineTo(n[0], n[1]); cx = n[0]; cy = n[1];
        } else if (cmd === "H") {
          ctx.lineTo(n[0], cy); cx = n[0];
        } else if (cmd === "V") {
          ctx.lineTo(cx, n[0]); cy = n[0];
        } else if (cmd === "Q") {
          ctx.quadraticCurveTo(n[0], n[1], n[2], n[3]); cx = n[2]; cy = n[3];
        } else if (cmd === "C") {
          ctx.bezierCurveTo(n[0], n[1], n[2], n[3], n[4], n[5]); cx = n[4]; cy = n[5];
        } else if (cmd === "Z") {
          ctx.closePath();
        }
      }
      ctx.fill();
      ctx.strokeStyle = "rgba(45,38,30,.35)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    }

    setStatus("Pipeline ready");
  }

  function renderCardGrids() {
    // Models
    modelGrid.innerHTML = MODELS.map((m) => `
      <div class="card ${state.model && state.model.id === m.id ? "is-selected" : ""}" data-model="${m.id}">
        <div class="card-media"><img src="${m.image}" alt="${m.name}" loading="lazy" /></div>
        <div class="card-copy"><h3>${escapeHtml(m.name)}</h3><p>${m.gender === "her" ? "Women" : "Men"} · Photorealistic model</p></div>
      </div>
    `).join("");

    // Scenes
    sceneGrid.innerHTML = SCENES.map((s) => `
      <div class="card ${state.scene && state.scene.id === s.id ? "is-selected" : ""}" data-scene="${s.id}">
        <div class="card-media"><img src="${s.image}" alt="${s.name}" loading="lazy" /></div>
        <div class="card-copy"><h3>${escapeHtml(s.name)}</h3><p>Real backdrop</p></div>
      </div>
    `).join("");

    // Garments (filtered by model gender if set)
    const allowed = state.model ? GARMENTS.filter((g) => g.gender === state.model.gender) : GARMENTS;
    garmentGrid.innerHTML = allowed.map((g) => `
      <div class="card ${state.garment && state.garment.id === g.id ? "is-selected" : ""}" data-garment="${g.id}">
        <div class="card-media garment-visual" style="background: linear-gradient(135deg,#efe5d5,#f8f1e6); display:flex;align-items:center;justify-content:center;">
          <svg width="90" height="110" viewBox="0 0 420 480" style="color:#786d5d">
            <path d="${GARMENT_PATHS[g.id] || GARMENT_PATHS.dress}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="card-copy"><h3>${escapeHtml(g.name)}</h3><p>${g.gender === "her" ? "Women" : "Men"}</p></div>
      </div>
    `).join("");

    // Add grid click handlers
    document.querySelectorAll("#model-grid .card").forEach((card) => {
      card.onclick = () => {
        state.model = MODELS.find((m) => m.id === card.dataset.model);
        loadImage(state.model.image).then((img) => { state.model.img = img; renderStage(); });
        renderCardGrids();
      };
    });
    document.querySelectorAll("#scene-grid .card").forEach((card) => {
      card.onclick = () => {
        state.scene = SCENES.find((s) => s.id === card.dataset.scene);
        loadImage(state.scene.image).then((img) => { state.scene.img = img; renderStage(); });
        renderCardGrids();
      };
    });
    document.querySelectorAll("#garment-grid .card").forEach((card) => {
      card.onclick = () => {
        const found = allowed.find((g) => g.id === card.dataset.garment);
        state.garment = found;
        metaGarment.textContent = found.name;
        renderStage();
        renderCardGrids();
      };
    });

    updateMeta();
  }

  function updateMeta() {
    if (metaModel) metaModel.textContent = state.model ? state.model.name : "—";
    if (metaScene) metaScene.textContent = state.scene ? state.scene.name : "—";
    if (metaFabric) metaFabric.textContent = state.fabric ? state.fabric.name : "—";
    if (metaGarment) metaGarment.textContent = state.garment ? state.garment.name : "—";
  }

  // ---------- Fabric ----------
  dropZone.addEventListener("click", () => fabricFileInput.click());
  dropZone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fabricFileInput.click(); } });
  fabricFileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    fabricFileInput.value = "";
    loadFabric(file);
  });

  sampleChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const kind = chip.dataset.sample;
      loadSample(kind);
    });
  });

  async function loadFabric(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      state.fabric = { dataUrl: url, name: file.name, img };
      fabricPreviewCanvas.hidden = false;
      const fctx = fabricPreviewCanvas.getContext("2d");
      fctx.drawImage(img, 0, 0, 200, 200);
      fabricStatus.textContent = "Fabric on the table";
      updateMeta();
      renderStage();
    } catch (err) {
      fabricStatus.textContent = "Could not read that image.";
    }
  }

  async function loadSample(kind) {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 480;
    const cctx = canvas.getContext("2d");
    cctx.fillStyle = kind === "denim" ? "#243a5e" : kind === "silk" ? "#2b1836" : "#d8c4a0";
    cctx.fillRect(0, 0, 720, 480);
    cctx.strokeStyle = kind === "denim" ? "rgba(178,212,255,.5)" : kind === "silk" ? "rgba(255,180,240,.22)" : "rgba(110,80,40,.18)";
    cctx.lineWidth = kind === "denim" ? 1.6 : 1.2;
    if (kind === "denim") {
      for (let x = -480; x < 720; x += 7) { cctx.beginPath(); cctx.moveTo(x, 0); cctx.lineTo(x + 480, 480); cctx.stroke(); }
      for (let y = 0; y < 480; y += 9) { cctx.beginPath(); cctx.moveTo(0, y); cctx.lineTo(720, y); cctx.stroke(); }
    } else if (kind === "silk") {
      for (let band = 0; band < 6; band++) { cctx.beginPath(); for (let x = 0; x <= 720; x += 12) { const y = 72 + band * 64 + Math.sin(x * 0.012 + band) * 18; if (x === 0) cctx.moveTo(x, y); else cctx.lineTo(x, y); } cctx.stroke(); }
    } else {
      for (let y = 0; y < 480; y += 5) { cctx.beginPath(); cctx.moveTo(0, y); cctx.lineTo(720, y + Math.sin(y * 0.12) * 2); cctx.stroke(); }
      for (let x = 0; x < 720; x += 5) { cctx.beginPath(); cctx.moveTo(x, 0); cctx.lineTo(x + Math.sin(x * 0.15) * 2, 480); cctx.stroke(); }
    }
    const name = kind === "denim" ? "Indigo twill" : kind === "silk" ? "Plum silk" : "Oat linen";
    const img = new Image();
    img.onload = () => {
      state.fabric = { dataUrl: canvas.toDataURL("image/png"), name, img };
      fabricPreviewCanvas.hidden = false;
      const fctx = fabricPreviewCanvas.getContext("2d");
      fctx.drawImage(img, 0, 0, 200, 200);
      fabricStatus.textContent = `${name} sample loaded`;
      updateMeta();
      renderStage();
    };
    img.src = canvas.toDataURL("image/png");
  }

  // ---------- Render ----------
  renderBtn.addEventListener("click", () => {
    if (!state.model || !state.scene || !state.garment || !state.fabric) {
      setStatus("Pick a model, scene, garment and fabric first.");
      return;
    }
    setStatus("Compositing look…");
    renderStage();
  });

  saveBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = `cloth-room-look-${Date.now()}.png`;
    link.href = stageCanvas.toDataURL("image/png");
    link.click();
    setStatus("Look saved to downloads.");
  });

  // ---------- Garment paths (420x480 silhouette space) ----------
  const GARMENT_PATHS = {
    suit: "M31 23 L42 13 L58 13 L69 23 L82 40 L73 49 L71 105 L29 105 L27 49 L18 40 Z",
    blazer: "M29 23 L40 14 L60 14 L71 23 L84 44 L74 51 L72 105 L28 105 L26 51 L16 44 Z",
    dress: "M38 15 L43 33 L39 50 L23 105 L77 105 L61 50 L57 33 L62 15 Z",
    shirt: "M34 21 L44 13 L56 13 L66 21 L82 31 L74 45 L69 40 L69 105 L31 105 L31 40 L26 45 L18 31 Z",
    jacket: "M28 23 L39 14 L61 14 L72 23 L85 47 L74 53 L71 105 L29 105 L26 53 L15 47 Z",
    trousers: "M34 17 H66 L73 105 H55 L50 55 L45 105 H27 Z",
    skirt: "M36 17 H64 L79 105 H21 Z",
    "co-ord": "M34 21 L44 13 L56 13 L66 21 L78 31 L72 44 L68 40 L68 70 L32 70 L32 40 L28 44 L22 31 Z M36 74 H64 L70 105 H54 L50 88 L46 105 H30 Z",
    kurta: "M34 20 L42 13 L58 13 L66 20 L79 32 L73 43 L68 39 L68 86 L32 86 L32 39 L27 43 L21 32 Z M37 89 H63 L68 113 H54 L50 100 L46 113 H32 Z",
    shalwar: "M34 20 L42 13 L58 13 L66 20 L78 32 L72 43 L68 39 L68 84 L32 84 L32 39 L28 43 L22 32 Z M36 87 H64 L74 113 H54 L50 98 L46 113 H26 Z",
    sherwani: "M34 18 L42 12 L58 12 L66 18 L80 34 L72 44 L68 40 L68 98 L32 98 L32 40 L28 44 L20 34 Z M38 100 H62 L66 113 H54 L50 104 L46 113 H34 Z",
    waistcoat: "M38 17 L46 13 L54 13 L62 17 L64 74 L56 78 L50 70 L44 78 L36 74 Z",
    "w-kurta": "M34 20 L42 13 L58 13 L66 20 L79 32 L73 43 L68 39 L68 86 L32 86 L32 39 L27 43 L21 32 Z M37 89 H63 L68 113 H54 L50 100 L46 113 H32 Z",
    anarkali: "M38 14 L44 28 L34 40 L20 113 L80 113 L66 40 L56 28 L62 14 Z",
    salwar: "M34 20 L42 13 L58 13 L66 20 L78 32 L72 43 L68 39 L68 82 L32 82 L32 39 L28 43 L22 32 Z M36 85 H64 L72 113 H54 L50 98 L46 113 H28 Z",
    lehenga: "M38 17 L44 30 L56 30 L62 17 L58 42 L42 42 Z M40 46 H60 L82 113 H18 Z",
    saree: "M38 14 Q50 22 62 14 L66 32 L58 44 L80 113 H20 L42 44 L34 32 Z M62 20 Q82 38 74 78 L66 74 Q72 44 56 28 Z",
    sharara: "M34 20 L42 13 L58 13 L66 20 L76 32 L70 43 L68 39 L68 66 L32 66 L32 39 L30 43 L24 32 Z M36 70 H64 L84 113 H54 L50 86 L46 113 H16 Z",
  };

  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  switchView("models");
})();