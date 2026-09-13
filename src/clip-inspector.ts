import "./clip-inspector.css";

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color4, Color3 } from "@babylonjs/core/Maths/math.color";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Node } from "@babylonjs/core/node";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";

import "@babylonjs/loaders/glTF";

const CLIPS = [
  "/assets/animations/nick/Nick_Idle.glb",
  "/assets/animations/nick/Nick_Talking.glb",
  "/assets/animations/nick/Nick_Pointing.glb",
  "/assets/animations/nick/Nick_Walking.glb",
  "/assets/animations/nick/Nick_Run_Look_Back.glb",
  "/assets/animations/nick/Nick_Kiss.glb",

  "/assets/animations/judy/Judy_Idle.glb",
  "/assets/animations/judy/Judy_Talking.glb",
  "/assets/animations/judy/Judy_Questioning.glb",
  "/assets/animations/judy/Judy_Walking.glb",
  "/assets/animations/judy/Judy_Run.glb",
  "/assets/animations/judy/Judy_Kiss.glb",
];

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

const canvas = must<HTMLCanvasElement>("#renderCanvas");
const select = must<HTMLSelectElement>("#clipSelect");
const status = must<HTMLParagraphElement>("#status");
const debug = must<HTMLPreElement>("#debug");

const rotX = must<HTMLInputElement>("#rotX");
const rotY = must<HTMLInputElement>("#rotY");
const rotZ = must<HTMLInputElement>("#rotZ");
const scaleInput = must<HTMLInputElement>("#scale");
const offsetY = must<HTMLInputElement>("#offsetY");

for (const path of CLIPS) {
  const option = document.createElement("option");
  option.value = path;
  option.textContent = path.split("/").pop() ?? path;
  select.appendChild(option);
}

const engine = new Engine(canvas, true);

const scene = new Scene(engine);
scene.clearColor = new Color4(0.035, 0.045, 0.065, 1);

const camera = new ArcRotateCamera(
  "Camera",
  Math.PI / 2,
  Math.PI / 2.5,
  5,
  new Vector3(0, 1, 0),
  scene,
);

camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 0.4;
camera.upperRadiusLimit = 50;
camera.wheelPrecision = 35;

const light = new HemisphericLight(
  "Light",
  new Vector3(0, 1, 0),
  scene,
);
light.intensity = 1.35;

const ground = MeshBuilder.CreateGround(
  "Ground",
  { width: 10, height: 10 },
  scene,
);

const groundMat = new StandardMaterial("GroundMat", scene);
groundMat.diffuseColor = new Color3(0.14, 0.16, 0.20);
groundMat.specularColor = new Color3(0, 0, 0);
ground.material = groundMat;

let correctionRoot: TransformNode | null = null;
let loadedMeshes: AbstractMesh[] = [];
let animationGroups: AnimationGroup[] = [];
let playing = true;

function topNodes(
  meshes: AbstractMesh[],
  transforms: TransformNode[],
): (TransformNode | AbstractMesh)[] {
  const all: (TransformNode | AbstractMesh)[] = [...transforms, ...meshes];
  const set = new Set<Node>(all);

  return all.filter((n) => !n.parent || !set.has(n.parent));
}

function bounds(meshes: AbstractMesh[]) {
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  let count = 0;

  for (const mesh of meshes) {
    try {
      mesh.computeWorldMatrix(true);

      try {
        mesh.refreshBoundingInfo(true, true);
      } catch {}

      const bb = mesh.getBoundingInfo().boundingBox;
      const a = bb.minimumWorld;
      const b = bb.maximumWorld;

      if (
        ![
          a.x, a.y, a.z,
          b.x, b.y, b.z,
        ].every(Number.isFinite)
      ) {
        continue;
      }

      const size = b.subtract(a);

      if (size.lengthSquared() < 1e-10) continue;

      min = Vector3.Minimize(min, a);
      max = Vector3.Maximize(max, b);
      count++;
    } catch {}
  }

  if (!count) return null;

  return {
    min,
    max,
    size: max.subtract(min),
    center: min.add(max).scale(0.5),
  };
}

