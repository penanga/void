// js/main.js
// Fully dynamic ring and object generation driven by CSV + API

window.addEventListener('DOMContentLoaded', async () => {
  const root = document.documentElement;
  const scene3D = document.querySelector('.scene3D');
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.querySelector('.connectors');

  const defs = document.createElementNS(svgNS, 'defs');
  svg.appendChild(defs);


  // create a radial gradient that goes from Black (mask-out) at 0%  
  // to White (mask-in) at 100%
  const maskRad = document.createElementNS(svgNS, 'radialGradient');
  maskRad.id = 'connectorMaskGrad';

  // ←—— set up in absolute SVG pixels, not % of bbox:
  maskRad.setAttribute('gradientUnits', 'userSpaceOnUse');

  // start the centre at the midpoint of the viewport:
  maskRad.setAttribute('cx', window.innerWidth / 2);
  maskRad.setAttribute('cy', window.innerHeight / 2);

  // radius big enough to cover the whole SVG:
  maskRad.setAttribute('r', Math.max(window.innerWidth, window.innerHeight) / 2);

  // focal point matches centre:
  maskRad.setAttribute('fx', window.innerWidth / 2);
  maskRad.setAttribute('fy', window.innerHeight / 2);

  maskRad.setAttribute('cx', '50%');
  maskRad.setAttribute('cy', '50%');
  maskRad.setAttribute('r', '50%');
  maskRad.setAttribute('fx', '50%');
  maskRad.setAttribute('fy', '50%');

  // Add two stops: 0% → black (transparent), 100% → white (opaque)
  const mStop1 = document.createElementNS(svgNS, 'stop');
  mStop1.setAttribute('offset', '0%');
  mStop1.setAttribute('stop-color', 'black');
  const mStop2 = document.createElementNS(svgNS, 'stop');
  mStop2.setAttribute('offset', '25%');
  mStop2.setAttribute('stop-color', 'white');

  maskRad.append(mStop1, mStop2);
  defs.append(maskRad);

  // wrap that gradient into a <mask>
  const mask = document.createElementNS(svgNS, 'mask');
  mask.id = 'connectorMask';
  const maskRect = document.createElementNS(svgNS, 'rect');
  // fill the full SVG with the radial gradient
  maskRect.setAttribute('x', 0);
  maskRect.setAttribute('y', 0);
  maskRect.setAttribute('width', '100%');
  maskRect.setAttribute('height', '100%');
  maskRect.setAttribute('fill', 'url(#connectorMaskGrad)');
  mask.append(maskRect);
  defs.append(mask);

  // 2) Tell your <svg class="connectors"> to use it:
  svg.setAttribute('mask', 'url(#connectorMask)');

  // 3) On resize, update neither the mask nor the defs need change—
  //    the <mask> is in % coordinates and will scale automatically 
  //    with your SVG’s viewBox.




  const modalOverlay = document.getElementById('object-modal');
  const popupContent = modalOverlay.querySelector('.popup-content');
  const tpl = document.getElementById('object-popup-template').innerHTML;

  const distortionModal = document.getElementById('distortion-modal');

  let tooltip = modalOverlay.querySelector('.tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    modalOverlay.appendChild(tooltip);
  }

  function onBlobEnter(e) {
    const a = e.currentTarget;
    // parse the URL once, synchronously:
    let title;
    try {
      const url = new URL(a.href);
      // you can choose what to show here:
      // • url.hostname            → "en.wikipedia.org"
      // • url.hostname + url.pathname → "/wiki/Elon_Musk%27s_Tesla_Roadster"
      title = url.hostname + url.pathname.replace(/\/$/, '');
    } catch {
      title = a.href; // fallback to full URL
    }

    // display it immediately
    tooltip.textContent = title;
    tooltip.style.display = 'block';
  }

  function onBlobMove(e) {
    const offset = 10;
    // clientX/Y keep the tooltip inside the modal viewport
    tooltip.style.left = (e.clientX + offset) + 'px';
    tooltip.style.top = (e.clientY + offset) + 'px';
  }

  function onBlobLeave() {
    tooltip.style.display = 'none';
  }

  //----SETTINGS------

  // ─── TOGGLE: live vs. static distances ───
  // Set to `true` to hit your proxy every time;
  // set to `false` to load from data/distances.json instead.
  const USE_LIVE_DISTANCES = false;

  const SCROLL_OFFSET = -175;  // “shift” everything 50px toward Earth

  // ─── (A) “flip” toggle ───
  // Set this to true if you want scrollY=0 → camera at Earth (Z=0),
  // and scrollY=maxZ → camera at farthest ring.
  const INVERT_SCROLL = true;

  // ─── Ring-focus settings ───
  // For focus setting search for FOCAL_OFFSET

  const ringInfo = {
    '301': { name: 'Moon', type: 1, objectType: 'Moon (Natural Satellite)'},
    '499': { name: 'Mars', type: 1, objectType: 'Planet' },
    '-143205': { name: 'Falcon Heavy', type: 2, objectType: 'Spacecraft'},
    '-98': { name: 'New Horizons', type: 2, objectType: 'Space Probe'},
    '199': { name: 'Mercury', type: 1, objectType: 'Planet'},
    '299': { name: 'Venus', type: 1, objectType: 'Planet'},
    '-125544': { name: 'International Space Station', type: 2, objectType: 'Orbital Space Station'},
    '599': { name: 'Jupiter', type: 1, objectType: 'Planet'},
    '699': { name: 'Saturn', type: 1, objectType: 'Planet'},
    '799': { name: 'Uranus', type: 1, objectType: 'Planet'},
    '899': { name: 'Neptune', type: 1, objectType: 'Planet'},
    '999': { name: 'Pluto', type: 1, objectType: 'Dwarf Planet'},
    '-31': { name: 'Voyager 1', type: 2, objectType: 'Space Probe'},
    '-32': { name: 'Voyager 2', type: 2, objectType: 'Space Probe'},
    '10': { name: 'Sun', type: 1, objectType: 'Star'},
    '-23': { name: 'Pioneer 10', type: 2, objectType: 'Space Probe'},
    '-24': { name: 'Pioneer 11', type: 2, objectType: 'Space Probe'},
    '-49': { name: 'Lucy', type: 2, objectType: 'Space Probe'},
  };


  const ENABLE_SPIN = false; // set to true to turn spinning back on

  // Connector visibility offsets (in px)
  // lines will show when scrollY is between [ringDepth - showOffset, ringDepth + hideOffset]
  const showOffset = 100; // px before camera reaches ring to start hiding
  const hideOffset = 90; // px after passing ring to fully hide

  // ─── Distortion settings ───
  // fraction of the [0…1] range to “warp” (closest to Earth)
  const distortionThreshold = 0.04;

  // exponent for your ease-out curve: 
  //  1 = perfectly linear (no distortion),
  // <1 = progressively stretch the low end
  const distortionStrength = 0.2;

  // add the Earth circle at the very center (Z = 0)
  const earth = document.createElement('div');
  earth.classList.add('earth');
  scene3D.appendChild(earth);

  // size in px 168 AT Z DEPTH 0
  const earthMin = 168;
  const earthMax = 168;

  // at what scroll‐progress (0…1) to start/end resizing
  const resizeStart = 0.9;
  const resizeEnd = 1;

  function easeOut(t) {
    // simple power-curve: returns tᵖ
    return Math.pow(t, distortionStrength);
  }

  // ─── Parallax pivot defaults ───
  // Read the CSS-declared “home” pivot and set your max drift (in %)
  const perspectiveOrigin = {
    x: parseFloat(
      getComputedStyle(root)
      .getPropertyValue('--scenePerspectiveOriginX')
    ),
    y: parseFloat(
      getComputedStyle(root)
      .getPropertyValue('--scenePerspectiveOriginY')
    ),
    maxGap: 5 // max ±5% shift. Increase for more dramatic tilt.
  };

  function updateSVGViewport() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  window.addEventListener('resize', updateSVGViewport);
  updateSVGViewport(); // initial

  // AU → kilometers (needed by your scroll handler)
  const AU_IN_KM = 149_597_870.7;

  const EARTH_RADIUS_KM = 6371;
  const EARTH_RADIUS_AU = EARTH_RADIUS_KM / AU_IN_KM; 

  // ─── Simple baseline + indicator + distance label ───
  const graphSvg = document.getElementById('distortion-svg');
  const baseline = document.createElementNS(svgNS, 'line');
  const indicatorLine = document.createElementNS(svgNS, 'line');
  const distanceText = document.createElementNS(svgNS, 'text');

  const distortionZone = document.createElementNS(svgNS, 'line');
  distortionZone.classList.add('distortion-zone');

  baseline.classList.add('baseline');
  indicatorLine.classList.add('indicator');
  distanceText.classList.add('distance-label');
  distanceText.setAttribute('text-anchor', 'middle');
  distanceText.setAttribute('y', '-35'); // just above the line

  graphSvg.append(distortionZone, baseline, indicatorLine, distanceText);

  // ─── Warning message for distortion zone ───
  const distortionWarning = document.createElement('div');
  distortionWarning.id = 'distortion-warning';
  distortionWarning.innerHTML = `
    <span class="material-symbols-outlined">warning</span>
    Near Earth Zone: Distances between objects have been distorted.
    <button id="learn-more-btn">Learn more.</button>
  `;
  document.body.appendChild(distortionWarning);


  // ─── 3) Draw an “upside-down” easing curve with adjusted axis labels into the popup SVG ───
  function drawPopupGraph() {
    const popupContainer = document.getElementById('popup-distortion-graph');
    const popupSvg = document.getElementById('popup-distortion-svg');
    const w = popupContainer.clientWidth;
    const h = popupContainer.clientHeight;

    // fill SVG
    popupSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    popupSvg.setAttribute('preserveAspectRatio', 'none');
    popupSvg.innerHTML = '';

    // ── 1) Draw axes ──
    const xAxis = document.createElementNS(svgNS, 'line');
    xAxis.setAttribute('x1', 0);
    xAxis.setAttribute('y1', h);
    xAxis.setAttribute('x2', w);
    xAxis.setAttribute('y2', h);
    xAxis.setAttribute('stroke', '#000');
    xAxis.setAttribute('stroke-width', '1');

    const yAxis = document.createElementNS(svgNS, 'line');
    yAxis.setAttribute('x1', 0);
    yAxis.setAttribute('y1', 0);
    yAxis.setAttribute('x2', 0);
    yAxis.setAttribute('y2', h);
    yAxis.setAttribute('stroke', '#000');
    yAxis.setAttribute('stroke-width', '1');

    // ── 2) Draw axis labels ──
    const xLabel = document.createElementNS(svgNS, 'text');
    xLabel.setAttribute('x', w / 2);
    xLabel.setAttribute('y', h + 30); // below the x-axis ADJUST THIS NUMBER
    xLabel.setAttribute('text-anchor', 'middle');
    xLabel.setAttribute('font-size', '12');
    xLabel.textContent = 'proximity to Earth';

    const yLabel = document.createElementNS(svgNS, 'text');
    // move left of the y-axis and rotate
    yLabel.setAttribute('transform', `translate(-10, ${h / 2}) rotate(-90)`); //ADJUST FIRST NUMBER
    yLabel.setAttribute('text-anchor', 'middle');
    yLabel.setAttribute('font-size', '12');
    yLabel.textContent = 'Amount of distortion';

    popupSvg.append(xAxis, yAxis, xLabel, yLabel);

    // ── 3) Draw the easing curve ──
    const pts = [];
    for (let x = 0; x <= w; x++) {
      const frac = x / w;
      const remap = easeOut(frac);
      const y = remap * h;
      pts.push(`${x},${y}`);
    }

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', 'M' + pts.join(' L'));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'deepskyblue');
    path.setAttribute('stroke-width', '2');

    popupSvg.appendChild(path);
  }


  // ─── 4) Wire up the buttons ───
  document.body.addEventListener('click', (e) => {
    // open modal when Learn More is clicked
    if (e.target.id === 'learn-more-btn') {
      distortionModal.classList.remove('hidden'); // or: distortionModal.style.display = 'flex';
      drawPopupGraph();
    }
    // close modal when “×” is clicked
    if (e.target.id === 'modal-close') {
      distortionModal.classList.add('hidden'); // or: distortionModal.style.display = 'none';
    }
  });


  function updateBaseline() {
    const w = window.innerWidth;
    const h = graphSvg.clientHeight;
    graphSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    // draw the distortion segment from x=0 to x=T*w
    const zoneEnd = distortionThreshold * w;
    distortionZone.setAttribute('x1', 0);
    distortionZone.setAttribute('y1', h / 2);
    distortionZone.setAttribute('x2', zoneEnd);
    distortionZone.setAttribute('y2', h / 2);

    // draw a horizontal line halfway down the SVG
    baseline.setAttribute('x1', 0);
    baseline.setAttribute('y1', h / 2);
    baseline.setAttribute('x2', w);
    baseline.setAttribute('y2', h / 2);

    // indicator runs full height
    indicatorLine.setAttribute('y1', '0%');
    indicatorLine.setAttribute('y2', '100%');
  }

  updateBaseline();
  window.addEventListener('resize', updateBaseline);

  // 1) Load & parse CSV of objects using PapaParse
  const csvText = await fetch('data/objects_001.csv', {
      cache: 'no-cache'
    })
    .then(r => r.text());
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true
  });
  if (parsed.errors.length) console.warn('CSV parse errors:', parsed.errors);
  const rows = parsed.data;
  console.log('✅ CSV loaded:', rows.length, 'rows');

  rows.forEach((row, idx) => row._idx = idx);

  // 1a) load & parse images CSV using PapaParse
  const imgCsvText = await fetch('data/images_001.csv', {
      cache: 'no-cache'
    })
    .then(r => r.text());
  const parsedImgs = Papa.parse(imgCsvText, {
    header: true,
    skipEmptyLines: true
  });
  if (parsedImgs.errors.length) console.warn('Image CSV parse errors:', parsedImgs.errors);

  // build a map: id → hero-image URL
  const heroImageByObjectId = {};
  parsedImgs.data.forEach(imgRow => {
    if (imgRow.role === 'h' && imgRow.id) {
      heroImageByObjectId[imgRow.id.trim()] = imgRow.url.trim();
    }
  });

  const objectImageByObjectId = {};
  parsedImgs.data.forEach(imgRow => {
    if (imgRow.role === 'o' && imgRow.id) {
      objectImageByObjectId[imgRow.id.trim()] = imgRow.url.trim();
    }
  });

  // Preload all hero images so the modal can show them instantly
  Object.values(heroImageByObjectId).forEach(rawUrl => {
    const fullUrl = rawUrl.startsWith('assets/')
      ? rawUrl
      : `assets/${rawUrl}`;
    const preload = new Image();
    preload.src = fullUrl;
  });

  // build a map of fully-loaded <img> elements
  const heroImageElements = {};
  Object.entries(heroImageByObjectId).forEach(([id, rawUrl]) => {
    const fullUrl = rawUrl.startsWith('assets/')
      ? rawUrl
      : `assets/${rawUrl}`;
    const img = new Image();
    img.src = fullUrl;
    // optional: force decode immediately (Chrome+FF will decode automatically once in DOM,
    // but this gives extra insurance)
    img.decode().catch(() => {/* ignore */});
    heroImageElements[id] = img;
  });


  // 2) Group rows by horizons_id (allow negative)
  const fieldName = 'horizons_id';
  const byId = {};
  rows.forEach(row => {
    const id = (row[fieldName] || '').trim();
    if (!/^-?\d+$/.test(id)) return;
    (byId[id] = byId[id] || []).push(row);
  });

  Object.keys(ringInfo).forEach(id => {
    if (!byId[id]) byId[id] = [];
  });

  // 3) Fetch distances (live or static)
  const idToDistanceAu = {};
  if (USE_LIVE_DISTANCES) {
    // ─── Option A: Hit the proxy for each Horizons ID ───
    await Promise.all(
      Object.keys(byId).map(async (id) => {
        const url = `http://localhost:3000/api/horizons?id=${encodeURIComponent(id)}`;
        try {
          console.log(`🌐 fetching for id=${id}`, url);
          const res = await fetch(url);
          console.log(`--> status ${res.status} for id=${id}`);
          if (!res.ok) {
            const text = await res.text();
            console.error(`❌ Proxy returned error for id=${id}:`, text);
            idToDistanceAu[id] = undefined;
            return;
          }
          const data = await res.json();
          console.log(`✅ got distance for id=${id}:`, data.distanceAu);
          idToDistanceAu[id] = data.distanceAu;
        } catch (err) {
          console.error(`⚠️ fetch failed for id=${id}:`, err);
          idToDistanceAu[id] = undefined;
        }
      })
    );
    console.log('🌌 fetched (live) distances:', idToDistanceAu);
  } else {
    // ─── Option B: Load from a local JSON snapshot ───
    try {
      const raw = await fetch('data/distances.json', { cache: 'no-cache' }).then((r) => r.json());
      // Copy everything from the static file into our map:
      Object.assign(idToDistanceAu, raw);
      console.log('📥 loaded (static) distances:', idToDistanceAu);
    } catch (err) {
      console.error('❌ Failed to load local distances.json:', err);
    }
  }

  // 4) Filter valid IDs and scale
  const validIds = Object.entries(idToDistanceAu)
    .filter(([_, au]) => typeof au === 'number')
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  if (!validIds.length) {
    console.error('No valid distances; aborting.');
    return;
  }

  // ── Subtract Earth’s radius from each AU distance ──
  // (So that “distanceAu” now means “from Earth’s surface” instead of “from Earth’s center”)
  validIds.forEach(id => {
    // idToDistanceAu[id] is currently center‐to‐center. We subtract EARTH_RADIUS_AU.
    const rawAu = idToDistanceAu[id];
    const surfaceAu = rawAu - EARTH_RADIUS_AU;
    // If an object ended up closer than Earth’s surface, clamp to zero:
    idToDistanceAu[id] = surfaceAu > 0 ? surfaceAu : 0;
  });

  const maxAu = Math.max(...validIds.map(id => idToDistanceAu[id]));
  const scale = 40000 / maxAu; //CHANGE PIXEL SCALE HERE

  // Pixel range of the entire depth before distortion:
  // this will also become our “true” maxZ once we remap
  const maxZRaw = maxAu * scale;

  // 5) Create dynamic rings
  const rings = validIds.map(id => {
    const au = idToDistanceAu[id];
    const frac = au / maxAu; // normalize [0…1]
    let zPx;

    if (frac <= distortionThreshold) {
      // 1) remap 0…T → 0…1
      const t = frac / distortionThreshold;
      // 2) apply ease-out curve
      const f = easeOut(t);
      // 3) scale back into pixel range [0…T*maxZRaw]
      zPx = f * (distortionThreshold * maxZRaw);
    } else {
      // linear for the remaining 75%
      zPx = frac * maxZRaw;
    }

    const ring = document.createElement('div');
    ring.classList.add('ring');
    ring.style.transform = `translate3d(-50%, -50%, ${zPx}px)`;
    ring.dataset.zPx = zPx;
    scene3D.appendChild(ring);

    const info = ringInfo[id];
    if (info) {
      // 1) adjust border thickness & opacity
      const thickness = info.type === 1 ? 2 : 1;
      const color     = info.type === 1
        ? 'rgb(228, 228, 229)'
        : 'rgb(228, 228, 229)';

      // clear any existing border
      ring.style.border = 'none';

      const styleType = (info.type === 2) ? 'dashed' : 'solid';
      ring.style.outline = `${thickness}px ${styleType} ${color}`;
      ring.style.outlineOffset = `-${thickness/2}px`;

      ring.dataset.type = info.type;

      // 2) inject centered label
      const lbl = document.createElement('div');
      lbl.classList.add('ring-label');
      lbl.textContent = info.name;
      ring.appendChild(lbl);

      // 2a) inject a second, separately-styled <div> for “objectType + distance”
      const auValue = idToDistanceAu[id];        // e.g. 6.0837 (in AU)
      const kmRaw = auValue * AU_IN_KM;          // convert to kilometers
      const kmRounded = Math.floor(kmRaw).toLocaleString(); // e.g. "910,077,047"
      const extra = document.createElement('div');
      extra.classList.add('ring-extra-label');
      extra.innerHTML = `
        <span class="object-type">${info.objectType}</span><br>
        <span class="distance-text">${kmRounded} km away</span>
      `;
      ring.appendChild(extra);

    }

    return {
      id,
      element: ring,
      zPx
    };
  });
  console.log('🌀 rings created:', rings.length);


  // 4a) Load & place quotes from quotes_001.csv
  (async function loadAndPlaceQuotes() {
    // 1) Fetch the CSV text (no-cache is optional)
    const quotesCsvText = await fetch('data/quotes_001.csv', { cache: 'no-cache' })
      .then(r => r.text());

    // 2) Parse with PapaParse (header: true)
    const parsedQuotes = Papa.parse(quotesCsvText, {
      header: true,
      skipEmptyLines: true
    });
    if (parsedQuotes.errors.length) {
      console.warn('Quote CSV parse errors:', parsedQuotes.errors);
    }

    // How far (in px) each quote should be pushed away from center:
    const quoteOffset = 50; // ←– tweak this value to taste

    // 3) For each quote row, create a .quote-container at the given Z but with random X/Y
    parsedQuotes.data.forEach((qRow) => {
      // a) Read your 'position' column. Adjust field name if yours is different.
      const rawPos = (qRow.position || '').trim();
      if (!rawPos) return;
      const zPos = parseFloat(rawPos);
      if (isNaN(zPos)) return;

      // b) Create container & two child <div>s:
      const container = document.createElement('div');
      container.classList.add('quote-container');

      container.dataset.zPx = zPos;

      // If a width value was provided in the CSV, apply it as the container’s width.
      // Otherwise, do nothing and let the CSS default kick in.
      if (qRow.width && qRow.width.trim()) {
        // Grab the raw string from CSV
        let w = qRow.width.trim();
      
        // If it’s purely digits (e.g. "300" or "  250 "), append "px"
        if (/^\d+$/.test(w)) {
          w = w + 'px';
        }
        // Now w might be "300px", "50%", "2rem", etc.—all valid CSS lengths
        container.style.width = w;
      }

      // ── Compute a random direction on the ring's circumference ──
      const θ = Math.random() * 2 * Math.PI;      // random angle
      const xOff = Math.cos(θ) * quoteOffset;          // px shift in X
      const yOff = Math.sin(θ) * quoteOffset;          // px shift in Y

      // ── Replace old transform with center + random X/Y + depth Z ──
      container.style.transform =
        `translate(-50%, -50%) ` +
        `translateX(${xOff}px) ` +
        `translateY(${yOff}px) ` +
        `translateZ(${zPos}px)`;

      // c) The quote text
      const quoteText = document.createElement('div');
      quoteText.classList.add('quote-text');
          
      // take the raw CSV string, e.g. "… and [shall be] …",
      // and replace “[…]” with <span class="highlight">…</span>
      const raw = (qRow.quote || '').trim();
          
      // escape any literal “<” or “>” first (just in case) so we don’t accidentally allow HTML injection:
      const escaped = raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
          
      // wrap bracketed text in a <span class="highlight">…</span>
      const withHighlights = escaped.replace(
        /\[([^\]]+)\]/g,
        '<span class="highlight">$1</span>'
      );
      
      quoteText.innerHTML = withHighlights;

      // d) The credit/attribution under it
      const credit = document.createElement('div');
      credit.classList.add('quote-credit');
      credit.textContent = qRow.credit.trim() || '';

      // e) Append in order: quote → credit
      container.appendChild(quoteText);
      container.appendChild(credit);

      // f) Finally, append into the same 3D parent that holds your rings & objects
      scene3D.appendChild(container);
    });
  })();

  // ── NEW: spin them in slow motion with random direction ──

  if (ENABLE_SPIN) {
    // 1) capture each ring’s “base” transform + random direction
    rings.forEach(({
      element
    }) => {
      element.dataset.baseTransform = element.style.transform;
      // randomly choose +1 or −1
      element.dataset.dir = Math.random() < 0.5 ? 1 : -1;
    });

    // 2) animation loop
    const rotationDuration = 500_000; // ms per full revolution
    function spinRings(timestamp) {
      const t = timestamp % rotationDuration;
      const pct = t / rotationDuration;
      const deg = pct * 360;

      rings.forEach(({
        element
      }) => {
        const dir = parseFloat(element.dataset.dir);
        const angle = deg * dir;

        // spin the ring
        element.style.transform =
          `${element.dataset.baseTransform} rotate(${angle}deg)`;

        // keep objects upright
        element.querySelectorAll('.object').forEach(obj => {
          obj.style.transform =
            `${obj.dataset.baseTransform} rotate(${-angle}deg)`;
        });
      });

      // ←←← UPDATE CONNECTORS HERE ←←←
      drawConnectors();

      requestAnimationFrame(spinRings);
    }
    requestAnimationFrame(spinRings);
  }

  // compute maximum z-depth for camera logic
  const maxZ = rings.length ?
    Math.max(...rings.map(r => r.zPx)) :
    0;


  // ─── Parallax background state & updater ───
  const parallaxBg = document.querySelector('.background-parallax');
  const maxScaleBoost = 0.5; //CHANGE MAGNIFICATION
  let parallaxScale = 0.5, //CHANGE PARALLAX SCALE
    parallaxTx = 0,
    parallaxTy = 0;

  function updateParallax() {
    parallaxBg.style.transform =
      `rotate(180deg) scale(${parallaxScale}) translate(${parallaxTx}px,${parallaxTy}px)`;
  }

  // ─── Scroll drives zoom (inverted if needed) ───
  window.addEventListener('scroll', () => {
    const scrollY = window.pageYOffset;
    // apply your SCROLL_OFFSET, then clamp between 0…maxZ
    const effectiveScroll = Math.min(Math.max(scrollY + SCROLL_OFFSET, 0), maxZ);
    // normalized [0…1]
    const rawP = effectiveScroll / maxZ;
    // if inverted, flip it:
    const p = INVERT_SCROLL ? 1 - rawP : rawP;
  
    parallaxScale = 1 + p * maxScaleBoost;
    updateParallax();
  });

  // ─── Mouse drives limited drift ───
  window.addEventListener('mousemove', e => {
    const dx = (e.clientX / window.innerWidth - 0.5);
    const dy = (e.clientY / window.innerHeight - 0.5);
    const maxDrift = 10;

    const rawTx = dx * maxDrift; // FLIP SIGNS BEFORE dx and dy to invert movement direction.
    const rawTy = dy * maxDrift;
    parallaxTx = Math.max(-maxDrift, Math.min(maxDrift, rawTx));
    parallaxTy = Math.max(-maxDrift, Math.min(maxDrift, rawTy));

    updateParallax();
  });

  // ─── 4a) Enable click-to-seek on the bottom distortion bar ───
  // Allow clicks on the SVG and show a pointer cursor
  graphSvg.style.pointerEvents = 'auto';
  graphSvg.style.cursor = 'pointer';

  graphSvg.addEventListener('click', e => {
    const { left, width } = graphSvg.getBoundingClientRect();
    const clickX    = e.clientX - left;
    const clickFrac = clickX / width;

    // decide which fraction to use:
    const targetProgress = INVERT_SCROLL
      ? clickFrac
      : (1 - clickFrac);

    // the “effective” scroll (what your scroll‐listener uses internally):
    const desiredEffective = targetProgress * maxZ;

    // undo SCROLL_OFFSET to get the actual window.scrollY:
    let targetScrollY = desiredEffective - SCROLL_OFFSET;

    // clamp between 0 and maxZ, in case the offset makes it negative/overshoot:
    targetScrollY = Math.max(0, Math.min(targetScrollY, maxZ));

    window.scrollTo({
      top: targetScrollY,
      behavior: 'smooth'
    });
  });


  // 6) Populate objects on each ring, include name
  rings.forEach(({
    id,
    element: ringElem,
    zPx
  }) => {
    const items = byId[id] || [];
    const randomizedItems = items.slice().sort(() => Math.random() - 0.5);
    const diameter = parseFloat(
      getComputedStyle(document.documentElement)
      .getPropertyValue('--ring-diameter')
    );
    const radius = diameter / 2;

    // add a random starting rotation for this ring
    const ringOffset = Math.random() * 2 * Math.PI;

    randomizedItems.forEach((row, i) => {
      // evenly spaced division plus the ring's random offset
      const angle = ringOffset + (2 * Math.PI / randomizedItems.length) * i;
      const obj = document.createElement('div');
      obj.classList.add('object');
      //obj.textContent = row['name'] || '';   ADD LABELS TO OBJECT DIVS IN VISUALISATION!!!

      // ───── NEW: try to set the “o”-role background image ─────
      // (make sure you ran this earlier:)
      // const objectImageByObjectId = { '42': 'assets/large/foo.jpg', … };
      const oUrl = objectImageByObjectId[row.id.trim()];
      if (oUrl) {
        // normalize path
        const fullUrl = oUrl.startsWith('assets/') ?
          oUrl :
          `assets/${oUrl}`;

        // apply as CSS background
        obj.style.backgroundImage = `url('${fullUrl}')`;
        obj.style.backgroundSize = 'cover'; // fill the circle without distortion
        obj.style.backgroundPosition = 'center'; // center the image
        obj.style.backgroundColor = 'transparent';
        // if you no longer want the yellow fallback border, you can also:
        // obj.style.border = 'none';
      }
      // ───────────────────────────────────────────────

      // center, rotate to the computed angle, offset to circumference, then counter-rotate so div stays upright
      obj.style.position = 'absolute';
      obj.style.top = '50%';
      obj.style.left = '50%';
      obj.style.transform =
        `translate(-50%, -50%) ` +
        `rotate(${angle}rad) ` +
        `translateX(${radius}px) ` +
        `rotate(${-angle}rad)`;

      obj.dataset.baseTransform = obj.style.transform;

      // store depth for connector filtering
      obj.dataset.zPx = zPx;

      obj.dataset.rowIdx = row._idx;

      // extract the launch-year (same logic you already use in renderTemplate)
      const parts = row.launch_date_utc.split('/');
      const launchYear = parts.length === 3
        ? parts[2]
        : new Date(row.launch_date_utc).getUTCFullYear();

      // create a real <div> under the circle
      const label = document.createElement('div');
      label.classList.add('object-label');

      label.innerHTML = `
        <span class="object-label-name">${row.name}</span>
        <span class="object-label-year">${launchYear}</span>
      `;

      // append it inside the .object so it moves/rotates with it
      obj.appendChild(label);

      // now append the object (with its new label) into the ring
      ringElem.appendChild(obj);

          ringElem.appendChild(obj);
        });
      });


  // 3b) helper to fill placeholders
  function renderTemplate(html, data) {
    if (!data.story_title || !data.story_title.trim()) {
      html = html.replace(
        /<article class="story">[\s\S]*?<\/article>\s*<div class="divider-horizontal"><\/div>\s*/,
        ''
      );
    }
    const parts = data.launch_date_utc.split('/');
    const launchYear = parts.length === 3 ?
      parts[2] :
      (new Date(data.launch_date_utc).getUTCFullYear() || '');
    const kmRaw = idToDistanceAu[data.horizons_id] * AU_IN_KM;
    const kmInt = Math.floor(kmRaw);
    const kmStr = kmInt.toLocaleString();
    return html
      .replace(/\[launch_year\]/g, launchYear)
      .replace(/\[name\]/g, data.name)
      .replace(/\[launch_date_utc\]/g, data.launch_date_utc)
      .replace(/\[mission\]/g, data.mission)
      .replace(/\[origin\]/g, data.origin)
      .replace(/\[fund_model\]/g, data.fund_model)
      .replace(/\[description_md\]/g, data.description_md)
      .replace(/\[current\]/g, data.current)
      .replace(/\[proxy\]/g, `${kmStr} km`)
      .replace(/\[story_title\]/g, data.story_title)
      .replace(/\[quote\]/g, data.quote)
      .replace(/\[quote_source\]/g, data.quote_source)
      .replace(/\[personal_story\]/g, data.personal_story);
  }
  // 3c) click handler for objects
  document.querySelectorAll('.object').forEach(obj => {
    obj.addEventListener('click', () => {
      const row = rows[obj.dataset.rowIdx];

      // 1) Find exactly the “hero” record in images_001.csv (role === 'h')
      const heroRow = parsedImgs.data.find(r =>
        r.id && r.id.trim() === row.id.trim() &&
        r.role && r.role.trim() === 'h'
      );

      // 2) Compute captionText: use caption if non-empty, otherwise alt_text
      let captionText = '';
      if (heroRow) {
        // trim() in case there’s extra whitespace
        const cap = (heroRow.caption || '').trim();
        const alt = (heroRow.alt_text || '').trim();
        captionText = cap.length ? cap : alt;
      }

      // 3) Run renderTemplate, then substitute [caption] before inserting
      let html = renderTemplate(tpl, row);
      html = html.replace(/\[caption\]/g, captionText);

      popupContent.innerHTML = html;

      // 2a) Inject hero image
      const visualDiv = popupContent.querySelector('.visual');
      visualDiv.innerHTML = ''; // clear the placeholder
      // look up by the same key your objects CSV uses:
      const original = heroImageElements[row.id.trim()];
      if (original) {
        const img = original.cloneNode(false);
        img.alt = row.name;
        // if you still want it to fill the container:
        img.style.width = '100%';
        img.style.height = 'auto';
        visualDiv.appendChild(img);
      }
      // 2) Build your “References” blobs inside the popup
      const refContainer = popupContent.querySelector('.references .placeholder');
      refContainer.innerHTML = ''; // clear static placeholders
      (row.reference_urls || '')
      .split('|')
        .map(u => u.trim())
        .filter(Boolean)
        .forEach(u => {
          const a = document.createElement('a');
          a.href = u;
          a.target = '_blank';
          a.rel = 'noopener';
          // the round blob
          const blob = document.createElement('div');
          blob.classList.add('blob');
          // → set the favicon as background
          try {
            const hostname = new URL(u).hostname;
            const favUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
            Object.assign(blob.style, {
              backgroundImage: `url("${favUrl}")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              backgroundSize: 'contain',
              backgroundColor: 'transparent'
            });
          } catch {
            console.warn('Invalid URL for favicon:', u);
          }
          a.appendChild(blob);
          refContainer.appendChild(a);
          // 3) Tooltip handlers
          a.addEventListener('mouseenter', onBlobEnter);
          a.addEventListener('mousemove', onBlobMove);
          a.addEventListener('mouseleave', onBlobLeave);
        });

      // 5) Close-button inside your popup
      popupContent.querySelector('.close-btn')
        .addEventListener('click', () => {
          modalOverlay.classList.add('hidden');
          popupContent.innerHTML = '';
          document.body.style.overflow = '';
        });

      // 2b) Build your “Image Sources” blob (only the single 'hero' entry)
      const imgSrcContainer = popupContent.querySelector('.image-sources .placeholder');
      if (imgSrcContainer) {
        imgSrcContainer.innerHTML = '';
      
        // Find exactly the “hero” row (role='h') for this object ID:
        const heroRow = parsedImgs.data.find(r =>
          r.id && r.id.trim() === row.id.trim() &&
          r.role && r.role.trim() === 'h' &&
          r.credit && r.credit.trim()
        );
      
        if (heroRow) {
          const u = heroRow.credit.trim();
          const a = document.createElement('a');
          a.href = u;
          a.target = '_blank';
          a.rel = 'noopener';
        
          // Create one “blob” div with favicon background:
          const blob = document.createElement('div');
          blob.classList.add('blob');
          try {
            const hostname = new URL(u).hostname;
            const favUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
            Object.assign(blob.style, {
              backgroundImage: `url("${favUrl}")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              backgroundSize: 'contain',
              backgroundColor: 'transparent'
            });
          } catch {
            console.warn('Invalid URL for favicon:', u);
          }
        
          a.appendChild(blob);
          imgSrcContainer.appendChild(a);
        
          // Tooltip handlers:
          a.addEventListener('mouseenter', onBlobEnter);
          a.addEventListener('mousemove',  onBlobMove);
          a.addEventListener('mouseleave', onBlobLeave);
        }
      }

      // 4) Show the modal
      modalOverlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      modalOverlay.scrollTop = 0;

    });

    
  });


  // 7) Scroll & connector logic
  function setSceneHeight() {
    const scenePerspective = +getComputedStyle(root).getPropertyValue('--scenePerspective');
    const cameraSpeed = +getComputedStyle(root).getPropertyValue('--cameraSpeed');

    // viewportHeight in px = viewport + perspective offset + furthest ring offset
    const heightPx = window.innerHeight +
      scenePerspective * cameraSpeed +
      maxZ;

    root.style.setProperty('--viewportHeight', `${heightPx}`);
  }

  // Map to track existing connectors
  const connectorLines = new Map();

  function drawConnectors() {

    const ox = parseFloat(maskRad.getAttribute('cx'));
    const oy = parseFloat(maskRad.getAttribute('cy'));

    const scrollY = window.pageYOffset;
    const visibleObjs = new Set();

    // Determine visible objects and create new connectors
    document.querySelectorAll('.object').forEach(o => {

      const ringElem = o.closest('.ring');
      if (!ringElem || !ringElem.classList.contains('spotlight')) return;

      visibleObjs.add(o);
      if (!connectorLines.has(o)) {
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', ox);
        line.setAttribute('y1', oy);
        svg.appendChild(line);
        connectorLines.set(o, line);
      }
    });

    // Remove connectors for objects that are no longer visible
    for (const [o, line] of connectorLines.entries()) {
      if (!visibleObjs.has(o)) {

        // 1) add fade-out class
        line.classList.add('fade-out');

        // 2) remove after the animation finishes
        line.addEventListener('animationend', () => {
          if (line.parentNode === svg) svg.removeChild(line);
          // now that it’s gone, remove it from the Map
          connectorLines.delete(o);
        }, {
          once: true
        });
      }
    }

    // Update all line endpoints
    connectorLines.forEach((line, o) => {
      const rc = o.getBoundingClientRect();
      // object center
      const cx = rc.left + rc.width / 2;
      const cy = rc.top + rc.height / 2;
      // assume width===height, so radius = width/2
      const R = rc.width / 2;

      // vector from pivot → center
      const dx = cx - ox;
      const dy = cy - oy;
      // full distance
      const dist = Math.hypot(dx, dy);
      // fraction of the way to stop: (dist - R) / dist
      const t = (dist - R) / dist;

      // new endpoint on circle edge
      const x2 = ox + dx * t;
      const y2 = oy + dy * t;

      line.setAttribute('x1', ox);
      line.setAttribute('y1', oy);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
    });
  }

  /**
   * Mouse → subtle CSS-var nudge
   * Moves the 3D pivot a bit toward the cursor.
   */
  function moveCameraAngle(event) {



    // 1) Compute how far pointer is from screen center, in %
    //    (range roughly −100 → +100; invert so scene moves toward cursor)
    const xPct = (
      ((event.clientX - window.innerWidth / 2) * 100) /
      (window.innerWidth / 2)
    ) * -1;

    const yPct = (
      ((event.clientY - window.innerHeight / 2) * 100) /
      (window.innerHeight / 2)
    ) * -1;

    // 2) Scale that offset by maxGap and add to your “home” values
    const newX = perspectiveOrigin.x + (xPct * perspectiveOrigin.maxGap) / 100;
    const newY = perspectiveOrigin.y + (yPct * perspectiveOrigin.maxGap) / 100;

    // 3) Push the new pivot back into CSS
    root.style.setProperty('--scenePerspectiveOriginX', newX);
    root.style.setProperty('--scenePerspectiveOriginY', newY);


    // convert % → absolute pixels in the SVG coordinate space:
    const pivotPxX = (newX / 100) * window.innerWidth;
    const pivotPxY = (newY / 100) * window.innerHeight;

    // shove those into our userSpace mask gradient:
    maskRad.setAttribute('cx', pivotPxX);
    maskRad.setAttribute('cy', pivotPxY);
    maskRad.setAttribute('fx', pivotPxX);
    maskRad.setAttribute('fy', pivotPxY);

    // now update our lines so the “tail” stays at that shifted pivot
    drawConnectors();
  }


  // initialize camera‐Z depending on INVERT_SCROLL:
  setSceneHeight();
  if (INVERT_SCROLL) {
    // scrollY = 0 → cameraZ = 0  (sits at Earth)
    root.style.setProperty('--cameraZ', `${-SCROLL_OFFSET}`);
  } else {
    // original behavior: scrollY = 0 → cameraZ = -maxZ (sits at farthest)
    root.style.setProperty('--cameraZ', `${-(maxZ + SCROLL_OFFSET)}`);
  }
  drawConnectors();

  // on scroll, move camera (either toward Earth or away, depending on INVERT_SCROLL)
  window.addEventListener('scroll', () => {
    const scrollY = window.pageYOffset;

    // ─── (B) flip camera-Z mapping ───
    let camZ;
    if (INVERT_SCROLL) {
      // scrollY=0 → camZ=0 (Earth). scrollY=maxZ → camZ=-maxZ (farthest).
      camZ = -scrollY - SCROLL_OFFSET;
    } else {
      // original: scrollY=0 → camZ=-maxZ; scrollY=maxZ → camZ=0.
      camZ = scrollY - (maxZ + SCROLL_OFFSET);
    }
    root.style.setProperty('--cameraZ', camZ);

    // focal plane is still at Z = -5 for “spotlight” logic:
    const FOCAL_OFFSET = -5;
    const FOCAL_RANGE  = 100;

    let bestDiff      = Infinity;
    let spotlightItem = null;

    // A1) Check every .ring first:
    document.querySelectorAll('.ring').forEach(ring => {
      const zPx      = +ring.dataset.zPx;
      const ringCamZ = zPx + camZ;
      const diff     = Math.abs(ringCamZ - FOCAL_OFFSET);

      if (diff < bestDiff && diff <= FOCAL_RANGE) {
        bestDiff      = diff;
        spotlightItem = ring;
      }
    });

    // A2) Then check every .quote-container:
    document.querySelectorAll('.quote-container').forEach(quote => {
      const zPx       = +quote.dataset.zPx;
      const quoteCamZ = zPx + camZ;
      const diff      = Math.abs(quoteCamZ - FOCAL_OFFSET);

      if (diff < bestDiff && diff <= FOCAL_RANGE) {
        bestDiff      = diff;
        spotlightItem = quote;
      }
    });

    // B1) Assign classes to all .ring
    document.querySelectorAll('.ring').forEach(ring => {
      ring.classList.remove('normal','spotlight','shadow','ghost');
      const zPx      = +ring.dataset.zPx;
      const ringCamZ = zPx + camZ;
      let status = 'normal';

      if (ring === spotlightItem) {
        status = 'spotlight';
      } else if (spotlightItem) {
        const spotlightCamZ = (+spotlightItem.dataset.zPx) + camZ;
        status = (ringCamZ < spotlightCamZ) ? 'shadow' : 'ghost';
      }

      ring.classList.add(status);
    });

    // B2) Assign classes to all .quote-container
    document.querySelectorAll('.quote-container').forEach(quote => {
      quote.classList.remove('normal','spotlight','shadow','ghost');
      const zPx       = +quote.dataset.zPx;
      const quoteCamZ = zPx + camZ;
      let status = 'normal';

      if (quote === spotlightItem) {
        status = 'spotlight';
      } else if (spotlightItem) {
        const spotlightCamZ = (+spotlightItem.dataset.zPx) + camZ;
        status = (quoteCamZ < spotlightCamZ) ? 'shadow' : 'ghost';
      }

      quote.classList.add(status);
    });

    drawConnectors();

    // ─── preserve “p” for parallax things that don’t need flipping ───
    const p = Math.min(Math.max(scrollY / maxZ, 0), 1);

    // map p into [0…1] over your resize window
    let t = (p - resizeStart) / (resizeEnd - resizeStart);
    t = Math.min(Math.max(t, 0), 1);

    // interpolate Earth’s size
    const size = earthMin + t * (earthMax - earthMin);
    earth.style.width  = `${size}px`;
    earth.style.height = `${size}px`;

    // ─── Draw object ticks on the baseline ───
    function drawObjectTicks() {
      const w = window.innerWidth;
      const h = graphSvg.clientHeight;

      // remove any old ticks
      graphSvg.querySelectorAll('line.tick').forEach(el => el.remove());

      rings.forEach(({ zPx }) => {
        const prog = zPx / maxZ;
        const xPos = prog * w;
        const tick = document.createElementNS(svgNS, 'line');
        tick.classList.add('tick');
        tick.setAttribute('x1', xPos);
        tick.setAttribute('x2', xPos);
        tick.setAttribute('y1', '20%');
        tick.setAttribute('y2', '80%');
        graphSvg.appendChild(tick);
      });
    }
    drawObjectTicks();
    window.addEventListener('resize', drawObjectTicks);

    // ─── update distortion-graph indicator ───
    const effectiveScroll = Math.min(Math.max(scrollY + SCROLL_OFFSET, 0), maxZ);
    const progress = effectiveScroll / maxZ;
    const graphW   = window.innerWidth;

    // (C) flip the xPos calculation:
    let xPos;
    if (INVERT_SCROLL) {
      // scrollY=0 → xPos=0; scrollY=maxZ → xPos=graphW
      xPos = progress * graphW;
    } else {
      // original: scrollY=0 → xPos=graphW; scrollY=maxZ → xPos=0
      xPos = (1 - progress) * graphW;
    }
    indicatorLine.setAttribute('x1', xPos);
    indicatorLine.setAttribute('x2', xPos);

    // ─── update distance label ───
    // (D) flip the “eff” so that eff=0 at scrollY=0 and eff=1 at scrollY=maxZ
    let eff;
    if (INVERT_SCROLL) {
      // scrollY=0 → eff=0; scrollY=maxZ → eff=1
      eff = progress;
    } else {
      // original: scrollY=0 → eff=1; scrollY=maxZ → eff=0
      eff = 1 - progress;
    }

    let tNorm;
    if (eff <= distortionThreshold) {
      tNorm = distortionThreshold *
        Math.pow(
          eff / distortionThreshold,
          1 / distortionStrength
        );
    } else {
      tNorm = eff;
    }

    const currentAu = tNorm * maxAu;
    const currentKm = currentAu * AU_IN_KM;

    distanceText.setAttribute('x', xPos);
    distanceText.textContent = `${Math.round(currentKm).toLocaleString()} km`;

    const zonePx = distortionThreshold * window.innerWidth;
    if (xPos <= zonePx) {
      distortionWarning.classList.add('visible');
    } else {
      distortionWarning.classList.remove('visible');
    }

    const vignette = document.querySelector('.vignette-overlay');
    if (xPos <= zonePx) {
      vignette.style.display = 'block';
    } else {
      vignette.style.display = 'none';
    }

  }); // end of scroll listener


  // kick it off once so the line is in the right place on load
  window.dispatchEvent(new Event('scroll'));

  window.addEventListener('resize', () => {
    setSceneHeight();
    drawConnectors();
  });

  // after scene setup, before the end of the callback…
  window.addEventListener('mousemove', moveCameraAngle);

  // 1) Grab references:
  const infoButton = document.getElementById('info-button');
  const infoModal  = document.getElementById('info-modal');
  const infoClose  = document.getElementById('info-modal-close');

  // 2) Open the “info” modal when the icon is clicked:
  infoButton.addEventListener('click', () => {
    infoModal.classList.remove('hidden');
  });

  // 3) Close it when “×” is clicked:
  infoClose.addEventListener('click', () => {
    infoModal.classList.add('hidden');
  });

  // 4) (Optional) also close if user clicks outside .modal-content:
  infoModal.addEventListener('click', e => {
    if (e.target === infoModal) {
      infoModal.classList.add('hidden');
    }
  });



});