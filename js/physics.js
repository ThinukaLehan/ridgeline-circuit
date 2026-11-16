/* Vehicle dynamics: a two-axle ("bicycle") model with slip-angle tyres, a friction circle,
   load transfer, aero drag and downforce, a torque curve and a stepped gearbox. */
(function (root) {
  'use strict';
  var RC = root.RC = root.RC || {};
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  var G = 9.81;

  RC.torque = function (s, rpm) {
    if (s.ev) { var w = Math.max(rpm, 1) * 0.10472; return Math.min(s.tq, s.kw * 1000 / w); }
    var r0 = s.tqRpm[0], r1 = s.tqRpm[1], f;
    if (rpm < r0) f = 0.55 + 0.45 * clamp((rpm - s.idle) / (r0 - s.idle), 0, 1);
    else if (rpm <= r1) f = 1;
    else f = 1 - s.fall * clamp((rpm - r1) / (s.redline - r1), 0, 1.3);
    return s.tq * f;
  };

  RC.physNew = function (spec) {
    return { spec: spec, x: 0, z: 0, h: 0, vx: 0, vy: 0, r: 0, steer: 0, thr: 0, brk: 0, gear: 1, rpm: spec.idle, shiftT: 0,
      ax: 0, axf: 0, ay: 0, slide: 0, spin: 0, af: 0, ar: 0, aids: true, load: 0 };
  };

  // friction circle for one axle: returns the forces the tyres can actually deliver
  function axle(FxD, FxB, Fy, D, aids, out) {
    var room = D * D - Fy * Fy, Fx, spin = 0;
    var maxB = Math.sqrt(Math.max(room, 0.36 * D * D));            // ABS keeps most braking while steering
    var b = clamp(FxB, -maxB, maxB);
    var maxD = aids ? Math.sqrt(Math.max(room, 0.12 * D * D)) : 0.98 * D;   // traction control gives cornering priority
    var d = clamp(FxD, -maxD, maxD);
    if (Math.abs(FxD) > maxD + 1) spin = 1;
    Fx = clamp(b + d, -0.99 * D, 0.99 * D);
    var left = Math.sqrt(Math.max(D * D - Fx * Fx, 0));
    if (Math.abs(Fy) > left) Fy = Fy > 0 ? left : -left;
    out.fx = Fx; out.fy = Fy; out.spin = spin;
  }
  var A1 = {}, A2 = {};

  // inp: {thr 0..1, brk 0..1, steer -1..1 (left positive), hb bool}; env: {mu, B, rr}
  RC.physStep = function (c, inp, env, dt) {
    var s = c.spec, m = s.mass, L = s.wb, a = s.a, b = L - a;
    c.thr += (inp.thr - c.thr) * Math.min(1, dt * 9);
    c.brk += (inp.brk - c.brk) * Math.min(1, dt * 14);
    var vx = c.vx, vy = c.vy, r = c.r, spd = Math.abs(vx);

    // steering: lock and rate both fall with speed, as a driver's hands would
    var maxS = Math.min(0.56, L * 12 / (vx * vx + 1) + 0.06);
    var rate = 0.6 + 1.9 / (1 + spd / 18);
    var ds = inp.steer * maxS - c.steer, mx = rate * dt * (inp.steer === 0 ? 1.7 : 1);
    c.steer += clamp(ds, -mx, mx);

    // engine and gearbox
    var wheelRpm = spd / s.wr * 9.5493, Fd = 0, rpm, thr = c.thr, brk = c.brk, ratio;
    var reversing = inp.brk > 0 && inp.thr === 0 && vx < 0.5;
    if (reversing) {
      c.gear = 0; ratio = s.gears[0] * s.final; rpm = Math.max(s.idle, wheelRpm * ratio); thr = c.brk; brk = 0;
      Fd = vx > -11 ? -RC.torque(s, Math.max(rpm, 1500)) * ratio * 0.9 / s.wr * thr * 0.6 : 0;
    } else {
      if (c.gear === 0) c.gear = 1;
      ratio = s.gears[c.gear - 1] * s.final; rpm = wheelRpm * ratio;
      if (!s.ev) {
        if (c.shiftT > 0) c.shiftT -= dt;
        else if (rpm > s.redline * 0.94 && c.gear < s.gears.length) { c.gear++; c.shiftT = s.shift; }
        else if (c.gear > 1) {
          var lower = wheelRpm * s.gears[c.gear - 2] * s.final;
          if (lower < s.redline * ((inp.thr > 0.5 || inp.brk > 0.5) ? 0.8 : 0.6)) { c.gear--; c.shiftT = s.shift * 0.6; }
        }
        ratio = s.gears[c.gear - 1] * s.final; rpm = wheelRpm * ratio;
        if (c.gear === 1) rpm = Math.max(rpm, s.idle + thr * (s.launch - s.idle));
        rpm = Math.max(rpm, s.idle);
      }
      var tq = rpm > s.redline ? 0 : RC.torque(s, rpm);
      Fd = (c.shiftT > 0 && !s.ev) ? 0 : tq * ratio * 0.9 / s.wr * thr;
      if (thr < 0.05 && vx > 1) Fd -= s.ev ? m * 1.2 : (rpm / s.redline) * 0.25 * s.tq * ratio / s.wr;   // engine braking / regen
    }

    // vertical loads with longitudinal load transfer and downforce
    var down = 0.6 * s.clA * vx * vx;
    c.axf += (c.ax - c.axf) * Math.min(1, dt * 10);
    var dW = m * c.axf * s.hcg / L;
    var Fzf = Math.max(300, m * G * b / L - dW + down * 0.45);
    var Fzr = Math.max(300, m * G * a / L + dW + down * 0.55);

    var fF = s.drive === 'F' ? 1 : (s.drive === 'R' ? 0 : s.split);
    var sg = vx > 0.05 ? 1 : (vx < -0.05 ? -1 : 0);
    var Fb = brk * m * G * 1.25;
    var FxfB = -sg * Fb * 0.62, FxrB = -sg * Fb * 0.38;

    // tyre slip angles and lateral force (simplified Pacejka curve)
    var cs = Math.cos(c.steer), sn = Math.sin(c.steer), v0 = 3.2, C = 1.35, B = env.B;
    var vyf = vy + a * r, vyr = vy - b * r;
    var latF = vyf * cs - vx * sn, lonF = vx * cs + vyf * sn;
    var af = Math.atan(latF / Math.max(Math.abs(lonF), v0)), ar = Math.atan(vyr / Math.max(spd, v0));
    var Df = env.mu * Fzf, Dr = env.mu * Fzr * 1.04 * (inp.hb ? 0.45 : 1);
    var Fyf = -Df * Math.sin(C * Math.atan(B * af)), Fyr = -Dr * Math.sin(C * Math.atan(B * ar));
    if (inp.hb && spd > 0.2) FxrB = -sg * Dr * 0.9;

    // stability control: brakes the car straight and trims power when the tail steps out
    var Mesc = 0, cut = 1;
    if (c.aids && !inp.hb && spd > 8) {
      var over = Math.abs(ar) - (0.07 + 0.55 / B);
      if (over > 0) { var k = Math.min(1, over / 0.1); Mesc = (ar > 0 ? 1 : -1) * k * 0.33 * env.mu * m * G; cut = 1 - 0.9 * k; }
    }
    var FdU = Fd > 0 ? Fd * cut : Fd;
    axle(FdU * fF, FxfB, Fyf, Df, c.aids, A1);
    axle(FdU * (1 - fF), FxrB, Fyr, Dr, c.aids, A2);
    var Fxf = A1.fx, Fxr = A2.fx; Fyf = A1.fy; Fyr = A2.fy;
    c.spin = Math.max(A1.spin, A2.spin);

    var drag = 0.6 * s.cdA * vx * Math.abs(vx);
    var roll = sg * env.rr * m * G;
    var FX = Fxf * cs - Fyf * sn + Fxr - drag - roll;
    var FY = Fyf * cs + Fxf * sn + Fyr;
    var MZ = a * (Fyf * cs + Fxf * sn) - b * Fyr + Mesc;
    var ax = FX / m, ay = FY / m;
    var nvx = vx + (ax + vy * r) * dt;
    if (((vx > 0 && nvx < 0) || (vx < 0 && nvx > 0)) && Math.abs(Fd) < 1) nvx = 0;   // come to rest cleanly
    if (sg === 0 && Math.abs(Fd) < 1) nvx = 0;
    c.vy = vy + (ay - vx * r) * dt;
    c.r = r + MZ / s.iz * dt;
    c.vx = nvx;
    if (Math.abs(nvx) < 0.3 && Math.abs(Fd) < 1) { c.vy *= 1 - Math.min(1, dt * 6); c.r *= 1 - Math.min(1, dt * 6); }
    c.h += c.r * dt;
    var sh = Math.sin(c.h), ch = Math.cos(c.h);
    c.x += (sh * c.vx + ch * c.vy) * dt;
    c.z += (ch * c.vx - sh * c.vy) * dt;

    c.ax = ax; c.ay = ay; c.af = af; c.ar = ar;
    var slip = Math.max(Math.abs(af), Math.abs(ar));
    c.slide = spd > 3 ? clamp((slip - (0.05 + 0.6 / B)) / 0.14, 0, 1) : 0;
    if (c.spin && !s.ev) rpm = Math.max(rpm, s.redline * 0.88);
    c.rpm += (rpm - c.rpm) * Math.min(1, dt * 16);
    c.load = thr;
    c.rev = reversing;
  };
})(typeof window !== 'undefined' ? window : globalThis);
