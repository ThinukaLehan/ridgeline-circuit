/* World, conditions, garage, instruments and the frame loop. */
(function () {
  'use strict';
  var T = window.THREE, RC = window.RC;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('view'), renderer;
  try {
    if (!T) throw new Error('no three');
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { $('err').style.display = 'flex'; $('menu').style.display = 'none'; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  var col = RC.col;
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  var seed = 20261116;
  function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  function h2(i, j) { var n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); }
  function vnoise(x, y) { var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return (h2(i, j) * (1 - fx) + h2(i + 1, j) * fx) * (1 - fy) + (h2(i, j + 1) * (1 - fx) + h2(i + 1, j + 1) * fx) * fy; }
  function fbm(x, y) { var a = 0.5, s = 0; for (var o = 0; o < 4; o++) { s += a * vnoise(x, y); x = x * 2.03 + 17; y = y * 2.03 + 9; a *= 0.5; } return s; }

  var scene = new T.Scene();
  scene.fog = new T.Fog(0xffffff, 220, 3200);
  var camera = new T.PerspectiveCamera(60, 1, 0.25, 9000);

  /* ---------- sky ---------- */
  var skyU = { sunDir: { value: new T.Vector3(0, 1, 0) }, sunCol: { value: new T.Vector3(1, 1, 1) }, sunStr: { value: 1 }, hor: { value: new T.Vector3() }, zen: { value: new T.Vector3() },
    cloudAmt: { value: 0.25 }, cloudCol: { value: new T.Vector3(1, 1, 1) }, cloudDark: { value: new T.Vector3(0.6, 0.65, 0.72) }, stars: { value: 0 } };
  var skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'varying vec3 vDir; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunStr; uniform vec3 hor; uniform vec3 zen;',
      'uniform float cloudAmt; uniform vec3 cloudCol; uniform vec3 cloudDark; uniform float stars;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
      'float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);',
      '  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }',
      'float fbm(vec2 p){ float a=0.5; float s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+vec2(17.0,9.0); a*=0.5; } return s; }',
      'void main(){',
      '  vec3 d = normalize(vDir);',
      '  float h = clamp(d.y,0.0,1.0);',
      '  vec3 c = mix(hor, zen, pow(h,0.5));',
      '  float s = max(dot(d,sunDir),0.0);',
      '  c += sunCol*pow(s,7.0)*0.25*sunStr;',
      '  c += sunCol*pow(s,1100.0)*6.0*sunStr;',
      '  if(d.y>0.0){',
      '    vec2 uv = d.xz/(d.y+0.14);',
      '    if(stars>0.0){ vec2 g=floor(uv*90.0); float st=hash(g); c += vec3(step(0.992,st))*stars*smoothstep(0.03,0.25,d.y)*(0.4+0.6*hash(g+3.0)); }',
      '    float n = fbm(uv*1.5+vec2(3.0,1.0));',
      '    float lo = mix(0.62,0.26,cloudAmt);',
      '    float cl = smoothstep(lo,lo+0.26,n)*smoothstep(0.0,0.2,d.y);',
      '    vec3 cc = mix(cloudDark, cloudCol, smoothstep(lo,lo+0.42,n));',
      '    c = mix(c, cc, cl*0.94);',
      '  }',
      '  gl_FragColor = vec4(c,1.0);',
      '  #include <tonemapping_fragment>',
      '  #include <encodings_fragment>',
      '}'].join('\n')
  });
  var sky = new T.Mesh(new T.SphereGeometry(6500, 40, 20), skyMat); sky.frustumCulled = false; scene.add(sky);
  var pmrem = new T.PMREMGenerator(renderer), envScene = new T.Scene(), envRT = null;
  envScene.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), skyMat));
  var envGround = new T.Mesh(new T.CircleGeometry(49, 24), new T.MeshBasicMaterial({ color: 0x334422 })); envGround.rotation.x = -Math.PI / 2; envGround.position.y = -4; envScene.add(envGround);

  /* ---------- light ---------- */
  var hemi = new T.HemisphereLight(0xffffff, 0x444444, 0.4); scene.add(hemi);
  var sun = new T.DirectionalLight(0xffffff, 2.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  var sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 460;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; scene.add(sun); scene.add(sun.target);
  var sunDir = new T.Vector3(0.5, 0.6, 0.4).normalize();
  var beams = [0, 1].map(function () { var s = new T.SpotLight(0xfff2d8, 0, 150, 0.5, 0.55, 1.1); s.castShadow = false; return s; });

  /* ---------- textures drawn in code ---------- */
  var maxAniso = renderer.capabilities.getMaxAnisotropy();
  function canvasTex(w, h, draw, linear) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c); if (!linear) t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = maxAniso; return t;
  }
  function speckle(g, w, h, n, tones, a0, a1, s) { for (var i = 0; i < n; i++) { g.globalAlpha = a0 + rnd() * (a1 - a0); g.fillStyle = tones[(rnd() * tones.length) | 0]; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * s, 1 + rnd() * s); } g.globalAlpha = 1; }
  function blotch(g, w, h, n, tones, a) { for (var i = 0; i < n; i++) { g.globalAlpha = a; g.fillStyle = tones[i % tones.length]; var r = 20 + rnd() * 60, x = rnd() * w, y = rnd() * h;
    for (var p = -1; p <= 1; p++) for (var q = -1; q <= 1; q++) { g.beginPath(); g.arc(x + p * w, y + q * h, r, 0, 6.283); g.fill(); } } g.globalAlpha = 1; }
  var grassTex = canvasTex(512, 512, function (g, w, h) {
    g.fillStyle = '#4a6e30'; g.fillRect(0, 0, w, h); var tn = ['#587f37', '#3d5f28', '#527a33', '#668a40', '#44682c', '#748f49', '#5d6f35'];
    blotch(g, w, h, 60, tn, 0.1); speckle(g, w, h, 30000, tn, 0.35, 0.75, 2);
  });
  var snowTex = canvasTex(512, 512, function (g, w, h) {
    g.fillStyle = '#eef2f6'; g.fillRect(0, 0, w, h); var tn = ['#ffffff', '#dfe6ee', '#e8eef4', '#d3dde8'];
    blotch(g, w, h, 50, tn, 0.12); speckle(g, w, h, 9000, tn, 0.2, 0.5, 2);
  });
  function lanes(g, w, h, rgba, lines) {
    [0.17, 0.36, 0.64, 0.83].forEach(function (u) { var gr = g.createLinearGradient((u - 0.07) * w, 0, (u + 0.07) * w, 0);
      gr.addColorStop(0, rgba + '0)'); gr.addColorStop(0.5, rgba + lines + ')'); gr.addColorStop(1, rgba + '0)'); g.fillStyle = gr; g.fillRect((u - 0.07) * w, 0, 0.14 * w, h); });
  }
  var roadTex = canvasTex(512, 1024, function (g, w, h) {
    g.fillStyle = '#34363a'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 70000; i++) { var v = 38 + ((rnd() * 54) | 0); g.globalAlpha = 0.5; g.fillStyle = 'rgb(' + v + ',' + v + ',' + (v + 3) + ')'; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.6, 1 + rnd() * 1.6); }
    g.globalAlpha = 1; lanes(g, w, h, 'rgba(18,18,20,', '0.34');
    g.globalAlpha = 0.92; g.fillStyle = '#e9e7df'; g.fillRect(0.030 * w, 0, 0.022 * w, h); g.fillRect(0.948 * w, 0, 0.022 * w, h); g.fillRect(0.491 * w, 0, 0.018 * w, h * 0.42); g.globalAlpha = 1;
  });
  var gravelTex = canvasTex(512, 1024, function (g, w, h) {
    g.fillStyle = '#8a7b63'; g.fillRect(0, 0, w, h); var tn = ['#9c8d74', '#77694f', '#a89a82', '#6b5e48', '#b3a78f', '#857761'];
    blotch(g, w, h, 40, tn, 0.12); speckle(g, w, h, 60000, tn, 0.5, 0.95, 3); lanes(g, w, h, 'rgba(70,58,40,', '0.4');
  });
  var snowRoadTex = canvasTex(512, 1024, function (g, w, h) {
    g.fillStyle = '#e4e9ee'; g.fillRect(0, 0, w, h); var tn = ['#f6f8fa', '#d5dce4', '#cbd3dc', '#eef1f4'];
    blotch(g, w, h, 40, tn, 0.14); speckle(g, w, h, 20000, tn, 0.3, 0.7, 3); lanes(g, w, h, 'rgba(120,130,142,', '0.55');
  });
  var puddleTex = canvasTex(256, 256, function (g, w, h) {
    g.fillStyle = 'rgb(0,60,0)'; g.fillRect(0, 0, w, h); blotch(g, w, h, 26, ['rgb(0,14,0)', 'rgb(0,24,0)'], 0.55); speckle(g, w, h, 5000, ['rgb(0,90,0)', 'rgb(0,40,0)'], 0.3, 0.6, 2);
  }, true);
  var checkTex = canvasTex(256, 32, function (g) { for (var x = 0; x < 16; x++) for (var y = 0; y < 2; y++) { g.fillStyle = ((x + y) % 2) ? '#111' : '#f2f2f2'; g.fillRect(x * 16, y * 16, 16, 16); } });
  var puffTex = canvasTex(64, 64, function (g) { var gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });

  /* ---------- track ---------- */
  var ctrl = [[0, -300], [180, -320], [330, -220], [360, -40], [260, 80], [300, 240], [180, 360], [0, 300], [-120, 180], [-300, 200], [-380, 40], [-300, -120], [-140, -140], [-100, -260]]
    .map(function (p) { return new T.Vector3(p[0], 0, p[1]); });
  var curve = new T.CatmullRomCurve3(ctrl, true, 'centripetal');
  var N = 1500, sp = curve.getSpacedPoints(N), TRACK_LEN = curve.getLength(), SEG = TRACK_LEN / N, P = [], TG = [], SD = [], i;
  for (i = 0; i < N; i++) { P.push(sp[i]); var tg = sp[(i + 1) % N].clone().sub(sp[(i - 1 + N) % N]).normalize(); TG.push(tg); SD.push(new T.Vector3(tg.z, 0, -tg.x)); }
  var ROAD_HALF = 5.5, START = N - 14;
  function ribbon(half, y, mat, tile) {
    var pos = [], uv = [], nor = [], idx = [], tl = tile ? TRACK_LEN / Math.round(TRACK_LEN / tile) : 1;
    for (var i = 0; i <= N; i++) { var k = i % N, p = P[k], s = SD[k];
      pos.push(p.x + s.x * half, y, p.z + s.z * half, p.x - s.x * half, y, p.z - s.z * half);
      var v = i * SEG / tl; uv.push(0, v, 1, v); nor.push(0, 1, 0, 0, 1, 0);
      if (i < N) { var a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    var m = new T.Mesh(g, mat); m.receiveShadow = true; m.frustumCulled = false; return m;
  }
  function roadM(o) { o.side = T.DoubleSide; o.polygonOffset = true; o.polygonOffsetFactor = -2; o.polygonOffsetUnits = -2; return new T.MeshStandardMaterial(o); }
  var roadMats = {
    dry: roadM({ map: roadTex, roughness: 0.82, envMapIntensity: 0.5 }),
    wet: roadM({ map: roadTex, color: col(0x8f9499), roughness: 1, roughnessMap: puddleTex, envMapIntensity: 1.5 }),
    gravel: roadM({ map: gravelTex, roughness: 1, envMapIntensity: 0.3 }),
    snow: roadM({ map: snowRoadTex, roughness: 0.85, envMapIntensity: 0.5 })
  };
  puddleTex.repeat.set(1, 1);
  var shoulderMat = new T.MeshStandardMaterial({ color: col(0x8b8068), roughness: 1, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, envMapIntensity: 0.3 });
  scene.add(ribbon(8.2, 0.02, shoulderMat));
  var roadMesh = ribbon(ROAD_HALF, 0.04, roadMats.dry, 12); scene.add(roadMesh);

  /* ---------- rolling ground ---------- */
  var GS = 3200, GN = 256, gH = new Float32Array((GN + 1) * (GN + 1)), coarse = [];
  for (i = 0; i < N; i += 6) coarse.push(P[i].x, P[i].z);
  (function () {
    var pos = [], uv = [], idx = [], ix, iz;
    for (iz = 0; iz <= GN; iz++) for (ix = 0; ix <= GN; ix++) {
      var x = -GS / 2 + ix * GS / GN, z = -GS / 2 + iz * GS / GN, d2 = 1e18;
      for (var k = 0; k < coarse.length; k += 2) { var dx = coarse[k] - x, dz = coarse[k + 1] - z, d = dx * dx + dz * dz; if (d < d2) d2 = d; }
      var h = 46 * Math.pow(fbm(x * 0.0021 + 3, z * 0.0021 + 7), 1.4) * sstep(26, 300, Math.sqrt(d2)) * (1 - sstep(1250, 1600, Math.max(Math.abs(x), Math.abs(z))));
      gH[iz * (GN + 1) + ix] = h; pos.push(x, h, z); uv.push(x / 14, z / 14);
    }
    for (iz = 0; iz < GN; iz++) for (ix = 0; ix < GN; ix++) { var a = iz * (GN + 1) + ix, b = a + 1, c = a + GN + 1, d3 = c + 1; idx.push(a, c, b, b, c, d3); }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    RC._groundGeo = g;
  })();
  function groundH(x, z) {
    var fx = (x + GS / 2) / GS * GN, fz = (z + GS / 2) / GS * GN; if (fx < 0 || fz < 0 || fx >= GN || fz >= GN) return 0;
    var ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, a = iz * (GN + 1) + ix;
    return (gH[a] * (1 - tx) + gH[a + 1] * tx) * (1 - tz) + (gH[a + GN + 1] * (1 - tx) + gH[a + GN + 2] * tx) * tz;
  }
  var groundMat = new T.MeshStandardMaterial({ map: grassTex, roughness: 1, envMapIntensity: 0.3 });
  var ground = new T.Mesh(RC._groundGeo, groundMat); ground.receiveShadow = true; scene.add(ground);
  var farTexG = grassTex.clone(); farTexG.needsUpdate = true; farTexG.repeat.set(900, 900);
  var farTexS = snowTex.clone(); farTexS.needsUpdate = true; farTexS.repeat.set(900, 900);
  var farMat = new T.MeshStandardMaterial({ map: farTexG, roughness: 1, envMapIntensity: 0.3 });
  var far = new T.Mesh(new T.PlaneGeometry(16000, 16000), farMat); far.rotation.x = -Math.PI / 2; far.position.y = -0.7; scene.add(far);

  var dummy = new T.Object3D();
  (function () {   // marker posts
    var every = 30, n = Math.floor(N / every) * 2, m = new T.InstancedMesh(new T.BoxGeometry(0.14, 1.0, 0.14), new T.MeshStandardMaterial({ color: col(0xf2f0e8), roughness: 0.6 }), n), k = 0;
    for (var i = 0; i < N - every + 1; i += every) for (var s = -1; s <= 1; s += 2) {
      dummy.position.set(P[i].x + SD[i].x * 7 * s, 0.5, P[i].z + SD[i].z * 7 * s); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); if (k < n) m.setMatrixAt(k++, dummy.matrix); }
    m.count = k; m.castShadow = true; m.frustumCulled = false; scene.add(m);
  })();
  (function () {   // start gantry
    var g = new T.Group(), steel = new T.MeshStandardMaterial({ color: col(0x2b2f36), roughness: 0.5, metalness: 0.7 });
    [-7.6, 7.6].forEach(function (x) { var p = new T.Mesh(new T.BoxGeometry(0.5, 7, 0.5), steel); p.position.set(x, 3.5, 0); p.castShadow = true; g.add(p); });
    var ct = checkTex.clone(); ct.needsUpdate = true; ct.repeat.set(3, 1);
    var beam = new T.Mesh(new T.BoxGeometry(15.7, 1.1, 0.5), new T.MeshStandardMaterial({ map: ct, roughness: 0.7 })); beam.position.set(0, 6.7, 0); beam.castShadow = true; g.add(beam);
    var line = new T.Mesh(new T.PlaneGeometry(ROAD_HALF * 2, 1.6), new T.MeshStandardMaterial({ map: ct, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    line.rotation.x = -Math.PI / 2; line.position.y = 0.05; g.add(line);
    g.position.copy(P[0]); g.rotation.y = Math.atan2(TG[0].x, TG[0].z); scene.add(g);
  })();

  /* ---------- forest ---------- */
  var treeGrid = {}, CELL = 16, foliage = [], treeBase = [], treeN = 0;
  function nearTrack(x, z, min) { var m2 = min * min; for (var i = 0; i < coarse.length; i += 2) { var dx = coarse[i] - x, dz = coarse[i + 1] - z; if (dx * dx + dz * dz < m2) return true; } return false; }
  (function () {
    var list = [], k, x, z;
    for (k = 0; k < 1700; k++) { var i = (rnd() * N) | 0, off = (rnd() < 0.5 ? -1 : 1) * (15 + Math.pow(rnd(), 1.6) * 160);
      x = P[i].x + SD[i].x * off + (rnd() - 0.5) * 6; z = P[i].z + SD[i].z * off + (rnd() - 0.5) * 6; if (!nearTrack(x, z, 14.5)) list.push([x, z]); }
    for (k = 0; k < 2300; k++) { x = (rnd() - 0.5) * 2900; z = (rnd() - 0.5) * 2900; if (!nearTrack(x, z, 15) && fbm(x * 0.004, z * 0.004) > 0.42) list.push([x, z]); }
    var n = treeN = list.length;
    var trunk = new T.InstancedMesh(new T.CylinderGeometry(0.14, 0.3, 3.0, 6).translate(0, 1.5, 0), new T.MeshStandardMaterial({ color: col(0x4a3524), roughness: 1 }), n);
    var fMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, envMapIntensity: 0.25 });
    var tiers = [[2.3, 4.2, 3.9], [1.9, 3.7, 5.9], [1.45, 3.3, 7.8], [0.95, 3.0, 9.6]].map(function (t) { return new T.InstancedMesh(new T.ConeGeometry(t[0], t[1], 10).translate(0, t[2], 0), fMat, n); });
    var greens = [0x24471f, 0x2d5526, 0x1f3d1c, 0x35602a, 0x2a4d2b];
    for (k = 0; k < n; k++) {
      var s = 0.75 + rnd() * 0.95;
      dummy.position.set(list[k][0], groundH(list[k][0], list[k][1]) - 0.15, list[k][1]); dummy.rotation.set((rnd() - 0.5) * 0.06, rnd() * 6.283, (rnd() - 0.5) * 0.06); dummy.scale.set(s, s * (0.9 + rnd() * 0.35), s); dummy.updateMatrix();
      trunk.setMatrixAt(k, dummy.matrix); tiers.forEach(function (m) { m.setMatrixAt(k, dummy.matrix); });
      treeBase.push(col(greens[(rnd() * greens.length) | 0]));
      var key = Math.floor(list[k][0] / CELL) + ',' + Math.floor(list[k][1] / CELL);
      (treeGrid[key] || (treeGrid[key] = [])).push([list[k][0], list[k][1], 0.3 * s]);
    }
    foliage = tiers; [trunk].concat(tiers).forEach(function (m) { m.castShadow = true; m.frustumCulled = false; scene.add(m); });
  })();
  function tintTrees(toWhite, dark) { var c = new T.Color(), w = new T.Color(0.85, 0.88, 0.92);
    foliage.forEach(function (m, ti) { for (var k = 0; k < treeN; k++) { c.copy(treeBase[k]).multiplyScalar(dark).lerp(w, toWhite * (0.45 + 0.12 * ti)); m.setColorAt(k, c); } m.instanceColor.needsUpdate = true; }); }

  /* ---------- mountain range ---------- */
  var mtnMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: T.DoubleSide, envMapIntensity: 0.2 });
  (function () {
    var AR = 220, RR = 12, pos = [], cl = [], idx = [], a, r;
    for (a = 0; a <= AR; a++) for (r = 0; r <= RR; r++) {
      var ang = a / AR * 6.2832, t = r / RR, rad = 1950 + t * 3800, cx = Math.cos(ang), sz = Math.sin(ang);
      var h = sstep(0, 0.5, t) * (90 + 900 * Math.pow(fbm(cx * 2.3 + 5 + t * 1.3, sz * 2.3 + 5 - t), 1.6)) - 12;
      pos.push(cx * rad, h, sz * rad);
      var rock = sstep(120, 340, h), snow = sstep(400, 540, h + 60 * fbm(cx * 9, sz * 9));
      var R = 0.035 + 0.11 * rock, G = 0.06 + 0.085 * rock, B = 0.04 + 0.10 * rock;
      cl.push(R + (0.85 - R) * snow, G + (0.87 - G) * snow, B + (0.92 - B) * snow);
    }
    for (a = 0; a < AR; a++) for (r = 0; r < RR; r++) { var p = a * (RR + 1) + r, q = p + RR + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(cl, 3)); g.setIndex(idx); g.computeVertexNormals();
    var m = new T.Mesh(g, mtnMat); m.frustumCulled = false; scene.add(m);
  })();

  /* ---------- weather and spray ---------- */
  var RAIN_N = 1500, RB = 34, rainPos = new Float32Array(RAIN_N * 6), rainGeo = new T.BufferGeometry();
  for (i = 0; i < RAIN_N; i++) { rainPos[i * 6] = (rnd() * 2 - 1) * RB; rainPos[i * 6 + 1] = rnd() * 26; rainPos[i * 6 + 2] = (rnd() * 2 - 1) * RB; }
  rainGeo.setAttribute('position', new T.BufferAttribute(rainPos, 3));
  var rain = new T.LineSegments(rainGeo, new T.LineBasicMaterial({ color: 0xaab6c4, transparent: true, opacity: 0.38, depthWrite: false })); rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  var SNOW_N = 2600, snowPos = new Float32Array(SNOW_N * 3), snowGeo = new T.BufferGeometry();
  for (i = 0; i < SNOW_N; i++) { snowPos[i * 3] = (rnd() * 2 - 1) * RB; snowPos[i * 3 + 1] = rnd() * 26; snowPos[i * 3 + 2] = (rnd() * 2 - 1) * RB; }
  snowGeo.setAttribute('position', new T.BufferAttribute(snowPos, 3));
  var snowP = new T.Points(snowGeo, new T.PointsMaterial({ map: puffTex, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false, color: 0xffffff })); snowP.frustumCulled = false; snowP.visible = false; scene.add(snowP);
  var wxLast = new T.Vector3();
  function wrap(v, R) { return v > R ? v - 2 * R : (v < -R ? v + 2 * R : v); }
  function weatherUpdate(dt, now) {
    var dx = camera.position.x - wxLast.x, dz = camera.position.z - wxLast.z, i; wxLast.copy(camera.position);
    if (Math.abs(dx) > RB || Math.abs(dz) > RB) { dx = 0; dz = 0; }
    if (rain.visible) {
      for (i = 0; i < RAIN_N; i++) { var o = i * 6, x = wrap(rainPos[o] - dx, RB), y = rainPos[o + 1] - 30 * dt, z = wrap(rainPos[o + 2] - dz, RB); if (y < -2) y += 26;
        rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z; rainPos[o + 3] = x + 0.06 - dx * 0.5; rainPos[o + 4] = y + 0.75; rainPos[o + 5] = z - dz * 0.5; }
      rainGeo.attributes.position.needsUpdate = true; rain.position.set(camera.position.x, camera.position.y - 6, camera.position.z);
    }
    if (snowP.visible) {
      for (i = 0; i < SNOW_N; i++) { var q = i * 3, sy = snowPos[q + 1] - (1.6 + (i % 5) * 0.25) * dt; if (sy < -2) sy += 26;
        snowPos[q] = wrap(snowPos[q] - dx + Math.sin(now * 0.001 + i) * 0.4 * dt, RB); snowPos[q + 1] = sy; snowPos[q + 2] = wrap(snowPos[q + 2] - dz + Math.cos(now * 0.0013 + i * 1.7) * 0.4 * dt, RB); }
      snowGeo.attributes.position.needsUpdate = true; snowP.position.set(camera.position.x, camera.position.y - 6, camera.position.z);
    }
  }
  var puffs = [], puffI = 0;
  for (i = 0; i < 64; i++) { var pm = new T.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0, depthWrite: false }); var ps = new T.Sprite(pm); ps.visible = false; scene.add(ps); puffs.push({ s: ps, life: 0, max: 1, vx: 0, vy: 0, vz: 0, op: 0, grow: 1 }); }
  function puff(x, y, z, c, size, life, op, vx, vz) { var p = puffs[puffI++ % puffs.length]; p.s.position.set(x, y, z); p.s.scale.set(size, size, 1); p.s.material.color.copy(c); p.life = p.max = life; p.op = op; p.vx = vx; p.vz = vz; p.vy = 0.6 + rnd() * 0.6; p.grow = size * 1.6; p.s.visible = true; }
  function puffsUpdate(dt) { for (var i = 0; i < puffs.length; i++) { var p = puffs[i]; if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) { p.s.visible = false; continue; }
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt; var k = p.s.scale.x + p.grow * dt; p.s.scale.set(k, k, 1); p.s.material.opacity = p.op * (p.life / p.max); } }
  var PUFF = { dust: col(0xb7a37f), smoke: col(0xe3e3e3), spray: col(0xc9d3dc), snow: col(0xffffff), grass: col(0x9a8f6a) };

  /* ---------- conditions ---------- */
  var TIME = {
    day: { sun: [0.55, 0.62, 0.38], sunCol: 0xfff0d6, sunInt: 2.6, hemi: 0.45, zen: [0.045, 0.17, 0.50], hor: [0.50, 0.64, 0.80], exp: 0.9, stars: 0, bright: 1, lamps: false },
    dusk: { sun: [0.86, 0.13, 0.34], sunCol: 0xffa25e, sunInt: 2.0, hemi: 0.3, zen: [0.05, 0.09, 0.27], hor: [0.80, 0.40, 0.20], exp: 1.0, stars: 0, bright: 0.45, lamps: true },
    night: { sun: [-0.4, 0.62, 0.3], sunCol: 0x9fb4ff, sunInt: 0.32, hemi: 0.13, zen: [0.003, 0.006, 0.02], hor: [0.012, 0.02, 0.04], exp: 1.15, stars: 1, bright: 0.05, lamps: true }
  };
  var state = { car: 0, color: 0, surf: 0, time: 0, aids: true };
  try { var sv = JSON.parse(localStorage.getItem('ridgeline-setup') || 'null'); if (sv) { state.car = clamp(sv.car | 0, 0, RC.CARS.length - 1); state.color = clamp(sv.color | 0, 0, 4); state.surf = clamp(sv.surf | 0, 0, 3); state.time = clamp(sv.time | 0, 0, 2); state.aids = sv.aids !== false; } } catch (e) {}
  function save() { try { localStorage.setItem('ridgeline-setup', JSON.stringify(state)); } catch (e) {} }
  var surf = RC.SURFACES[0], lampsOn = false;
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function applyConditions() {
    surf = RC.SURFACES[state.surf]; var t = TIME[RC.TIMES[state.time].id];
    var cloud = surf.loose ? 0.32 : 0.25, sunMul = 1, grey = 0, fogN = 220, fogF = 3200, gc = [0.36, 0.39, 0.44], b = Math.max(t.bright, 0.05);
    if (surf.rain) { cloud = 1; sunMul = 0.28; grey = 0.82; fogN = 45; fogF = 850; }
    if (surf.snow) { cloud = 0.93; sunMul = 0.5; grey = 0.82; fogN = 60; fogF = 1000; gc = [0.66, 0.7, 0.76]; }
    var g2 = [gc[0] * b, gc[1] * b, gc[2] * b], hor = mix3(t.hor, g2, grey), zen = mix3(t.zen, [g2[0] * 0.75, g2[1] * 0.75, g2[2] * 0.8], grey);
    skyU.hor.value.set(hor[0], hor[1], hor[2]); skyU.zen.value.set(zen[0], zen[1], zen[2]);
    sunDir.set(t.sun[0], t.sun[1], t.sun[2]).normalize(); skyU.sunDir.value.copy(sunDir);
    var sc2 = col(t.sunCol); skyU.sunCol.value.set(sc2.r, sc2.g, sc2.b); skyU.sunStr.value = (t.stars ? 0.5 : 1) * (grey ? 0.15 : 1);
    skyU.cloudAmt.value = cloud; skyU.stars.value = grey ? 0 : t.stars;
    var cb = grey ? b * 0.75 : b, warm = RC.TIMES[state.time].id === 'dusk' && !grey;
    skyU.cloudCol.value.set(cb * (warm ? 1.25 : 1), cb * (warm ? 0.72 : 1), cb * (warm ? 0.55 : 1));
    skyU.cloudDark.value.set(hor[0] * 0.55 + cb * 0.12, hor[1] * 0.55 + cb * 0.13, hor[2] * 0.55 + cb * 0.16);
    scene.fog.color.setRGB(hor[0], hor[1], hor[2]); scene.fog.near = fogN; scene.fog.far = fogF;
    sun.color.copy(sc2); sun.intensity = t.sunInt * sunMul;
    hemi.color.setRGB(Math.min(1, zen[0] * 2 + hor[0]), Math.min(1, zen[1] * 2 + hor[1]), Math.min(1, zen[2] * 1.4 + hor[2])); hemi.groundColor.copy(col(surf.snow ? 0xb8c0c8 : 0x56683a)); hemi.intensity = t.hemi * (grey ? 1.5 : 1) + (surf.snow ? 0.12 : 0);
    renderer.toneMappingExposure = t.exp;
    roadMesh.material = roadMats[surf.id];
    shoulderMat.color.copy(col(surf.snow ? 0xdfe5ea : (surf.rain ? 0x5f5848 : 0x8b8068)));
    groundMat.map = surf.snow ? snowTex : grassTex; groundMat.color.setScalar(surf.rain ? 0.6 : 1); groundMat.roughness = surf.rain ? 0.75 : 1; groundMat.needsUpdate = true;
    farMat.map = surf.snow ? farTexS : farTexG; farMat.color.setScalar(surf.rain ? 0.6 : 1); farMat.needsUpdate = true;
    mtnMat.color.setScalar(surf.snow ? 1.6 : 1);
    envGround.material.color.copy(col(surf.snow ? 0xcfd6dd : 0x33471f)).multiplyScalar(b);
    tintTrees(surf.snow ? 1 : 0, surf.rain ? 0.7 : 1);
    rain.visible = !!surf.rain; snowP.visible = !!surf.snow; rain.material.opacity = 0.2 + 0.25 * b;
    lampsOn = t.lamps || !!surf.rain || !!surf.snow;
    if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene, 0, 0.1, 200); scene.environment = envRT.texture;
    updateLamps(); updateTag();
  }

  /* ---------- car ---------- */
  var model = null, car = RC.physNew(RC.CARS[0]), spec = RC.CARS[0], camH = 0;
  function updateLamps() {
    if (!model) return;
    model.headMat.emissiveIntensity = lampsOn ? 3 : 0.7; var night = RC.TIMES[state.time].id === 'night';
    beams.forEach(function (b) { b.intensity = lampsOn ? (night ? 7 : 2.4) : 0; });
  }
  function placeAt(i) { car.x = P[i].x; car.z = P[i].z; car.h = Math.atan2(TG[i].x, TG[i].z); car.vx = car.vy = car.r = 0; car.steer = 0; car.gear = 1; car.rpm = spec.idle; car.ax = car.axf = 0; idxNow = i; camH = car.h; }
  function setCar(n) {
    state.car = (n + RC.CARS.length) % RC.CARS.length; spec = RC.CARS[state.car]; if (state.color >= spec.colors.length) state.color = 0;
    if (model) { scene.remove(model.group); model.dispose(); }
    model = RC.buildCar(spec, spec.colors[state.color]); scene.add(model.group);
    beams.forEach(function (b, k) { var sx = k ? -1 : 1; b.position.set(sx * model.lampX, model.lampY, model.lampZ); b.target.position.set(sx * model.lampX * 0.6, -1.2, model.lampZ + 22); model.group.add(b); model.group.add(b.target); });
    var aids = car.aids; car = RC.physNew(spec); car.aids = state.aids; placeAt(START); updateLamps(); RC.audio.setCar(spec); loadBest(); menuFill(); save();
  }

  /* ---------- track position, laps ---------- */
  var idxNow = START, distNow = 0, onRoad = true, lostT = 0;
  function nearestIdx(full) { var best = idxNow, bd = 1e18, from = full ? 0 : -40, to = full ? N - 1 : 40;
    for (var o = from; o <= to; o++) { var i = full ? o : ((idxNow + o) % N + N) % N, dx = P[i].x - car.x, dz = P[i].z - car.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    idxNow = best; distNow = Math.sqrt(bd); }
  var lap = { running: false, t: 0, last: null, best: null, half: false, prev: START };
  function bestKey() { return 'ridgeline-best-' + spec.id + '-' + surf.id; }
  function loadBest() { lap.best = null; try { var b = parseFloat(localStorage.getItem(bestKey())); if (b > 0) lap.best = b; } catch (e) {} }
  function fmt(t) { if (t == null) return '–'; var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); }
  var noteT = 0;
  function note(msg, secs) { $('note').textContent = msg; $('note').classList.add('on'); noteT = secs || 2.5; }
  function lapUpdate(dt) {
    var p = idxNow / N, pp = lap.prev / N; if (lap.running) lap.t += dt; if (p > 0.45 && p < 0.55) lap.half = true;
    if (pp > 0.9 && p < 0.1 && distNow < 9) {
      if (lap.running && lap.half) { lap.last = lap.t;
        if (lap.best == null || lap.t < lap.best) { lap.best = lap.t; note('Best lap ' + fmt(lap.t), 3.5); try { localStorage.setItem(bestKey(), String(lap.t)); } catch (e) {} } else note('Lap ' + fmt(lap.t), 3); }
      lap.running = true; lap.t = 0; lap.half = false;
    }
    lap.prev = idxNow;
  }

  /* ---------- minimap ---------- */
  var mg = $('mapC').getContext('2d'), mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = 300;
  var mb = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 }; P.forEach(function (p) { mb.x0 = Math.min(mb.x0, p.x); mb.x1 = Math.max(mb.x1, p.x); mb.z0 = Math.min(mb.z0, p.z); mb.z1 = Math.max(mb.z1, p.z); });
  var ms = 250 / Math.max(mb.x1 - mb.x0, mb.z1 - mb.z0);
  function mx(x) { return 150 + (x - (mb.x0 + mb.x1) / 2) * ms; } function mz(z) { return 150 + (z - (mb.z0 + mb.z1) / 2) * ms; }
  (function () { var g = mapBase.getContext('2d'); g.lineJoin = 'round'; g.beginPath(); for (var i = 0; i <= N; i += 5) { var p = P[i % N]; if (i) g.lineTo(mx(p.x), mz(p.z)); else g.moveTo(mx(p.x), mz(p.z)); }
    g.closePath(); g.strokeStyle = 'rgba(244,241,234,.85)'; g.lineWidth = 7; g.stroke(); g.fillStyle = '#ffb62e'; g.fillRect(mx(P[0].x) - 9, mz(P[0].z) - 3, 18, 6); })();
  function drawMap() { mg.clearRect(0, 0, 300, 300); mg.drawImage(mapBase, 0, 0); mg.fillStyle = '#ff4b3a'; mg.strokeStyle = '#fff'; mg.lineWidth = 3; mg.beginPath(); mg.arc(mx(car.x), mz(car.z), 9, 0, 6.283); mg.fill(); mg.stroke(); }

  /* ---------- garage ---------- */
  var mode = 'menu', sprint = {};
  function sprintTime(s) {   // 0-100 km/h from the driving model itself
    if (sprint[s.id]) return sprint[s.id]; var c = RC.physNew(s), t = 0, inp = { thr: 1, brk: 0, steer: 0, hb: false }, env = { mu: 0.92 * s.grip, B: 11, rr: 0.013 };
    while (c.vx < 27.78 && t < 20) { RC.physStep(c, inp, env, 1 / 240); t += 1 / 240; } return (sprint[s.id] = t);
  }
  function opt(parent, label, pressed, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'opt'; b.textContent = label; b.setAttribute('aria-pressed', pressed ? 'true' : 'false'); b.addEventListener('click', fn); parent.appendChild(b); }
  function menuFill() {
    $('carName').textContent = spec.name; $('carCls').textContent = spec.cls; $('carCount').textContent = (state.car + 1) + ' / ' + RC.CARS.length;
    var rows = [['Engine', spec.engine], ['Power', spec.hp + ' hp (' + spec.kw + ' kW)'], ['Weight', spec.mass.toLocaleString('en-US') + ' kg'], ['Drive', spec.layout], ['0–100 km/h', sprintTime(spec).toFixed(1) + ' s'], ['Gearbox', spec.ev ? 'Single speed' : spec.gears.length + '-speed automatic']];
    var dl = $('specs'); dl.textContent = ''; rows.forEach(function (r) { var dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = r[0]; dd.textContent = r[1]; dl.appendChild(dt); dl.appendChild(dd); });
    var sw = $('swatches'); sw.textContent = '';
    spec.colors.forEach(function (c, k) { var b = document.createElement('button'); b.type = 'button'; b.style.background = '#' + ('000000' + c.toString(16)).slice(-6); b.setAttribute('aria-label', 'Colour ' + (k + 1)); b.setAttribute('aria-pressed', k === state.color ? 'true' : 'false');
      b.addEventListener('click', function () { state.color = k; model.paint.color.copy(col(c)); save(); menuFill(); }); sw.appendChild(b); });
    var so = $('surfOpts'); so.textContent = ''; RC.SURFACES.forEach(function (s, k) { opt(so, s.name, k === state.surf, function () { state.surf = k; applyConditions(); loadBest(); save(); menuFill(); }); });
    $('surfNote').textContent = RC.SURFACES[state.surf].note;
    var to = $('timeOpts'); to.textContent = ''; RC.TIMES.forEach(function (s, k) { opt(to, s.name, k === state.time, function () { state.time = k; applyConditions(); save(); menuFill(); }); });
    $('aidOn').setAttribute('aria-pressed', state.aids ? 'true' : 'false'); $('aidOff').setAttribute('aria-pressed', state.aids ? 'false' : 'true');
  }
  function updateTag() { $('tag').innerHTML = '<b>' + surf.name + '</b> · ' + RC.TIMES[state.time].name + '<br>Aids ' + (state.aids ? 'on' : 'off'); }
  function setAids(on) { state.aids = on; car.aids = on; save(); menuFill(); updateTag(); }
  $('prevCar').addEventListener('click', function () { setCar(state.car - 1); });
  $('nextCar').addEventListener('click', function () { setCar(state.car + 1); });
  $('aidOn').addEventListener('click', function () { setAids(true); }); $('aidOff').addEventListener('click', function () { setAids(false); });
  function toDrive() { mode = 'drive'; document.body.classList.remove('menu'); $('title').style.display = 'none'; placeAt(START); lap.running = false; lap.t = 0; lap.last = null; lap.half = false; lap.prev = START; RC.audio.start(); RC.audio.setCar(spec); try { canvas.focus(); } catch (e) {} }
  function toMenu() { mode = 'menu'; document.body.classList.add('menu'); $('title').style.display = ''; placeAt(START); for (var k in input) input[k] = false; }
  $('go').addEventListener('click', toDrive); $('back').addEventListener('click', toMenu);

  /* ---------- input ---------- */
  var input = { up: false, down: false, left: false, right: false, hb: false }, camMode = 0, muted = false;
  var KEY = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'hb' };
  window.addEventListener('keydown', function (e) {
    if (mode !== 'drive') { if (e.code === 'Enter') toDrive(); else if (e.code === 'ArrowLeft') setCar(state.car - 1); else if (e.code === 'ArrowRight') setCar(state.car + 1); return; }
    var k = KEY[e.code]; if (k) { input[k] = true; e.preventDefault(); return; }
    if (e.repeat) return;
    if (e.code === 'KeyC') camMode = (camMode + 1) % 3;
    else if (e.code === 'KeyR') { nearestIdx(true); placeAt(idxNow); note('Back on track', 1.5); }
    else if (e.code === 'KeyM') { muted = !muted; RC.audio.setMuted(muted); note(muted ? 'Sound off' : 'Sound on', 1.2); }
    else if (e.code === 'KeyT') { setAids(!state.aids); note('Driving aids ' + (state.aids ? 'on' : 'off'), 1.5); }
    else if (e.code === 'Escape') toMenu();
  });
  window.addEventListener('keyup', function (e) { var k = KEY[e.code]; if (k) { input[k] = false; e.preventDefault(); } });
  window.addEventListener('blur', function () { for (var k in input) input[k] = false; });
  document.addEventListener('visibilitychange', function () { RC.audio.pause(document.hidden); });
  if (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) document.body.classList.add('touch');
  [['bL', 'left'], ['bR', 'right'], ['bG', 'up'], ['bB', 'down']].forEach(function (b) {
    var el = $(b[0]); function on(e) { e.preventDefault(); input[b[1]] = true; el.classList.add('act'); } function off(e) { e.preventDefault(); input[b[1]] = false; el.classList.remove('act'); }
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off); el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  /* ---------- frame loop ---------- */
  function resize() { var w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize); resize();
  var elSpeed = $('speed'), elGear = $('gear'), elArc = $('rpmArc'), elNow = $('tNow'), elLast = $('tLast'), elBest = $('tBest');
  var inp = { thr: 0, brk: 0, steer: 0, hb: false }, env = { mu: 1, B: 11, rr: 0.013 }, last = performance.now(), hudT = 0, orbit = 0.9, emitT = 0, roll = 0, pitch = 0;
  function collide() {
    var sh = Math.sin(car.h), ch = Math.cos(car.h), wx = sh * car.vx + ch * car.vy, wz = ch * car.vx - sh * car.vy, hit = false;
    var cx = Math.floor(car.x / CELL), cz = Math.floor(car.z / CELL);
    for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) { var cell = treeGrid[(cx + a) + ',' + (cz + b)]; if (!cell) continue;
      for (var k = 0; k < cell.length; k++) { var dx = car.x - cell[k][0], dz = car.z - cell[k][1], rr = cell[k][2] + 1.0, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { var d = Math.sqrt(d2), nx = dx / d, nz = dz / d, vn = wx * nx + wz * nz; car.x = cell[k][0] + nx * rr; car.z = cell[k][1] + nz * rr;
          if (vn < 0) { wx -= 1.25 * vn * nx; wz -= 1.25 * vn * nz; wx *= 0.5; wz *= 0.5; car.r *= 0.3; hit = true; } } } }
    if (hit) { car.vx = wx * sh + wz * ch; car.vy = wx * ch - wz * sh; }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000); last = now; if (dt <= 0) return;
    var speed = Math.abs(car.vx), sh, ch;
    if (mode === 'drive') {
      inp.thr = input.up ? 1 : 0; inp.brk = input.down ? 1 : 0; inp.steer = (input.left ? 1 : 0) - (input.right ? 1 : 0); inp.hb = input.hb;
      if (onRoad) { env.mu = surf.mu * (surf.loose ? spec.loose : (surf.rain ? 1 + (spec.grip - 1) * 0.3 : spec.grip)); env.B = surf.B; env.rr = surf.rr; }
      else { env.mu = surf.offMu * spec.loose; env.B = 5; env.rr = surf.offRr; }
      var sub = Math.max(1, Math.ceil(dt * 240)); for (var s = 0; s < sub; s++) RC.physStep(car, inp, env, dt / sub);
      collide(); nearestIdx(false);
      if (distNow > 40) { lostT += dt; if (lostT > 0.4) { nearestIdx(true); lostT = 0; } }
      onRoad = distNow < ROAD_HALF + 0.7; lapUpdate(dt); speed = Math.abs(car.vx);
    }
    sh = Math.sin(car.h); ch = Math.cos(car.h);
    var rough = (onRoad && !surf.loose) ? 0 : Math.min(1, speed / 14) * (onRoad ? 0.5 : 1), gy = groundH(car.x, car.z);
    model.group.position.set(car.x, gy + rough * 0.018 * Math.sin(now * 0.05), car.z); model.group.rotation.y = car.h;
    roll += (clamp(car.ay * 0.0042 * (spec.hcg / 0.5), -0.07, 0.07) - roll) * Math.min(1, dt * 6); pitch += (clamp(-car.ax * 0.0035 * (spec.hcg / 0.5), -0.045, 0.05) - pitch) * Math.min(1, dt * 6);
    model.body.rotation.z = roll; model.body.rotation.x = pitch;
    var spin = car.vx / spec.wr * dt; for (var w = 0; w < 4; w++) model.wheels[w].rotation.x += spin;
    model.frontPivots[0].rotation.y = model.frontPivots[1].rotation.y = car.steer;
    model.tailMat.emissiveIntensity = (mode === 'drive' && car.brk > 0.1 && !car.rev) ? 3.4 : (lampsOn ? 1.3 : 0.5);

    // dust, spray, smoke
    if (mode === 'drive' && speed > 4) {
      var kind = null, rate = 0;
      if (!onRoad) { kind = surf.snow ? 'snow' : 'grass'; rate = 26; }
      else if (surf.id === 'gravel') { kind = 'dust'; rate = 30; }
      else if (surf.snow) { kind = 'snow'; rate = 24; }
      else if (surf.rain && speed > 12) { kind = 'spray'; rate = 30; }
      else if (car.slide > 0.35 || car.spin) { kind = 'smoke'; rate = 34; }
      if (kind) { emitT += dt * rate; while (emitT > 1) { emitT -= 1; var side = rnd() < 0.5 ? -1 : 1, bx = car.x + sh * model.axR + ch * side * model.halfW * 0.85, bz = car.z + ch * model.axR - sh * side * model.halfW * 0.85;
        var wvx = (sh * car.vx + ch * car.vy) * 0.25, wvz = (ch * car.vx - sh * car.vy) * 0.25;
        puff(bx, gy + 0.25, bz, PUFF[kind], 0.7 + rnd() * 0.6, kind === 'smoke' ? 1.3 : 0.9, kind === 'spray' ? 0.22 : (kind === 'smoke' ? 0.3 : 0.4), wvx + (rnd() - 0.5), wvz + (rnd() - 0.5)); } }
    }
    puffsUpdate(dt);

    // camera
    if (mode === 'menu') {
      orbit += dt * 0.22; var or = spec.shape.L * 1.55 + 0.6;
      camera.position.set(car.x + Math.sin(car.h + orbit) * or, gy + 1.5 + 0.35 * Math.sin(orbit * 0.6), car.z + Math.cos(car.h + orbit) * or);
      camera.lookAt(car.x, gy + spec.shape.H * 0.42, car.z); if (camera.fov !== 42) { camera.fov = 42; camera.updateProjectionMatrix(); }
    } else {
      var vh = speed > 4 ? Math.atan2(sh * car.vx + ch * car.vy, ch * car.vx - sh * car.vy) : car.h, tgt = car.vx > 2 ? car.h + clamp(Math.atan2(Math.sin(vh - car.h), Math.cos(vh - car.h)), -0.5, 0.5) * 0.5 : car.h;
      var dh = tgt - camH; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); camH += dh * Math.min(1, dt * 4.5);
      var shk = rough * 0.03 * Math.sin(now * 0.07), S = spec.shape;
      if (camMode === 0) { var cd = S.L * 1.35 + 1.3 + speed * 0.02, cs2 = Math.sin(camH), cc = Math.cos(camH), px = car.x - cs2 * cd, pz = car.z - cc * cd;
        camera.position.set(px, Math.max(groundH(px, pz) + 0.7, gy + S.H + 1.15) + shk, pz); camera.lookAt(car.x + sh * 3.5, gy + S.H * 0.75, car.z + ch * 3.5); }
      else if (camMode === 1) { var hz = S.cowl + 0.12; camera.position.set(car.x + sh * hz, gy + S.hood + 0.3 + shk, car.z + ch * hz); camera.lookAt(car.x + sh * 30, gy + S.hood - 0.2, car.z + ch * 30); }
      else { var bz2 = S.L / 2 + 0.15; camera.position.set(car.x + sh * bz2, gy + 0.6 + shk, car.z + ch * bz2); camera.lookAt(car.x + sh * 30, gy + 0.55, car.z + ch * 30); }
      var fov = (camMode === 0 ? 58 : 68) + Math.min(18, speed * 0.2); if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
    }
    sky.position.copy(camera.position);
    sun.position.set(car.x + sunDir.x * 220, gy + sunDir.y * 220, car.z + sunDir.z * 220); sun.target.position.set(car.x, gy, car.z);
    weatherUpdate(dt, now);

    hudT += dt;
    if (hudT > 0.05) { hudT = 0;
      if (mode === 'drive') {
        elSpeed.textContent = Math.round(speed * 3.6);
        elGear.textContent = car.gear === 0 ? 'R' : (spec.ev ? 'D' : (speed < 0.3 && car.thr < 0.05 ? 'N' : String(car.gear)));
        var f = clamp((car.rpm - spec.idle * 0.7) / (spec.redline - spec.idle * 0.7), 0, 1); elArc.setAttribute('stroke-dasharray', (f * 273.3).toFixed(1) + ' 364.4'); elArc.classList.toggle('red', car.rpm > spec.redline * 0.9);
        elNow.textContent = fmt(lap.running ? lap.t : 0); elLast.textContent = fmt(lap.last); elBest.textContent = fmt(lap.best); drawMap();
      }
    }
    if (noteT > 0) { noteT -= dt; if (noteT <= 0) $('note').classList.remove('on'); }
    if (mode === 'drive' && distNow > 120 && noteT <= 0) note('Press R to return to the track', 1);
    RC.audio.update({ rpm: car.rpm, thr: mode === 'drive' ? car.load : 0, speed: mode === 'drive' ? speed : 0, slide: mode === 'drive' ? Math.max(car.slide, car.spin ? 0.6 : 0) : 0, surface: surf.id, rain: !!surf.rain, onRoad: onRoad, active: mode === 'drive' });
    renderer.render(scene, camera);
  }
  applyConditions(); setCar(state.car);
  requestAnimationFrame(frame);
  window.__game = { get car() { return car; }, input: input, lap: lap, state: state, setCar: setCar, apply: applyConditions, toDrive: toDrive };
})();
