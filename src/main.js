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
    // Reverted to v1 Dark Studio car paint & pure AgX shading (with reduced bloom)
    exposure: 0.84,
    envIntensity: 0.92,
    keyLightIntensity: 0.22,
    rimLightIntensity: 0.0,
    cabinLightIntensity: 0.12,
    bloomEnabled: true,
    bloomThreshold: 4.0,
    bloomStrength: 0.024,
    bloomRadius: 0.14,
    contrastEnabled: false,
    contrast: 1.0,
    shadowToe: 0.0,
    saturation: 1.0,
    fresnelMode: 0.0, // v1 exact Blender Layer Weight curve
    materials: {
      'METALLIC CARPAINT - columbia blue': {
        base: [0.14, 0.15, 0.17],
        highlight: [0.88, 0.91, 0.96],
        metalness: 0.92,
        roughness: 0.25,
        clearcoat: 0.8,
        clearcoatRoughness: 0.045,
        envMapIntensity: 1.0,
      },
      'SATIN METALLIC CARPAINT - lava': {
        base: [0.3419, 0.0123, 0.0024],
        highlight: [0.82, 0.86, 0.92],
        metalness: 0.93,
        roughness: 0.26,
        clearcoat: 0.8,
        clearcoatRoughness: 0.045,
        envMapIntensity: 1.0,
      },
      'HYPE_METALLIC CARPAINT - grey': {
        color: [0.76, 0.79, 0.84],
        metalness: 1.0,
        roughness: 0.15,
        envMapIntensity: 1.0,
      },
      'SATIN METALLIC CARPAINT - anthracite': {
        color: [0.01, 0.011, 0.014],
        metalness: 0.55,
        roughness: 0.28,
        envMapIntensity: 1.0,
      },
      'GLASS - windshield': {
        color: [0.0004, 0.0006, 0.001], // 97.5% linear opacity (true ~95-98% dark tint after sRGB gamma)
        metalness: 0.1,
        roughness: 0.022,
        opacity: 0.975,
        envMapIntensity: 1.0,
      },
      'odi_LIGHT_front_v1.1': {
        emissiveIntensity: 3.8,
      },
      'odi_LIGHT_rear_v1.1': {
        emissiveColor: [1.0, 0.008, 0.002],
        emissiveIntensity: 2.4,
      },
    },
  },
  white: {
    // Maintained Light Studio car paint material & contrast
    exposure: 0.94,
    envIntensity: 1.12,
    keyLightIntensity: 1.4,
    rimLightIntensity: 0.5,
    cabinLightIntensity: 0.18,
    bloomEnabled: false,
    bloomThreshold: 5.0,
    bloomStrength: 0.0,
    bloomRadius: 0.1,
    contrastEnabled: true,
    contrast: 1.08,
    shadowToe: 0.012,
    saturation: 1.03,
    fresnelMode: 1.0, // Light Studio sculpted metallic flop
    materials: {
      'METALLIC CARPAINT - columbia blue': {
        base: [0.18, 0.23, 0.32],
        highlight: [0.89, 0.93, 0.99],
        metalness: 0.9,
        roughness: 0.19,
        clearcoat: 0.9,
        clearcoatRoughness: 0.03,
        envMapIntensity: 1.15,
      },
      'SATIN METALLIC CARPAINT - lava': {
        base: [0.31, 0.011, 0.002],
        highlight: [0.86, 0.48, 0.38],
        metalness: 0.9,
        roughness: 0.22,
        clearcoat: 0.85,
        clearcoatRoughness: 0.035,
        envMapIntensity: 1.1,
      },
      'HYPE_METALLIC CARPAINT - grey': {
        color: [0.78, 0.83, 0.89],
        metalness: 1.0,
        roughness: 0.1,
        envMapIntensity: 1.15,
      },
      'SATIN METALLIC CARPAINT - anthracite': {
        color: [0.006, 0.007, 0.01],
        metalness: 0.4,
        roughness: 0.22,
        envMapIntensity: 1.0,
      },
      'GLASS - windshield': {
        color: [0.0004, 0.0006, 0.001], // 97.5% linear opacity (true ~95-98% dark tint after sRGB gamma)
        metalness: 0.06,
        roughness: 0.015,
        opacity: 0.975,
        envMapIntensity: 0.8,
      },
      'odi_LIGHT_front_v1.1': {
        emissiveIntensity: 4.5,
      },
      'odi_LIGHT_rear_v1.1': {
        emissiveColor: [1.0, 0.006, 0.002],
        emissiveIntensity: 1.8,
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

// Subtle cockpit interior fill light
const cabinLight = new THREE.PointLight(0xf5f7ff, STUDIO_PROFILES.dark.cabinLightIntensity, 3.4, 1.5);
cabinLight.position.set(0.0, 0.92, 0.1);
scene.add(cabinLight);

// ============================================================================
// Dynamic Rear Brake-Lamp Glow & Bloom Rig (activates as aero flaps open!)
// ============================================================================
function createRedGlowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  // Rich ruby-red exponential glow matching Cycles glare around rear LED bars
  g.addColorStop(0.0, 'rgba(255, 68, 42, 0.95)');
  g.addColorStop(0.18, 'rgba(255, 18, 12, 0.62)');
  g.addColorStop(0.45, 'rgba(220, 6, 4, 0.24)');
  g.addColorStop(0.75, 'rgba(180, 0, 0, 0.06)');
  g.addColorStop(1.0, 'rgba(140, 0, 0, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const rearGlowTexture = createRedGlowTexture();
const rearBrakeGroup = new THREE.Group();
scene.add(rearBrakeGroup);

// 3 soft red bounce lights casting real crimson glow onto rear diffuser & open flaps
const rearBounceLights = [
  { pos: [0.0, 0.64, -2.92], mult: 1.0 },
  { pos: [-0.72, 0.62, -2.54], mult: 0.75 },
  { pos: [0.72, 0.62, -2.54], mult: 0.75 },
].map(({ pos, mult }) => {
  const pl = new THREE.PointLight(0xff0a06, 0, 3.4, 1.8);
  pl.position.set(...pos);
  pl.userData.mult = mult;
  rearBrakeGroup.add(pl);
  return pl;
});

// 5 feathered optical bloom sprites hugging the swept chevron rear tail-light arc
// (depthTest=true so front views never bleed through the chassis!)
const rearHaloSprites = [
  { pos: [0.0, 0.65, -2.86], scale: [1.55, 0.78, 1], mult: 1.0 },
  { pos: [-0.46, 0.635, -2.66], scale: [1.25, 0.68, 1], mult: 0.85 },
  { pos: [0.46, 0.635, -2.66], scale: [1.25, 0.68, 1], mult: 0.85 },
  { pos: [-0.84, 0.625, -2.38], scale: [1.0, 0.58, 1], mult: 0.72 },
  { pos: [0.84, 0.625, -2.38], scale: [1.0, 0.58, 1], mult: 0.72 },
].map(({ pos, scale, mult }) => {
  const mat = new THREE.SpriteMaterial({
    map: rearGlowTexture,
    color: 0xff160e,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const sp = new THREE.Sprite(mat);
  sp.position.set(...pos);
  sp.scale.set(...scale);
  sp.renderOrder = 4;
  sp.userData.mult = mult;
  sp.userData.baseScale = scale;
  rearBrakeGroup.add(sp);
  return sp;
});

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

// True Cycles path-traced White Studio shadow-catcher plane (14m x 14m exact top-down ortho bake)
// Aligns 1:1 with centered carRoot so all 4 tires & diffuser penumbra match Cycles to the millimeter!
const whiteShadowTexture = new THREE.TextureLoader().load('./env/white_shadow.png');
whiteShadowTexture.colorSpace = THREE.SRGBColorSpace;
whiteShadowTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const contactShadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 14),
  new THREE.MeshBasicMaterial({
    map: whiteShadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.92,
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
// Dual-Studio Fresnel Metallic Car-Paint Shader Hook
//   uFresnelMode = 0.0 -> Exact v1 Dark Studio Blender Layer Weight curve
//   uFresnelMode = 1.0 -> Light Studio sculpted metallic flop curve
// ============================================================================
function attachBlenderFresnelPaint(material, initialBase, initialHighlight) {
  const uniforms = {
    uCarBaseColor: { value: new THREE.Color(...initialBase) },
    uCarHighlightTint: { value: new THREE.Color(...initialHighlight) },
    uFresnelMode: { value: 0.0 },
  };
  fresnelUniforms.set(material.name, uniforms);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCarBaseColor = uniforms.uCarBaseColor;
    shader.uniforms.uCarHighlightTint = uniforms.uCarHighlightTint;
    shader.uniforms.uFresnelMode = uniforms.uFresnelMode;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uCarBaseColor;
        uniform vec3 uCarHighlightTint;
        uniform float uFresnelMode;`
      )
      .replace(
        '#include <lights_fragment_begin>',
        `{
          float ndotv = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
          // Mode 0 (Dark Studio v1): exact Blender Layer Weight (blend=0.5) -> ColorRamp(0.25..0.88 -> 0..0.48)
          float lwV1 = 1.0 - sqrt(ndotv);
          float mixV1 = 0.48 * clamp((lwV1 - 0.25) / (0.88 - 0.25), 0.0, 1.0);
          // Mode 1 (Light Studio): sculpted high-contrast metallic flop
          float lwLight = 1.0 - pow(ndotv, 0.55);
          float mixLight = 0.58 * smoothstep(0.28, 0.90, lwLight);
          float mixFac = mix(mixV1, mixLight, uFresnelMode);
          diffuseColor.rgb = mix(uCarBaseColor, uCarHighlightTint, mixFac);
        }
        #include <lights_fragment_begin>`
      );
  };
  material.customProgramCacheKey = () => `blender-fresnel-dual-${material.name}`;
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
    contactShadowPlane.visible = false;
  } else {
    // Transparent canvas over CSS #FFFFFF so the Cycles shadow plane composites cleanly without AgX washout!
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    renderPass.clearAlpha = 0;
    if (whiteEnvMap) scene.environment = whiteEnvMap;
    darkFloor.visible = false;
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

  contrastPass.enabled = profile.contrastEnabled;
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
      u.uFresnelMode.value = profile.fresnelMode;
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

  // Re-sync rear lamp brightness & bloom to current aero flap state for the newly active studio
  updateRearLampBloom(aeroProgress);
}

// ============================================================================
// Dynamic Rear Brake-Lamp Brightness & Bloom (synced to aeroProgress 0 -> 1)
// ============================================================================
function updateRearLampBloom(progress) {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  // Smooth ease-in-out curve so lamps surge convincingly as the aero flaps lift
  const glow = p * p * (3 - 2 * p);
  const isDark = currentStudio === 'dark';

  // 1. Boost rear red LED lamp material brightness (odi_LIGHT_rear_v1.1)
  const rearLedMat = namedMaterials.get('odi_LIGHT_rear_v1.1');
  if (rearLedMat) {
    if (isDark) {
      rearLedMat.emissive.setRGB(
        1.0,
        THREE.MathUtils.lerp(0.008, 0.022, glow),
        THREE.MathUtils.lerp(0.002, 0.006, glow)
      );
      rearLedMat.emissiveIntensity = THREE.MathUtils.lerp(2.4, 34.0, glow);
    } else {
      rearLedMat.emissive.setRGB(
        1.0,
        THREE.MathUtils.lerp(0.006, 0.032, glow),
        THREE.MathUtils.lerp(0.002, 0.012, glow)
      );
      rearLedMat.emissiveIntensity = THREE.MathUtils.lerp(1.8, 16.0, glow);
    }
  }

  // 2. Illuminate the outer translucent red lens smoothly (LIGHT LENS PLASTIC - red)
  const rearLensMat = namedMaterials.get('LIGHT LENS PLASTIC - red');
  if (rearLensMat && rearLensMat.emissive) {
    rearLensMat.emissive.setRGB(1.0, 0.008, 0.002);
    rearLensMat.emissiveIntensity = THREE.MathUtils.lerp(0.0, isDark ? 3.0 : 2.2, glow);
  }

  // 3. Surgical HDR Bloom boost in Dark Studio (high threshold isolates the blazing 34.0 red lamps!)
  if (isDark) {
    bloomPass.threshold = THREE.MathUtils.lerp(4.0, 5.2, glow);
    bloomPass.strength = THREE.MathUtils.lerp(0.024, 0.145, glow);
    bloomPass.radius = THREE.MathUtils.lerp(0.14, 0.56, glow);
  }

  // 4. Real crimson bounce lights illuminating rear diffuser, bumper, and underside of open aero flaps
  const bouncePeak = isDark ? 4.8 : 3.2;
  for (const pl of rearBounceLights) {
    pl.intensity = bouncePeak * glow * pl.userData.mult;
  }

  // 5. Feathered optical crimson bloom sprites (works seamlessly in BOTH Dark and White Studios!)
  const haloPeak = isDark ? 0.36 : 0.48;
  for (const sp of rearHaloSprites) {
    sp.material.blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
    sp.material.opacity = haloPeak * glow * sp.userData.mult;
    const scaleBoost = THREE.MathUtils.lerp(0.75, 1.15, glow);
    const [bx, by, bz] = sp.userData.baseScale;
    sp.scale.set(bx * scaleBoost, by * scaleBoost, bz);
    sp.visible = glow > 0.005;
  }
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

  // Update rear red brake-lamp brightness & bloom in sync with aero flaps
  updateRearLampBloom(aeroProgress);

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

    // Compute EXACT world-space lowest vertex Y (not loose AABB corners of rotated tires!)
    // so the rubber tires sit flush on Y = 0.0 and meet the shadow plane cleanly!
    carRoot.updateWorldMatrix(true, true);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let trueMinY = Infinity;
    const tmpV = new THREE.Vector3();

    carRoot.traverse((child) => {
      if (!child.isMesh || !child.geometry?.attributes?.position) return;
      const pos = child.geometry.attributes.position;
      const mw = child.matrixWorld;
      for (let i = 0; i < pos.count; i++) {
        tmpV.fromBufferAttribute(pos, i).applyMatrix4(mw);
        if (tmpV.x < minX) minX = tmpV.x;
        if (tmpV.x > maxX) maxX = tmpV.x;
        if (tmpV.z < minZ) minZ = tmpV.z;
        if (tmpV.z > maxZ) maxZ = tmpV.z;
        if (tmpV.y < trueMinY) trueMinY = tmpV.y;
      }
    });

    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    // Sink tires by 5mm for a realistic flat rubber contact patch on the studio floor
    carRoot.position.set(-centerX, -trueMinY - 0.005, -centerZ);

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

        // Ultra-dark smoked automotive glass (97.5% linear opacity -> true 95-98% visual tint)
        if (mat.name === 'GLASS - windshield' || mat.name === 'odi_GLASS_reflection_v1.1') {
          isGlassMesh = true;
          mat.transparent = true;
          mat.opacity = 0.975;
          mat.color.setRGB(0.0004, 0.0006, 0.001);
          mat.roughness = 0.022;
          mat.metalness = 0.1;
          if ('clearcoat' in mat) {
            mat.clearcoat = 1.0;
            mat.clearcoatRoughness = 0.01;
          }
          if ('ior' in mat) mat.ior = 1.52;
          if ('reflectivity' in mat) mat.reflectivity = 1.0;
          mat.depthWrite = false;
          mat.side = THREE.DoubleSide; // Preserve Blender doubleSided so side windows aren't backface-culled!
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
