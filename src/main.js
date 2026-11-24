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

// Additive selective-bloom composite pass (blends ONLY the rear-lamp bloom pass onto the main scene!)
const SelectiveBloomCompositeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    uBloomStrength: { value: 0.0 },
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
    uniform sampler2D tBloom;
    uniform float uBloomStrength;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 bloom = texture2D(tBloom, vUv).rgb * uBloomStrength;
      gl_FragColor = vec4(base.rgb + bloom, base.a);
    }
  `,
};

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
        emissiveColor: [1.0, 0.005, 0.0],
        emissiveIntensity: 0.45, // Calm standby running light when flaps are closed
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
        emissiveColor: [1.0, 0.005, 0.0],
        emissiveIntensity: 0.55, // Calm standby running light when flaps are closed
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

// 1. Dedicated Selective-Bloom Composer (renders ONLY the rear red lamps occluded by pitch-black car body!)
const bloomRenderTarget = new THREE.WebGLRenderTarget(
  Math.max(1, Math.floor(window.innerWidth / 2)),
  Math.max(1, Math.floor(window.innerHeight / 2)),
  { type: THREE.HalfFloatType }
);
const rearBloomComposer = new EffectComposer(renderer, bloomRenderTarget);
rearBloomComposer.renderToScreen = false;
const rearBloomRenderPass = new RenderPass(scene, camera);
rearBloomRenderPass.clearAlpha = 1;
rearBloomComposer.addPass(rearBloomRenderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(
    Math.max(1, Math.floor(window.innerWidth / 2)),
    Math.max(1, Math.floor(window.innerHeight / 2))
  ),
  0.55, // Selective bloom strength on rear lamps ONLY
  0.48, // Tight crisp halo radius
  0.35 // Low threshold since ONLY rear red lamps are non-black in this pass!
);
rearBloomComposer.addPass(bloomPass);

// 2. Main Scene Composer (ZERO global bloom on car body — composites ONLY selective rear-lamp bloom!)
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

const selectiveBloomBlendPass = new ShaderPass(SelectiveBloomCompositeShader);
selectiveBloomBlendPass.uniforms.tBloom.value = rearBloomComposer.renderTarget2.texture;
composer.addPass(selectiveBloomBlendPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

const contrastPass = new ShaderPass(AgXContrastShader);
composer.addPass(contrastPass);

// Black depth-occluder material used during the selective rear-lamp bloom pass
const blackOccluderMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  side: THREE.DoubleSide,
});
const nonRearLampMeshes = []; // populated on GLB load for zero-allocation selective bloom swap

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

// 3 soft red bounce lights casting vivid crimson glow onto rear diffuser & open flaps
const rearBounceLights = [
  { pos: [0.0, 0.63, -2.96], mult: 1.0 },
  { pos: [-0.76, 0.61, -2.56], mult: 0.8 },
  { pos: [0.76, 0.61, -2.56], mult: 0.8 },
].map(({ pos, mult }) => {
  const pl = new THREE.PointLight(0xff0b06, 0, 4.6, 1.6);
  pl.position.set(...pos);
  pl.userData.mult = mult;
  rearBrakeGroup.add(pl);
  return pl;
});

// 5 feathered crimson optical bloom sprites tightly hugging the swept chevron tail-light bar
// (dynamically hidden when viewing from the front half so there is zero bleed-through!)
const rearHaloSprites = [
  { pos: [0.0, 0.64, -2.86], scale: [1.35, 0.56, 1], mult: 1.0 },
  { pos: [-0.46, 0.63, -2.68], scale: [1.05, 0.48, 1], mult: 0.9 },
  { pos: [0.46, 0.63, -2.68], scale: [1.05, 0.48, 1], mult: 0.9 },
  { pos: [-0.84, 0.62, -2.38], scale: [0.82, 0.42, 1], mult: 0.75 },
  { pos: [0.84, 0.62, -2.38], scale: [0.82, 0.42, 1], mult: 0.75 },
].map(({ pos, scale, mult }) => {
  const mat = new THREE.SpriteMaterial({
    map: rearGlowTexture,
    color: new THREE.Color(1.0, 0.04, 0.02),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const sp = new THREE.Sprite(mat);
  sp.position.set(...pos);
  sp.scale.set(...scale);
  sp.renderOrder = 6;
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
// Wheel-Arch Ambient Occlusion Shader for Tires (odi_TIRE_v1.004)
// Deeply darkens the upper tire tread & sidewall tucked beneath the body shell!
// ============================================================================
function attachTireWheelArchAO(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTireWorldPos;
        varying vec3 vTireWorldNormal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTireWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTireWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTireWorldPos;
        varying vec3 vTireWorldNormal;`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          // Tires span Y = 0.0 (contact patch) to Y = 0.74 (top tucked deep under fender)
          float heightMask = smoothstep(0.20, 0.56, vTireWorldPos.y);
          float upMask = smoothstep(-0.20, 0.50, normalize(vTireWorldNormal).y);
          float archShadow = clamp(heightMask * 0.80 + heightMask * upMask * 0.16, 0.0, 0.94);
          float tireAO = 1.0 - archShadow;
          reflectedLight.indirectDiffuse *= tireAO;
          reflectedLight.indirectSpecular *= tireAO;
          reflectedLight.directDiffuse *= mix(1.0, tireAO, 0.88);
          reflectedLight.directSpecular *= mix(1.0, tireAO, 0.92);
        }`
      );
  };
  material.customProgramCacheKey = () => 'tire-wheel-arch-ao-v1';
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
let lastRearGlow = 0;

function updateRearHaloVisibility() {
  const glow = lastRearGlow;
  const isDark = currentStudio === 'dark';
  // In Dark Studio we use true pixel-accurate selective bloom (rearBloomComposer), so hide sprites!
  // In Light Studio (transparent white shadow canvas) we use the soft crimson halo sprites!
  if (isDark || glow <= 0.005) {
    for (const sp of rearHaloSprites) sp.visible = false;
    return;
  }
  const rearViewFactor = THREE.MathUtils.clamp(
    THREE.MathUtils.mapLinear(camera.position.z, 2.2, -0.8, 0.0, 1.0),
    0.0,
    1.0
  );
  const haloPeak = 0.27;

  for (const sp of rearHaloSprites) {
    sp.visible = rearViewFactor > 0.01;
    sp.material.blending = THREE.NormalBlending;
    sp.material.color.setRGB(1.1, 0.04, 0.02);
    sp.material.opacity = haloPeak * glow * rearViewFactor * sp.userData.mult;
  }
}

function updateRearLampBloom(progress) {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  // Smooth ease-in-out surge as the aero flaps lift
  const glow = p * p * (3 - 2 * p);
  lastRearGlow = glow;
  const isDark = currentStudio === 'dark';

  // 1. Standby -> airbrake surge on rear red LEDs (odi_LIGHT_rear_v1.1)
  const rearLedMat = namedMaterials.get('odi_LIGHT_rear_v1.1');
  if (rearLedMat) {
    if (isDark) {
      rearLedMat.color.setRGB(THREE.MathUtils.lerp(0.18, 0.85, glow), 0.0, 0.0);
      rearLedMat.emissive.setRGB(
        1.0,
        THREE.MathUtils.lerp(0.005, 0.035, glow),
        THREE.MathUtils.lerp(0.0, 0.01, glow)
      );
      rearLedMat.emissiveIntensity = THREE.MathUtils.lerp(0.45, 16.0, glow);
    } else {
      rearLedMat.color.setRGB(THREE.MathUtils.lerp(0.22, 0.9, glow), 0.0, 0.0);
      rearLedMat.emissive.setRGB(
        1.0,
        THREE.MathUtils.lerp(0.005, 0.06, glow),
        THREE.MathUtils.lerp(0.0, 0.02, glow)
      );
      rearLedMat.emissiveIntensity = THREE.MathUtils.lerp(0.55, 28.0, glow);
    }
  }

  // 2. Illuminate the outer translucent red lens housing (LIGHT LENS PLASTIC - red)
  const rearLensMat = namedMaterials.get('LIGHT LENS PLASTIC - red');
  if (rearLensMat && rearLensMat.emissive) {
    rearLensMat.emissive.setRGB(1.0, 0.01, 0.002);
    rearLensMat.emissiveIntensity = THREE.MathUtils.lerp(0.0, isDark ? 4.0 : 4.5, glow);
  }

  // 3. Selective Rear-Lamp-Only HDR Bloom in Dark Studio (0% bloom on any other car part!)
  if (isDark) {
    selectiveBloomBlendPass.uniforms.uBloomStrength.value = glow;
    bloomPass.strength = THREE.MathUtils.lerp(0.0, 0.52, glow);
    bloomPass.radius = THREE.MathUtils.lerp(0.2, 0.52, glow);
  } else {
    selectiveBloomBlendPass.uniforms.uBloomStrength.value = 0.0;
  }

  // 4. Subtle crimson bounce lights on rear diffuser & open flaps
  const bouncePeak = isDark ? 6.0 : 4.5;
  for (const pl of rearBounceLights) {
    pl.intensity = bouncePeak * glow * pl.userData.mult;
  }

  // 5. Update feathered optical crimson bloom sprites (used in Light Studio)
  for (const sp of rearHaloSprites) {
    const scaleBoost = THREE.MathUtils.lerp(0.7, 1.0, glow);
    const [bx, by, bz] = sp.userData.baseScale;
    sp.scale.set(bx * scaleBoost, by * scaleBoost, bz);
  }
  updateRearHaloVisibility();
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
      let isRearLampMesh = false;

      mats.forEach((mat) => {
        if (!mat) return;
        namedMaterials.set(mat.name, mat);

        if (mat.name === 'odi_LIGHT_rear_v1.1' || mat.name === 'LIGHT LENS PLASTIC - red') {
          isRearLampMesh = true;
        }

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

        // Attach upper wheel-arch ambient occlusion to rubber tires
        if (mat.name === 'odi_TIRE_v1.004' && !mat.userData._archAOApplied) {
          mat.userData._archAOApplied = true;
          mat.roughness = 0.68;
          mat.envMapIntensity = 0.6;
          attachTireWheelArchAO(mat);
        }

        // Translucent red tail lens
        if (mat.name === 'LIGHT LENS PLASTIC - red') {
          mat.transparent = true;
          mat.opacity = 0.58;
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

      // Build per-mesh bloom-pass material override so ONLY rear red lamps emit in rearBloomComposer
      // (handles both single-material and multi-material meshes cleanly!)
      if (Array.isArray(child.material)) {
        const hasAnyNonRear = child.material.some(
          (m) => !m || (m.name !== 'odi_LIGHT_rear_v1.1' && m.name !== 'LIGHT LENS PLASTIC - red')
        );
        if (hasAnyNonRear) {
          const bloomOverride = child.material.map((m) =>
            m && (m.name === 'odi_LIGHT_rear_v1.1' || m.name === 'LIGHT LENS PLASTIC - red')
              ? m
              : blackOccluderMat
          );
          nonRearLampMeshes.push({
            mesh: child,
            originalMaterial: child.material,
            bloomMaterial: bloomOverride,
          });
        }
      } else if (!isRearLampMesh) {
        nonRearLampMeshes.push({
          mesh: child,
          originalMaterial: child.material,
          bloomMaterial: blackOccluderMat,
        });
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
  const bw = Math.max(1, Math.floor(w / 2));
  const bh = Math.max(1, Math.floor(h / 2));
  camera.aspect = w / h;
  camera.fov = focalLengthToVFov(currentFocalMm, camera.aspect);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  rearBloomComposer.setSize(bw, bh);
  bloomPass.setSize(bw, bh);
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

  updateRearHaloVisibility();
  controls.update();

  // Selective bloom pass: render ONLY the rear red lamps (with rest of car as black depth occluders)
  if (currentStudio === 'dark' && lastRearGlow > 0.002) {
    const savedEnv = scene.environment;
    const savedFloorVis = darkFloor.visible;
    scene.environment = null;
    darkFloor.visible = false;
    for (let i = 0; i < nonRearLampMeshes.length; i++) {
      nonRearLampMeshes[i].mesh.material = nonRearLampMeshes[i].bloomMaterial;
    }

    rearBloomComposer.render();

    for (let i = 0; i < nonRearLampMeshes.length; i++) {
      nonRearLampMeshes[i].mesh.material = nonRearLampMeshes[i].originalMaterial;
    }
    scene.environment = savedEnv;
    darkFloor.visible = savedFloorVis;
  }

  composer.render();
}

animate();
