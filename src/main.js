import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './style.css';

// ============================================================================
// Constants & Blender-Calibrated Studio Profiles
// ============================================================================
const FOCAL_AUTO_ORBIT = 80; // mm (default while rotating)
const FOCAL_FREE_BROWSE = 50; // mm (free browsing)
const SENSOR_WIDTH_MM = 36; // Full-frame 36mm matching Blender cameras

const STUDIO_PROFILES = {
  dark: {
    exposure: 0.84,
    envIntensity: 0.92,
    keyLightIntensity: 0.22,
    bloomEnabled: true,
    bloomThreshold: 2.6,
    bloomStrength: 0.085,
    bloomRadius: 0.22,
    materials: {
      'METALLIC CARPAINT - columbia blue': {
        base: [0.14, 0.15, 0.17],
        highlight: [0.88, 0.91, 0.96],
        metalness: 0.92,
        roughness: 0.25,
        clearcoat: 0.8,
        clearcoatRoughness: 0.045,
      },
      'SATIN METALLIC CARPAINT - lava': {
        base: [0.3419, 0.0123, 0.0024],
        highlight: [0.82, 0.86, 0.92],
        metalness: 0.93,
        roughness: 0.26,
        clearcoat: 0.8,
        clearcoatRoughness: 0.045,
      },
      'HYPE_METALLIC CARPAINT - grey': {
        color: [0.76, 0.79, 0.84],
        metalness: 1.0,
        roughness: 0.15,
      },
      'SATIN METALLIC CARPAINT - anthracite': {
        color: [0.01, 0.011, 0.014],
        metalness: 0.55,
        roughness: 0.28,
      },
      'GLASS - windshield': {
        metalness: 0.1,
        roughness: 0.022,
      },
      'odi_LIGHT_front_v1.1': {
        emissiveIntensity: 3.8,
      },
      'odi_LIGHT_rear_v1.1': {
        emissiveColor: [1.0, 0.006, 0.0],
        emissiveIntensity: 4.2,
      },
    },
  },
  white: {
    exposure: 0.94,
    envIntensity: 1.15,
    keyLightIntensity: 1.2,
    bloomEnabled: false,
    bloomThreshold: 2.0,
    bloomStrength: 0.0,
    bloomRadius: 0.4,
    materials: {
      'METALLIC CARPAINT - columbia blue': {
        base: [0.24, 0.29, 0.38],
        highlight: [0.88, 0.92, 0.98],
        metalness: 0.88,
        roughness: 0.24,
        clearcoat: 0.82,
        clearcoatRoughness: 0.045,
      },
      'SATIN METALLIC CARPAINT - lava': {
        base: [0.3405, 0.0123, 0.0024],
        highlight: [0.82, 0.87, 0.94],
        metalness: 0.9,
        roughness: 0.25,
        clearcoat: 0.8,
        clearcoatRoughness: 0.045,
      },
      'HYPE_METALLIC CARPAINT - grey': {
        color: [0.78, 0.82, 0.88],
        metalness: 1.0,
        roughness: 0.1,
      },
      'SATIN METALLIC CARPAINT - anthracite': {
        color: [0.005, 0.006, 0.009],
        metalness: 0.3,
        roughness: 0.24,
      },
      'GLASS - windshield': {
        metalness: 0.05,
        roughness: 0.015,
      },
      'odi_LIGHT_front_v1.1': {
        emissiveIntensity: 4.5,
      },
      'odi_LIGHT_rear_v1.1': {
        emissiveColor: [1.0, 0.004, 0.0],
        emissiveIntensity: 2.6,
      },
    },
  },
};

