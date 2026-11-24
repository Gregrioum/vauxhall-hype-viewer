# Vauxhall HYPE — Vision GT 3D Studio Viewer

Interactive real-time 3D web viewer for the **Vauxhall HYPE Vision GT** concept car, converted from Blender Cycles Dark & White Studio scenes.

## Features
- **Active Aero Shape-Key Animations:** Clickable **Open / Close Aero Flaps** toggle, continuous **Loop Mode**, and manual 0–100% scrubber across all 7 baked aero-flap morph targets.
- **Dual Studio Lighting (Dark & Light):** Instant switching between Cycles-baked 360° **Dark Studio** (4-ribbon lighting, pitch-black backdrop, AgX glare) and **White Studio** (high-key horizon reflections, soft ground contact shadows) with matching per-studio material calibration and `AgX` tone mapping.
- **Adaptive Cinema Lens:** Defaults to **80mm** during smooth studio **Auto-Rotate**, and smoothly transitions to **50mm** with framing compensation when switching to **Free View** (click toggle or drag the viewport).
- **Camera Presets:** Quick transitions to Blender's `Front 3/4`, `Side`, `Rear 3/4`, and `Top` views.

## Local Development
```bash
npm install
npm run dev
```

## Production Build
```bash
npm run build
```
