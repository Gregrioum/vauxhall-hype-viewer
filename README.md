# Vauxhall HYPE — Vision GT 3D Studio Viewer

**Live Viewer:** https://gregrioum.github.io/vauxhall-hype-viewer/

> [!IMPORTANT]
> **Copyright & Usage Notice — All Rights Reserved**
>
> **Copyright © 2026 Gregrioum. All rights reserved.**
>
> All copyrights and intellectual property rights to the **vehicle design, 3D model (`hype_vgt.glb`), animations, and visual assets** in this repository are exclusively owned and retained by the author.
>
> - **All commercial use is strictly prohibited.**
> - Copying, downloading, redistributing, modifying, selling, or reusing the vehicle design or 3D model in whole or in part without prior written permission from the copyright holder is strictly prohibited.
> - This repository and its hosted demo are published solely for interactive portfolio viewing. See [LICENSE](./LICENSE) for full terms.

---

## Features
- **Active Aero Shape-Key Animations:** Clickable **Open / Close Aero Flaps** toggle, continuous **Loop Mode**, and manual 0–100% scrubber across all 15 baked morph targets (7 aero flaps + 8 flap lift supports).
- **Dual Studio Lighting (Dark & Light):** Instant switching between Cycles-baked 2K 360° **Dark Studio** and **Light Studio** lighting rigs with per-studio car paint calibration, `AgX` tone mapping, and soft studio ground shadows.
- **Adaptive Cinema Lens:** Defaults to **80mm** during smooth studio **Auto-Rotate**, and smoothly transitions to **50mm** with framing compensation when switching to **Free View** (click toggle or drag the viewport).
- **Camera Presets:** Quick transitions to `Front 3/4`, `Side`, `Rear 3/4`, and `Top` views.

## Local Development
```bash
npm install
npm run dev
```

## Production Build
```bash
npm run build
```