// Camera presets defined at 80mm baseline (scaled automatically when in 50mm free mode)
// Car faces +Z in Three.js (converted from Blender -Y)
const CAMERA_PRESETS = {
  front34: {
    azimuth: -0.74, // Front-left 3/4 matching Hero_Cam_Front34
    polar: 1.46, // Subtle low automotive eye level
    distance80: 14.4,
    target: new THREE.Vector3(0, 0.48, 0),
  },
  side: {
    azimuth: -Math.PI / 2,
    polar: 1.535, // Dramatic low side profile matching Hero_Cam_Side
    distance80: 14.8,
    target: new THREE.Vector3(0, 0.46, 0),
  },
  rear34: {
    azimuth: -2.4, // Rear-left 3/4 matching Hero_Cam_Rear34
    polar: 1.44,
    distance80: 14.4,
    target: new THREE.Vector3(0, 0.5, 0),
  },
  top: {
    azimuth: -0.75,
    polar: 0.72,
    distance80: 15.2,
    target: new THREE.Vector3(0, 0.38, 0),
  },
};

// ============================================================================
// DOM Elements
// ============================================================================
const container = document.getElementById('canvas-container');
const loaderEl = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');
const loaderStatus = document.getElementById('loader-status');

const btnStudioDark = document.getElementById('btn-studio-dark');
const btnStudioWhite = document.getElementById('btn-studio-white');
const btnAeroToggle = document.getElementById('btn-aero-toggle');
const labelAero = document.getElementById('label-aero');
const iconAero = document.getElementById('icon-aero');
const btnAeroLoop = document.getElementById('btn-aero-loop');
const aeroScrubber = document.getElementById('aero-scrubber');
const aeroPct = document.getElementById('aero-pct');
const btnOrbitToggle = document.getElementById('btn-orbit-toggle');
const labelOrbit = document.getElementById('label-orbit');
const lensLabel = document.getElementById('lens-label');
const modeLabel = document.getElementById('mode-label');
const modeDot = document.getElementById('mode-dot');
const interactionHint = document.getElementById('interaction-hint');
const presetButtons = Array.from(document.querySelectorAll('.preset-btn'));

// ============================================================================
// Renderer, Scene, Camera, Post-Processing
// ============================================================================
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = STUDIO_PROFILES.dark.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

function focalLengthToVFov(focalMm, aspect) {
  // Blender sensor_fit = AUTO with 36mm horizontal sensor on landscape;
  // gently widens on narrow/portrait viewports so car stays fully framed.
  const effectiveAspect = Math.max(aspect, 0.72);
  const sensorH = SENSOR_WIDTH_MM / effectiveAspect;
  return THREE.MathUtils.radToDeg(2 * Math.atan(sensorH / (2 * focalMm)));
}

let currentFocalMm = FOCAL_AUTO_ORBIT;
let targetFocalMm = FOCAL_AUTO_ORBIT;

