import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import './style.css';

// ============================================================================
// Constants & Blender-Calibrated Studio Profiles
// ============================================================================
const FOCAL_AUTO_ORBIT = 80; // mm (default while rotating)
const FOCAL_FREE_BROWSE = 50; // mm (free browsing)
const SENSOR_WIDTH_MM = 36; // Full-frame 36mm matching Blender cameras

// Blender "AgX - Very High Contrast" filmic S-curve look pass (preserves alpha for White Studio shadows!)
const AgXContrastShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 1.22 },
    uShadowToe: { value: 0.045 },
    uSaturation: { value: 1.08 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uShadowToe;
    uniform float uSaturation;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = texel.rgb;

      // Only grade opaque/semi-opaque shaded pixels (leave transparent shadow-catcher alpha pure)
      if (texel.a > 0.001) {
        // Subtle shadow toe deepening (eliminates milky/watercolor midtone wash)
        c = max(c - vec3(uShadowToe), vec3(0.0)) / (1.0 - uShadowToe);

        // Smooth S-curve contrast around mid-grey 0.48
        vec3 centered = c - vec3(0.48);
        c = clamp(centered * uContrast + vec3(0.48), 0.0, 1.0);

        // Gentle filmic shoulder curve (balanced — no burnt shadows/highlights)
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.07);

        // Slight saturation lift matching AgX Very High Contrast
        float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = clamp(mix(vec3(luma), c, uSaturation), 0.0, 1.0);
      }

      gl_FragColor = vec4(c, texel.a);
    }
  `,
};

const STUDIO_PROFILES = {
  dark: {
    exposure: 0.9,
    envIntensity: 1.02,
    keyLightIntensity: 0.42,
    rimLightIntensity: 0.35,
    cabinLightIntensity: 1.2,
    bloomEnabled: true,
    bloomThreshold: 4.2,
    bloomStrength: 0.022, // Whisper-subtle optical glint — no hazy fog!
    bloomRadius: 0.14,
    contrast: 1.11,
    shadowToe: 0.018,
    saturation: 1.03,
    materials: {
      'METALLIC CARPAINT - columbia blue': {
        base: [0.11, 0.12, 0.14], // Balanced sculptural metallic (no burnt shadows)
        highlight: [0.86, 0.9, 0.96],
        metalness: 0.93,
        roughness: 0.19,
        clearcoat: 0.9,
        clearcoatRoughness: 0.03,
      },
      'SATIN METALLIC CARPAINT - lava': {
        base: [0.3, 0.01, 0.002],
        highlight: [0.85, 0.45, 0.35],
        metalness: 0.91,
        roughness: 0.22,
        clearcoat: 0.85,
        clearcoatRoughness: 0.035,
      },
      'HYPE_METALLIC CARPAINT - grey': {
        color: [0.76, 0.8, 0.86],
        metalness: 1.0,
        roughness: 0.12,
      },
      'SATIN METALLIC CARPAINT - anthracite': {
        color: [0.009, 0.01, 0.013],
        metalness: 0.55,
        roughness: 0.24,
      },
      'GLASS - windshield': {
        color: [0.008, 0.01, 0.015], // Deep dark smoked tint
        metalness: 0.08,
        roughness: 0.018,
        opacity: 0.82, // 82% opacity — dark tinted while subtly revealing interior
        envMapIntensity: 1.45,
      },
      'odi_LIGHT_front_v1.1': {
        emissiveIntensity: 3.6,
      },
      'odi_LIGHT_rear_v1.1': {
        emissiveColor: [1.0, 0.005, 0.0],
        emissiveIntensity: 4.0,
      },
    },
  },
  white: {
    exposure: 0.94,
    envIntensity: 1.12,
    keyLightIntensity: 1.35,
    rimLightIntensity: 0.5,
    cabinLightIntensity: 1.8,
    bloomEnabled: false,
    bloomThreshold: 5.0,
    bloomStrength: 0.0,
    bloomRadius: 0.1,
    contrast: 1.09,
    shadowToe: 0.015,
    saturation: 1.03,
    materials: {
      'METALLIC CARPAINT - columbia blue': {
        base: [0.18, 0.23, 0.32], // Crisp cool silver-blue without burnt contrast
        highlight: [0.89, 0.93, 0.99],
        metalness: 0.9,
        roughness: 0.19,
        clearcoat: 0.9,
        clearcoatRoughness: 0.03,
      },
      'SATIN METALLIC CARPAINT - lava': {
        base: [0.31, 0.011, 0.002],
        highlight: [0.86, 0.48, 0.38],
        metalness: 0.9,
        roughness: 0.22,
        clearcoat: 0.85,
        clearcoatRoughness: 0.035,
      },
      'HYPE_METALLIC CARPAINT - grey': {
        color: [0.78, 0.83, 0.89],
        metalness: 1.0,
        roughness: 0.1,
      },
      'SATIN METALLIC CARPAINT - anthracite': {
        color: [0.006, 0.007, 0.01],
        metalness: 0.4,
        roughness: 0.22,
      },
      'GLASS - windshield': {
        color: [0.008, 0.01, 0.016], // Deep dark smoked tint
        metalness: 0.06,
        roughness: 0.016,
        opacity: 0.83, // 83% opacity — dark tinted while subtly revealing interior
        envMapIntensity: 1.35,
      },
      'odi_LIGHT_front_v1.1': {
        emissiveIntensity: 4.5,
      },
      'odi_LIGHT_rear_v1.1': {
        emissiveColor: [1.0, 0.004, 0.0],
        emissiveIntensity: 2.8,
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
  alpha: true, // Enables spotless pure-#FFFFFF White Studio shadow-catcher compositing!
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
controls.minDistance = 3.2;
controls.maxDistance = 28.0;
controls.minPolarAngle = 0.14;
controls.maxPolarAngle = Math.PI * 0.492;
controls.target.copy(CAMERA_PRESETS.front34.target);

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

// Post-processing Composer (HalfFloat + MSAA + whisper bloom + AgX Very High Contrast look)
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
renderPass.clearAlpha = 0;
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

const contrastPass = new ShaderPass(AgXContrastShader);
composer.addPass(contrastPass);

// ============================================================================
// Studio Lighting, Interior Fill & Ground Shadow Planes
// ============================================================================
// Overhead sculpt directional key light (matches White_Sculpt_Key + casts soft studio shadows)
const keyLight = new THREE.DirectionalLight(0xf6f9ff, STUDIO_PROFILES.dark.keyLightIntensity);
keyLight.position.set(-4.6, 8.2, 4.4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 26;
keyLight.shadow.camera.left = -4.5;
keyLight.shadow.camera.right = 4.5;
keyLight.shadow.camera.top = 4.5;
keyLight.shadow.camera.bottom = -4.5;
keyLight.shadow.bias = -0.00035;
keyLight.shadow.normalBias = 0.02;
keyLight.shadow.radius = 6.5;
scene.add(keyLight);

// Crisp rear-right rim accent light to carve sculptural edges on the metallic bodywork
const rimLight = new THREE.DirectionalLight(0xeef5ff, STUDIO_PROFILES.dark.rimLightIntensity);
rimLight.position.set(4.5, 4.2, -6.5);
scene.add(rimLight);

// Subtle cockpit interior fill light so the orange-gold/navy Alcantara seats & steering wheel read clearly through the glass
const cabinLight = new THREE.PointLight(0xf5f7ff, STUDIO_PROFILES.dark.cabinLightIntensity, 3.4, 1.5);
cabinLight.position.set(0.0, 0.92, 0.1);
scene.add(cabinLight);

// Dark Studio seamless pitch-black floor
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

// White Studio real-time shadow-catcher plane (composites directly over CSS #FFFFFF — zero AgX washout!)
const whiteShadowFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(36, 36),
  new THREE.ShadowMaterial({
    color: 0x0d1522,
    opacity: 0.28,
  })
);
whiteShadowFloor.rotation.x = -Math.PI / 2;
whiteShadowFloor.position.y = -0.001;
whiteShadowFloor.receiveShadow = true;
whiteShadowFloor.visible = false;
scene.add(whiteShadowFloor);

// Soft studio under-chassis & 4-wheel contact AO shadow plane (matches WhiteStudio_ShadowCatcher_Mat)
function createStudioShadowPlaneTexture() {
  const w = 1024;
  const h = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  // 1. Wide soft studio overhead penumbra (slightly offset toward rear-right like White_Sculpt_Key)
  ctx.save();
  ctx.translate(w * 0.53, h * 0.51);
  ctx.scale(1.05, 1.92);
  const gWide = ctx.createRadialGradient(0, 0, 40, 0, 0, 430);
  gWide.addColorStop(0.0, 'rgba(14, 20, 32, 0.34)');
  gWide.addColorStop(0.45, 'rgba(14, 20, 32, 0.20)');
  gWide.addColorStop(0.75, 'rgba(14, 20, 32, 0.06)');
  gWide.addColorStop(1.0, 'rgba(14, 20, 32, 0.0)');
  ctx.fillStyle = gWide;
  ctx.beginPath();
  ctx.arc(0, 0, 430, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Tighter under-body chassis occlusion core
  ctx.save();
  ctx.translate(w * 0.5, h * 0.5);
  ctx.scale(0.74, 1.72);
  const gCore = ctx.createRadialGradient(0, 0, 30, 0, 0, 340);
  gCore.addColorStop(0.0, 'rgba(8, 12, 20, 0.52)');
  gCore.addColorStop(0.55, 'rgba(8, 12, 20, 0.30)');
  gCore.addColorStop(0.85, 'rgba(8, 12, 20, 0.08)');
  gCore.addColorStop(1.0, 'rgba(8, 12, 20, 0.0)');
  ctx.fillStyle = gCore;
  ctx.beginPath();
  ctx.arc(0, 0, 340, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 3. Dedicated crisp tire contact shadows at all 4 wheel footprints
  const wheelCoords = [
    [w * 0.26, h * 0.25], // Front-left
    [w * 0.74, h * 0.25], // Front-right
    [w * 0.27, h * 0.75], // Rear-left
    [w * 0.73, h * 0.75], // Rear-right
  ];
  for (const [wx, wy] of wheelCoords) {
    ctx.save();
    ctx.translate(wx, wy);
    ctx.scale(0.65, 1.45);
    const gTire = ctx.createRadialGradient(0, 0, 12, 0, 0, 115);
    gTire.addColorStop(0.0, 'rgba(4, 6, 12, 0.62)');
    gTire.addColorStop(0.5, 'rgba(4, 6, 12, 0.26)');
    gTire.addColorStop(1.0, 'rgba(4, 6, 12, 0.0)');
    ctx.fillStyle = gTire;
    ctx.beginPath();
    ctx.arc(0, 0, 115, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const contactShadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(3.8, 7.2),
  new THREE.MeshBasicMaterial({
    map: createStudioShadowPlaneTexture(),
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
let aeroProgress = 0;
let aeroTarget = 0;
let aeroAnimatingToTarget = false;
let aeroAnimStartVal = 0;
let aeroAnimElapsed = 0;
const AERO_TRANSITION_SEC = 1.35;

let isLooping = false;
let loopClock = 0;
const LOOP_HOLD_CLOSED = 0.65;
const LOOP_OPEN_DUR = 1.35;
const LOOP_HOLD_OPEN = 1.35;
const LOOP_CLOSE_DUR = 1.35;
const LOOP_TOTAL = LOOP_HOLD_CLOSED + LOOP_OPEN_DUR + LOOP_HOLD_OPEN + LOOP_CLOSE_DUR;

// Camera & Auto-Orbit State
let isAutoRotating = true;
const AUTO_ROTATE_SPEED = 0.16;
let isUserWheelZooming = false;
let wheelTimeout = null;
let activeCameraTween = null;

// ============================================================================
// High-Contrast Automotive Fresnel Metallic Car-Paint Shader Hook
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
          // Sculptural metallic flop: deep rich base on facing planes, crisp metallic highlight along grazing curves
          float lwFacing = 1.0 - pow(ndotv, 0.55);
          float rampT = smoothstep(0.28, 0.90, lwFacing);
          float mixFac = 0.58 * rampT;
          diffuseColor.rgb = mix(uCarBaseColor, uCarHighlightTint, mixFac);
        }
        #include <lights_fragment_begin>`
      );
  };
  material.customProgramCacheKey = () => `blender-fresnel-hc-${material.name}`;
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
    renderer.setClearColor(0x000000, 1);
    renderPass.clearAlpha = 1;
    if (darkEnvMap) scene.environment = darkEnvMap;
    darkFloor.visible = true;
    whiteShadowFloor.visible = false;
    contactShadowPlane.visible = false;
  } else {
    // Transparent canvas over CSS #FFFFFF so the shadow plane composites cleanly without AgX washout!
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    renderPass.clearAlpha = 0;
    if (whiteEnvMap) scene.environment = whiteEnvMap;
    darkFloor.visible = false;
    whiteShadowFloor.visible = true;
    contactShadowPlane.visible = true;
  }

  scene.environmentIntensity = profile.envIntensity;
  renderer.toneMappingExposure = profile.exposure;
  keyLight.intensity = profile.keyLightIntensity;
  rimLight.intensity = profile.rimLightIntensity;
  cabinLight.intensity = profile.cabinLightIntensity;

  bloomPass.enabled = profile.bloomEnabled;
  bloomPass.threshold = profile.bloomThreshold;
  bloomPass.strength = profile.bloomStrength;
  bloomPass.radius = profile.bloomRadius;

  contrastPass.uniforms.uContrast.value = profile.contrast;
  contrastPass.uniforms.uShadowToe.value = profile.shadowToe;
  contrastPass.uniforms.uSaturation.value = profile.saturation;

  // Apply exact per-studio material calibration
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
    if (cfg.opacity !== undefined) mat.opacity = cfg.opacity;
    if (cfg.envMapIntensity !== undefined) mat.envMapIntensity = cfg.envMapIntensity;
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

  const pct = Math.round(aeroProgress * 100);
  aeroScrubber.value = (aeroProgress * 100).toFixed(1);
  aeroPct.textContent = `${pct}%`;

  const isOpenOrOpening =
    (aeroAnimatingToTarget && aeroTarget > 0.5) || (!aeroAnimatingToTarget && aeroProgress > 0.5);
  labelAero.textContent = isOpenOrOpening ? 'Close Aero Flaps' : 'Open Aero Flaps';
  btnAeroToggle.classList.toggle('active', isOpenOrOpening && !isLooping);

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
    if (aeroProgress < 0.05) {
      loopClock = LOOP_HOLD_CLOSED;
    } else if (aeroProgress > 0.95) {
      loopClock = LOOP_HOLD_CLOSED + LOOP_OPEN_DUR + LOOP_HOLD_OPEN;
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
// Load 2K Studio HDRIs & Vauxhall HYPE GLB (with Cockpit Interior)
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
    updateLoaderBar('Loading Vauxhall HYPE geometry & interior…');

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
    updateLoaderBar('Calibrating materials, glass & shadows…');

    const carRoot = gltf.scene;

    // Center X/Z at origin and rest tires flush on Y = 0
    const box = new THREE.Box3().setFromObject(carRoot);
    const center = box.getCenter(new THREE.Vector3());
    carRoot.position.set(-center.x, -box.min.y, -center.z);

    // Upgrade & catalog materials
    carRoot.traverse((child) => {
      if (!child.isMesh) return;

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      let isGlassMesh = false;

      mats.forEach((mat) => {
        if (!mat) return;
        namedMaterials.set(mat.name, mat);

        // Attach high-contrast automotive Fresnel car paint shader
        if (
          (mat.name === 'METALLIC CARPAINT - columbia blue' ||
            mat.name === 'SATIN METALLIC CARPAINT - lava') &&
          !fresnelUniforms.has(mat.name)
        ) {
          const prof = STUDIO_PROFILES.dark.materials[mat.name];
          attachBlenderFresnelPaint(mat, prof.base, prof.highlight);
        }

        // Dark-tinted smoked automotive glass (82–83% opacity) so cockpit subtly reads through
        if (mat.name === 'GLASS - windshield' || mat.name === 'odi_GLASS_reflection_v1.1') {
          isGlassMesh = true;
          mat.transparent = true;
          mat.opacity = 0.82;
          mat.color.setRGB(0.008, 0.01, 0.015);
          mat.roughness = 0.018;
          mat.metalness = 0.08;
          if ('clearcoat' in mat) {
            mat.clearcoat = 1.0;
            mat.clearcoatRoughness = 0.012;
          }
          if ('ior' in mat) mat.ior = 1.52;
          if ('reflectivity' in mat) mat.reflectivity = 1.0;
          mat.depthWrite = false;
          mat.side = THREE.FrontSide;
          mat.needsUpdate = true;
        }

        // Translucent red tail lens
        if (mat.name === 'LIGHT LENS PLASTIC - red') {
          mat.transparent = true;
          mat.opacity = 0.52;
          mat.depthWrite = false;
        }

        // Prevent z-fighting on decals
        if (
          [
            'CAUTION',
            'RED_TRIANGLE',
            'STEP AWAY',
            'STEP AWAY.001',
            'VISION GT',
            'VX_POS_HORIZONTAL_RGB',
            'Vauxhall-logo-1990-1024x768_02',
          ].includes(mat.name)
        ) {
          mat.polygonOffset = true;
          mat.polygonOffsetFactor = -1;
          mat.polygonOffsetUnits = -1;
          mat.roughness = 0.35;
        }
      });

      // Let light pass into the cockpit through glass (glass does not cast opaque shadow onto seats!)
      child.castShadow = !isGlassMesh;
      child.receiveShadow = !isGlassMesh;
      if (isGlassMesh) {
        child.renderOrder = 2; // Render glass cleanly over interior cockpit
      }
    });

    scene.add(carRoot);

    // Shape-Key Aero Flap AnimationMixer (all 7 flaps synchronized)
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

    applyStudio('dark');
    updateCameraModeUI();
    setAeroProgress(0);

    window.__hypeViewer = {
      applyStudio,
      setAeroProgress,
      triggerAeroToggle,
      setLoopMode,
      setAutoRotate,
      tweenToPreset,
    };

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
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -AUTO_ROTATE_SPEED * dt);
    camera.position.copy(controls.target).add(offset);
  }

  // 3. Smooth Focal Length Transition (80mm Auto-Rotate <-> 50mm Free Browse)
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
