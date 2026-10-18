import { ArenaArt } from "./arena-art";
import { CharacterModels, type CharacterVisual } from "./character-models";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RegisterRay } from "@babylonjs/core/Culling/ray.pure";
import type { Arena, Content, PlayerView, Pos, Snapshot } from "./protocol";
import initialContent from "../../data/game.json";

type Actor = {
  root: TransformNode;
  body: TransformNode;
  left: TransformNode;
  right: TransformNode;
  ring: Mesh;
  aura: Mesh;
  shield: Mesh;
  label: HTMLDivElement;
  lastPos: Vector3;
  health: number;
  flash: number;
  visual: CharacterVisual | null;
  labelHtml: string;
};
export class ArenaRenderer {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  private models: CharacterModels;
  private arenaArt: ArenaArt;
  private actors = new Map<number, Actor>();
  private areaMeshes = new Map<number, Mesh>();
  private materials = new Map<string, StandardMaterial>();
  private placement: Mesh;
  private content: Content | null = null;
  private frames: { state: Snapshot; at: number }[] = [];
  private snapFocus = true;
  private ground: Mesh;
  private court: TransformNode | null = null;
  private arena: Arena = initialContent.maps.shattered_court;
  private flagMeshes = new Map<number, TransformNode>();
  onPick: (id: number | null, point: Pos | null) => void = () => {};
  cursor: Pos | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    RegisterRay();
    this.engine = new Engine(canvas, true, {
      stencil: true,
      preserveDrawingBuffer: false,
    });
    const quality = Number(localStorage.getItem("warshard.quality"));
    this.engine.setHardwareScalingLevel(
      [1, 1.5, 2].includes(quality)
        ? quality
        : Math.max(1, devicePixelRatio / 1.5),
    );
    this.scene = new Scene(this.engine);
    this.models = new CharacterModels(this.scene);
    this.arenaArt = new ArenaArt(this.scene);
    this.scene.clearColor = new Color4(0.035, 0.065, 0.083, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.012;
    this.scene.fogColor = new Color3(0.045, 0.082, 0.101);
    this.camera = new ArcRotateCamera(
      "camera",
      -Math.PI / 2,
      0.55,
      39,
      new Vector3(0, 0, 0),
      this.scene,
    );
    this.camera.fov = 0.8;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 120;
    const ambient = new HemisphericLight(
      "sky",
      new Vector3(0.1, 1, 0.25),
      this.scene,
    );
    ambient.intensity = 0.85;
    ambient.groundColor = new Color3(0.08, 0.13, 0.16);
    const sun = new DirectionalLight(
      "moon",
      new Vector3(-0.4, -1, 0.35),
      this.scene,
    );
    sun.intensity = 1.5;
    sun.diffuse = new Color3(0.77, 0.86, 0.83);
    this.ground = this.box("pick-ground", 28, 0.3, 20, 0, -0.25, 0, "#243438");
    this.ground.isPickable = true;
    this.buildCourt(this.arena);
    this.placement = this.ring("placement", 5.4, "#e7c783");
    this.placement.position.y = 0.04;
    this.placement.setEnabled(false);
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }
  pointAt(clientX: number, clientY: number) {
    this.scene.updateTransformMatrix();
    const rect = this.canvas.getBoundingClientRect();
    const pick = this.scene.pick(
      clientX - rect.left,
      clientY - rect.top,
      (m) => m === this.ground,
    );
    this.cursor = pick?.pickedPoint
      ? {
          x: Math.round(pick.pickedPoint.x * 1000),
          z: Math.round(pick.pickedPoint.z * 1000),
        }
      : null;
  }
  pickAt(clientX: number, clientY: number) {
    this.scene.updateTransformMatrix();
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const pick = this.scene.pick(
      x,
      y,
      (m) => m === this.ground || typeof m.metadata?.playerId === "number",
    );
    let id: number | null = null;
    if (typeof pick?.pickedMesh?.metadata?.playerId === "number")
      id = pick.pickedMesh.metadata.playerId as number;
    const floor = this.scene.pick(x, y, (m) => m === this.ground);
    const point = floor?.pickedPoint
      ? {
          x: Math.round(floor.pickedPoint.x * 1000),
          z: Math.round(floor.pickedPoint.z * 1000),
        }
      : null;
    this.onPick(id, point);
  }
  project(pos: Pos, height = 2.5) {
    const screen = Vector3.Project(
      new Vector3(pos.x / 1000, height, pos.z / 1000),
      Matrix.IdentityReadOnly,
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(
        this.engine.getRenderWidth(),
        this.engine.getRenderHeight(),
      ),
    );
    return {
      x: (screen.x * this.canvas.clientWidth) / this.engine.getRenderWidth(),
      y: (screen.y * this.canvas.clientHeight) / this.engine.getRenderHeight(),
    };
  }
  cue(id: number, melee: boolean) {
    this.actors.get(id)?.visual?.cue(melee);
  }
  private resize() {
    this.engine.resize();
  }
  private material(color: string, glow = false, alpha = 1) {
    const key = `${color}/${glow}/${alpha}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new StandardMaterial(key, this.scene);
      material.diffuseColor = Color3.FromHexString(color);
      material.specularColor = new Color3(0.16, 0.2, 0.18);
      material.alpha = alpha;
      if (glow)
        material.emissiveColor = Color3.FromHexString(color).scale(0.75);
      this.materials.set(key, material);
    }
    return material;
  }
  private box(
    name: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    color: string,
    parent?: TransformNode,
  ) {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width, height, depth },
      this.scene,
    );
    mesh.position.set(x, y, z);
    mesh.material = this.material(color);
    mesh.isPickable = false;
    if (parent) mesh.parent = parent;
    return mesh;
  }
  private cylinder(
    name: string,
    diameter: number,
    height: number,
    x: number,
    y: number,
    z: number,
    color: string,
    parent?: TransformNode,
    top?: number,
  ) {
    const mesh = MeshBuilder.CreateCylinder(
      name,
      { diameter, diameterTop: top ?? diameter, height, tessellation: 8 },
      this.scene,
    );
    mesh.position.set(x, y, z);
    mesh.material = this.material(color);
    mesh.isPickable = false;
    if (parent) mesh.parent = parent;
    return mesh;
  }
  private ring(
    name: string,
    diameter: number,
    color: string,
    thickness = 0.035,
  ) {
    const mesh = MeshBuilder.CreateTorus(
      name,
      { diameter, thickness, tessellation: 64 },
      this.scene,
    );
    mesh.material = this.material(color, true);
    mesh.isPickable = false;
    return mesh;
  }
  private buildCourt(arena: Arena) {
    this.court?.dispose(false);
    const existing = new Set(this.scene.meshes);
    const hx = arena.half_x / 1000;
    const hz = arena.half_z / 1000;
    this.ground.scaling.set(hx / 14, 1, hz / 10);
    for (let x = -hx + 1; x <= hx - 1; x += 2)
      for (let z = -hz + 1; z <= hz - 1; z += 2) {
        const n = Math.abs((x * 13 + z * 7) % 5);
        this.box(
          "flagstone",
          1.96,
          0.08,
          1.96,
          x,
          -0.055 + n * 0.002,
          z,
          ["#404b5f", "#485468", "#354258", "#3d4a60", "#455368"][n],
        );
      }
    this.cylinder("central-dais", 7.5, 0.12, 0, 0.03, 0, "#405152");
    for (const d of [4.4, 6.5, 7.3]) {
      const rune = this.ring("court-inscription", d, "#9a9d76", 0.025);
      rune.position.y = 0.1;
    }
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const mark = this.box(
        "rune",
        0.08,
        0.015,
        0.55,
        Math.cos(angle) * 2.8,
        0.115,
        Math.sin(angle) * 2.8,
        "#aaa47d",
      );
      mark.rotation.y = -angle;
    }
    for (const z of [-hz - 0.4, hz + 0.4]) {
      this.box("parapet", hx * 2 + 1.2, 0.8, 0.65, 0, 0.2, z, "#273a3d");
      this.box("coping", hx * 2 + 1.5, 0.12, 0.85, 0, 0.66, z, "#56605a");
      for (let x = -hx; x <= hx; x += 4)
        this.box("wall-tooth", 0.7, 1.2, 0.9, x, 0.65, z, "#3c4d4d");
    }
    for (const x of [-hx - 0.4, hx + 0.4]) {
      this.box("side-wall", 0.65, 0.8, hz * 2 + 1, x, 0.2, 0, "#273a3d");
      this.box("side-coping", 0.85, 0.12, hz * 2 + 1, x, 0.66, 0, "#56605a");
    }
    for (const x of [-11, 11])
      for (const z of [-7.5, 7.5]) {
        this.cylinder("plinth", 0.8, 0.5, x, 0.25, z, "#56615c");
        this.cylinder("brazier", 0.4, 1.1, x, 1, z, "#283c3e");
        const flame = MeshBuilder.CreateSphere(
          "spirit-flame",
          { diameter: 0.42, segments: 6 },
          this.scene,
        );
        flame.position.set(x, 1.7, z);
        flame.scaling.y = 1.6;
        flame.material = this.material("#d4a967", true);
        flame.isPickable = false;
        const halo = this.ring("torch-halo", 0.65, "#ae9b68", 0.025);
        halo.position.set(x, 0.025, z);
      }
    for (const spawn of arena.spawns) {
      const r = this.ring("spawn-seal", 2.5, "#648884", 0.025);
      r.position.set(spawn.x / 1000, 0.02, spawn.z / 1000);
    }
    for (const obstacle of arena.obstacles) {
      const before = this.scene.meshes.length;
      const x = obstacle.pos.x / 1000;
      const z = obstacle.pos.z / 1000;
      const diameter = (obstacle.radius * 2) / 1000;
      this.cylinder("pillar-base", diameter, 0.35, x, 0.18, z, "#53615c");
      this.cylinder(
        "pillar",
        diameter * 0.67,
        2.7,
        x,
        1.65,
        z,
        "#3f5151",
        undefined,
        diameter * 0.52,
      );
      this.cylinder("capital", diameter * 0.88, 0.25, x, 3.1, z, "#758078");
      const crystal = MeshBuilder.CreatePolyhedron(
        "shard",
        { type: 1, size: 0.5 },
        this.scene,
      );
      crystal.position.set(x, 3.7, z);
      crystal.scaling.y = 1.8;
      crystal.material = this.material("#98c6b6", true);
      crystal.isPickable = false;
      if (arena.half_x === 14000)
        for (const mesh of this.scene.meshes.slice(before))
          mesh.metadata = { arenaPlaceholder: true };
    }
    this.box("underworld", 90, 0.1, 90, 0, -1.5, 0, "#0d1729");
    // Static stonework shares materials: merge it once instead of drawing each tile.
    const batches = new Map<StandardMaterial, Mesh[]>();
    for (const mesh of this.scene.meshes) {
      if (
        !existing.has(mesh) &&
        !mesh.metadata?.arenaPlaceholder &&
        mesh instanceof Mesh &&
        mesh.material instanceof StandardMaterial
      ) {
        mesh.computeWorldMatrix(true);
        const group = batches.get(mesh.material) ?? [];
        group.push(mesh);
        batches.set(mesh.material, group);
      }
    }
    for (const group of batches.values()) {
      if (group.length > 1) {
        const merged = Mesh.MergeMeshes(group, true, true);
        if (merged) merged.isPickable = false;
      }
    }
    this.court = new TransformNode("court", this.scene);
    for (const mesh of this.scene.meshes)
      if (!existing.has(mesh)) mesh.parent = this.court;
    void this.arenaArt
      .decorate(this.court, arena)
      .catch((error) =>
        console.warn("Arena art unavailable; using procedural fallback", error),
      );
  }
  configure(content: Content) {
    this.content = content;
    if (JSON.stringify(this.arena) !== JSON.stringify(content.arena)) {
      this.arena = content.arena;
      this.buildCourt(this.arena);
    }
    for (const flag of this.flagMeshes.values()) flag.dispose(false);
    this.flagMeshes.clear();
  }
  receive(state: Snapshot, reset: boolean) {
    if (reset) {
      this.snapFocus = true;
      this.frames = [];
      for (const actor of this.actors.values()) {
        actor.visual?.dispose();
        actor.root.dispose(false);
        actor.label.remove();
      }
      this.actors.clear();
    }
    this.frames.push({ state, at: performance.now() });
    if (this.frames.length > 12) this.frames.shift();
  }
  setPlacement(radius: number | null) {
    this.placement.setEnabled(radius !== null);
    if (radius !== null) this.placement.scaling.setAll((radius * 2) / 5400);
  }
  private actor(player: PlayerView): Actor {
    const root = new TransformNode(`player-${player.id}`, this.scene);
    const body = new TransformNode("animated-body", this.scene);
    body.parent = root;
    const melee = player.class_id === "briarwarden";
    const armor = melee ? "#4d7770" : "#6e4f48";
    const trim = melee ? "#c5c69c" : "#d5ae78";
    this.cylinder("torso", 0.75, 0.8, 0, 1.2, 0, armor, body, 0.98);
    this.cylinder(
      "skirt",
      melee ? 0.87 : 1.1,
      0.8,
      0,
      0.55,
      0,
      melee ? "#273f42" : "#393845",
      body,
      0.55,
    );
    this.box("belt", 0.83, 0.12, 0.52, 0, 0.85, 0, trim, body);
    for (const x of [-0.21, 0.21])
      this.box("boot", 0.26, 0.3, 0.43, x, 0.19, -0.04, "#1d3034", body);
    this.cylinder(
      "helmet",
      0.52,
      0.5,
      0,
      1.88,
      0,
      melee ? "#b5bdab" : "#4c4545",
      body,
      melee ? 0.4 : 0,
    );
    this.box("visor", 0.42, 0.07, 0.12, 0, 1.89, -0.26, "#132c32", body);
    this.box(
      "eyes",
      0.25,
      0.028,
      0.14,
      0,
      1.91,
      -0.28,
      melee ? "#81dfc2" : "#ffbf79",
      body,
    ).material = this.material(melee ? "#81dfc2" : "#ffbf79", true);
    if (melee)
      for (const x of [-0.28, 0.28]) {
        const horn = this.cylinder(
          "antler",
          0.16,
          0.75,
          x,
          2.2,
          0,
          trim,
          body,
          0.015,
        );
        horn.rotation.z = -x * 1.8;
      }
    else {
      this.cylinder(
        "hood-crown",
        0.65,
        0.45,
        0,
        2.05,
        0.03,
        "#795d55",
        body,
        0.04,
      );
    }
    const left = new TransformNode("left-arm", this.scene);
    left.parent = body;
    left.position.set(-0.58, 1.45, 0);
    const right = new TransformNode("right-arm", this.scene);
    right.parent = body;
    right.position.set(0.58, 1.45, 0);
    for (const arm of [left, right]) {
      this.box("pauldron", 0.49, 0.28, 0.58, 0, 0.03, 0, trim, arm);
      this.box("arm", 0.23, 0.6, 0.28, 0, -0.32, 0, armor, arm);
      this.box("gauntlet", 0.26, 0.2, 0.31, 0, -0.65, 0, trim, arm);
    }
    if (melee) {
      this.box(
        "shield",
        0.62,
        0.95,
        0.16,
        -0.12,
        -0.35,
        -0.25,
        "#365f5a",
        left,
      );
      this.box(
        "shield-crest",
        0.13,
        0.72,
        0.18,
        -0.12,
        -0.35,
        -0.27,
        trim,
        left,
      );
      this.box("blade", 0.14, 1.25, 0.11, 0, -0.6, -0.34, "#d9e0cf", right);
      this.box("crossguard", 0.5, 0.1, 0.14, 0, -0.1, -0.34, trim, right);
    } else {
      this.cylinder("staff", 0.085, 2.25, 0.07, -0.25, -0.13, "#9c8464", right);
      const gem = MeshBuilder.CreatePolyhedron(
        "staff-shard",
        { type: 1, size: 0.23 },
        this.scene,
      );
      gem.position.set(0.07, 1.05, -0.13);
      gem.parent = right;
      gem.material = this.material("#f4b370", true);
    }
    const ring = this.ring("selection", 1.65, "#dcc38b", 0.05);
    ring.parent = root;
    ring.position.y = 0.025;
    const aura = this.ring(
      "ultimate-aura",
      2.2,
      melee ? "#8ee3b0" : "#f4c482",
      0.06,
    );
    aura.parent = root;
    aura.position.y = 0.12;
    const barrier = MeshBuilder.CreateSphere(
      "barrier",
      { diameter: 2.3, segments: 16 },
      this.scene,
    );
    barrier.parent = root;
    barrier.position.y = 1;
    barrier.material = this.material("#8ac9ce", true, 0.12);
    barrier.isPickable = false;
    for (const mesh of root.getChildMeshes()) {
      if (mesh !== ring && mesh !== aura && mesh !== barrier) {
        mesh.isPickable = true;
        mesh.metadata = { playerId: player.id };
      }
    }
    const label = document.createElement("div");
    label.className = "actor-label";
    document.querySelector("#labels")!.append(label);
    const actor = {
      root,
      body,
      left,
      right,
      ring,
      aura,
      shield: barrier,
      label,
      lastPos: new Vector3(),
      health: player.health,
      flash: 0,
      visual: null as CharacterVisual | null,
      labelHtml: "",
    };
    void this.models
      .attach(root, player.id, melee)
      .then((visual) => {
        if (!visual) return;
        actor.visual = visual;
        body.setEnabled(false);
        label.dataset.model = "kaykit";
      })
      .catch((error) => {
        label.dataset.model = "fallback";
        console.warn(
          "Character model unavailable; using procedural fallback",
          error,
        );
      });
    root.position.set(player.pos.x / 1000, 0, player.pos.z / 1000);
    this.actors.set(player.id, actor);
    return actor;
  }
  render(
    localId: number,
    predicted: Pos | null,
    target: number | null,
    facing: number,
  ) {
    const latest = this.frames.at(-1)?.state;
    const now = performance.now();
    if (latest && this.content) {
      const local = latest.players.find((p) => p.id === localId);
      if (local) {
        const focus = predicted ?? local.pos;
        const follow = this.snapFocus ? 1 : 0.15;
        this.camera.target.x += (focus.x / 1000 - this.camera.target.x) * follow;
        this.camera.target.z += (focus.z / 1000 - this.camera.target.z) * follow;
        this.snapFocus = false;
      }
      // Labels and picking must use this frame's orbit/follow transform.
      this.scene.updateTransformMatrix();
      for (const flag of latest.match_info.flags) {
        let root = this.flagMeshes.get(flag.team);
        if (!root) {
          root = new TransformNode(`flag-${flag.team}`, this.scene);
          this.cylinder("flagpole", 0.08, 3, 0, 1.5, 0, "#ddcfab", root);
          const banner = this.box(
            "team-standard",
            1.1,
            0.85,
            0.07,
            0.52,
            2.45,
            0,
            flag.team === 0 ? "#55bca3" : "#d18d6e",
            root,
          );
          banner.material = this.material(
            flag.team === 0 ? "#55bca3" : "#d18d6e",
            true,
          );
          const marker = this.ring(
            "flag-marker",
            1.6,
            flag.team === 0 ? "#55bca3" : "#d18d6e",
            0.08,
          );
          marker.parent = root;
          marker.position.y = 0.15;
          this.flagMeshes.set(flag.team, root);
        }
        root.position.set(
          flag.pos.x / 1000,
          flag.carrier !== null ? 0.6 : 0,
          flag.pos.z / 1000,
        );
      }
      const at = now - 100;
      const before = this.frames.findLast((f) => f.at <= at) ?? this.frames[0];
      const after = this.frames.find((f) => f.at > at) ?? this.frames.at(-1)!;
      const mix = Math.max(
        0,
        Math.min(1, (at - before.at) / Math.max(1, after.at - before.at)),
      );
      for (const p of latest.players) {
        const actor = this.actors.get(p.id) ?? this.actor(p);
        const a = before.state.players.find((q) => q.id === p.id)?.pos ?? p.pos;
        const b = after.state.players.find((q) => q.id === p.id)?.pos ?? p.pos;
        const pos =
          p.id === localId && predicted
            ? predicted
            : { x: a.x + (b.x - a.x) * mix, z: a.z + (b.z - a.z) * mix };
        actor.lastPos.copyFrom(actor.root.position);
        actor.root.position.x +=
          (pos.x / 1000 - actor.root.position.x) * (p.id === localId ? 0.5 : 1);
        actor.root.position.z +=
          (pos.z / 1000 - actor.root.position.z) * (p.id === localId ? 0.5 : 1);
        const moved =
          Vector3.DistanceSquared(actor.root.position, actor.lastPos) > 0.00001;
        actor.visual?.update(
          moved,
          !!p.casting,
          p.health <= 0,
          p.form_until > latest.tick,
        );
        actor.root.rotation.y =
          (p.id === localId ? facing : p.facing / 1000) + Math.PI;
        actor.body.position.y = moved
          ? Math.sin(now / 85) * 0.045
          : Math.sin(now / 600 + p.id) * 0.025;
        actor.right.rotation.x = p.casting
          ? -0.8 + Math.sin(now / 130) * 0.1
          : moved
            ? Math.sin(now / 130) * 0.3
            : 0.05;
        actor.left.rotation.x = moved ? -Math.sin(now / 130) * 0.25 : 0;
        const transformed =
          p.form !== this.content.classes[p.class_id].base_form;
        actor.aura.setEnabled(transformed);
        actor.aura.rotation.y = now / 600;
        actor.aura.position.y = 0.12 + Math.sin(now / 350) * 0.06;
        actor.root.scaling.setAll(transformed ? 1.22 : 1);
        actor.shield.setEnabled(p.shield > 0);
        actor.ring.setEnabled(p.id === target || p.id === localId);
        actor.ring.material = this.material(
          p.id === target ? "#dfa288" : "#6dbaa4",
          true,
        );
        if (p.health < actor.health) actor.flash = now + 220;
        actor.health = p.health;
        actor.body.scaling.y = p.health <= 0 ? 0.35 : 1;
        actor.shield.visibility = p.shield > 0 ? 1 : 0;
        actor.ring.scaling.setAll(now < actor.flash ? 1.35 : 1);
        const screen = Vector3.Project(
          actor.root.position.add(new Vector3(0, transformed ? 3.3 : 2.7, 0)),
          Matrix.Identity(),
          this.scene.getTransformMatrix(),
          this.camera.viewport.toGlobal(
            this.engine.getRenderWidth(),
            this.engine.getRenderHeight(),
          ),
        );
        const scaleX = this.canvas.clientWidth / this.engine.getRenderWidth();
        const scaleY = this.canvas.clientHeight / this.engine.getRenderHeight();
        actor.label.style.left = `${screen.x * scaleX}px`;
        actor.label.style.top = `${screen.y * scaleY}px`;
        actor.label.classList.toggle(
          "enemy",
          p.team !== latest.players.find((q) => q.id === localId)?.team,
        );
        const name = this.content.classes[p.class_id].name;
        const carrying = latest.match_info.flags.some(
          (f) => f.carrier === p.id,
        );
        const labelHtml = `${name} #${p.id}${p.bot ? " [BOT]" : p.id === localId ? " · YOU" : ""}<span class="mini-bar"><i style="width:${(p.health / p.max_health) * 100}%;background:${p.team === 0 ? "#6ad9bb" : "#e49b73"}"></i></span>${carrying ? '<b class="flag-carrier">⚑ FLAG CARRIER</b>' : ""}${p.casting ? `<b>${this.content.abilities[p.casting.ability].name}</b>` : ""}`;
        if (actor.labelHtml !== labelHtml) {
          actor.label.innerHTML = labelHtml;
          actor.labelHtml = labelHtml;
        }
      }
      for (const [id, actor] of this.actors)
        if (!latest.players.some((p) => p.id === id)) {
          actor.visual?.dispose();
          actor.root.dispose(false);
          actor.label.remove();
          this.actors.delete(id);
        }
      for (const area of latest.areas) {
        let mesh = this.areaMeshes.get(area.id);
        if (!mesh) {
          mesh = MeshBuilder.CreateDisc(
            "fire-field",
            {
              radius: area.radius / 1000,
              tessellation: 48,
              sideOrientation: Mesh.DOUBLESIDE,
            },
            this.scene,
          );
          mesh.rotation.x = Math.PI / 2;
          mesh.position.set(area.pos.x / 1000, 0.14, area.pos.z / 1000);
          mesh.material = this.material("#d88e52", true, 0.35);
          mesh.isPickable = false;
          const ring = this.ring(
            "field-edge",
            (area.radius * 2) / 1000,
            "#edb47d",
            0.06,
          );
          ring.parent = mesh;
          ring.rotation.x = Math.PI / 2;
          for (let i = 0; i < 9; i++) {
            const flame = this.cylinder(
              "cinder",
              0.14,
              0.65,
              (Math.sin(i * 7) * area.radius) / 1400,
              0,
              (Math.cos(i * 7) * area.radius) / 1400,
              "#eec584",
              undefined,
              0,
            );
            flame.parent = mesh;
            // Disc-local X/Y become world X/Z after the parent's rotation.
            flame.position.set(
              (Math.sin(i * 7) * area.radius) / 1400,
              (Math.cos(i * 7) * area.radius) / 1400,
              -0.4,
            );
            flame.rotation.x = -Math.PI / 2;
            flame.material = this.material("#eec584", true);
          }
          this.areaMeshes.set(area.id, mesh);
        }
        mesh.visibility = 0.7 + Math.sin(now / 140) * 0.25;
      }
      for (const [id, mesh] of this.areaMeshes)
        if (!latest.areas.some((a) => a.id === id)) {
          mesh.dispose(false);
          this.areaMeshes.delete(id);
        }
    }
    if (this.cursor)
      this.placement.position.set(
        this.cursor.x / 1000,
        0.15,
        this.cursor.z / 1000,
      );
    this.scene.render();
  }
}