function frameActor() {
  const b = bounds(loadedMeshes);

  if (!b) {
    camera.target.set(0, 1, 0);
    camera.radius = 5;
    return;
  }

  camera.target.copyFrom(b.center);

  const largest = Math.max(
    b.size.x,
    b.size.y,
    b.size.z,
  );

  camera.radius = Math.max(2.5, largest * 1.8);

  console.log("[Inspector] bounds", b);
}

function applyCorrection() {
  if (!correctionRoot) return;

  correctionRoot.rotationQuaternion =
    Quaternion.FromEulerAngles(
      Number(rotX.value) * Math.PI / 180,
      Number(rotY.value) * Math.PI / 180,
      Number(rotZ.value) * Math.PI / 180,
    );

  const s = Number(scaleInput.value);
  correctionRoot.scaling.setAll(s);
  correctionRoot.position.y = Number(offsetY.value);

  frameActor();
}

function disposeCurrent() {
  for (const g of animationGroups) {
    g.stop();
    g.dispose();
  }

  animationGroups = [];

  if (correctionRoot) {
    correctionRoot.dispose(false, true);
    correctionRoot = null;
  }

  loadedMeshes = [];
}

async function loadSelected() {
  disposeCurrent();

  const path = select.value;

  status.textContent = `Loading ${path.split("/").pop()}…`;

  const slash = path.lastIndexOf("/");
  const rootUrl = path.slice(0, slash + 1);
  const fileName = path.slice(slash + 1);

  const result = await SceneLoader.ImportMeshAsync(
    "",
    rootUrl,
    fileName,
    scene,
  );

  correctionRoot = new TransformNode(
    "CLIP_CORRECTION_ROOT",
    scene,
  );

  for (const node of topNodes(
    result.meshes,
    result.transformNodes,
  )) {
    node.parent = correctionRoot;
  }

  loadedMeshes = result.meshes;
  animationGroups = result.animationGroups;

  correctionRoot.rotationQuaternion = Quaternion.Identity();

  rotX.value = "0";
  rotY.value = "0";
  rotZ.value = "0";
  scaleInput.value = "1";
  offsetY.value = "0";

  for (const group of animationGroups) {
    group.start(
      true,
      1,
      group.from,
      group.to,
      false,
    );
  }

  playing = true;
  must<HTMLButtonElement>("#playPause").textContent = "Pause";

  scene.render();
  frameActor();

  const b = bounds(loadedMeshes);

  debug.textContent = JSON.stringify(
    {
      file: path,
      meshes: result.meshes.map((m) => ({
        name: m.name,
        vertices: (() => {
          try {
            return m.getTotalVertices();
          } catch {
            return -1;
          }
        })(),
      })),
      skeletons: result.skeletons.length,
      animations: result.animationGroups.map((g) => ({
        name: g.name,
        from: g.from,
        to: g.to,
      })),
      bounds: b
        ? {
            min: b.min.asArray(),
            max: b.max.asArray(),
            size: b.size.asArray(),
          }
        : null,
    },
    null,
    2,
  );

  status.textContent = `${fileName} loaded ✓`;

  console.log("[Inspector] loaded", {
    path,
    result,
    bounds: b,
  });
}

must<HTMLButtonElement>("#loadClip").onclick = () => void loadSelected();

must<HTMLButtonElement>("#playPause").onclick = () => {
  if (!animationGroups.length) return;

  if (playing) {
    for (const g of animationGroups) g.pause();
    playing = false;
    must<HTMLButtonElement>("#playPause").textContent = "Play";
  } else {
    for (const g of animationGroups) g.play(true);
    playing = true;
    must<HTMLButtonElement>("#playPause").textContent = "Pause";
  }
};

must<HTMLButtonElement>("#restart").onclick = () => {
  for (const g of animationGroups) {
    g.stop();
    g.start(true, 1, g.from, g.to, false);
  }

  playing = true;
  must<HTMLButtonElement>("#playPause").textContent = "Pause";
};

must<HTMLButtonElement>("#frameActor").onclick = frameActor;
must<HTMLButtonElement>("#applyCorrection").onclick = applyCorrection;

must<HTMLButtonElement>("#resetCorrection").onclick = () => {
  rotX.value = "0";
  rotY.value = "0";
  rotZ.value = "0";
  scaleInput.value = "1";
  offsetY.value = "0";
  applyCorrection();
};

select.addEventListener("change", () => {
  void loadSelected();
});

engine.runRenderLoop(() => {
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});

void loadSelected();
