import "./style.css";

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color4, Color3 } from "@babylonjs/core/Maths/math.color";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Node } from "@babylonjs/core/node";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";

import "@babylonjs/core/Culling/ray";
import "@babylonjs/loaders/glTF";

/* ============================================================
   DOM
============================================================ */

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing DOM element: ${selector}`);
  }

  return element;
}

const canvas = must<HTMLCanvasElement>("#renderCanvas");
const loading = must<HTMLDivElement>("#loading");
const loadingText = must<HTMLDivElement>("#loadingText");
const dialogueBox = must<HTMLDivElement>("#dialogueBox");
const speaker = must<HTMLDivElement>("#speaker");
const dialogueText = must<HTMLDivElement>("#dialogueText");
const missionCard = must<HTMLDivElement>("#missionCard");
const transitionCard = must<HTMLDivElement>("#transitionCard");
const transitionSmallEl = must<HTMLDivElement>("#transitionCard .transitionSmall");
const transitionBigEl = must<HTMLDivElement>("#transitionCard .transitionBig");
const transitionSubEl = must<HTMLDivElement>("#transitionCard .transitionSub");
const editorPanel = must<HTMLElement>("#editorPanel");
const selectedLabel = must<HTMLDivElement>("#selectedLabel");
const configOutput = must<HTMLTextAreaElement>("#configOutput");
const animationReadout = must<HTMLDivElement>("#animationReadout");
const debugReadout = must<HTMLDivElement>("#debugReadout");
const toastEl = must<HTMLDivElement>("#toast");
const birthdayFinale = must<HTMLDivElement>("#birthdayFinale");
const replayFinaleButton = must<HTMLButtonElement>("#replayFinale");
const missionLocationEl = must<HTMLDivElement>("#missionLocation");
const startScreen = must<HTMLDivElement>("#startScreen");
const startMissionButton = must<HTMLButtonElement>("#startMission");
const continueHint = must<HTMLDivElement>("#continueHint");
const pauseMenu = must<HTMLDivElement>("#pauseMenu");
const pauseButton = must<HTMLButtonElement>("#pauseButton");
const resumeGameButton = must<HTMLButtonElement>("#resumeGame");
const restartGameButton = must<HTMLButtonElement>("#restartGame");
const missionProgress = must<HTMLDivElement>("#missionProgress");
const miniGameOverlay = must<HTMLDivElement>("#miniGameOverlay");
const miniGameKicker = must<HTMLDivElement>("#miniGameKicker");
const miniGameTitle = must<HTMLDivElement>("#miniGameTitle");
const miniGameSubtitle = must<HTMLDivElement>("#miniGameSubtitle");
const miniGameBody = must<HTMLDivElement>("#miniGameBody");
const miniGameFeedback = must<HTMLDivElement>("#miniGameFeedback");

let toastTimer = 0;

function toast(message: string) {
  toastEl.textContent = message;
  toastEl.classList.add("show");

  window.clearTimeout(toastTimer);

  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove("show");
  }, 1500);
}

/* ============================================================
   ENGINE / SCENE
============================================================ */

const engine = new Engine(
  canvas,
  true,
  {
    antialias: true,
    preserveDrawingBuffer: false,
    stencil: true,
  },
  false,
);

/* ============================================================
   MOBILE RETINA RENDER RESOLUTION
   - Normal desktop behavior is left unchanged.
   - Mobile/coarse-pointer devices render up to 2x CSS resolution.
   - Re-applies after orientation/fullscreen/viewport changes.
============================================================ */

const MOBILE_RETINA_RENDERING =
  window.matchMedia("(pointer: coarse)").matches ||
  window.matchMedia("(max-width: 900px)").matches;

const MAX_MOBILE_RENDER_DPR = 2;
let appliedMobileRenderDpr = 0;
let renderResolutionTimer: number | null = null;
let renderResolutionRaf = 0;

function targetMobileRenderDpr() {
  const rawDpr = Number(window.devicePixelRatio) || 1;

  return Math.min(
    MAX_MOBILE_RENDER_DPR,
    Math.max(1, rawDpr),
  );
}

function applyMobileRenderResolution(reason = "manual") {
  if (MOBILE_RETINA_RENDERING) {
    const dpr = targetMobileRenderDpr();

    if (Math.abs(dpr - appliedMobileRenderDpr) > 0.001) {
      /*
        Babylon hardwareScalingLevel is inverse resolution scale:
          1.0 = 1x
          0.5 = 2x
      */
      engine.setHardwareScalingLevel(1 / dpr);
      appliedMobileRenderDpr = dpr;
    }
  }

  engine.resize();

  if (MOBILE_RETINA_RENDERING) {
    console.info(
      `[Render] ${reason}: DPR ${appliedMobileRenderDpr.toFixed(2)}x, ` +
      `${engine.getRenderWidth()}x${engine.getRenderHeight()}`
    );
  }
}

function scheduleMobileRenderResolution(
  reason: string,
  settleDelay = 120,
) {
  if (renderResolutionRaf) {
    window.cancelAnimationFrame(renderResolutionRaf);
  }

  if (renderResolutionTimer !== null) {
    window.clearTimeout(renderResolutionTimer);
  }

  renderResolutionRaf = window.requestAnimationFrame(() => {
    renderResolutionRaf = 0;
    applyMobileRenderResolution(`${reason}:raf`);

    /*
      Mobile browsers can report an intermediate viewport size
      while browser chrome, fullscreen, or orientation is settling.
    */
    renderResolutionTimer = window.setTimeout(() => {
      renderResolutionTimer = null;
      applyMobileRenderResolution(`${reason}:settled`);
    }, settleDelay);
  });
}

if (MOBILE_RETINA_RENDERING) {
  applyMobileRenderResolution("boot");

  window.addEventListener(
    "resize",
    () => scheduleMobileRenderResolution("resize", 140),
    { passive: true },
  );

  window.addEventListener(
    "orientationchange",
    () => scheduleMobileRenderResolution("orientation", 320),
    { passive: true },
  );

  document.addEventListener(
    "fullscreenchange",
    () => scheduleMobileRenderResolution("fullscreen", 220),
  );

  document.addEventListener(
    "webkitfullscreenchange",
    (() => scheduleMobileRenderResolution("webkit-fullscreen", 220)) as EventListener,
  );

  window.visualViewport?.addEventListener(
    "resize",
    () => scheduleMobileRenderResolution("visual-viewport", 160),
    { passive: true },
  );
}


engine.setHardwareScalingLevel(
  window.devicePixelRatio > 1 ? 1.25 : 1,
);

console.log("=======================================");
console.log("OPERATION: PERFECT DATE — FULL GAME");
console.log("=======================================");
console.log("[Renderer]", engine.getGlInfo());

const scene = new Scene(engine);

scene.clearColor = new Color4(
  0.025,
  0.032,
  0.045,
  1,
);

const camera = new ArcRotateCamera(
  "NIC_CINEMATIC_CAMERA",
  1.5708,
  1.4689,
  4.423,
  new Vector3(
    -1.6432,
    1.05,
    4.6491,
  ),
  scene,
);

camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 0.8;
camera.upperRadiusLimit = 60;
camera.wheelPrecision = 35;
camera.panningSensibility = 100;
camera.fov = 0.72;

const hemi = new HemisphericLight(
  "NIC_HEMI",
  new Vector3(0, 1, 0),
  scene,
);

hemi.intensity = 1.12;

const sun = new DirectionalLight(
  "NIC_SUN",
  new Vector3(-0.45, -1, 0.3),
  scene,
);

sun.position = new Vector3(4, 9, -5);
sun.intensity = 0.9;

/* ============================================================
   TYPES
============================================================ */

type ActorName = "Nick" | "Judy";

type TransformSnapshot = {
  position: [number, number, number];
  rotation: [number, number, number];
  scaling: [number, number, number];
};

type CameraSnapshot = {
  alpha: number;
  beta: number;
  radius: number;
  target: [number, number, number];
  fov: number;
};

type SceneConfig = {
  version: 5;
  environment: "NIC" | "JAGRO" | "VITO" | "CCC";
  actors: Record<ActorName, TransformSnapshot>;
  activeClips: Record<ActorName, string>;
  camera: CameraSnapshot;
  hiddenMeshes: string[];
};

type ClipCalibration = {
  scale: number;
  floorOffset: number;
  anchorX: number;
  anchorZ: number;
};

type LoadedClip = {
  name: string;
  root: TransformNode;
  meshes: AbstractMesh[];
  animationGroup: AnimationGroup;
};

type ActorController = {
  name: ActorName;
  placementRoot: TransformNode;
  clips: Map<string, LoadedClip>;
  activeClip: string;
  desiredHeight: number;
  calibration?: ClipCalibration;
};

/* ============================================================
   LOCKED STAGING PRESETS
============================================================ */

/*
  Normal NIC staging — the previous approved idle scene.
*/
const IDLE_STAGING: Record<ActorName, TransformSnapshot> = {
  Nick: {
    position: [-2.17, 0, 4.836],
    rotation: [0, 0.3491, 0],
    scaling: [2.5, 2.5, 2.5],
  },

  Judy: {
    position: [-1.177, 0, 4.847],
    rotation: [0, -0.4363, 0],
    scaling: [1, 1, 1],
  },
};

/*
  FUTURE-SCENE KISS STAGING — exact config supplied by the user.

  IMPORTANT:
  This preset is intentionally NOT used anywhere in the NIC scene.
  It is stored here only so the approved coordinates are preserved
  for the future scene that actually requires the kiss.
*/
const KISS_STAGING: Record<ActorName, TransformSnapshot> = {
  Nick: {
    position: [-1.8175, -0.2097, 5.409],
    rotation: [0, 1.5708, 0],
    scaling: [2.5, 2.5, 2.5],
  },

  Judy: {
    position: [-1.3714, 0.0068, 5.3003],
    rotation: [0.0524, -1.5708, 0],
    scaling: [1, 1, 1],
  },
};

const IDLE_CAMERA: CameraSnapshot = {
  alpha: 1.5708,
  beta: 1.4689,
  radius: 4.423,
  target: [-1.6432, 1.05, 4.6491],
  fov: 0.72,
};


/*
  JAGRO INTERIOR — LOCKED FIRST-PASS STAGING

  Exact actor coordinates supplied after manually placing Nick/Judy
  inside the Jagro location.

  The camera is intentionally on the OPPOSITE end from the previous
  debug view:
    - current bad/debug camera was at negative Z looking +Z
    - this camera is at positive-Z side of the actors looking -Z

  Result: character-focused shot with the Jagro INTERIOR behind them.
  The storefront/entrance is not part of the composition.
*/
const JAGRO_INTERIOR_STAGING: Record<ActorName, TransformSnapshot> = {
  Nick: {
    position: [-0.2692, -0.0359, -20.0479],
    rotation: [0, -0.2269, 0],
    scaling: [3, 3, 3],
  },

  Judy: {
    position: [0.4562, 0, -19.8554],
    rotation: [0, -0.4363, 0],
    scaling: [1.1, 1.1, 1],
  },
};

/*
  Actor midpoint:
    X ~= 0.0935
    Z ~= -19.9517

  alpha +PI/2 places the ArcRotate camera on the +Z side, so we look
  back into the restaurant and see the characters from the front.
*/
const JAGRO_INTERIOR_CAMERA: CameraSnapshot = {
  alpha: 1.5708,
  beta: 1.455,
  radius: 6.35,
  target: [0.0935, 1.12, -19.9517],
  fov: 0.72,
};


/*
  SCENE 03 · VITO WOOD FIRED PIZZA — LOCKED STAGING V2
  Exact actor/camera values approved from the visual editor.
*/
const VITO_LOCKED_STAGING: Record<ActorName, TransformSnapshot> = {
  Nick: {
    position: [0.55, 0, 6.2699],
    rotation: [0, -0.4189, 0],
    scaling: [2.5, 2.5, 2.5],
  },

  Judy: {
    position: [-0.3416, 0, 6.3141],
    rotation: [0, 0.4189, 0],
    scaling: [1, 1, 1],
  },
};

const VITO_LOCKED_CAMERA: CameraSnapshot = {
  alpha: 1.562,
  beta: 1.5086,
  radius: 9.1572,
  target: [0, 1.05, 2.2],
  fov: 0.72,
};


/*
  SCENE 04 · SCOPE CINEMAS / CCC — LOCKED STAGING V2
  Exact actor/camera values approved from the visual editor.
  This intentionally replaces the exported CAMERA_ESTABLISH marker.
*/
const CCC_LOCKED_STAGING: Record<ActorName, TransformSnapshot> = {
  Nick: {
    position: [0.4997, 0, 5.6],
    rotation: [0, -0.4189, 0],
    scaling: [2.5, 2.5, 2.5],
  },

  Judy: {
    position: [-0.1811, 0, 5.6],
    rotation: [0, 0.4189, 0],
    scaling: [1, 1, 1],
  },
};

const CCC_LOCKED_CAMERA: CameraSnapshot = {
  alpha: 1.4231,
  beta: 1.5006,
  radius: 6.8801,
  target: [-0.594, 1.185, 3.62],
  fov: 0.72,
};

// FUTURE-SCENE ONLY. Not used in the NIC cinematic.
const KISS_CAMERA: CameraSnapshot = {
  alpha: 1.5588,
  beta: 1.4511,
  radius: 4.4219,
  target: [-1.6432, 1.05, 4.6491],
  fov: 0.72,
};

// Preserve approved future-scene kiss values without using them in NIC.
void KISS_STAGING;
void KISS_CAMERA;

const CLIP_FILES: Record<ActorName, Record<string, string>> = {
  Nick: {
    Idle: "Nick_Idle.glb",
    Talking: "Nick_Talking.glb",
    Pointing: "Nick_Pointing.glb",
    Walking: "Nick_Walking.glb",
    "Run Look Back": "Nick_Run_Look_Back.glb",
    Kiss: "Nick_Kiss.glb",
  },

  Judy: {
    Idle: "Judy_Idle.glb",
    Talking: "Judy_Talking.glb",
    Questioning: "Judy_Questioning.glb",
    Walking: "Judy_Walking.glb",
    Run: "Judy_Run.glb",
    Kiss: "Judy_Kiss.glb",
  },
};

/* ============================================================
   STATE
============================================================ */

const actors = new Map<ActorName, ActorController>();

let nicMeshes: AbstractMesh[] = [];
let jagroMeshes: AbstractMesh[] = [];
let vitoMeshes: AbstractMesh[] = [];
let cccMeshes: AbstractMesh[] = [];
let activeEnvironment: "NIC" | "JAGRO" | "VITO" | "CCC" = "CCC";

let selectedNode:
  | TransformNode
  | AbstractMesh
  | null = null;

let cinematicRunId = 0;
let cinematicRunning = false;
let fullGameSequenceId = 0;

let gameStarted = false;
let gamePaused = false;
let waitingForAdvance = false;
let advanceResolver: (() => void) | null = null;
let advanceRejecter: ((error: Error) => void) | null = null;

const DEBUG_EDITOR =
  new URLSearchParams(window.location.search).get("editor") === "1";


/* ============================================================
   PLAYER PRESENTATION LOCK
   - Normal player build: camera input is disabled completely.
   - Mobile: Start Operation requests fullscreen + landscape.
   - Browsers may reject fullscreen/orientation unless triggered by
     a user gesture; Start Operation provides that gesture.
============================================================ */

const MOBILE_PLAYER =
  window.matchMedia("(pointer: coarse)").matches ||
  window.matchMedia("(max-width: 900px)").matches;

if (!DEBUG_EDITOR) {
  // The cinematic camera is authored by the game. The player must not
  // orbit, pan, pinch, zoom, or inspect the 3D set manually.
  camera.detachControl();
}

function updateOrientationGuard() {
  const portrait = window.innerHeight > window.innerWidth;

  document.body.classList.toggle(
    "portraitBlocked",
    !DEBUG_EDITOR && MOBILE_PLAYER && portrait,
  );
}

async function requestMobilePresentationMode() {
  if (DEBUG_EDITOR || !MOBILE_PLAYER) return;

  // Fullscreen is deliberately requested from the Start/Resume button
  // handlers because mobile browsers require a real user gesture.
  try {
    if (!document.fullscreenElement) {
      const root = (
        document.getElementById("immersiveHost") ??
        document.documentElement
      ) as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };

      if (root.requestFullscreen) {
        await root.requestFullscreen();
      } else if (root.webkitRequestFullscreen) {
        await root.webkitRequestFullscreen();
      }
    }
  } catch (error) {
    console.info("[Mobile] Fullscreen request was not allowed by this browser", error);
  }

  // Chromium/Android can normally lock orientation once fullscreen.
  // Unsupported browsers (notably some iPhone/Safari modes) will simply
  // keep the rotate-device overlay until the user rotates manually.
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };

    if (orientation?.lock) {
      await orientation.lock("landscape");
    }
  } catch (error) {
    console.info("[Mobile] Landscape lock was not allowed by this browser", error);
  }

  window.setTimeout(() => {
    updateOrientationGuard();
    engine.resize();
  }, 120);
}

updateOrientationGuard();

window.addEventListener("orientationchange", () => {
  window.setTimeout(() => {
    updateOrientationGuard();
    engine.resize();
  }, 120);
});

document.addEventListener("fullscreenchange", () => {
  window.setTimeout(() => {
    updateOrientationGuard();
    engine.resize();
  }, 80);
});

/* ============================================================
   MATH / TRANSFORMS
============================================================ */

function round(value: number, digits = 4) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function rad(value: number) {
  return value * Math.PI / 180;
}

function deg(value: number) {
  return value * 180 / Math.PI;
}

function currentEuler(node: TransformNode | AbstractMesh) {
  return node.rotationQuaternion
    ? node.rotationQuaternion.toEulerAngles()
    : node.rotation;
}

function snapshot(node: TransformNode | AbstractMesh): TransformSnapshot {
  const r = currentEuler(node);

  return {
    position: [
      round(node.position.x),
      round(node.position.y),
      round(node.position.z),
    ],
    rotation: [
      round(r.x),
      round(r.y),
      round(r.z),
    ],
    scaling: [
      round(node.scaling.x),
      round(node.scaling.y),
      round(node.scaling.z),
    ],
  };
}

function applySnapshot(
  node: TransformNode | AbstractMesh,
  data: TransformSnapshot,
) {
  node.position.set(...data.position);

  node.rotation.set(0, 0, 0);

  node.rotationQuaternion = Quaternion.FromEulerAngles(
    data.rotation[0],
    data.rotation[1],
    data.rotation[2],
  );

  node.scaling.set(...data.scaling);
}

function applyCamera(data: CameraSnapshot) {
  camera.alpha = data.alpha;
  camera.beta = data.beta;
  camera.radius = data.radius;
  camera.target.set(...data.target);
  camera.fov = data.fov;
}

function calculateBounds(meshes: AbstractMesh[]) {
  let min = new Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );

  let max = new Vector3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  );

  let usable = 0;

  for (const mesh of meshes) {
    try {
      mesh.computeWorldMatrix(true);

      try {
        mesh.refreshBoundingInfo(true, true);
      } catch {
        // Not every mesh needs refresh.
      }

      const bb = mesh.getBoundingInfo().boundingBox;

      const meshMin = bb.minimumWorld;
      const meshMax = bb.maximumWorld;

      const values = [
        meshMin.x,
        meshMin.y,
        meshMin.z,
        meshMax.x,
        meshMax.y,
        meshMax.z,
      ];

      if (!values.every(Number.isFinite)) {
        continue;
      }

      const size = meshMax.subtract(meshMin);

      if (size.lengthSquared() < 1e-10) {
        continue;
      }

      min = Vector3.Minimize(min, meshMin);
      max = Vector3.Maximize(max, meshMax);
      usable += 1;
    } catch {
      // Ignore helper nodes without useful bounds.
    }
  }

  if (!usable) {
    return null;
  }

  return {
    min,
    max,
    center: min.add(max).scale(0.5),
    size: max.subtract(min),
  };
}

function topImportedNodes(
  meshes: AbstractMesh[],
  transformNodes: TransformNode[],
): (TransformNode | AbstractMesh)[] {
  const all: (TransformNode | AbstractMesh)[] = [
    ...transformNodes,
    ...meshes,
  ];

  const set = new Set<Node>(all);

  return all.filter(
    (node) => !node.parent || !set.has(node.parent),
  );
}

/* ============================================================
   ENVIRONMENT
============================================================ */

async function loadNIC() {
  loadingText.textContent = "Loading National Innovation Centre…";

  console.time("NIC load");

  const result = await SceneLoader.ImportMeshAsync(
    "",
    "/assets/locations/",
    "NIC_Lobby.glb",
    scene,
  );

  console.timeEnd("NIC load");

  nicMeshes = result.meshes;

  console.log("[NIC] meshes:", result.meshes.length);
  console.log("[NIC] transforms:", result.transformNodes.length);
}

async function loadJagro() {
  loadingText.textContent = "Preloading Simply Strawberries by Jagro…";

  console.time("Jagro load");

  const result = await SceneLoader.ImportMeshAsync(
    "",
    "/assets/locations/",
    "Jagro_Polhengoda.glb",
    scene,
  );

  console.timeEnd("Jagro load");

  jagroMeshes = result.meshes;

  /*
    Preload now, but keep the environment invisible until the NIC
    cinematic actually transitions to Jagro.
  */
  for (const mesh of jagroMeshes) {
    mesh.setEnabled(false);
  }

  console.log("[Jagro] meshes:", result.meshes.length);
  console.log("[Jagro] transforms:", result.transformNodes.length);
}

async function loadVito() {
  loadingText.textContent = "Loading Vito Wood Fired Pizza…";

  console.time("Vito load");

  const result = await SceneLoader.ImportMeshAsync(
    "",
    "/assets/locations/",
    "Vito_Wood_Fired_Pizza.glb",
    scene,
  );

  console.timeEnd("Vito load");

  vitoMeshes = result.meshes;

  for (const mesh of vitoMeshes) {
    mesh.setEnabled(false);
  }

  console.log("[Vito] meshes:", result.meshes.length);
  console.log("[Vito] transforms:", result.transformNodes.length);
  console.log(
    "[Vito] marker nodes:",
    result.transformNodes
      .filter((node) =>
        [
          "SPAWN_NICK",
          "SPAWN_JUDY",
          "INTERACTION_POINT",
          "CAMERA_ESTABLISH",
          "EXIT_TO_CCC",
          "VITO_SIGN_TARGET",
          "PIZZA_KITCHEN_TARGET",
        ].includes(node.name),
      )
      .map((node) => ({
        name: node.name,
        position: node.getAbsolutePosition().asArray(),
      })),
  );
}


async function loadCCC() {
  loadingText.textContent = "Loading Scope Cinemas · Colombo City Centre…";

  console.time("CCC load");

  const result = await SceneLoader.ImportMeshAsync(
    "",
    "/assets/locations/",
    "CCC_Scope_Cinema.glb",
    scene,
  );

  console.timeEnd("CCC load");

  cccMeshes = result.meshes;
  for (const mesh of cccMeshes) {
    mesh.setEnabled(false);
  }

  console.log("[CCC] meshes:", result.meshes.length);
  console.log("[CCC] transforms:", result.transformNodes.length);
  console.log(
    "[CCC] marker nodes:",
    result.transformNodes
      .filter((node) =>
        [
          "SPAWN_NICK",
          "SPAWN_JUDY",
          "BOX_OFFICE_TARGET",
          "PAW_POSTER_TARGET",
          "SCOPE_SIGN_TARGET",
          "ESCALATOR_TARGET",
          "CINEMA_ENTRY_TARGET",
          "CAMERA_ESTABLISH",
        ].includes(node.name),
      )
      .map((node) => ({
        name: node.name,
        position: node.getAbsolutePosition().asArray(),
      })),
  );
}

function showEnvironment(name: "NIC" | "JAGRO" | "VITO" | "CCC") {
  activeEnvironment = name;

  for (const mesh of nicMeshes) {
    mesh.setEnabled(name === "NIC");
  }

  for (const mesh of jagroMeshes) {
    mesh.setEnabled(name === "JAGRO");
  }

  for (const mesh of vitoMeshes) {
    mesh.setEnabled(name === "VITO");
  }

  for (const mesh of cccMeshes) {
    mesh.setEnabled(name === "CCC");
  }

  missionLocationEl.textContent =
    name === "NIC"
      ? "01 · NATIONAL INNOVATION CENTRE"
      : name === "JAGRO"
        ? "02 · SIMPLY STRAWBERRIES BY JAGRO"
        : name === "VITO"
          ? "03 · VITO WOOD FIRED PIZZA"
          : "04 · SCOPE CINEMAS · CCC";

  console.log(`[Environment] -> ${name}`);
}

/* ============================================================
   CHARACTER CLIP SYSTEM
============================================================ */

function createActor(
  name: ActorName,
  desiredHeight: number,
) {
  const placementRoot = new TransformNode(
    `${name}_PLACEMENT_ROOT`,
    scene,
  );

  applySnapshot(
    placementRoot,
    IDLE_STAGING[name],
  );

  const actor: ActorController = {
    name,
    placementRoot,
    clips: new Map(),
    activeClip: "",
    desiredHeight,
  };

  actors.set(name, actor);

  return actor;
}

async function importClip(
  actor: ActorController,
  clipName: string,
  fileName: string,
  isReference: boolean,
) {
  loadingText.textContent = `Loading ${actor.name} · ${clipName}…`;

  console.time(`${actor.name}:${clipName}`);

  const result = await SceneLoader.ImportMeshAsync(
    "",
    `/assets/animations/${actor.name.toLowerCase()}/`,
    fileName,
    scene,
  );

  console.timeEnd(`${actor.name}:${clipName}`);

  if (result.animationGroups.length !== 1) {
    throw new Error(
      `${actor.name} ${clipName}: expected exactly 1 animation group, found ${result.animationGroups.length}`,
    );
  }

  if (!result.skeletons.length) {
    throw new Error(
      `${actor.name} ${clipName}: no skeleton found`,
    );
  }

  const clipRoot = new TransformNode(
    `${actor.name}_${clipName.replaceAll(" ", "_")}_CLIP_ROOT`,
    scene,
  );

  for (const node of topImportedNodes(
    result.meshes,
    result.transformNodes,
  )) {
    node.parent = clipRoot;
  }

  const group = result.animationGroups[0];

  /*
    Evaluate every actor at its first frame before calculating alignment.
    This is the key to keeping Nick in the SAME world position when clips
    are swapped.
  */
  group.stop();

  try {
    group.goToFrame(group.from);
  } catch {
    // Fine; the current frame is already the start.
  }

  scene.render();

  clipRoot.computeWorldMatrix(true);

  for (const mesh of result.meshes) {
    mesh.computeWorldMatrix(true);
  }

  if (isReference) {
    const initial = calculateBounds(result.meshes);

    if (!initial || initial.size.y <= 0.0001) {
      throw new Error(
        `${actor.name} ${clipName}: reference bounds invalid`,
      );
    }

    const scale = actor.desiredHeight / initial.size.y;

    clipRoot.scaling.setAll(scale);

    clipRoot.computeWorldMatrix(true);

    for (const mesh of result.meshes) {
      mesh.computeWorldMatrix(true);

      try {
        mesh.refreshBoundingInfo(true, true);
      } catch {}
    }

    const scaled = calculateBounds(result.meshes);

    if (!scaled) {
      throw new Error(
        `${actor.name} ${clipName}: scaled reference bounds invalid`,
      );
    }

    const floorOffset = -scaled.min.y;

    clipRoot.position.y += floorOffset;
    clipRoot.computeWorldMatrix(true);

    for (const mesh of result.meshes) {
      mesh.computeWorldMatrix(true);
    }

    const grounded = calculateBounds(result.meshes);

    if (!grounded) {
      throw new Error(
        `${actor.name} ${clipName}: grounded reference bounds invalid`,
      );
    }

    actor.calibration = {
      scale,
      floorOffset,
      anchorX: grounded.center.x,
      anchorZ: grounded.center.z,
    };

    console.log(
      `[${actor.name}] Idle anchor locked`,
      actor.calibration,
    );
  } else {
    if (!actor.calibration) {
      throw new Error(
        `${actor.name} ${clipName}: missing Idle calibration`,
      );
    }

    clipRoot.scaling.setAll(actor.calibration.scale);
    clipRoot.position.y += actor.calibration.floorOffset;

    clipRoot.computeWorldMatrix(true);

    for (const mesh of result.meshes) {
      mesh.computeWorldMatrix(true);

      try {
        mesh.refreshBoundingInfo(true, true);
      } catch {}
    }

    const current = calculateBounds(result.meshes);

    if (current) {
      /*
        Align X/Z centre to the Idle clip's first-frame anchor.
        Placement root never changes.

        Therefore clicking Talking/Pointing/Walking/etc. cannot send
        Nick backwards anymore.
      */
      clipRoot.position.x +=
        actor.calibration.anchorX - current.center.x;

      clipRoot.position.z +=
        actor.calibration.anchorZ - current.center.z;
    }
  }

  clipRoot.parent = actor.placementRoot;
  clipRoot.setEnabled(false);

  group.stop();

  actor.clips.set(clipName, {
    name: clipName,
    root: clipRoot,
    meshes: result.meshes,
    animationGroup: group,
  });

  console.log(
    `[${actor.name}:${clipName}] ready`,
    {
      animation: group.name,
      frames: [group.from, group.to],
      correction: {
        x: clipRoot.position.x,
        y: clipRoot.position.y,
        z: clipRoot.position.z,
      },
    },
  );
}

async function loadCharacters() {
  const nick = createActor("Nick", 1.72);
  const judy = createActor("Judy", 1.45);

  /*
    NOW that Nick Idle is fixed, BOTH actors use Idle as their permanent
    calibration/reference clip.
  */
  await importClip(
    nick,
    "Idle",
    CLIP_FILES.Nick.Idle,
    true,
  );

  await importClip(
    judy,
    "Idle",
    CLIP_FILES.Judy.Idle,
    true,
  );

  const jobs: Promise<void>[] = [];

  for (const [clipName, fileName] of Object.entries(CLIP_FILES.Nick)) {
    if (clipName === "Idle") continue;

    jobs.push(
      importClip(
        nick,
        clipName,
        fileName,
        false,
      ),
    );
  }

  for (const [clipName, fileName] of Object.entries(CLIP_FILES.Judy)) {
    if (clipName === "Idle") continue;

    jobs.push(
      importClip(
        judy,
        clipName,
        fileName,
        false,
      ),
    );
  }

  await Promise.all(jobs);

  console.log("[Characters] all 12 clean clips loaded");
}

function setClip(
  actorName: ActorName,
  clipName: string,
  loop = true,
) {
  const actor = actors.get(actorName);

  if (!actor) return;

  const target = actor.clips.get(clipName);

  if (!target) {
    console.warn(`[${actorName}] clip missing: ${clipName}`);
    return;
  }

  /*
    CRITICAL:
    We do NOT touch actor.placementRoot here.
    World placement remains exactly where the user staged the actor.
  */
  for (const clip of actor.clips.values()) {
    clip.animationGroup.stop();
    clip.root.setEnabled(false);
  }

  target.root.setEnabled(true);

  target.animationGroup.start(
    loop,
    1,
    target.animationGroup.from,
    target.animationGroup.to,
    false,
  );

  actor.activeClip = clipName;

  console.log(
    `[Animation] ${actorName} -> ${clipName}`,
    snapshot(actor.placementRoot),
  );

  updateAnimationButtons();
  renderConfig();
}

function updateAnimationButtons() {
  const nick = actors.get("Nick")?.activeClip;
  const judy = actors.get("Judy")?.activeClip;

  document
    .querySelectorAll<HTMLButtonElement>(
      "[data-animation-actor]",
    )
    .forEach((button) => {
      const actor = button.dataset.animationActor;
      const clip = button.dataset.animationClip;

      const active =
        actor === "Nick"
          ? clip === nick
          : actor === "Judy"
            ? clip === judy
            : false;

      button.classList.toggle("active", active);
    });

  animationReadout.textContent =
    `Nick: ${nick ?? "none"}\n` +
    `Judy: ${judy ?? "none"}`;
}

/* ============================================================
   STAGING PRESETS
============================================================ */

function applyStaging(
  preset: Record<ActorName, TransformSnapshot>,
  cam?: CameraSnapshot,
) {
  const nick = actors.get("Nick");
  const judy = actors.get("Judy");

  if (!nick || !judy) return;

  applySnapshot(
    nick.placementRoot,
    preset.Nick,
  );

  applySnapshot(
    judy.placementRoot,
    preset.Judy,
  );

  if (cam) {
    applyCamera(cam);
  }

  renderConfig();
}

function applyIdleStaging() {
  applyStaging(
    IDLE_STAGING,
    IDLE_CAMERA,
  );
}

function getJagroBounds() {
  const bounds = calculateBounds(jagroMeshes);

  if (!bounds) {
    throw new Error("Jagro environment bounds are unavailable");
  }

  return bounds;
}

/*
  Jagro is now treated as an INTERIOR scene only.

  We do not frame the exterior, storefront entrance, or front platform.
  These exact actor coordinates came from the manual interior staging.
*/
function applyJagroInteriorStaging() {
  const nick = actors.get("Nick");
  const judy = actors.get("Judy");

  if (!nick || !judy) {
    return;
  }

  applySnapshot(
    nick.placementRoot,
    JAGRO_INTERIOR_STAGING.Nick,
  );

  applySnapshot(
    judy.placementRoot,
    JAGRO_INTERIOR_STAGING.Judy,
  );

  setClip("Nick", "Idle", true);
  setClip("Judy", "Idle", true);

  applyCamera(
    JAGRO_INTERIOR_CAMERA,
  );

  renderConfig();

  console.log(
    "[Jagro] interior staging applied",
    {
      actors: {
        Nick: snapshot(nick.placementRoot),
        Judy: snapshot(judy.placementRoot),
      },
      camera: JAGRO_INTERIOR_CAMERA,
      environmentBounds: (() => {
        const b = getJagroBounds();

        return {
          min: b.min.asArray(),
          max: b.max.asArray(),
          size: b.size.asArray(),
        };
      })(),
    },
  );
}

function applyJagroActorCamera() {
  applyCamera(
    JAGRO_INTERIOR_CAMERA,
  );

  renderConfig();

  console.log(
    "[Jagro] opposite-end actor camera applied",
    JAGRO_INTERIOR_CAMERA,
  );
}

function enterJagroForEditing() {
  stopNICScene(false);

  showEnvironment("JAGRO");
  applyJagroInteriorStaging();

  if (DEBUG_EDITOR) {
    editorPanel.classList.remove("hiddenPanel");
  }

  toast("Jagro interior ready");
}

/*
  Scene 03 uses the Vito asset's own game-engine markers rather than
  guessed location coordinates.
*/
function applyVitoLockedStaging() {
  const nick = actors.get("Nick");
  const judy = actors.get("Judy");

  if (!nick || !judy) {
    return;
  }

  applySnapshot(
    nick.placementRoot,
    VITO_LOCKED_STAGING.Nick,
  );

  applySnapshot(
    judy.placementRoot,
    VITO_LOCKED_STAGING.Judy,
  );

  setClip("Nick", "Idle", true);
  setClip("Judy", "Idle", true);

  applyCamera(VITO_LOCKED_CAMERA);
  renderConfig();

  console.log("[Vito] locked staging applied", {
    Nick: snapshot(nick.placementRoot),
    Judy: snapshot(judy.placementRoot),
    camera: VITO_LOCKED_CAMERA,
  });
}

function applyVitoLockedCamera() {
  applyCamera(VITO_LOCKED_CAMERA);
  renderConfig();
  console.log("[Vito] locked camera applied", VITO_LOCKED_CAMERA);
}

function enterVitoForEditing() {
  stopNICScene(false);
  showEnvironment("VITO");
  applyVitoLockedStaging();

  if (DEBUG_EDITOR) {
    editorPanel.classList.remove("hiddenPanel");
  }

  toast("Vito Scene 03 ready for staging");
}

function applyCCCLockedStaging() {
  const nick = actors.get("Nick");
  const judy = actors.get("Judy");

  if (!nick || !judy) return;

  applySnapshot(
    nick.placementRoot,
    CCC_LOCKED_STAGING.Nick,
  );

  applySnapshot(
    judy.placementRoot,
    CCC_LOCKED_STAGING.Judy,
  );

  setClip("Nick", "Idle", true);
  setClip("Judy", "Idle", true);

  applyCamera(CCC_LOCKED_CAMERA);
  renderConfig();

  console.log("[CCC] locked staging applied", {
    Nick: snapshot(nick.placementRoot),
    Judy: snapshot(judy.placementRoot),
    camera: CCC_LOCKED_CAMERA,
  });
}

function applyCCCLockedCamera() {
  applyCamera(CCC_LOCKED_CAMERA);
  renderConfig();

  console.log(
    "[CCC] locked camera applied",
    CCC_LOCKED_CAMERA,
  );
}

function enterCCCForEditing() {
  stopNICScene(false);
  showEnvironment("CCC");
  applyCCCLockedStaging();

  if (DEBUG_EDITOR) {
    editorPanel.classList.remove("hiddenPanel");
  }

  toast("Scope Cinemas Scene 04 · locked camera loaded");
}

/* ============================================================
   SELECTION / EDITOR
============================================================ */

const gizmos = DEBUG_EDITOR
  ? new GizmoManager(scene)
  : null;

if (gizmos) {
  gizmos.positionGizmoEnabled = true;
  gizmos.rotationGizmoEnabled = false;
  gizmos.scaleGizmoEnabled = false;
  gizmos.usePointerToAttachGizmos = false;
}

const highlight = new HighlightLayer(
  "NIC_SELECTION",
  scene,
);

highlight.innerGlow = false;
highlight.outerGlow = true;

function actorFromMesh(mesh: AbstractMesh): ActorName | null {
  let node: Node | null = mesh;

  while (node) {
    for (const [name, actor] of actors) {
      if (node === actor.placementRoot) {
        return name;
      }
    }

    node = node.parent;
  }

  return null;
}

function selectNode(
  node: TransformNode | AbstractMesh | null,
) {
  highlight.removeAllMeshes();

  selectedNode = node;

  if (!node) {
    gizmos?.attachToNode(null);
    selectedLabel.textContent = "Nothing selected";
    syncInputs();
    return;
  }

  gizmos?.attachToNode(node);

  selectedLabel.textContent = node.name;

  if (node instanceof Mesh) {
    highlight.addMesh(
      node,
      Color3.FromHexString("#58A6FF"),
    );
  }

  syncInputs();
}

function selectActor(name: ActorName) {
  const actor = actors.get(name);

  if (actor) {
    selectNode(actor.placementRoot);
  }
}

if (DEBUG_EDITOR) {
  scene.onPointerObservable.add((pointerInfo) => {
    if (
      pointerInfo.type !==
      PointerEventTypes.POINTERPICK
    ) {
      return;
    }

    const mesh = pointerInfo.pickInfo?.pickedMesh;

    if (!mesh) return;

    const actor = actorFromMesh(mesh);

    if (actor) {
      selectActor(actor);
    }
  });
}

/* ============================================================
   NUMERIC TRANSFORMS
============================================================ */

const inputs = {
  posX: must<HTMLInputElement>("#posX"),
  posY: must<HTMLInputElement>("#posY"),
  posZ: must<HTMLInputElement>("#posZ"),
  rotX: must<HTMLInputElement>("#rotX"),
  rotY: must<HTMLInputElement>("#rotY"),
  rotZ: must<HTMLInputElement>("#rotZ"),
  scaleX: must<HTMLInputElement>("#scaleX"),
  scaleY: must<HTMLInputElement>("#scaleY"),
  scaleZ: must<HTMLInputElement>("#scaleZ"),
};

function syncInputs() {
  if (!selectedNode) {
    for (const input of Object.values(inputs)) {
      input.value = "";
      input.disabled = true;
    }

    return;
  }

  for (const input of Object.values(inputs)) {
    input.disabled = false;
  }

  const r = currentEuler(selectedNode);

  inputs.posX.value = selectedNode.position.x.toFixed(4);
  inputs.posY.value = selectedNode.position.y.toFixed(4);
  inputs.posZ.value = selectedNode.position.z.toFixed(4);

  inputs.rotX.value = deg(r.x).toFixed(1);
  inputs.rotY.value = deg(r.y).toFixed(1);
  inputs.rotZ.value = deg(r.z).toFixed(1);

  inputs.scaleX.value = selectedNode.scaling.x.toFixed(3);
  inputs.scaleY.value = selectedNode.scaling.y.toFixed(3);
  inputs.scaleZ.value = selectedNode.scaling.z.toFixed(3);
}

function applyInputs() {
  if (!selectedNode) return;

  selectedNode.position.set(
    Number(inputs.posX.value),
    Number(inputs.posY.value),
    Number(inputs.posZ.value),
  );

  selectedNode.rotation.set(0, 0, 0);

  selectedNode.rotationQuaternion = Quaternion.FromEulerAngles(
    rad(Number(inputs.rotX.value)),
    rad(Number(inputs.rotY.value)),
    rad(Number(inputs.rotZ.value)),
  );

  selectedNode.scaling.set(
    Number(inputs.scaleX.value),
    Number(inputs.scaleY.value),
    Number(inputs.scaleZ.value),
  );

  renderConfig();
}

for (const input of Object.values(inputs)) {
  input.addEventListener(
    "change",
    applyInputs,
  );
}

function setTool(
  mode: "move" | "rotate" | "scale",
) {
  if (!gizmos) {
    return;
  }

  gizmos.positionGizmoEnabled = mode === "move";
  gizmos.rotationGizmoEnabled = mode === "rotate";
  gizmos.scaleGizmoEnabled = mode === "scale";

  document
    .querySelector("#toolMove")
    ?.classList.toggle("active", mode === "move");

  document
    .querySelector("#toolRotate")
    ?.classList.toggle("active", mode === "rotate");

  document
    .querySelector("#toolScale")
    ?.classList.toggle("active", mode === "scale");

  if (selectedNode) {
    gizmos.attachToNode(selectedNode);
  }
}

/* ============================================================
   CONFIG / DEBUG
============================================================ */

function buildConfig(): SceneConfig {
  const nick = actors.get("Nick")!;
  const judy = actors.get("Judy")!;

  return {
    version: 5,
    environment: activeEnvironment,

    actors: {
      Nick: snapshot(nick.placementRoot),
      Judy: snapshot(judy.placementRoot),
    },

    activeClips: {
      Nick: nick.activeClip,
      Judy: judy.activeClip,
    },

    camera: {
      alpha: round(camera.alpha),
      beta: round(camera.beta),
      radius: round(camera.radius),
      target: [
        round(camera.target.x),
        round(camera.target.y),
        round(camera.target.z),
      ],
      fov: round(camera.fov),
    },

    hiddenMeshes:
      (activeEnvironment === "NIC"
        ? nicMeshes
        : activeEnvironment === "JAGRO"
          ? jagroMeshes
          : vitoMeshes)
        .filter((mesh) => !mesh.isEnabled())
        .map((mesh) => mesh.name),
  };
}

function renderConfig() {
  if (
    !actors.has("Nick") ||
    !actors.has("Judy")
  ) {
    return;
  }

  configOutput.value = JSON.stringify(
    buildConfig(),
    null,
    2,
  );
}

/* ============================================================
   PLAYER INPUT / PAUSE
============================================================ */

function showContinueHint(value: boolean) {
  continueHint.classList.toggle("hidden", !value);
}

function waitForAdvance(runId: number) {
  return new Promise<void>((resolve, reject) => {
    waitingForAdvance = true;
    showContinueHint(true);

    advanceRejecter = reject;

    advanceResolver = () => {
      if (runId !== cinematicRunId) {
        waitingForAdvance = false;
        advanceResolver = null;
        advanceRejecter = null;
        showContinueHint(false);
        reject(new Error("CINEMATIC_CANCELLED"));
        return;
      }

      if (gamePaused) {
        return;
      }

      waitingForAdvance = false;
      advanceResolver = null;
      advanceRejecter = null;
      showContinueHint(false);
      resolve();
    };
  });
}

function advanceGame() {
  if (!gameStarted || gamePaused) {
    return;
  }

  if (waitingForAdvance && advanceResolver) {
    advanceResolver();
  }
}

function pauseActiveAnimations() {
  for (const actor of actors.values()) {
    const clip = actor.clips.get(actor.activeClip);

    if (clip) {
      clip.animationGroup.pause();
    }
  }
}

function resumeActiveAnimations() {
  for (const actor of actors.values()) {
    const clip = actor.clips.get(actor.activeClip);

    if (clip) {
      clip.animationGroup.play(true);
    }
  }
}

function setPaused(value: boolean) {
  if (!gameStarted) {
    return;
  }

  gamePaused = value;

  pauseMenu.classList.toggle("hidden", !value);

  if (value) {
    pauseActiveAnimations();
    showContinueHint(false);
  } else {
    resumeActiveAnimations();

    if (waitingForAdvance) {
      showContinueHint(true);
    }
  }
}

function togglePause() {
  setPaused(!gamePaused);
}

async function waitWhilePaused(runId: number) {
  while (gamePaused) {
    if (runId !== cinematicRunId) {
      throw new Error("CINEMATIC_CANCELLED");
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 40);
    });
  }
}

async function playerDelay(
  ms: number,
  runId: number,
) {
  let remaining = ms;
  let last = performance.now();

  while (remaining > 0) {
    if (runId !== cinematicRunId) {
      throw new Error("CINEMATIC_CANCELLED");
    }

    if (gamePaused) {
      await waitWhilePaused(runId);
      last = performance.now();
      continue;
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 16);
    });

    const now = performance.now();
    remaining -= now - last;
    last = now;
  }
}

function playerAdvanceFromPointer(event: PointerEvent) {
  const target = event.target as HTMLElement;

  if (
    target.closest("button") ||
    target.closest("#miniGameOverlay") ||
    target.closest("#editorPanel") ||
    target.closest("#pauseMenu")
  ) {
    return;
  }

  advanceGame();
}

window.addEventListener(
  "pointerup",
  playerAdvanceFromPointer,
);

/* ============================================================
   CINEMATIC HELPERS
============================================================ */

function sleep(ms: number, runId: number) {
  return playerDelay(ms, runId);
}

function showDialogue(
  who: "NICK WILDE" | "JUDY HOPPS",
  text: string,
) {
  speaker.textContent = who;
  dialogueText.textContent = text;

  speaker.style.color =
    who === "NICK WILDE"
      ? "#ff9a4b"
      : "#8ab8ff";

  dialogueBox.classList.remove("hidden");
}

function hideDialogue() {
  dialogueBox.classList.add("hidden");
}

function showTransition(small: string, big: string, sub: string) {
  transitionSmallEl.textContent = small;
  transitionBigEl.textContent = big;
  transitionSubEl.textContent = sub;
  transitionCard.classList.remove("hidden");
}

function hideTransition() {
  transitionCard.classList.add("hidden");
}

function setCinematicMode(value: boolean) {
  document.body.classList.toggle(
    "cinematic",
    value,
  );
}


/* ============================================================
   INTERACTIVE CHECKPOINT MINI-GAMES

   Short mobile-friendly tasks are inserted between dialogue beats.
   They deliberately do NOT alter any locked 3D staging/cameras.
============================================================ */

type MissionStop = "NIC" | "JAGRO" | "VITO" | "CCC";

let activeMiniGameAbort: (() => void) | null = null;
let activeMiniGameTimer = 0;

function haptic(pattern: number | number[] = 28) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration is only a progressive enhancement.
  }
}

function resetMissionProgress() {
  missionProgress.classList.remove("hidden");

  document
    .querySelectorAll<HTMLElement>("[data-progress-stop]")
    .forEach((element) => {
      element.classList.remove("complete", "active");
    });

  document
    .querySelector<HTMLElement>('[data-progress-stop="NIC"]')
    ?.classList.add("active");
}

function setMissionProgressActive(stop: MissionStop) {
  document
    .querySelectorAll<HTMLElement>("[data-progress-stop]")
    .forEach((element) => element.classList.remove("active"));

  document
    .querySelector<HTMLElement>(`[data-progress-stop="${stop}"]`)
    ?.classList.add("active");
}

function markMissionStopComplete(stop: MissionStop) {
  const current = document.querySelector<HTMLElement>(
    `[data-progress-stop="${stop}"]`,
  );

  current?.classList.remove("active");
  current?.classList.add("complete");

  const order: MissionStop[] = ["NIC", "JAGRO", "VITO", "CCC"];
  const next = order[order.indexOf(stop) + 1];

  if (next) {
    setMissionProgressActive(next);
  }
}

function showMiniGame(
  kicker: string,
  title: string,
  subtitle: string,
) {
  showContinueHint(false);
  miniGameKicker.textContent = kicker;
  miniGameTitle.textContent = title;
  miniGameSubtitle.textContent = subtitle;
  miniGameBody.innerHTML = "";
  miniGameFeedback.textContent = "";
  miniGameFeedback.className = "miniGameFeedback";
  miniGameOverlay.classList.remove("hidden", "success");
  document.body.classList.add("miniGameActive");
}

function hideMiniGame() {
  window.clearTimeout(activeMiniGameTimer);
  activeMiniGameTimer = 0;
  miniGameOverlay.classList.add("hidden");
  miniGameOverlay.classList.remove("success");
  document.body.classList.remove("miniGameActive");
  miniGameBody.innerHTML = "";
  miniGameFeedback.textContent = "";
}

function cancelActiveMiniGame() {
  window.clearTimeout(activeMiniGameTimer);
  activeMiniGameTimer = 0;

  const abort = activeMiniGameAbort;
  activeMiniGameAbort = null;

  hideMiniGame();

  if (abort) {
    abort();
  }
}

function miniGameWrong(message: string) {
  miniGameFeedback.textContent = message;
  miniGameFeedback.className = "miniGameFeedback wrong";
  haptic(18);
}

function miniGameSuccess(
  stop: MissionStop,
  message: string,
  runId: number,
  resolve: () => void,
  reject: (reason?: unknown) => void,
) {
  markMissionStopComplete(stop);
  miniGameFeedback.textContent = message;
  miniGameFeedback.className = "miniGameFeedback good";
  miniGameOverlay.classList.add("success");
  haptic([34, 45, 65]);

  activeMiniGameAbort = null;

  activeMiniGameTimer = window.setTimeout(() => {
    activeMiniGameTimer = 0;

    if (runId !== cinematicRunId) {
      hideMiniGame();
      reject(new Error("CINEMATIC_CANCELLED"));
      return;
    }

    hideMiniGame();
    resolve();
  }, 720);
}

function playNICMissionAccept(runId: number) {
  showMiniGame(
    "ZPD AUTHORIZATION",
    "Accept the mission",
    "Slide Nick’s badge all the way across to authorize Operation: Perfect Date.",
  );

  miniGameBody.innerHTML = `
    <div class="acceptMissionWrap">
      <div id="acceptTrack" class="acceptTrack" aria-label="Slide to accept mission">
        <div id="acceptFill" class="acceptFill"></div>
        <div class="acceptTrackLabel">SLIDE TO ACCEPT →</div>
        <button id="acceptBadge" class="acceptBadge" type="button" aria-label="Drag badge to the right">ZPD</button>
        <div class="acceptTarget">✓</div>
      </div>
      <div class="miniInstruction">Drag the badge →</div>
    </div>
  `;

  return new Promise<void>((resolve, reject) => {
    const track = must<HTMLDivElement>("#acceptTrack");
    const badge = must<HTMLButtonElement>("#acceptBadge");
    const fill = must<HTMLDivElement>("#acceptFill");
    let dragging = false;
    let progress = 0;
    let completed = false;

    activeMiniGameAbort = () => {
      if (completed) return;
      completed = true;
      reject(new Error("CINEMATIC_CANCELLED"));
    };

    const setProgress = (clientX: number) => {
      if (completed || gamePaused) return;

      const rect = track.getBoundingClientRect();
      const badgeWidth = badge.getBoundingClientRect().width || 54;
      const maxX = Math.max(1, rect.width - badgeWidth - 8);
      const rawX = clientX - rect.left - badgeWidth / 2;
      const x = Math.max(4, Math.min(maxX, rawX));

      progress = Math.max(0, Math.min(1, (x - 4) / Math.max(1, maxX - 4)));
      badge.style.transform = `translateX(${x - 4}px)`;
      fill.style.width = `${Math.max(8, progress * 100)}%`;

      if (progress >= 0.88) {
        completed = true;
        badge.textContent = "✓";
        badge.classList.add("accepted");
        miniGameSuccess(
          "NIC",
          "MISSION ACCEPTED · Checkpoint 01 cleared",
          runId,
          resolve,
          reject,
        );
      }
    };

    badge.addEventListener("pointerdown", (event) => {
      dragging = true;
      badge.setPointerCapture(event.pointerId);
      setProgress(event.clientX);
    });

    badge.addEventListener("pointermove", (event) => {
      if (dragging) setProgress(event.clientX);
    });

    badge.addEventListener("pointerup", (event) => {
      dragging = false;
      if (badge.hasPointerCapture(event.pointerId)) {
        badge.releasePointerCapture(event.pointerId);
      }

      if (!completed && progress < 0.88) {
        badge.style.transform = "translateX(0px)";
        fill.style.width = "8%";
        progress = 0;
        miniGameWrong("Almost. Slide it all the way to authorize the mission.");
      }
    });

    badge.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        const rect = track.getBoundingClientRect();
        const syntheticX = rect.left + rect.width * Math.min(1, progress + 0.18);
        setProgress(syntheticX);
      }
    });
  });
}

function playJagroCheesecakeHunt(runId: number) {
  showMiniGame(
    "CHECKPOINT 02",
    "Find the reward",
    "Nick said signature cheesecakes. Pick the right Jagro treat.",
  );

  miniGameBody.innerHTML = `
    <div class="choiceGrid treatGrid">
      <button type="button" class="choiceCard" data-treat="berries">
        <span class="choiceEmoji">🍓</span>
        <span>Strawberry bowl</span>
      </button>
      <button type="button" class="choiceCard" data-treat="cheesecake">
        <span class="choiceEmoji">🍰</span>
        <span>Signature cheesecake</span>
      </button>
      <button type="button" class="choiceCard" data-treat="shake">
        <span class="choiceEmoji">🥤</span>
        <span>Strawberry shake</span>
      </button>
    </div>
  `;

  return new Promise<void>((resolve, reject) => {
    let completed = false;

    activeMiniGameAbort = () => {
      if (completed) return;
      completed = true;
      reject(new Error("CINEMATIC_CANCELLED"));
    };

    miniGameBody
      .querySelectorAll<HTMLButtonElement>("[data-treat]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          if (completed || gamePaused) return;

          if (button.dataset.treat === "cheesecake") {
            completed = true;
            button.classList.add("correctChoice");
            miniGameSuccess(
              "JAGRO",
              "SIGNATURE CHEESECAKE FOUND · Checkpoint 02 cleared",
              runId,
              resolve,
              reject,
            );
          } else {
            button.classList.add("wrongChoice");
            window.setTimeout(() => button.classList.remove("wrongChoice"), 420);
            miniGameWrong("Nick would absolutely eat that too… but that’s not the one.");
          }
        });
      });
  });
}

function playVitoPizzaBuilder(runId: number) {
  showMiniGame(
    "CHECKPOINT 03",
    "Build the pizza",
    "Pick any three toppings. No judgement from Judy. Probably.",
  );

  miniGameBody.innerHTML = `
    <div class="pizzaGame">
      <div id="pizzaBase" class="pizzaBase" aria-label="Your pizza">
        <div class="pizzaSauce"></div>
        <div class="pizzaCheese"></div>
      </div>
      <div class="pizzaCounter"><span id="pizzaCount">0</span>/3 toppings</div>
      <div class="toppingGrid">
        <button type="button" class="toppingButton" data-topping="pepper" data-emoji="🌶️">🌶️ Pepper</button>
        <button type="button" class="toppingButton" data-topping="mushroom" data-emoji="🍄">🍄 Mushroom</button>
        <button type="button" class="toppingButton" data-topping="olive" data-emoji="🫒">🫒 Olive</button>
        <button type="button" class="toppingButton" data-topping="tomato" data-emoji="🍅">🍅 Tomato</button>
        <button type="button" class="toppingButton" data-topping="pineapple" data-emoji="🍍">🍍 Chaos</button>
      </div>
    </div>
  `;

  return new Promise<void>((resolve, reject) => {
    const pizza = must<HTMLDivElement>("#pizzaBase");
    const count = must<HTMLSpanElement>("#pizzaCount");
    const selected = new Set<string>();
    let completed = false;

    const positions = [
      [31, 28],
      [62, 35],
      [48, 59],
    ];

    activeMiniGameAbort = () => {
      if (completed) return;
      completed = true;
      reject(new Error("CINEMATIC_CANCELLED"));
    };

    miniGameBody
      .querySelectorAll<HTMLButtonElement>("[data-topping]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          if (completed || gamePaused) return;

          const topping = button.dataset.topping;
          const emoji = button.dataset.emoji ?? "•";
          if (!topping || selected.has(topping)) return;

          selected.add(topping);
          button.classList.add("selectedTopping");
          button.disabled = true;

          const [left, top] = positions[selected.size - 1];
          const piece = document.createElement("span");
          piece.className = "pizzaPiece";
          piece.textContent = emoji;
          piece.style.left = `${left}%`;
          piece.style.top = `${top}%`;
          pizza.appendChild(piece);
          count.textContent = String(selected.size);
          haptic(18);

          if (selected.size === 3) {
            completed = true;
            window.setTimeout(() => {
              miniGameSuccess(
                "VITO",
                "PIZZA APPROVED · Checkpoint 03 cleared",
                runId,
                resolve,
                reject,
              );
            }, 350);
          }
        });
      });
  });
}

function playCCCMovieScanner(runId: number) {
  showMiniGame(
    "FINAL CHECKPOINT",
    "Find the movie",
    "Move the spotlight across the cinema board and tap the correct poster.",
  );

  miniGameBody.innerHTML = `
    <div id="movieScanner" class="movieScanner" aria-label="Cinema poster scanner">
      <div class="scannerBeam"></div>
      <div class="posterGrid">
        <button type="button" class="mysteryPoster p1" data-title="SPACE RANGERS"><span>???</span></button>
        <button type="button" class="mysteryPoster p2" data-title="OCEAN QUEST"><span>???</span></button>
        <button type="button" class="mysteryPoster p3" data-title="PAW PATROL · THE DINO MOVIE" data-correct="true"><span>???</span></button>
        <button type="button" class="mysteryPoster p4" data-title="ROBOT CITY"><span>???</span></button>
      </div>
      <div class="scannerHint">Drag your finger around the board 🔦</div>
    </div>
  `;

  return new Promise<void>((resolve, reject) => {
    const scanner = must<HTMLDivElement>("#movieScanner");
    const posters = Array.from(
      scanner.querySelectorAll<HTMLButtonElement>(".mysteryPoster"),
    );
    let completed = false;

    activeMiniGameAbort = () => {
      if (completed) return;
      completed = true;
      reject(new Error("CINEMATIC_CANCELLED"));
    };

    const scanAt = (clientX: number, clientY: number) => {
      if (completed || gamePaused) return;

      const scannerRect = scanner.getBoundingClientRect();
      const x = Math.max(0, Math.min(scannerRect.width, clientX - scannerRect.left));
      const y = Math.max(0, Math.min(scannerRect.height, clientY - scannerRect.top));

      scanner.style.setProperty("--scan-x", `${x}px`);
      scanner.style.setProperty("--scan-y", `${y}px`);

      posters.forEach((poster) => {
        const rect = poster.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const distance = Math.hypot(clientX - cx, clientY - cy);
        const lit = distance < Math.max(95, rect.width * 0.72);

        poster.classList.toggle("scanned", lit);
        const label = poster.querySelector("span");
        if (label) label.textContent = lit ? (poster.dataset.title ?? "POSTER") : "???";
      });
    };

    scanner.addEventListener("pointerdown", (event) => {
      scanAt(event.clientX, event.clientY);
    });

    scanner.addEventListener("pointermove", (event) => {
      if (event.buttons !== 0 || event.pointerType === "touch") {
        scanAt(event.clientX, event.clientY);
      }
    });

    posters.forEach((poster) => {
      poster.addEventListener("pointerdown", (event) => {
        scanAt(event.clientX, event.clientY);
      });

      poster.addEventListener("click", () => {
        if (completed || gamePaused) return;

        if (!poster.classList.contains("scanned")) {
          miniGameWrong("Use the spotlight first — the posters are still classified.");
          return;
        }

        if (poster.dataset.correct === "true") {
          completed = true;
          poster.classList.add("correctChoice");
          miniGameSuccess(
            "CCC",
            "MOVIE FOUND · Final checkpoint cleared",
            runId,
            resolve,
            reject,
          );
        } else {
          poster.classList.add("wrongChoice");
          window.setTimeout(() => poster.classList.remove("wrongChoice"), 420);
          miniGameWrong("Not this one. Keep scanning, detective.");
        }
      });
    });
  });
}

/* ============================================================
   FULL NIC CINEMATIC
   SCRIPT-ACCURATE:
   1. Nick opening dialogue
   2. Judy question
   3. Nick reveals Jagro
   4. Judy accepts
   5. Mission Accepted
   6. Walk to exit
   7. Transition to Jagro
============================================================ */

async function playNICScene1() {
  stopNICScene(false);
  cinematicRunId += 1;
  const runId = cinematicRunId;
  cinematicRunning = true;

  try {
    setCinematicMode(true);
    if (!DEBUG_EDITOR) editorPanel.classList.add("hiddenPanel");
    pauseMenu.classList.add("hidden");
    gamePaused = false;
    birthdayFinale.classList.add("hidden");
    hideTransition();
    missionCard.classList.add("hidden");
    hideDialogue();

    showEnvironment("NIC");
    applyIdleStaging();
    setClip("Nick", "Idle", true);
    setClip("Judy", "Idle", true);

    await sleep(900, runId);

    setClip("Nick", "Talking", true);
    showDialogue("NICK WILDE", "Agent Nishu... birthday mission officially starts here.");
    await sleep(350, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(260, runId);
    setClip("Judy", "Questioning", true);
    showDialogue("JUDY HOPPS", "A mission? At NIC?");
    await sleep(320, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Judy", "Idle", true);

    await sleep(260, runId);
    setClip("Nick", "Pointing", true);
    showDialogue("NICK WILDE", "First checkpoint: Strawberries by Jagro.");
    await sleep(340, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(260, runId);
    setClip("Judy", "Talking", true);
    showDialogue("JUDY HOPPS", "Okay, partner. Lead the way.");
    await sleep(340, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Judy", "Idle", true);

    await sleep(300, runId);
    await playNICMissionAccept(runId);

    missionCard.classList.remove("hidden");
    await sleep(850, runId);
    missionCard.classList.add("hidden");

    await sleep(280, runId);
    setClip("Nick", "Walking", true);
    setClip("Judy", "Walking", true);

    const nick = actors.get("Nick")!;
    const judy = actors.get("Judy")!;
    const startNick = nick.placementRoot.position.clone();
    const startJudy = judy.placementRoot.position.clone();
    const endNick = startNick.add(new Vector3(-0.25, 0, 2.0));
    const endJudy = startJudy.add(new Vector3(-0.1, 0, 2.0));

    let walkStart = performance.now();
    const walkDuration = 2200;

    while (true) {
      if (runId !== cinematicRunId) throw new Error("CINEMATIC_CANCELLED");

      if (gamePaused) {
        const pausedAt = performance.now();
        await waitWhilePaused(runId);
        walkStart += performance.now() - pausedAt;
      }

      const t = Math.min(1, (performance.now() - walkStart) / walkDuration);
      const k = t * t * (3 - 2 * t);
      Vector3.LerpToRef(startNick, endNick, k, nick.placementRoot.position);
      Vector3.LerpToRef(startJudy, endJudy, k, judy.placementRoot.position);
      if (t >= 1) break;
      await sleep(16, runId);
    }

    setClip("Nick", "Idle", true);
    setClip("Judy", "Idle", true);

    showTransition("NEXT CHECKPOINT", "SIMPLY STRAWBERRIES", "by Jagro · Polhengoda");
    await sleep(400, runId);
    await waitForAdvance(runId);
    hideTransition();

    setCinematicMode(false);
    cinematicRunning = false;
    showContinueHint(false);
    console.log("[FULL GAME] Scene 01 complete");
  } catch (error) {
    if (error instanceof Error && error.message === "CINEMATIC_CANCELLED") return;
    cinematicRunning = false;
    setCinematicMode(false);
    throw error;
  }
}

async function playJagroScene2Integrated() {
  stopNICScene(false);
  cinematicRunId += 1;
  const runId = cinematicRunId;
  cinematicRunning = true;

  try {
    setCinematicMode(true);
    if (!DEBUG_EDITOR) editorPanel.classList.add("hiddenPanel");
    pauseMenu.classList.add("hidden");
    gamePaused = false;
    hideTransition();
    missionCard.classList.add("hidden");
    hideDialogue();

    showEnvironment("JAGRO");
    applyJagroInteriorStaging();
    setClip("Nick", "Idle", true);
    setClip("Judy", "Idle", true);

    await sleep(800, runId);

    setClip("Nick", "Talking", true);
    showDialogue("NICK WILDE", "Alright, Nishu… this stop? Definitely less mission, more reward.");
    await sleep(330, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(240, runId);
    setClip("Judy", "Talking", true);
    showDialogue("JUDY HOPPS", "Hmm. Let me guess — strawberries?");
    await sleep(320, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Judy", "Idle", true);

    await sleep(240, runId);
    setClip("Nick", "Pointing", true);
    showDialogue("NICK WILDE", "Close. Their signature cheesecakes.");
    await sleep(320, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(220, runId);
    await playJagroCheesecakeHunt(runId);

    await sleep(240, runId);
    setClip("Judy", "Talking", true);
    showDialogue("JUDY HOPPS", "Ohhh. Now that is a very convincing birthday plan.");
    await sleep(330, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Judy", "Idle", true);

    await sleep(240, runId);
    setClip("Nick", "Talking", true);
    showDialogue("NICK WILDE", "See? I told you this mission had excellent taste.");
    await sleep(330, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(350, runId);
    showTransition("NEXT STOP", "VITO WOOD FIRED PIZZA", "Scene 03");
    await sleep(400, runId);
    await waitForAdvance(runId);
    hideTransition();

    setCinematicMode(false);
    cinematicRunning = false;
    showContinueHint(false);
    console.log("[FULL GAME] Scene 02 complete");
  } catch (error) {
    if (error instanceof Error && error.message === "CINEMATIC_CANCELLED") return;
    cinematicRunning = false;
    setCinematicMode(false);
    throw error;
  }
}

async function playVitoScene3Integrated() {
  stopNICScene(false);
  cinematicRunId += 1;
  const runId = cinematicRunId;
  cinematicRunning = true;

  try {
    setCinematicMode(true);
    if (!DEBUG_EDITOR) editorPanel.classList.add("hiddenPanel");
    pauseMenu.classList.add("hidden");
    gamePaused = false;
    hideTransition();
    missionCard.classList.add("hidden");
    hideDialogue();

    showEnvironment("VITO");
    applyVitoLockedStaging();
    setClip("Nick", "Idle", true);
    setClip("Judy", "Idle", true);

    await sleep(800, runId);

    const beats: Array<[ActorName, string, string, string, boolean]> = [
      ["Nick", "Talking", "NICK WILDE", "Dessert first, pizza second. Now that is proper birthday planning.", true],
      ["Judy", "Talking", "JUDY HOPPS", "You do realize most people do that the other way around?", true],
      ["Nick", "Talking", "NICK WILDE", "Most people lack vision, Carrots.", true],
      ["Judy", "Talking", "JUDY HOPPS", "Right. And I suppose this wood-fired pizza is part of the ‘mission’ too?", true],
      ["Nick", "Talking", "NICK WILDE", "Obviously. Very serious operation.", true],
      ["Judy", "Questioning", "JUDY HOPPS", "And after this?", true],
      ["Nick", "Talking", "NICK WILDE", "One more stop.", true],
      ["Judy", "Talking", "JUDY HOPPS", "You really planned the whole day, didn’t you?", true],
      ["Nick", "Talking", "NICK WILDE", "Maybe.", false],
    ];

    for (const [actor, clip, who, line, loop] of beats) {
      setClip(actor, clip, loop);
      showDialogue(who as "NICK WILDE" | "JUDY HOPPS", line);
      await sleep(300, runId);
      await waitForAdvance(runId);
      hideDialogue();
      setClip(actor, "Idle", true);
      await sleep(210, runId);

      if (line === "Obviously. Very serious operation.") {
        await playVitoPizzaBuilder(runId);
        await sleep(180, runId);
      }
    }

    showTransition("ONE MORE STOP", "SCOPE CINEMAS", "Colombo City Centre");
    await sleep(400, runId);
    await waitForAdvance(runId);
    hideTransition();

    setCinematicMode(false);
    cinematicRunning = false;
    showContinueHint(false);
    console.log("[FULL GAME] Scene 03 complete");
  } catch (error) {
    if (error instanceof Error && error.message === "CINEMATIC_CANCELLED") return;
    cinematicRunning = false;
    setCinematicMode(false);
    throw error;
  }
}

async function playCCCScene4() {
  stopNICScene(false);

  cinematicRunId += 1;
  const runId = cinematicRunId;
  cinematicRunning = true;

  try {
    setCinematicMode(true);

    if (!DEBUG_EDITOR) {
      editorPanel.classList.add("hiddenPanel");
    }

    birthdayFinale.classList.add("hidden");
    pauseMenu.classList.add("hidden");
    gamePaused = false;

    hideTransition();
    missionCard.classList.add("hidden");
    hideDialogue();

    showEnvironment("CCC");
    applyCCCLockedStaging();

    setClip("Nick", "Idle", true);
    setClip("Judy", "Idle", true);

    await sleep(900, runId);

    // Beat 1 — callback to Nick's "one more stop" tease at Vito.
    setClip("Judy", "Questioning", true);
    showDialogue(
      "JUDY HOPPS",
      "So… this is the mysterious ‘one more stop’?",
    );
    await sleep(350, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Judy", "Idle", true);

    await sleep(240, runId);

    setClip("Nick", "Talking", true);
    showDialogue(
      "NICK WILDE",
      "I prefer ‘carefully planned grand finale.’",
    );
    await sleep(340, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(240, runId);

    setClip("Judy", "Talking", true);
    showDialogue(
      "JUDY HOPPS",
      "Scope Cinemas. Okay… what are we watching?",
    );
    await sleep(340, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Judy", "Idle", true);

    await sleep(220, runId);
    await playCCCMovieScanner(runId);

    await sleep(240, runId);

    setClip("Nick", "Pointing", true);
    showDialogue(
      "NICK WILDE",
      "Right there.",
    );
    await sleep(300, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(240, runId);

    setClip("Judy", "Talking", true);
    showDialogue(
      "JUDY HOPPS",
      "PAW Patrol: The Dino Movie?",
    );
    await sleep(320, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Judy", "Idle", true);

    await sleep(240, runId);

    setClip("Nick", "Talking", true);
    showDialogue(
      "NICK WILDE",
      "Dinosaurs, puppies, air-conditioning. I’m not seeing a downside.",
    );
    await sleep(360, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(240, runId);

    setClip("Judy", "Talking", true);
    showDialogue(
      "JUDY HOPPS",
      "Cheesecake, pizza, and now a movie. You really did plan the whole thing.",
    );
    await sleep(380, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Judy", "Idle", true);

    await sleep(240, runId);

    setClip("Nick", "Talking", true);
    showDialogue(
      "NICK WILDE",
      "I told you. Surprisingly competent.",
    );
    await sleep(320, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(240, runId);

    setClip("Judy", "Talking", true);
    showDialogue(
      "JUDY HOPPS",
      "Don’t get used to hearing me say that.",
    );
    await sleep(330, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Judy", "Idle", true);

    await sleep(220, runId);

    setClip("Nick", "Talking", false);
    showDialogue(
      "NICK WILDE",
      "Too late.",
    );
    await sleep(290, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    // Small breathing beat before the final mission callback.
    await sleep(620, runId);

    setClip("Judy", "Questioning", true);
    showDialogue(
      "JUDY HOPPS",
      "So… mission over?",
    );
    await sleep(310, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Judy", "Idle", true);

    await sleep(220, runId);

    setClip("Nick", "Talking", false);
    showDialogue(
      "NICK WILDE",
      "For today.",
    );
    await sleep(280, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(220, runId);

    setClip("Judy", "Talking", true);
    showDialogue(
      "JUDY HOPPS",
      "That sounded suspicious.",
    );
    await sleep(300, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Judy", "Idle", true);

    await sleep(220, runId);

    setClip("Nick", "Talking", false);
    showDialogue(
      "NICK WILDE",
      "Good.",
    );
    await sleep(280, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(650, runId);

    setCinematicMode(false);
    cinematicRunning = false;
    showContinueHint(false);

    // The characters carried the story. Navii gets the final word.
    birthdayFinale.classList.remove("hidden");

    if (DEBUG_EDITOR) {
      editorPanel.classList.add("hiddenPanel");
    }

    console.log("[CCC] Scene 04 complete — birthday finale shown");
  } catch (error) {
    if (error instanceof Error && error.message === "CINEMATIC_CANCELLED") {
      return;
    }

    cinematicRunning = false;
    setCinematicMode(false);
    console.error("[CCC Scene 04 error]", error);
  }
}

async function runFullGame() {
  const sequenceId = ++fullGameSequenceId;

  try {
    birthdayFinale.classList.add("hidden");
    hideMiniGame();
    resetMissionProgress();

    await playNICScene1();
    if (sequenceId !== fullGameSequenceId) return;

    await playJagroScene2Integrated();
    if (sequenceId !== fullGameSequenceId) return;

    await playVitoScene3Integrated();
    if (sequenceId !== fullGameSequenceId) return;

    await playCCCScene4();
  } catch (error) {
    if (sequenceId !== fullGameSequenceId) return;
    console.error("[FULL GAME ERROR]", error);
    toast("Game sequence stopped — check console");
  }
}

function stopNICScene(
  reset = true,
) {
  cinematicRunId += 1;
  cinematicRunning = false;
  cancelActiveMiniGame();

  if (advanceRejecter) {
    const reject = advanceRejecter;
    advanceRejecter = null;
    reject(new Error("CINEMATIC_CANCELLED"));
  }

  waitingForAdvance = false;
  advanceResolver = null;
  showContinueHint(false);

  hideDialogue();
  missionCard.classList.add("hidden");
  transitionCard.classList.add("hidden");
  setCinematicMode(false);

  if (
    reset &&
    actors.has("Nick") &&
    actors.has("Judy")
  ) {
    showEnvironment("NIC");
    applyIdleStaging();

    setClip(
      "Nick",
      "Idle",
      true,
    );

    setClip(
      "Judy",
      "Idle",
      true,
    );
  }
}

/* ============================================================
   PLAYER UI EVENTS
============================================================ */

startMissionButton.onclick = async () => {
  if (!actors.has("Nick") || !actors.has("Judy")) return;

  await requestMobilePresentationMode();

  gameStarted = true;
  document.body.classList.add("gameHasStarted");
  updateOrientationGuard();

  gamePaused = false;
  startScreen.classList.add("hidden");
  pauseMenu.classList.add("hidden");
  birthdayFinale.classList.add("hidden");

  if (DEBUG_EDITOR) editorPanel.classList.remove("hiddenPanel");

  void runFullGame();
};

pauseButton.onclick = () => {
  togglePause();
};

resumeGameButton.onclick = () => {
  void requestMobilePresentationMode();
  setPaused(false);
};

restartGameButton.onclick = () => {
  void requestMobilePresentationMode();
  fullGameSequenceId += 1;
  gamePaused = false;
  pauseMenu.classList.add("hidden");
  birthdayFinale.classList.add("hidden");
  stopNICScene(false);
  showEnvironment("NIC");
  applyIdleStaging();
  void runFullGame();
};

replayFinaleButton.onclick = () => {
  void requestMobilePresentationMode();
  fullGameSequenceId += 1;
  birthdayFinale.classList.add("hidden");
  gameStarted = true;
  document.body.classList.add("gameHasStarted");
  updateOrientationGuard();

  gamePaused = false;
  stopNICScene(false);
  showEnvironment("NIC");
  applyIdleStaging();
  void runFullGame();
};

/* ============================================================
   UI EVENTS
============================================================ */

document
  .querySelectorAll<HTMLButtonElement>(
    "[data-animation-actor]",
  )
  .forEach((button) => {
    button.onclick = () => {
      stopNICScene(false);

      const actor = button.dataset.animationActor;
      const clip = button.dataset.animationClip;

      if (
        (actor === "Nick" || actor === "Judy") &&
        clip
      ) {
        /*
          Manual clip preview preserves current placement.
          No Kiss staging is invoked in the NIC scene.
      */

        setClip(
          actor,
          clip,
          true,
        );
      }
    };
  });

document
  .querySelectorAll<HTMLButtonElement>(
    "[data-select]",
  )
  .forEach((button) => {
    button.onclick = () => {
      const name = button.dataset.select;

      if (
        name === "Nick" ||
        name === "Judy"
      ) {
        selectActor(name);
      }
    };
  });






must<HTMLButtonElement>("#closeEditor").onclick = () => {
  editorPanel.classList.add("hiddenPanel");
};

must<HTMLButtonElement>("#clearSelection").onclick = () => {
  selectNode(null);
};

must<HTMLButtonElement>("#toolMove").onclick = () => {
  setTool("move");
};

must<HTMLButtonElement>("#toolRotate").onclick = () => {
  setTool("rotate");
};

must<HTMLButtonElement>("#toolScale").onclick = () => {
  setTool("scale");
};

must<HTMLButtonElement>("#idlePreset").onclick = () => {
  stopNICScene(false);
  applyIdleStaging();
  setClip("Nick", "Idle", true);
  setClip("Judy", "Idle", true);
};

must<HTMLButtonElement>("#jagroPreset").onclick = () => {
  if (!DEBUG_EDITOR) return;

  stopNICScene(false);
  showEnvironment("JAGRO");
  applyJagroInteriorStaging();
};

must<HTMLButtonElement>("#showNICDebug").onclick = () => {
  if (!DEBUG_EDITOR) return;

  stopNICScene(false);
  showEnvironment("NIC");
  applyIdleStaging();
  setClip("Nick", "Idle", true);
  setClip("Judy", "Idle", true);
};

must<HTMLButtonElement>("#showJagroDebug").onclick = () => {
  if (!DEBUG_EDITOR) return;

  enterJagroForEditing();
};




must<HTMLButtonElement>("#showVitoDebug").onclick = () => {
  if (!DEBUG_EDITOR) return;
  enterVitoForEditing();
};

must<HTMLButtonElement>("#vitoPreset").onclick = () => {
  if (!DEBUG_EDITOR) return;
  showEnvironment("VITO");
  applyVitoLockedStaging();
};

must<HTMLButtonElement>("#vitoCamera").onclick = () => {
  if (!DEBUG_EDITOR) return;
  showEnvironment("VITO");
  applyVitoLockedCamera();
};


must<HTMLButtonElement>("#showCCCDebug").onclick = () => {
  if (!DEBUG_EDITOR) return;
  enterCCCForEditing();
};

must<HTMLButtonElement>("#cccPreset").onclick = () => {
  if (!DEBUG_EDITOR) return;
  showEnvironment("CCC");
  applyCCCLockedStaging();
};

must<HTMLButtonElement>("#cccCamera").onclick = () => {
  if (!DEBUG_EDITOR) return;
  showEnvironment("CCC");
  applyCCCLockedCamera();
};

must<HTMLButtonElement>("#savedCamera").onclick = () => {
  applyCamera(IDLE_CAMERA);
};

must<HTMLButtonElement>("#actorsCamera").onclick = () => {
  if (activeEnvironment === "JAGRO") {
    applyJagroActorCamera();
    return;
  }

  const nick = actors.get("Nick");
  const judy = actors.get("Judy");

  if (!nick || !judy) return;

  const target = new Vector3(
    (
      nick.placementRoot.position.x +
      judy.placementRoot.position.x
    ) / 2,
    1.05,
    (
      nick.placementRoot.position.z +
      judy.placementRoot.position.z
    ) / 2,
  );

  camera.target.copyFrom(target);
  camera.radius = 4.1;
  camera.alpha = 1.5708;
  camera.beta = 1.42;
  camera.fov = 0.7;
};

must<HTMLButtonElement>("#copyConfig").onclick = async () => {
  const value = JSON.stringify(
    buildConfig(),
    null,
    2,
  );

  configOutput.value = value;

  try {
    await navigator.clipboard.writeText(value);
    toast("Config copied");
  } catch {
    configOutput.select();
    toast("Select and copy");
  }
};

must<HTMLButtonElement>("#showAll").onclick = () => {
  const meshes =
    activeEnvironment === "NIC"
      ? nicMeshes
      : activeEnvironment === "JAGRO"
        ? jagroMeshes
        : activeEnvironment === "VITO"
          ? vitoMeshes
          : cccMeshes;

  for (const mesh of meshes) {
    mesh.setEnabled(true);
  }

  renderConfig();
};

/* ============================================================
   KEYBOARD
============================================================ */

window.addEventListener("keydown", (event) => {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  ) {
    return;
  }

  const key = event.key.toLowerCase();

  if (key === "f2" && DEBUG_EDITOR) {
    event.preventDefault();
    editorPanel.classList.toggle("hiddenPanel");
    return;
  }

  if (key === " " || key === "enter") {
    event.preventDefault();

    if (!gameStarted && !startScreen.classList.contains("hidden")) {
      startMissionButton.click();
      return;
    }

    advanceGame();
    return;
  }

  if (key === "escape") {
    event.preventDefault();

    if (gameStarted) {
      togglePause();
    }

    return;
  }

  /*
    Editor shortcuts exist only in explicit debug mode:
      /?editor=1
  */
  if (!DEBUG_EDITOR) {
    return;
  }

  switch (key) {
    case "w":
      setTool("move");
      break;

    case "e":
      setTool("rotate");
      break;

    case "r":
      setTool("scale");
      break;

    case "1":
      selectActor("Nick");
      break;

    case "2":
      selectActor("Judy");
      break;
  }
});

/* ============================================================
   LOOP / DEBUG
============================================================ */

let lastDebug = 0;

engine.runRenderLoop(() => {
  scene.render();

  const now = performance.now();

  if (now - lastDebug > 180) {
    debugReadout.textContent =
      `FPS ${engine.getFps().toFixed(1)}\n` +
      `Nick ${actors.get("Nick")?.activeClip ?? "loading"}\n` +
      `Judy ${actors.get("Judy")?.activeClip ?? "loading"}\n` +
      `cinematic ${cinematicRunning ? "PLAYING" : "idle"}\n` +
      `environment ${activeEnvironment}\n` +
      `selected ${selectedNode?.name ?? "none"}`;

    if (
      selectedNode &&
      !(document.activeElement instanceof HTMLInputElement)
    ) {
      syncInputs();
    }

    lastDebug = now;
  }
});

window.addEventListener("resize", () => {
  updateOrientationGuard();
  engine.resize();
});



/* ============================================================
   IMMERSIVE 16:9 MOBILE GAME SHELL
   - Keeps the authored game inside a centered 16:9 stage.
   - Requests fullscreen on the black host, not the document.
   - Adds a friendly Full Screen / Exit Full Screen button.
   - Preserves the debug editor unchanged.
   - iOS/Safari fallback explains Add to Home Screen when the
     Fullscreen API is not available.
============================================================ */

const fullscreenButton =
  document.querySelector<HTMLButtonElement>("#fullscreenButton");

const fullscreenLabel =
  fullscreenButton?.querySelector<HTMLElement>(".fullscreenLabel") ?? null;

const fullscreenGuide =
  document.querySelector<HTMLDivElement>("#fullscreenGuide");

const fullscreenGuideText =
  document.querySelector<HTMLDivElement>("#fullscreenGuideText");

const closeFullscreenGuide =
  document.querySelector<HTMLButtonElement>("#closeFullscreenGuide");

function isStandaloneDisplayMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(
      (navigator as Navigator & {
        standalone?: boolean;
      }).standalone
    )
  );
}

function isAppleMobileBrowser() {
  const ua = navigator.userAgent;
  const appleDevice =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return appleDevice;
}

function buildImmersiveGameShell() {
  if (DEBUG_EDITOR) return;

  let host = document.querySelector<HTMLDivElement>("#immersiveHost");
  let stage = document.querySelector<HTMLDivElement>("#gameViewport16x9");

  if (!host) {
    host = document.createElement("div");
    host.id = "immersiveHost";
    host.setAttribute("aria-label", "Operation Perfect Date game viewport");
  }

  if (!stage) {
    stage = document.createElement("div");
    stage.id = "gameViewport16x9";
  }

  if (!host.parentElement) {
    document.body.prepend(host);
  }

  if (!stage.parentElement) {
    host.appendChild(stage);
  }

  const keepOutside = new Set<Element>(
    [
      host,
      document.querySelector("#rotateDevice"),
      document.querySelector("#editorPanel"),
    ].filter((node): node is Element => Boolean(node))
  );

  Array.from(document.body.children).forEach((child) => {
    if (keepOutside.has(child)) return;
    if (child.tagName === "SCRIPT") return;
    stage.appendChild(child);
  });

  document.body.classList.add("immersiveGame");
}

function immersiveHostElement() {
  return (
    document.querySelector<HTMLElement>("#immersiveHost") ??
    document.documentElement
  );
}

function showFullscreenGuide(message: string) {
  if (!fullscreenGuide || !fullscreenGuideText) return;

  fullscreenGuideText.textContent = message;
  fullscreenGuide.classList.remove("hidden");
}

function hideFullscreenGuide() {
  fullscreenGuide?.classList.add("hidden");
}

async function lockLandscapeIfPossible() {
  try {
    const orientation =
      screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };

    if (orientation?.lock) {
      await orientation.lock("landscape");
    }
  } catch (error) {
    console.info("[Immersive] Landscape lock unavailable", error);
  }
}

function updateFullscreenButton() {
  if (!fullscreenButton || !fullscreenLabel) return;

  if (DEBUG_EDITOR) {
    fullscreenButton.classList.add("hidden");
    return;
  }

  const fullscreenActive = Boolean(
    document.fullscreenElement ||
    (document as Document & {
      webkitFullscreenElement?: Element | null;
    }).webkitFullscreenElement
  );

  if (isStandaloneDisplayMode()) {
    fullscreenButton.classList.add("standaloneMode");
    fullscreenLabel.textContent = "Game Mode";
    fullscreenButton.setAttribute(
      "aria-label",
      "Standalone game mode is active"
    );
    return;
  }

  fullscreenButton.classList.remove("standaloneMode");
  fullscreenLabel.textContent =
    fullscreenActive ? "Exit Full Screen" : "Full Screen";

  fullscreenButton.setAttribute(
    "aria-label",
    fullscreenActive ? "Exit full screen" : "Enter full screen"
  );
}

async function enterImmersiveFullscreen() {
  hideFullscreenGuide();

  if (isStandaloneDisplayMode()) {
    await lockLandscapeIfPossible();
    updateFullscreenButton();
    return;
  }

  const host = immersiveHostElement() as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };

  try {
    if (host.requestFullscreen) {
      await host.requestFullscreen({
        navigationUI: "hide",
      } as FullscreenOptions);
    } else if (host.webkitRequestFullscreen) {
      await host.webkitRequestFullscreen();
    } else {
      throw new Error("Fullscreen API unavailable");
    }

    await lockLandscapeIfPossible();
  } catch (error) {
    console.info("[Immersive] Fullscreen request unavailable", error);

    if (isAppleMobileBrowser()) {
      showFullscreenGuide(
        "Safari is keeping its browser bars visible. For true full screen on iPhone or iPad, tap Share, choose Add to Home Screen, then open Operation: Perfect Date from the Home Screen."
      );
    } else {
      showFullscreenGuide(
        "Your browser did not allow full screen. Rotate to landscape and use the browser's full-screen or install-to-home-screen option for the cleanest view."
      );
    }
  }

  window.setTimeout(() => {
    updateFullscreenButton();
    window.dispatchEvent(new Event("resize"));
  }, 100);
}

async function exitImmersiveFullscreen() {
  try {
    if (document.exitFullscreen && document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    const webkitDocument = document as Document & {
      webkitExitFullscreen?: () => void;
      webkitFullscreenElement?: Element | null;
    };

    if (
      webkitDocument.webkitExitFullscreen &&
      webkitDocument.webkitFullscreenElement
    ) {
      webkitDocument.webkitExitFullscreen();
    }
  } catch (error) {
    console.info("[Immersive] Exit fullscreen failed", error);
  }
}

async function toggleImmersiveFullscreen(event?: Event) {
  event?.stopPropagation();

  if (isStandaloneDisplayMode()) {
    await lockLandscapeIfPossible();
    return;
  }

  const fullscreenActive = Boolean(
    document.fullscreenElement ||
    (document as Document & {
      webkitFullscreenElement?: Element | null;
    }).webkitFullscreenElement
  );

  if (fullscreenActive) {
    await exitImmersiveFullscreen();
  } else {
    await enterImmersiveFullscreen();
  }
}

buildImmersiveGameShell();

fullscreenButton?.addEventListener(
  "click",
  (event) => {
    void toggleImmersiveFullscreen(event);
  }
);

closeFullscreenGuide?.addEventListener(
  "click",
  (event) => {
    event.stopPropagation();
    hideFullscreenGuide();
  }
);

fullscreenGuide?.addEventListener(
  "click",
  (event) => {
    if (event.target === fullscreenGuide) {
      hideFullscreenGuide();
    }
  }
);

document.addEventListener(
  "fullscreenchange",
  () => {
    updateFullscreenButton();
    window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 80);
  }
);

document.addEventListener(
  "webkitfullscreenchange",
  (() => {
    updateFullscreenButton();
    window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 80);
  }) as EventListener
);

window.addEventListener(
  "orientationchange",
  () => {
    window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 120);
  }
);

updateFullscreenButton();



const startFullscreenButton =
  document.querySelector<HTMLButtonElement>("#startFullscreenButton");

startFullscreenButton?.addEventListener(
  "click",
  (event) => {
    event.stopPropagation();
    void enterImmersiveFullscreen();
  }
);

/* ============================================================
   BOOT
============================================================ */

async function boot() {
  try {
    await loadNIC();
    await loadJagro();
    await loadVito();
    await loadCCC();
    await loadCharacters();

    showEnvironment("CCC");

    applyCCCLockedStaging();

    setClip(
      "Nick",
      "Idle",
      true,
    );

    setClip(
      "Judy",
      "Idle",
      true,
    );

    renderConfig();

    loading.classList.add("hidden");

    if (DEBUG_EDITOR) {
      editorPanel.classList.remove("hiddenPanel");
      startScreen.classList.add("hidden");
      toast("Scene 03 editor ready · F2 toggles editor");
    } else {
      editorPanel.classList.add("hiddenPanel");
      startScreen.classList.remove("hidden");
    }

    console.log(
      "[READY] Vito Scene 03 staging loaded",
    );
  } catch (error) {
    console.error(
      "[BOOT FAILED]",
      error,
    );

    loadingText.textContent =
      error instanceof Error
        ? `ERROR: ${error.message}`
        : "Failed to load scene";
  }
}

void boot();