const camera = new THREE.PerspectiveCamera(
  focalLengthToVFov(currentFocalMm, window.innerWidth / window.innerHeight),
  window.innerWidth / window.innerHeight,
  0.1,
  120
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 3.6;
controls.maxDistance = 28.0;
controls.minPolarAngle = 0.14;
controls.maxPolarAngle = Math.PI * 0.492; // Clamp cleanly above studio floor
controls.target.copy(CAMERA_PRESETS.front34.target);

// Place initial camera at Front 3/4 (80mm)
function setCameraFromSpherical(azimuth, polar, distance, target) {
  const sph = new THREE.Spherical(distance, polar, azimuth);
  const offset = new THREE.Vector3().setFromSpherical(sph);
  controls.target.copy(target);
  camera.position.copy(target).add(offset);
  controls.update();
}

setCameraFromSpherical(
  CAMERA_PRESETS.front34.azimuth,
  CAMERA_PRESETS.front34.polar,
  CAMERA_PRESETS.front34.distance80,
  CAMERA_PRESETS.front34.target
);

// Post-processing Composer (HalfFloat + MSAA for crisp AgX + Cycles-style bloom)
const renderTarget = new THREE.WebGLRenderTarget(
  window.innerWidth,
  window.innerHeight,
  {
    type: THREE.HalfFloatType,
    samples: 4,
  }
);
const composer = new EffectComposer(renderer, renderTarget);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  STUDIO_PROFILES.dark.bloomStrength,
  STUDIO_PROFILES.dark.bloomRadius,
  STUDIO_PROFILES.dark.bloomThreshold
);
composer.addPass(bloomPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

// ============================================================================
// Studio Lighting & Ground Floors
// ============================================================================
// Overhead + slightly front-left directional key for crisp soft floor shadows
const keyLight = new THREE.DirectionalLight(0xf6f9ff, STUDIO_PROFILES.dark.keyLightIntensity);
keyLight.position.set(-4.2, 8.5, 4.6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 26;
keyLight.shadow.camera.left = -4.2;
keyLight.shadow.camera.right = 4.2;
keyLight.shadow.camera.top = 4.2;
keyLight.shadow.camera.bottom = -4.2;
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.025;
keyLight.shadow.radius = 5.5;
scene.add(keyLight);

// Dark Studio seamless pitch-black floor (matches DarkStudio_BlackFloor_Mat pure black void)
const darkFloor = new THREE.Mesh(
  new THREE.CircleGeometry(30, 64),
  new THREE.MeshBasicMaterial({
    color: 0x000000,
    depthWrite: true,
  })
);
darkFloor.rotation.x = -Math.PI / 2;
darkFloor.position.y = -0.002;
scene.add(darkFloor);

// White Studio shadow-catcher floor (matches WhiteStudio_ShadowCatcher_Mat)
const whiteShadowFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(36, 36),
  new THREE.ShadowMaterial({
    color: 0x0b1220,
    opacity: 0.34,
  })
);
whiteShadowFloor.rotation.x = -Math.PI / 2;
whiteShadowFloor.position.y = -0.002;
whiteShadowFloor.receiveShadow = true;
whiteShadowFloor.visible = false;
scene.add(whiteShadowFloor);

// Soft procedural under-chassis ambient contact shadow for White Studio realism
function createContactShadowTexture() {
  const w = 512;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  // Broad soft studio penumbra
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(1.0, 2.05);
  const g1 = ctx.createRadialGradient(0, 0, 20, 0, 0, 215);
  g1.addColorStop(0.0, 'rgba(10, 15, 24, 0.42)');
  g1.addColorStop(0.45, 'rgba(10, 15, 24, 0.24)');
  g1.addColorStop(0.75, 'rgba(10, 15, 24, 0.07)');
  g1.addColorStop(1.0, 'rgba(10, 15, 24, 0.0)');
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.arc(0, 0, 215, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Tighter under-body core occlusion
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(0.82, 1.9);
  const g2 = ctx.createRadialGradient(0, 0, 10, 0, 0, 165);
  g2.addColorStop(0.0, 'rgba(5, 8, 14, 0.48)');
  g2.addColorStop(0.65, 'rgba(5, 8, 14, 0.20)');
  g2.addColorStop(1.0, 'rgba(5, 8, 14, 0.0)');
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(0, 0, 165, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const contactShadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(3.4, 6.7),
  new THREE.MeshBasicMaterial({
    map: createContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.88,
  })
);
contactShadowPlane.rotation.x = -Math.PI / 2;
contactShadowPlane.position.y = 0.001;
contactShadowPlane.visible = false;
scene.add(contactShadowPlane);

// ============================================================================
// State Variables
// ============================================================================
let currentStudio = 'dark';
let darkEnvMap = null;
let whiteEnvMap = null;
const namedMaterials = new Map();
const fresnelUniforms = new Map();

// Animation (7 Shape-Key Aero Flaps)
let mixer = null;
let aeroActions = [];
let maxClipDuration = 40 / 30;
let aeroProgress = 0; // 0.0 (closed) -> 1.0 (open)
let aeroTarget = 0;
let aeroAnimatingToTarget = false;
let aeroAnimStartVal = 0;
let aeroAnimElapsed = 0;
const AERO_TRANSITION_SEC = 1.35;

let isLooping = false;
let loopClock = 0;
// Loop cycle: Hold Closed (0.65s) -> Open (1.35s) -> Hold Open (1.35s) -> Close (1.35s)
const LOOP_HOLD_CLOSED = 0.65;
const LOOP_OPEN_DUR = 1.35;
const LOOP_HOLD_OPEN = 1.35;
const LOOP_CLOSE_DUR = 1.35;
const LOOP_TOTAL = LOOP_HOLD_CLOSED + LOOP_OPEN_DUR + LOOP_HOLD_OPEN + LOOP_CLOSE_DUR;

// Camera & Auto-Orbit State
let isAutoRotating = true;
const AUTO_ROTATE_SPEED = 0.16; // rad/s (~39s per 360° studio rotation)
let isUserWheelZooming = false;
let wheelTimeout = null;
let activeCameraTween = null;

// ============================================================================
// Blender Fresnel Car-Paint Shader Hook (Layer Weight -> ColorRamp -> Mix)
// ============================================================================
function attachBlenderFresnelPaint(material, initialBase, initialHighlight) {
  const uniforms = {
    uCarBaseColor: { value: new THREE.Color(...initialBase) },
    uCarHighlightTint: { value: new THREE.Color(...initialHighlight) },
  };
  fresnelUniforms.set(material.name, uniforms);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCarBaseColor = uniforms.uCarBaseColor;
    shader.uniforms.uCarHighlightTint = uniforms.uCarHighlightTint;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uCarBaseColor;
        uniform vec3 uCarHighlightTint;`
      )
      .replace(
        '#include <lights_fragment_begin>',
        `{
          float ndotv = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
          // Match Blender Layer Weight (Facing, blend=0.5) -> ColorRamp(0.25..0.88 -> 0..0.48)
          float lwFacing = 1.0 - sqrt(ndotv);
          float rampT = clamp((lwFacing - 0.25) / (0.88 - 0.25), 0.0, 1.0);
          float mixFac = 0.48 * rampT;
          diffuseColor.rgb = mix(uCarBaseColor, uCarHighlightTint, mixFac);
        }
        #include <lights_fragment_begin>`
      );
  };
  material.customProgramCacheKey = () => `blender-fresnel-${material.name}`;
  material.needsUpdate = true;
}

// ============================================================================
// Studio Switching (Dark Studio <-> White Studio)
// ============================================================================
function applyStudio(studioName) {
  currentStudio = studioName;
  const profile = STUDIO_PROFILES[studioName];
  document.body.dataset.studio = studioName;

  if (studioName === 'dark') {
    scene.background = new THREE.Color(0x000000);
    if (darkEnvMap) scene.environment = darkEnvMap;
    darkFloor.visible = true;
    whiteShadowFloor.visible = false;
    contactShadowPlane.visible = false;
  } else {
    // Linear 18.0 maps cleanly through AgX to pure spotless studio #FFFFFF
    scene.background = new THREE.Color(18.0, 18.0, 18.0);
    if (whiteEnvMap) scene.environment = whiteEnvMap;
    darkFloor.visible = false;
    whiteShadowFloor.visible = true;
    contactShadowPlane.visible = true;
  }

  scene.environmentIntensity = profile.envIntensity;
  renderer.toneMappingExposure = profile.exposure;
  keyLight.intensity = profile.keyLightIntensity;

  bloomPass.enabled = profile.bloomEnabled;
  bloomPass.threshold = profile.bloomThreshold;
  bloomPass.strength = profile.bloomStrength;
  bloomPass.radius = profile.bloomRadius;

  // Apply exact per-studio material calibration from the two Blender files
  for (const [matName, cfg] of Object.entries(profile.materials)) {
    const mat = namedMaterials.get(matName);
    if (!mat) continue;

    if (cfg.base && cfg.highlight && fresnelUniforms.has(matName)) {
      const u = fresnelUniforms.get(matName);
      u.uCarBaseColor.value.setRGB(...cfg.base);
      u.uCarHighlightTint.value.setRGB(...cfg.highlight);
      mat.color.setRGB(...cfg.base);
    } else if (cfg.color) {
      mat.color.setRGB(...cfg.color);
    }
    if (cfg.metalness !== undefined) mat.metalness = cfg.metalness;
    if (cfg.roughness !== undefined) mat.roughness = cfg.roughness;
    if (cfg.clearcoat !== undefined && 'clearcoat' in mat) mat.clearcoat = cfg.clearcoat;
    if (cfg.clearcoatRoughness !== undefined && 'clearcoatRoughness' in mat) {
      mat.clearcoatRoughness = cfg.clearcoatRoughness;
    }
    if (cfg.emissiveColor && mat.emissive) {
      mat.emissive.setRGB(...cfg.emissiveColor);
    }
    if (cfg.emissiveIntensity !== undefined) {
      mat.emissiveIntensity = cfg.emissiveIntensity;
    }
  }

  btnStudioDark.classList.toggle('active', studioName === 'dark');
  btnStudioWhite.classList.toggle('active', studioName === 'white');
}

// ============================================================================
// Shape-Key Aero Flap Animation Controls
// ============================================================================
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function setAeroProgress(val) {
  aeroProgress = THREE.MathUtils.clamp(val, 0, 1);

  if (mixer && aeroActions.length > 0) {
    const t = aeroProgress * maxClipDuration;
    for (const action of aeroActions) {
      const clipDur = action.getClip().duration;
      action.time = Math.min(t, clipDur);
    }
    mixer.update(0);
  }

  // Sync UI
  const pct = Math.round(aeroProgress * 100);
  aeroScrubber.value = (aeroProgress * 100).toFixed(1);
  aeroPct.textContent = `${pct}%`;

  const isOpenOrOpening =
    (aeroAnimatingToTarget && aeroTarget > 0.5) || (!aeroAnimatingToTarget && aeroProgress > 0.5);
  labelAero.textContent = isOpenOrOpening ? 'Close Aero Flaps' : 'Open Aero Flaps';
  btnAeroToggle.classList.toggle('active', isOpenOrOpening && !isLooping);

  // Swap play / reverse icon subtly
  iconAero.innerHTML = isOpenOrOpening
    ? '<polygon points="19 3 5 12 19 21 19 3" />'
    : '<polygon points="5 3 19 12 5 21 5 3" />';
}

function triggerAeroToggle() {
  if (isLooping) {
    setLoopMode(false);
  }
  const shouldOpen = aeroProgress < 0.5;
  aeroAnimStartVal = aeroProgress;
  aeroTarget = shouldOpen ? 1 : 0;
  aeroAnimElapsed = 0;
  aeroAnimatingToTarget = true;
  setAeroProgress(aeroProgress);
}

function setLoopMode(enabled) {
  isLooping = enabled;
  btnAeroLoop.classList.toggle('loop-active', isLooping);
  if (isLooping) {
    aeroAnimatingToTarget = false;
    // Start smoothly from current position in the loop
    if (aeroProgress < 0.05) {
      loopClock = LOOP_HOLD_CLOSED; // begin opening right away on click!
    } else if (aeroProgress > 0.95) {
      loopClock = LOOP_HOLD_CLOSED + LOOP_OPEN_DUR + LOOP_HOLD_OPEN; // begin closing
    } else {
      loopClock = LOOP_HOLD_CLOSED + aeroProgress * LOOP_OPEN_DUR;
    }
  }
  setAeroProgress(aeroProgress);
}

// ============================================================================
// Auto-Rotate (80mm) <-> Free Browse (50mm) Controller
// ============================================================================
function updateCameraModeUI() {
  btnOrbitToggle.classList.toggle('active', isAutoRotating);
  labelOrbit.textContent = isAutoRotating ? 'Auto-Rotate · 80mm' : 'Free View · 50mm';
  modeLabel.textContent = isAutoRotating ? 'Auto Orbit' : 'Free View';
  modeDot.classList.toggle('free', !isAutoRotating);
}

function setAutoRotate(enabled) {
  if (isAutoRotating === enabled) return;
  isAutoRotating = enabled;
  targetFocalMm = isAutoRotating ? FOCAL_AUTO_ORBIT : FOCAL_FREE_BROWSE;
  updateCameraModeUI();
}

function tweenToPreset(presetKey) {
  const preset = CAMERA_PRESETS[presetKey];
  if (!preset) return;

  presetButtons.forEach((b) => b.classList.toggle('active', b.dataset.preset === presetKey));

  const offsetNow = camera.position.clone().sub(controls.target);
  const startSph = new THREE.Spherical().setFromVector3(offsetNow);

  const scaleFactor = targetFocalMm / FOCAL_AUTO_ORBIT;
  const endDist = preset.distance80 * scaleFactor;

  // Shortest angular path for azimuth
  let deltaTheta = preset.azimuth - startSph.theta;
  while (deltaTheta > Math.PI) deltaTheta -= Math.PI * 2;
  while (deltaTheta < -Math.PI) deltaTheta += Math.PI * 2;

  activeCameraTween = {
    elapsed: 0,
    duration: 0.9,
    startTheta: startSph.theta,
    endTheta: startSph.theta + deltaTheta,
    startPhi: startSph.phi,
    endPhi: preset.polar,
    startRadius: startSph.radius,
    endRadius: endDist,
    startTarget: controls.target.clone(),
    endTarget: preset.target.clone(),
  };
}

// When the user manually grabs/drags/zooms the canvas -> switch smoothly to Free Browse (50mm)
controls.addEventListener('start', () => {
  activeCameraTween = null;
  interactionHint.classList.add('faded');
  presetButtons.forEach((b) => b.classList.remove('active'));
  if (isAutoRotating) {
    setAutoRotate(false);
  }
});

renderer.domElement.addEventListener(
  'wheel',
  () => {
    isUserWheelZooming = true;
    clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(() => {
      isUserWheelZooming = false;
    }, 280);
  },
  { passive: true }
);

// ============================================================================
// Wire UI Events
// ============================================================================
btnStudioDark.addEventListener('click', () => applyStudio('dark'));
btnStudioWhite.addEventListener('click', () => applyStudio('white'));
btnAeroToggle.addEventListener('click', triggerAeroToggle);
btnAeroLoop.addEventListener('click', () => setLoopMode(!isLooping));
btnOrbitToggle.addEventListener('click', () => {
  interactionHint.classList.add('faded');
  setAutoRotate(!isAutoRotating);
});

aeroScrubber.addEventListener('input', (e) => {
  if (isLooping) setLoopMode(false);
  aeroAnimatingToTarget = false;
  setAeroProgress(parseFloat(e.target.value) / 100);
});

presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    interactionHint.classList.add('faded');
    tweenToPreset(btn.dataset.preset);
  });
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    triggerAeroToggle();
  } else if (e.key === 'l' || e.key === 'L') {
    setLoopMode(!isLooping);
  } else if (e.key === 'r' || e.key === 'R') {
    setAutoRotate(!isAutoRotating);
  } else if (e.key === 't' || e.key === 'T') {
    applyStudio(currentStudio === 'dark' ? 'white' : 'dark');
  }
});

