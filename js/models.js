/* Car models. Each body is one smooth skin lofted through ~50 cross-sections, shaped from the
   car's real dimensions (length, width, roofline, bonnet and boot heights, wheelbase). */
(function () {
  'use strict';
  var T = window.THREE, RC = window.RC = window.RC || {};
  function col(h) { return new T.Color(h).convertSRGBToLinear(); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function ss(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  RC.col = col;

  var shared = null;
  function mats() {
    if (shared) return shared;
    shared = {
      glass: new T.MeshPhysicalMaterial({ color: col(0x0a1016), metalness: 0.9, roughness: 0.05, envMapIntensity: 1.7, side: T.DoubleSide }),
      trim: new T.MeshStandardMaterial({ color: col(0x121315), roughness: 0.62, metalness: 0.2, side: T.DoubleSide }),
      black: new T.MeshStandardMaterial({ color: col(0x050506), roughness: 0.95 }),
      tire: new T.MeshStandardMaterial({ color: col(0x0e0e10), roughness: 0.9 }),
      rimDark: new T.MeshStandardMaterial({ color: col(0x1c1d20), roughness: 0.45, metalness: 0.8, side: T.DoubleSide }),
      alloy: new T.MeshStandardMaterial({ color: col(0xc6c9cf), roughness: 0.22, metalness: 1 }),
      disc: new T.MeshStandardMaterial({ color: col(0x8d9096), roughness: 0.4, metalness: 0.9 }),
      caliper: new T.MeshStandardMaterial({ color: col(0xc21a1a), roughness: 0.5 }),
      plate: new T.MeshStandardMaterial({ color: col(0xe8e6da), roughness: 0.6 }),
      chrome: new T.MeshStandardMaterial({ color: col(0xd8dade), roughness: 0.12, metalness: 1 })
    };
    return shared;
  }

  function makeWheel(r, tw, side, spec) {
    var M = mats(), g = new T.Group(), rimR = r - 0.105;
    var pr = [[rimR, -tw / 2], [r - 0.035, -tw / 2], [r - 0.006, -tw / 2 + 0.03], [r, -tw / 2 + 0.07], [r, tw / 2 - 0.07], [r - 0.006, tw / 2 - 0.03], [r - 0.035, tw / 2], [rimR, tw / 2]]
      .map(function (p) { return new T.Vector2(p[0], p[1]); });
    var tire = new T.Mesh(new T.LatheGeometry(pr, 40).rotateZ(Math.PI / 2), M.tire); tire.castShadow = true; g.add(tire);
    g.add(new T.Mesh(new T.CylinderGeometry(rimR, rimR, tw * 0.94, 32, 1, true).rotateZ(Math.PI / 2), M.rimDark));
    var fx = side * (tw / 2 - 0.045);
    var lip = new T.Mesh(new T.TorusGeometry(rimR - 0.008, 0.013, 8, 40).rotateY(Math.PI / 2), M.alloy); lip.position.x = side * (tw / 2 - 0.012); g.add(lip);
    var n = spec.spokes, sg = new T.BoxGeometry(0.035, rimR - 0.02, n > 7 ? 0.028 : 0.05).translate(0, (rimR - 0.02) / 2 + 0.01, 0);
    for (var k = 0; k < n; k++) { var sp = new T.Mesh(sg, M.alloy); sp.rotation.x = k * 2 * Math.PI / n; sp.position.x = fx; g.add(sp); }
    var hub = new T.Mesh(new T.CylinderGeometry(0.062, 0.07, 0.07, 18).rotateZ(Math.PI / 2), M.alloy); hub.position.x = fx; g.add(hub);
    var disc = new T.Mesh(new T.CylinderGeometry(rimR * 0.8, rimR * 0.8, 0.03, 28).rotateZ(Math.PI / 2), M.disc); disc.position.x = side * (tw / 2 - 0.13); g.add(disc);
    return g;
  }

  RC.buildCar = function (spec, colorHex) {
    var M = mats(), sh = spec.shape, L = sh.L, W = sh.W, H = sh.H, hw = W / 2, zF = L / 2, zR = -L / 2, wr = spec.wr;
    var axF = zF - sh.fo, axR = axF - spec.wb;
    var beltPts = [[zR, sh.tail], [sh.rearB, sh.deck], [(sh.rearB + sh.cowl) / 2, sh.belt], [sh.cowl, sh.hood], [zF - 0.25, sh.nose], [zF, sh.nose - 0.06]];
    function key(z) {
      var p = beltPts; if (z <= p[0][0]) return p[0][1];
      for (var i = 1; i < p.length; i++) if (z <= p[i][0]) { var t = (z - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * ss(t); }
      return p[p.length - 1][1];
    }
    function fn(z) {
      var yb = key(z), yr = yb;
      if (z < sh.cowl && z > sh.rearB) {
        var top;
        if (z >= sh.roofF) top = 1 - Math.pow(1 - (sh.cowl - z) / (sh.cowl - sh.roofF), 1.7);
        else if (z >= sh.roofR) top = 1;
        else top = 1 - Math.pow(1 - (z - sh.rearB) / (sh.roofR - sh.rearB), sh.rearP);
        yr = yb + (H - yb) * top;
      }
      var w = hw, tn = (z - (zF - 1.0)) / 1.0; if (tn > 0) w *= 1 - sh.noseT * tn * tn;
      var tt = ((zR + 0.8) - z) / 0.8; if (tt > 0) w *= 1 - sh.tailT * tt * tt;
      var y0 = sh.clear, bn = (z - (zF - 0.55)) / 0.55; if (bn > 0) y0 += 0.10 * bn * bn;
      var bt = ((zR + 0.5) - z) / 0.5; if (bt > 0) y0 += 0.16 * bt * bt;
      var fb = 0;
      [axF, axR].forEach(function (az) {
        var d = Math.abs(z - az) / (wr + 0.3);
        if (d < 1) { var need = (2 * wr + 0.11) - yb; if (need > 0) fb = Math.max(fb, need * Math.pow(Math.cos(d * Math.PI / 2), 2)); }
      });
      return { w: w, y0: y0, yb: yb, yr: yr, fb: fb };
    }
    function ring(zEval, e) {
      var f = fn(zEval), w = f.w, y0 = f.y0, yb = f.yb, yr = f.yr, c = ss((yr - yb) / 0.2), ys = yb + f.fb;
      var wb_ = w * sh.cabB, wt = w * sh.cabT;
      var hood = [[0.80 * w, yb + 0.02 + f.fb * 0.9], [0.55 * w, yb + 0.04 + f.fb * 0.35], [0.28 * w, yb + 0.052], [0, yb + 0.057]];
      var cab = [[wb_, ys + 0.02], [wt + 0.03, yr - 0.07], [wt - 0.12, yr - 0.008], [0, yr + 0.02]];
      var pts = [[0, y0], [0.62 * w, y0], [0.93 * w, y0 + 0.035], [w, y0 + 0.15], [w, y0 + 0.55 * (ys - y0)], [0.985 * w, ys - 0.10], [0.94 * w, ys - 0.015]];
      for (var i = 0; i < 4; i++) pts.push([hood[i][0] + (cab[i][0] - hood[i][0]) * c, hood[i][1] + (cab[i][1] - hood[i][1]) * c]);
      if (e !== 1) { var cy = (y0 + yb) / 2; pts.forEach(function (p) { p[0] *= e; p[1] = cy + (p[1] - cy) * e; }); }
      return { pts: pts, c: (yr - yb) };
    }
    // stations: even spacing plus the exact window and pillar edges
    var keys = [sh.cowl, sh.roofF, sh.roofR, sh.rearB], bp = (sh.roofF + sh.roofR) / 2 - 0.08, hasBP = (sh.roofF - sh.roofR) > 0.9;
    if (hasBP) keys.push(bp - 0.05, bp + 0.05);
    var zs = keys.slice(), n = Math.round(L / 0.1), i, j;
    for (i = 0; i <= n; i++) { var z = zR + 0.1 + (L - 0.2) * i / n, near = false; for (j = 0; j < keys.length; j++) if (Math.abs(keys[j] - z) < 0.035) near = true; if (!near) zs.push(z); }
    zs.sort(function (a, b) { return a - b; });
    var st = [];
    st.push({ z: zR, r: ring(zR + 0.1, 0.80) }, { z: zR + 0.035, r: ring(zR + 0.1, 0.95) });
    zs.forEach(function (z) { st.push({ z: z, r: ring(z, 1) }); });
    st.push({ z: zF - 0.035, r: ring(zF - 0.1, 0.95) }, { z: zF, r: ring(zF - 0.1, 0.78) });
    var S = st.length, R = 20, pos = [], idx = [[], [], [], [], []];   // paint, glass, trim, headlamp, taillamp
    // wheel arches: side vertices that fall inside an arch are slid along the car onto its rim,
    // and the skin panels left wholly inside are dropped, which leaves a clean round opening
    var AR = wr + 0.05, cut = new Uint8Array(S * R);
    for (i = 0; i < S; i++) for (j = 0; j < R; j++) {
      var p = j <= 10 ? st[i].r.pts[j] : st[i].r.pts[20 - j], kq = j < 10 ? j : 20 - j, zz = st[i].z;
      if (kq >= 2 && kq <= 5) [axF, axR].forEach(function (az) {
        var dy = p[1] - wr; if (Math.abs(dy) < AR) { var half = Math.sqrt(AR * AR - dy * dy); if (Math.abs(st[i].z - az) < half) { zz = az + (st[i].z >= az ? half : -half); cut[i * R + j] = 1; } }
      });
      pos.push(j <= 10 ? p[0] : -p[0], p[1], zz);
    }
    for (i = 0; i < S - 1; i++) {
      var zm = (st[i].z + st[i + 1].z) / 2, cm = (st[i].r.c + st[i + 1].r.c) / 2;
      for (j = 0; j < R; j++) {
        var k = j < 10 ? j : 19 - j, m = 0;
        if (k <= 2) m = 2;
        else if (i === 0 && k >= 4 && (k <= 6 || sh.bar)) m = 4;
        else if (i === 1 && k >= 5 && k <= 6) m = 4;
        else if (i >= S - 4 && k >= 5 && k <= 7) m = 3;
        else if (k === 7 && cm > 0.16 && !(hasBP && Math.abs(zm - bp) < 0.05)) m = 1;
        else if (k === 9 && cm > 0.1 && ((zm > sh.roofF && zm < sh.cowl) || (zm > sh.rearB && zm < sh.roofR))) m = 1;
        var a = i * R + j, b = i * R + (j + 1) % R, c2 = (i + 1) * R + j, d = (i + 1) * R + (j + 1) % R;
        if (cut[a] && cut[b] && cut[c2] && cut[d]) continue;
        idx[m].push(a, b, c2, b, d, c2);
      }
    }
    // end caps
    var fr = st[S - 1].r.pts, re = st[0].r.pts, cF = pos.length / 3; pos.push(0, (fr[0][1] + fr[10][1]) / 2, zF + 0.015);
    var cR = pos.length / 3; pos.push(0, (re[0][1] + re[10][1]) / 2, zR - 0.015);
    for (j = 0; j < R; j++) {
      var kk = j < 10 ? j : 19 - j, j2 = (j + 1) % R;
      idx[(kk <= 3 && !spec.ev) || kk <= 1 ? 2 : 0].push((S - 1) * R + j, (S - 1) * R + j2, cF);
      idx[kk <= 3 ? 2 : 0].push(j2, j, cR);
    }
    var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    var all = [], off = 0; idx.forEach(function (a, m) { geo.addGroup(off, a.length, m); off += a.length; all = all.concat(a); });
    geo.setIndex(all); geo.computeVertexNormals();
    var paint = new T.MeshPhysicalMaterial({ color: col(colorHex), metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3, side: T.DoubleSide });
    var headMat = new T.MeshStandardMaterial({ color: col(0xf4f6ff), emissive: col(0xfff4dc), emissiveIntensity: 0.9, roughness: 0.15, side: T.DoubleSide });
    var tailMat = new T.MeshStandardMaterial({ color: col(0x5a0508), emissive: col(0xff1a12), emissiveIntensity: 0.5, roughness: 0.3, side: T.DoubleSide });
    var group = new T.Group(), body = new T.Group(); group.add(body);
    var skin = new T.Mesh(geo, [paint, M.glass, M.trim, headMat, tailMat]); skin.castShadow = true; body.add(skin);

    // wheel wells, floor
    [axF, axR].forEach(function (az) {
      var f = fn(az);
      [-1, 1].forEach(function (sx) {
        var well = new T.Mesh(new T.CylinderGeometry(wr + 0.062, wr + 0.062, 0.3, 30).rotateZ(Math.PI / 2), M.black);
        well.position.set(sx * (f.w - 0.185), wr + 0.005, az); body.add(well);
      });
    });
    var floor = new T.Mesh(new T.BoxGeometry(W * 0.86, 0.06, L * 0.86), M.black); floor.position.y = sh.clear + 0.05; floor.castShadow = true; body.add(floor);
    // mirrors
    var fm = fn(sh.cowl - 0.22);
    [-1, 1].forEach(function (sx) {
      var mg = new T.SphereGeometry(0.09, 12, 10); mg.scale(1.15, 0.72, 0.95);
      var mr = new T.Mesh(mg, paint); mr.position.set(sx * (fm.w * sh.cabB + 0.07), fm.yb + 0.09, sh.cowl - 0.22); body.add(mr);
    });
    // number plate, exhausts, wing
    var fT = fn(zR + 0.1), plate = new T.Mesh(new T.BoxGeometry(0.5, 0.11, 0.02), M.plate); plate.position.set(0, (fT.y0 + fT.yb) / 2 - 0.02, zR - 0.012); body.add(plate);
    if (!spec.ev) [-1, 1].forEach(function (sx) {
      var ex = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 0.14, 14).rotateX(Math.PI / 2), M.chrome); ex.position.set(sx * hw * 0.52, fT.y0 + 0.05, zR + 0.03); body.add(ex);
    });
    if (sh.wing) {
      var wing = new T.Mesh(new T.BoxGeometry(W * 0.86, 0.03, 0.28), M.trim); wing.position.set(0, sh.deck + 0.2, zR + 0.32); wing.castShadow = true; body.add(wing);
      [-1, 1].forEach(function (sx) { var su = new T.Mesh(new T.BoxGeometry(0.03, 0.2, 0.16), M.trim); su.position.set(sx * hw * 0.55, sh.deck + 0.1, zR + 0.34); body.add(su); });
    }
    if (sh.tall) [-1, 1].forEach(function (sx) {
      var rail = new T.Mesh(new T.BoxGeometry(0.04, 0.04, (sh.roofF - sh.roofR) * 0.9), M.trim); rail.position.set(sx * hw * sh.cabT * 0.86, H + 0.03, (sh.roofF + sh.roofR) / 2); body.add(rail);
    });
    // wheels
    var wheels = [], pivots = [], front = [];
    [[axF, true], [axR, false]].forEach(function (ax) {
      var f = fn(ax[0]);
      [1, -1].forEach(function (sx) {
        var pv = new T.Group(); pv.position.set(sx * (f.w - sh.tw / 2 - 0.012), wr, ax[0]);
        var wh = makeWheel(wr, sh.tw, sx, spec); pv.add(wh);
        var cal = new T.Mesh(new T.BoxGeometry(0.06, 0.1, 0.17), M.caliper); cal.position.set(sx * (sh.tw / 2 - 0.13), 0.02, -(wr - 0.105) * 0.7); pv.add(cal);
        group.add(pv); wheels.push(wh); pivots.push(pv); if (ax[1]) front.push(pv);
      });
    });
    var fN = fn(zF - 0.1);
    return { group: group, body: body, wheels: wheels, frontPivots: front, tailMat: tailMat, headMat: headMat, paint: paint,
      lampZ: zF - 0.05, lampY: fN.yb - 0.06, lampX: fN.w * 0.7, tailZ: zR, axR: axR, halfW: hw, H: H, L: L,
      dispose: function () { geo.dispose(); paint.dispose(); headMat.dispose(); tailMat.dispose(); } };
  };
})();
