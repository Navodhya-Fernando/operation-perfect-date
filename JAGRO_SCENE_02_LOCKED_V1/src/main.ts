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
const missionLocationEl = must<HTMLDivElement>("#missionLocation");
const startScreen = must<HTMLDivElement>("#startScreen");
const startMissionButton = must<HTMLButtonElement>("#startMission");
const continueHint = must<HTMLDivElement>("#continueHint");
const pauseMenu = must<HTMLDivElement>("#pauseMenu");
const pauseButton = must<HTMLButtonElement>("#pauseButton");
const resumeGameButton = must<HTMLButtonElement>("#resumeGame");
const restartGameButton = must<HTMLButtonElement>("#restartGame");

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

engine.setHardwareScalingLevel(
  window.devicePixelRatio > 1 ? 1.25 : 1,
);

console.log("=======================================");
console.log("OPERATION: PERFECT DATE — NIC CINEMATIC");
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
  environment: "NIC" | "JAGRO";
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
    scaling: [3, 3, 3],
  },

  Judy: {
    position: [-1.177, 0, 4.847],
    rotation: [0, -0.4363, 0],
    scaling: [1.1, 1.1, 1],
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
    scaling: [2.5, 2.5, 2.5],
  },

  Judy: {
    position: [0.4562, 0, -19.8554],
    rotation: [0, -0.4363, 0],
    scaling: [1, 1, 1],
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
let activeEnvironment: "NIC" | "JAGRO" = "NIC";

let selectedNode:
  | TransformNode
  | AbstractMesh
  | null = null;

let selectedActorName: ActorName | null = null;

let cinematicRunId = 0;
let cinematicRunning = false;

let gameStarted = false;
let gamePaused = false;
let waitingForAdvance = false;
let advanceResolver: (() => void) | null = null;
let advanceRejecter: ((error: Error) => void) | null = null;

const DEBUG_EDITOR =
  new URLSearchParams(window.location.search).get("editor") === "1";

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

function showEnvironment(name: "NIC" | "JAGRO") {
  activeEnvironment = name;

  const showNIC = name === "NIC";

  for (const mesh of nicMeshes) {
    mesh.setEnabled(showNIC);
  }

  for (const mesh of jagroMeshes) {
    mesh.setEnabled(!showNIC);
  }

  missionLocationEl.textContent =
    name === "NIC"
      ? "01 · NATIONAL INNOVATION CENTRE"
      : "02 · SIMPLY STRAWBERRIES BY JAGRO";

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
  actorName: ActorName | null = null,
) {
  highlight.removeAllMeshes();

  selectedNode = node;
  selectedActorName = actorName;

  if (!node) {
    gizmos?.attachToNode(null);
    selectedLabel.textContent = "Nothing selected";
    syncInputs();
    return;
  }

  gizmos?.attachToNode(node);

  selectedLabel.textContent =
    actorName
      ? `${actorName} · ${node.name}`
      : node.name;

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
    selectNode(
      actor.placementRoot,
      name,
    );
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
      activeEnvironment === "NIC"
        ? nicMeshes
            .filter((mesh) => !mesh.isEnabled())
            .map((mesh) => mesh.name)
        : jagroMeshes
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

async function playJagroScene2() {
  stopNICScene(false);

  cinematicRunId += 1;
  const runId = cinematicRunId;
  cinematicRunning = true;

  try {
    setCinematicMode(true);

    if (!DEBUG_EDITOR) {
      editorPanel.classList.add("hiddenPanel");
    }

    pauseMenu.classList.add("hidden");
    gamePaused = false;

    hideTransition();
    missionCard.classList.add("hidden");
    hideDialogue();

    showEnvironment("JAGRO");
    applyJagroInteriorStaging();

    setClip("Nick", "Idle", true);
    setClip("Judy", "Idle", true);

    await sleep(900, runId);

    setClip("Nick", "Talking", true);
    showDialogue(
      "NICK WILDE",
      "Alright, Nishu… this stop? Definitely less mission, more reward.",
    );
    await sleep(350, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(300, runId);

    setClip("Judy", "Talking", true);
    showDialogue(
      "JUDY HOPPS",
      "Hmm. Let me guess — strawberries?",
    );
    await sleep(350, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Judy", "Idle", true);

    await sleep(300, runId);

    setClip("Nick", "Pointing", true);
    showDialogue(
      "NICK WILDE",
      "Close. Their signature cheesecakes.",
    );
    await sleep(350, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(300, runId);

    setClip("Judy", "Talking", true);
    showDialogue(
      "JUDY HOPPS",
      "Ohhh. Now that is a very convincing birthday plan.",
    );
    await sleep(350, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Judy", "Idle", true);

    await sleep(300, runId);

    setClip("Nick", "Talking", true);
    showDialogue(
      "NICK WILDE",
      "See? I told you this mission had excellent taste.",
    );
    await sleep(350, runId);
    await waitForAdvance(runId);
    hideDialogue();
    setClip("Nick", "Idle", true);

    await sleep(450, runId);

    showTransition(
      "SCENE 02 COMPLETE",
      "SIMPLY STRAWBERRIES",
      "Signature cheesecakes unlocked",
    );

    await sleep(450, runId);
    await waitForAdvance(runId);

    hideTransition();
    setCinematicMode(false);
    cinematicRunning = false;
    showContinueHint(false);

    if (DEBUG_EDITOR) {
      editorPanel.classList.remove("hiddenPanel");
    }

    console.log("[JAGRO] scene 02 complete");
  } catch (error) {
    if (error instanceof Error && error.message === "CINEMATIC_CANCELLED") {
      return;
    }

    cinematicRunning = false;
    setCinematicMode(false);
    console.error("[JAGRO scene 02 error]", error);
  }
}

function stopNICScene(
  reset = true,
) {
  cinematicRunId += 1;
  cinematicRunning = false;

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

startMissionButton.onclick = () => {
  if (!actors.has("Nick") || !actors.has("Judy")) {
    return;
  }

  gameStarted = true;
  gamePaused = false;

  startScreen.classList.add("hidden");
  pauseMenu.classList.add("hidden");

  if (DEBUG_EDITOR) {
    editorPanel.classList.remove("hiddenPanel");
  }

  void playJagroScene2();
};

pauseButton.onclick = () => {
  togglePause();
};

resumeGameButton.onclick = () => {
  setPaused(false);
};

restartGameButton.onclick = () => {
  gamePaused = false;
  pauseMenu.classList.add("hidden");

  stopNICScene(true);

  cinematicRunId += 1;

  void playJagroScene2();
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
      : jagroMeshes;

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
  engine.resize();
});

/* ============================================================
   BOOT
============================================================ */

async function boot() {
  try {
    await loadNIC();
    await loadJagro();
    await loadCharacters();

    showEnvironment("JAGRO");

    applyJagroInteriorStaging();

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

    applyCamera(
      JAGRO_INTERIOR_CAMERA,
    );

    renderConfig();

    loading.classList.add("hidden");

    if (DEBUG_EDITOR) {
      editorPanel.classList.remove("hiddenPanel");
      toast("Debug editor enabled");
    } else {
      editorPanel.classList.add("hiddenPanel");
    }

    startScreen.classList.remove("hidden");

    console.log(
      "[READY] Jagro Scene 02 loaded",
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