// ============================================================================
// Load Studio HDRIs & Draco-Compressed Vauxhall HYPE GLB
// ============================================================================
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

const rgbeLoader = new RGBELoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./draco/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

let hdrProgress = 0;
let glbProgress = 0;
function updateLoaderBar(msg) {
  const total = Math.round(hdrProgress * 25 + glbProgress * 75);
  loaderBar.style.width = `${total}%`;
  if (msg) loaderStatus.textContent = msg;
}

async function initAssets() {
  try {
    updateLoaderBar('Loading Cycles studio lighting…');

    const [darkTex, whiteTex] = await Promise.all([
      rgbeLoader.loadAsync('./env/dark_studio.hdr'),
      rgbeLoader.loadAsync('./env/white_studio.hdr'),
    ]);
    darkEnvMap = pmremGenerator.fromEquirectangular(darkTex).texture;
    whiteEnvMap = pmremGenerator.fromEquirectangular(whiteTex).texture;
    darkTex.dispose();
    whiteTex.dispose();
    pmremGenerator.dispose();

    hdrProgress = 1;
    updateLoaderBar('Loading Vauxhall HYPE geometry & aero flaps…');

    const gltf = await new Promise((resolve, reject) => {
      gltfLoader.load(
        './models/hype_vgt.glb',
        resolve,
        (xhr) => {
          if (xhr.total > 0) {
            glbProgress = Math.min(1, xhr.loaded / xhr.total);
            updateLoaderBar(
              `Loading Vauxhall HYPE… ${Math.round(glbProgress * 100)}%`
            );
          }
        },
        reject
      );
    });

    glbProgress = 1;
    updateLoaderBar('Calibrating materials & studio reflections…');

    const carRoot = gltf.scene;

    // Center X/Z at origin and rest tires flush on Y = 0
    const box = new THREE.Box3().setFromObject(carRoot);
    const center = box.getCenter(new THREE.Vector3());
    carRoot.position.set(-center.x, -box.min.y, -center.z);

    // Upgrade & catalog materials for Cycles-grade realism
    carRoot.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if (!mat) return;
        namedMaterials.set(mat.name, mat);

        // Attach Blender Layer-Weight Fresnel car paint shader to hero paints
        if (
          (mat.name === 'METALLIC CARPAINT - columbia blue' ||
            mat.name === 'SATIN METALLIC CARPAINT - lava') &&
          !fresnelUniforms.has(mat.name)
        ) {
          const prof = STUDIO_PROFILES.dark.materials[mat.name];
          attachBlenderFresnelPaint(mat, prof.base, prof.highlight);
        }

        // Crisp translucent red tail lens
        if (mat.name === 'LIGHT LENS PLASTIC - red') {
          mat.transparent = true;
          mat.opacity = 0.55;
          mat.depthWrite = false;
        }

        // Prevent z-fighting on decals
        if (
          ['CAUTION', 'RED_TRIANGLE', 'STEP AWAY', 'STEP AWAY.001', 'VISION GT', 'VX_POS_HORIZONTAL_RGB', 'Vauxhall-logo-1990-1024x768_02'].includes(
            mat.name
          )
        ) {
          mat.polygonOffset = true;
          mat.polygonOffsetFactor = -1;
          mat.polygonOffsetUnits = -1;
          mat.roughness = 0.35;
        }
      });
    });

    scene.add(carRoot);

    // Set up Shape-Key Aero Flap AnimationMixer (all 7 flaps synchronized)
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(carRoot);
      maxClipDuration = 0;
      aeroActions = gltf.animations.map((clip) => {
        maxClipDuration = Math.max(maxClipDuration, clip.duration);
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.paused = true;
        action.play();
        action.time = 0;
        return action;
      });
      mixer.update(0);
    }

    // Apply initial Dark Studio calibration
    applyStudio('dark');
    updateCameraModeUI();
    setAeroProgress(0);

    // Expose tiny debug hook for verification
    window.__hypeViewer = {
      applyStudio,
      setAeroProgress,
      triggerAeroToggle,
      setLoopMode,
      setAutoRotate,
      tweenToPreset,
      getState: () => ({
        studio: currentStudio,
        focalMm: Math.round(currentFocalMm * 10) / 10,
        targetFocalMm,
        isAutoRotating,
        aeroProgress: Math.round(aeroProgress * 1000) / 1000,
        isLooping,
        clipCount: aeroActions.length,
      }),
    };

    // Hide loader smoothly
    setTimeout(() => {
      loaderEl.classList.add('hidden');
    }, 220);
  } catch (err) {
    console.error('Failed to initialize HYPE 3D Studio:', err);
    loaderStatus.textContent = `Error loading 3D assets: ${err.message}`;
  }
}

