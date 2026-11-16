# Ridgeline Circuit

A 3D driving game that runs in the browser. Built with three.js, no build step.

**Play:** https://thinukalehan.github.io/ridgeline-circuit/

Pick one of six cars, a road surface and a time of day, then drive a 3.1 km road course through pine forest and hills.

## What's in it

- **Six cars** with their own bodies, weights, engines, gearboxes and drivetrains: a front-drive hot hatch, an inline-six sports coupe, a V8 muscle car, a mid-engined V10 supercar, an all-wheel-drive SUV and an electric sedan.
- **Four road conditions:** dry tarmac, wet tarmac with rain, gravel, and snow. Grip follows published tyre-road friction figures (about 0.9 dry, 0.6 wet, 0.6 gravel, 0.25 snow).
- **Three times of day:** day, sunset and night with headlights.
- **Driving model:** two-axle model with slip-angle tyres, a friction circle, load transfer, aero drag and downforce, torque curves and stepped gearboxes. Traction and stability control can be switched off.
- **Sound:** the engine is synthesised from one exhaust pulse per cylinder firing, timed by each engine's firing order, then passed through pipe resonances and a muffler filter. Tyre roar, wind, squeal and rain are layered on top.

## Controls

| Key | Action |
| --- | --- |
| W A S D or arrow keys | Drive and steer (hold brake at a standstill to reverse) |
| Space | Handbrake |
| C | Switch camera (chase, bonnet, bumper) |
| T | Driving aids on/off |
| R | Return to the track |
| M | Sound on/off |
| Esc | Back to the garage |

On a phone, on-screen buttons appear instead.

## Files

- `index.html` – page, garage and instruments
- `js/specs.js` – car, surface and time-of-day data
- `js/physics.js` – driving model
- `js/audio.js` – engine and road sound
- `js/models.js` – car body and wheel builder
- `js/game.js` – world, weather, cameras and the frame loop

## Run it locally

Serve the folder with any static server (for example `python3 -m http.server`) and open it in a browser. three.js loads from a CDN.
