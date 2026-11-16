/* Car, surface and time-of-day data. No rendering code here, so it can be tested on its own. */
(function (root) {
  'use strict';
  var RC = root.RC = root.RC || {};
  function even(n) { var a = []; for (var i = 0; i < n; i++) a.push(i / n); return a; }

  // Peak tyre-road friction and rolling resistance per surface, from published tables
  // (dry asphalt ~0.9, wet asphalt ~0.6, dry rolled gravel 0.6-0.7, snow ~0.2;
  //  rolling resistance 0.013 asphalt, 0.02-0.05 gravel and unpaved, 0.1+ field).
  RC.SURFACES = [
    { id: 'dry', name: 'Dry tarmac', mu: 0.92, B: 11, rr: 0.013, offMu: 0.5, offRr: 0.09, note: 'Full grip.' },
    { id: 'wet', name: 'Wet tarmac', mu: 0.6, B: 10, rr: 0.016, offMu: 0.33, offRr: 0.11, rain: true, note: 'Rain. About two thirds of dry grip.' },
    { id: 'gravel', name: 'Gravel', mu: 0.62, B: 5.5, rr: 0.03, offMu: 0.5, offRr: 0.09, loose: true, note: 'Loose stones. The car slides early and long.' },
    { id: 'snow', name: 'Snow', mu: 0.24, B: 6.5, rr: 0.035, offMu: 0.2, offRr: 0.08, loose: true, snow: true, note: 'Packed snow. About a quarter of dry grip.' }
  ];
  RC.TIMES = [{ id: 'day', name: 'Day' }, { id: 'dusk', name: 'Sunset' }, { id: 'night', name: 'Night' }];

  RC.CARS = [
    {
      id: 'civetta', name: 'Civetta 2.0 Turbo', cls: 'Hot hatch', engine: '2.0 L turbo inline-four', layout: 'Front-wheel drive',
      drive: 'F', mass: 1420, kw: 207, tq: 380, tqRpm: [2200, 5200], fall: 0.35, redline: 7000, idle: 850, launch: 3000, shift: 0.18,
      gears: [3.63, 2.12, 1.53, 1.13, 0.91, 0.73], final: 3.84, wr: 0.32, wb: 2.65, front: 0.62, hcg: 0.53,
      cdA: 0.70, clA: 0.05, grip: 1.0, loose: 1.0, spokes: 5,
      colors: [0xc81d25, 0xf2f2f0, 0x1c5fd1, 0x1d1f23, 0xf2b01e],
      shape: { L: 4.30, W: 1.80, H: 1.45, fo: 0.88, clear: 0.15, nose: 0.70, hood: 0.92, belt: 0.95, deck: 0.98, tail: 0.92,
        cowl: 0.85, roofF: 0.12, roofR: -1.50, rearB: -2.02, rearP: 1.7, cabB: 0.90, cabT: 0.72, noseT: 0.16, tailT: 0.08, tw: 0.225 },
      snd: { offs: even(4), bank: [1, 0.9, 1, 0.92], fp: 150, dk: 270, pipe: 0.0105, fb: 0.42, lp0: 480, lp1: 2300, lp2: 0.26, jit: 0.12, nz: 0.5, pop: 0.06, drive: 1.5 }
    },
    {
      id: 'kestrel', name: 'Kestrel GT', cls: 'Sports coupe', engine: '3.0 L twin-turbo inline-six', layout: 'Rear-wheel drive',
      drive: 'R', mass: 1560, kw: 334, tq: 550, tqRpm: [2400, 5800], fall: 0.3, redline: 7200, idle: 750, launch: 3200, shift: 0.14,
      gears: [4.11, 2.32, 1.54, 1.18, 1.0, 0.85, 0.69], final: 3.15, wr: 0.335, wb: 2.70, front: 0.52, hcg: 0.48,
      cdA: 0.66, clA: 0.25, grip: 1.08, loose: 0.92, spokes: 10,
      colors: [0x1f4f8f, 0xa3121b, 0xd9dadc, 0x15171a, 0x2f6b4a],
      shape: { L: 4.55, W: 1.88, H: 1.30, fo: 0.85, clear: 0.12, nose: 0.62, hood: 0.84, belt: 0.90, deck: 0.93, tail: 0.86,
        cowl: 0.50, roofF: -0.18, roofR: -0.75, rearB: -1.78, rearP: 1.25, cabB: 0.88, cabT: 0.66, noseT: 0.2, tailT: 0.12, tw: 0.26 },
      snd: { offs: even(6), bank: [1, 0.96, 1, 0.95, 1, 0.97], fp: 180, dk: 310, pipe: 0.009, fb: 0.5, lp0: 600, lp1: 2700, lp2: 0.3, jit: 0.07, nz: 0.45, pop: 0.1, drive: 1.5 }
    },
    {
      id: 'marauder', name: 'Marauder 6.2', cls: 'Muscle car', engine: '6.2 L V8', layout: 'Rear-wheel drive',
      drive: 'R', mass: 1750, kw: 339, tq: 617, tqRpm: [3800, 4800], fall: 0.2, redline: 6500, idle: 700, launch: 2600, shift: 0.2,
      gears: [2.66, 1.78, 1.30, 1.0, 0.74, 0.5], final: 3.73, wr: 0.345, wb: 2.82, front: 0.54, hcg: 0.52,
      cdA: 0.80, clA: 0.1, grip: 1.02, loose: 0.9, spokes: 5,
      colors: [0xe07a12, 0x15171a, 0x7a1418, 0xe9e7df, 0x2b3d6b],
      shape: { L: 4.80, W: 1.92, H: 1.36, fo: 0.90, clear: 0.14, nose: 0.76, hood: 0.95, belt: 0.97, deck: 0.97, tail: 0.90,
        cowl: 0.42, roofF: -0.22, roofR: -0.95, rearB: -1.72, rearP: 1.2, cabB: 0.88, cabT: 0.68, noseT: 0.1, tailT: 0.07, tw: 0.27 },
      snd: { offs: even(8), bank: [1, 0.5, 0.5, 1, 0.5, 1, 1, 0.5], fp: 95, dk: 190, pipe: 0.014, fb: 0.55, lp0: 420, lp1: 1900, lp2: 0.2, jit: 0.15, nz: 0.7, pop: 0.12, drive: 1.8 }
    },
    {
      id: 'vanta', name: 'Vanta V10', cls: 'Supercar', engine: '5.2 L V10, mid-mounted', layout: 'Rear-wheel drive',
      drive: 'R', mass: 1520, kw: 449, tq: 560, tqRpm: [5800, 7200], fall: 0.12, redline: 8700, idle: 950, launch: 4200, shift: 0.09,
      gears: [3.13, 2.19, 1.63, 1.29, 1.03, 0.84, 0.69], final: 4.0, wr: 0.345, wb: 2.65, front: 0.42, hcg: 0.44,
      cdA: 0.72, clA: 0.95, grip: 1.16, loose: 0.85, spokes: 10,
      colors: [0xf2c200, 0xd4d6d9, 0xb80f1a, 0x101114, 0x1c8c5c],
      shape: { L: 4.55, W: 1.98, H: 1.16, fo: 1.05, clear: 0.10, nose: 0.50, hood: 0.70, belt: 0.80, deck: 0.92, tail: 0.88,
        cowl: 0.98, roofF: 0.22, roofR: -0.25, rearB: -1.45, rearP: 1.15, cabB: 0.86, cabT: 0.62, noseT: 0.26, tailT: 0.08, tw: 0.3, wing: true },
      snd: { offs: even(10), bank: [1, 0.86, 1, 0.86, 1, 0.86, 1, 0.86, 1, 0.86], fp: 250, dk: 430, pipe: 0.0065, fb: 0.5, lp0: 900, lp1: 3800, lp2: 0.45, jit: 0.05, nz: 0.4, pop: 0.14, drive: 1.6 }
    },
    {
      id: 'atlas', name: 'Atlas X6', cls: 'SUV', engine: '3.0 L turbo V6', layout: 'All-wheel drive',
      drive: 'A', split: 0.42, mass: 2150, kw: 251, tq: 480, tqRpm: [1800, 5000], fall: 0.35, redline: 6500, idle: 700, launch: 2400, shift: 0.2,
      gears: [4.71, 3.14, 2.11, 1.67, 1.29, 1.0, 0.84, 0.67], final: 3.31, wr: 0.385, wb: 2.90, front: 0.53, hcg: 0.68,
      cdA: 0.98, clA: 0, grip: 0.93, loose: 1.18, spokes: 7,
      colors: [0x3a4a3f, 0xe9e7df, 0x15171a, 0x6b6f76, 0x7a4a2a],
      shape: { L: 4.85, W: 1.96, H: 1.72, fo: 0.92, clear: 0.22, nose: 0.94, hood: 1.12, belt: 1.15, deck: 1.18, tail: 1.10,
        cowl: 0.95, roofF: 0.28, roofR: -1.92, rearB: -2.34, rearP: 2.0, cabB: 0.92, cabT: 0.78, noseT: 0.1, tailT: 0.05, tw: 0.27, tall: true },
      snd: { offs: even(6), bank: [1, 0.7, 1, 0.7, 1, 0.7], fp: 120, dk: 240, pipe: 0.012, fb: 0.45, lp0: 430, lp1: 1800, lp2: 0.22, jit: 0.1, nz: 0.5, pop: 0.02, drive: 1.4 }
    },
    {
      id: 'lumen', name: 'Lumen E', cls: 'Electric sedan', engine: 'Dual electric motors', layout: 'All-wheel drive',
      drive: 'A', split: 0.45, ev: true, mass: 1950, kw: 340, tq: 660, tqRpm: [0, 4900], fall: 0, redline: 16000, idle: 0, launch: 0, shift: 0,
      gears: [9.0], final: 1, wr: 0.35, wb: 2.92, front: 0.49, hcg: 0.46,
      cdA: 0.56, clA: 0.1, grip: 1.04, loose: 1.0, spokes: 7,
      colors: [0xdfe3e6, 0x14323a, 0x15171a, 0x8a1c2b, 0x3c5a9a],
      shape: { L: 4.85, W: 1.90, H: 1.43, fo: 0.88, clear: 0.13, nose: 0.66, hood: 0.88, belt: 0.93, deck: 0.98, tail: 0.94,
        cowl: 0.90, roofF: 0.05, roofR: -0.80, rearB: -1.98, rearP: 1.3, cabB: 0.88, cabT: 0.68, noseT: 0.2, tailT: 0.1, tw: 0.25, bar: true },
      snd: { ev: true }
    }
  ];
  RC.CARS.forEach(function (c) { c.a = c.wb * (1 - c.front); c.iz = c.mass * c.a * (c.wb - c.a) * 1.08; c.hp = Math.round(c.kw * 1.341); });
})(typeof window !== 'undefined' ? window : globalThis);