initAssets();

// ============================================================================
// Resize Handler
// ============================================================================
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = focalLengthToVFov(currentFocalMm, camera.aspect);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ============================================================================
// Main Render & Animation Loop
// ============================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // 1. Update Aero Flap Shape-Key Animations
  if (isLooping) {
    loopClock = (loopClock + dt) % LOOP_TOTAL;
    let p = 0;
    if (loopClock < LOOP_HOLD_CLOSED) {
      p = 0;
    } else if (loopClock < LOOP_HOLD_CLOSED + LOOP_OPEN_DUR) {
      p = easeInOutCubic((loopClock - LOOP_HOLD_CLOSED) / LOOP_OPEN_DUR);
    } else if (loopClock < LOOP_HOLD_CLOSED + LOOP_OPEN_DUR + LOOP_HOLD_OPEN) {
      p = 1;
    } else {
      const closeT =
        (loopClock - (LOOP_HOLD_CLOSED + LOOP_OPEN_DUR + LOOP_HOLD_OPEN)) /
        LOOP_CLOSE_DUR;
      p = 1 - easeInOutCubic(closeT);
    }
    setAeroProgress(p);
  } else if (aeroAnimatingToTarget) {
    aeroAnimElapsed += dt;
    const rawT = Math.min(1, aeroAnimElapsed / AERO_TRANSITION_SEC);
    const eased = easeInOutCubic(rawT);
    const nextVal = THREE.MathUtils.lerp(aeroAnimStartVal, aeroTarget, eased);
    setAeroProgress(nextVal);
    if (rawT >= 1) {
      aeroAnimatingToTarget = false;
      setAeroProgress(aeroTarget);
    }
  }

  // 2. Smooth Preset Camera Tween
  if (activeCameraTween) {
    activeCameraTween.elapsed += dt;
    const t = Math.min(1, activeCameraTween.elapsed / activeCameraTween.duration);
    const e = easeInOutCubic(t);

    const theta = THREE.MathUtils.lerp(
      activeCameraTween.startTheta,
      activeCameraTween.endTheta,
      e
    );
    const phi = THREE.MathUtils.lerp(
      activeCameraTween.startPhi,
      activeCameraTween.endPhi,
      e
    );
    const radius = THREE.MathUtils.lerp(
      activeCameraTween.startRadius,
      activeCameraTween.endRadius,
      e
    );
    controls.target.lerpVectors(
      activeCameraTween.startTarget,
      activeCameraTween.endTarget,
      e
    );
    const offset = new THREE.Vector3().setFromSpherical(
      new THREE.Spherical(radius, phi, theta)
    );
    camera.position.copy(controls.target).add(offset);

    if (t >= 1) {
      activeCameraTween = null;
    }
  } else if (isAutoRotating) {
    // Smooth studio turntable orbit around the car
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -AUTO_ROTATE_SPEED * dt);
    camera.position.copy(controls.target).add(offset);
  }

  // 3. Smooth Focal Length Transition (80mm Auto-Rotate <-> 50mm Free Browse)
  // Includes proportional dolly compensation so car stays smoothly framed!
  if (Math.abs(currentFocalMm - targetFocalMm) > 0.02) {
    const prevFocal = currentFocalMm;
    const alpha = 1 - Math.exp(-6.5 * dt);
    currentFocalMm = THREE.MathUtils.lerp(currentFocalMm, targetFocalMm, alpha);
    if (Math.abs(currentFocalMm - targetFocalMm) <= 0.05) {
      currentFocalMm = targetFocalMm;
    }

    camera.fov = focalLengthToVFov(currentFocalMm, camera.aspect);
    camera.updateProjectionMatrix();

    if (!isUserWheelZooming && !activeCameraTween) {
      const ratio = currentFocalMm / prevFocal;
      const offset = camera.position.clone().sub(controls.target);
      const newLen = THREE.MathUtils.clamp(
        offset.length() * ratio,
        controls.minDistance,
        controls.maxDistance
      );
      offset.setLength(newLen);
      camera.position.copy(controls.target).add(offset);
    }

    lensLabel.textContent = `${Math.round(currentFocalMm)}mm`;
  }

  controls.update();
  composer.render();
}

animate();
