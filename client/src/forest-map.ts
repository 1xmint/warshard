import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Arena } from "./protocol";

/** Authored forest CTF layout. Only protocol obstacles block movement and sight. */
export class ForestMap {
  private assets = new Map<string, Promise<AssetContainer>>();
  private trees: TransformNode[] = [];
  constructor(private scene: Scene) {}
  update(alpha: number, focus: Readonly<{ x: number; z: number }>) {
    const x = Math.cos(alpha), z = Math.sin(alpha);
    for (const tree of this.trees) {
      // Decorative trees on the camera's side of the field must not hide players.
      const foreground = (tree.position.x - focus.x) * x + (tree.position.z - focus.z) * z > 0.5;
      if (tree.isEnabled() === foreground) tree.setEnabled(!foreground);
    }
  }
  build(arena: Arena): TransformNode {
    this.trees = [];
    const root = new TransformNode("riftwood-crossing", this.scene);
    const materials = new Map<string, StandardMaterial>();
    const mat = (color: string) => {
      let m = materials.get(color);
      if (!m) {
        m = new StandardMaterial(`forest-${color}`, this.scene);
        m.diffuseColor = Color3.FromHexString(color);
        m.specularColor = Color3.Black();
        materials.set(color, m);
      }
      return m;
    };
    const box = (name: string, x: number, z: number, w: number, d: number, color: string, y = -0.07, h = 0.08) => {
      const mesh = MeshBuilder.CreateBox(name, { width: w, depth: d, height: h }, this.scene);
      mesh.position.set(x, y, z); mesh.parent = root; mesh.material = mat(color); mesh.isPickable = false;
      return mesh;
    };
    const hx = arena.half_x / 1000, hz = arena.half_z / 1000;
    // One continuous flat combat surface. All variation is baked into this original canvas texture.
    const terrainTexture = new DynamicTexture("riftwood-original-painted-ground", { width: 1040, height: 560 }, this.scene, false);
    terrainTexture.hasAlpha = false;
    terrainTexture.wrapU = terrainTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.paintTerrain(terrainTexture.getContext() as CanvasRenderingContext2D, hx, hz);
    terrainTexture.update(false);
    const terrain = MeshBuilder.CreateGround("forest-floor", { width: hx * 2, height: hz * 2, subdivisions: 1 }, this.scene);
    terrain.position.y = -0.035; terrain.parent = root; terrain.isPickable = false;
    const terrainMat = mat("#ffffff"); terrainMat.diffuseTexture = terrainTexture; terrainMat.specularColor = Color3.Black();
    terrain.material = terrainMat;
    for (const x of [-21, 21]) {
      const color = x < 0 ? "#55aa98" : "#d17955";
      for (const z of [-5, 5]) {
        box("standard-post", x, z, 0.16, 0.16, "#66513c", 1.7, 3.4);
        box("team-standard", x, z, 1.3, 0.08, color, 2.7, 1);
      }
    }
    // Rock silhouettes occupy exactly the server's circular cover footprint.
    for (const obstacle of arena.obstacles) {
      const radius = obstacle.radius / 1000;
      const mesh = MeshBuilder.CreateCylinder("forest-cover", { diameter: radius * 2, diameterTop: radius * 1.8, height: 2.7, tessellation: 12 }, this.scene);
      mesh.position.set(obstacle.pos.x / 1000, 1.32, obstacle.pos.z / 1000);
      mesh.material = mat("#637064"); mesh.parent = root; mesh.isPickable = false;
      mesh.metadata = { coverFallback: true };
      const footprint = MeshBuilder.CreateCylinder("rocky-cover-footprint", { diameter: radius * 2, height: 0.14, tessellation: 12 }, this.scene);
      footprint.position.set(obstacle.pos.x / 1000, 0.03, obstacle.pos.z / 1000);
      footprint.material = mat("#57604b"); footprint.parent = root; footprint.isPickable = false;
    }
    // Low, soft mounds sit outside the combat surface; distant blue-green ridges frame the map.
    this.addHills(root, hx, hz, mat);
    const batches = new Map<StandardMaterial, Mesh[]>();
    for (const mesh of root.getChildMeshes()) if (mesh instanceof Mesh && mesh.material instanceof StandardMaterial && !mesh.metadata?.coverFallback) {
      mesh.computeWorldMatrix(true);
      const group = batches.get(mesh.material) ?? []; group.push(mesh); batches.set(mesh.material, group);
    }
    for (const group of batches.values()) if (group.length > 1) {
      const merged = Mesh.MergeMeshes(group, true, true); if (merged) { merged.parent = root; merged.isPickable = false; }
    }
    // Per-map materials are released only after their meshes are gone.
    root.onDisposeObservable.add(() => { for (const m of materials.values()) m.dispose(); terrainTexture.dispose(); });
    void this.decorate(root, arena).catch((error) => console.warn("Forest art unavailable; terrain and cover remain playable", error));
    return root;
  }
  private paintTerrain(ctx: CanvasRenderingContext2D, hx: number, hz: number) {
    const width = 1040, height = 560, sx = width / (hx * 2), sz = height / (hz * 2);
    let seed = 0x52a79;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
    const px = (x: number) => (x + hx) * sx;
    const pz = (z: number) => (hz - z) * sz;
    ctx.fillStyle = "#4c7149"; ctx.fillRect(0, 0, width, height);
    // Broad translucent brush patches give the grass depth without changing collision height.
    const greens = ["#416744", "#567b4d", "#60804c", "#3e6347", "#718653", "#4a7045"];
    for (let i = 0; i < 2500; i++) {
      const x = random() * width, y = random() * height;
      ctx.globalAlpha = 0.12 + random() * 0.17; ctx.fillStyle = greens[Math.floor(random() * greens.length)];
      ctx.beginPath(); ctx.ellipse(x, y, 2 + random() * 14, 1.5 + random() * 7, random() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    // Short painted blades are clustered irregularly through the turf.
    for (let i = 0; i < 1900; i++) {
      const x = random() * width, y = random() * height;
      ctx.globalAlpha = 0.26 + random() * 0.25; ctx.strokeStyle = greens[Math.floor(random() * greens.length)]; ctx.lineWidth = 1 + random() * 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 1, y - 2 - random() * 4, x + 2 + random() * 3, y - 4 - random() * 6); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const route = (lane: number, x: number) => lane === 0
      ? Math.sin(x * 0.15) * 1.1 + Math.sin(x * 0.39 + 0.6) * 0.45
      : lane * 10.5 + Math.sin(x * 0.12 + lane) * 0.75 + Math.sin(x * 0.31 + lane * 1.7) * 0.3;
    for (let lane = -1; lane <= 1; lane++) {
      const path = new Path2D();
      for (let i = 0; i <= 90; i++) {
        const x = -hx - 1 + i * ((hx * 2 + 2) / 90), y = route(lane, x);
        if (!i) path.moveTo(px(x), pz(y)); else path.lineTo(px(x), pz(y));
      }
      const roadWidth = lane === 0 ? 4.7 : 3.6;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = "#344b37"; ctx.lineWidth = roadWidth * sx + 12; ctx.globalAlpha = 0.4; ctx.stroke(path);
      ctx.strokeStyle = "#62543e"; ctx.lineWidth = roadWidth * sx; ctx.globalAlpha = 0.96; ctx.stroke(path);
      ctx.strokeStyle = lane === 0 ? "#806c4e" : "#796749"; ctx.lineWidth = roadWidth * sx - 8; ctx.globalAlpha = 0.82; ctx.stroke(path);
      // Uneven shoulders soften the path edge into the turf.
      ctx.strokeStyle = "#a09064"; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.32; ctx.stroke(path);
      ctx.globalAlpha = 1;
      // The center of each dirt route is a hand-varied cobble ribbon.
      for (let x = -hx + 0.3; x < hx; x += 0.7) {
        const z = route(lane, x) + (random() - 0.5) * Math.max(0.3, roadWidth * 0.35);
        const tangent = Math.atan2(-0.18 * Math.cos(x * 0.15) - 0.18 * Math.cos(x * 0.39 + 0.6), 1);
        const cx = px(x), cy = pz(z), angle = -tangent + (random() - 0.5) * 0.24;
        const stoneW = 7 + random() * 5, stoneH = 5 + random() * 3, shade = ["#97876b", "#a69677", "#827660", "#b0a082"][Math.floor(random() * 4)];
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle); ctx.fillStyle = shade; ctx.strokeStyle = "#625b4a"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-stoneW * 0.5, -stoneH * 0.4); ctx.lineTo(-stoneW * 0.25, -stoneH * 0.6); ctx.lineTo(stoneW * 0.48, -stoneH * 0.35); ctx.lineTo(stoneW * 0.5, stoneH * 0.25); ctx.lineTo(stoneW * 0.12, stoneH * 0.55); ctx.lineTo(-stoneW * 0.42, stoneH * 0.38); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    // Worn flag plazas blend into the three routes at each end.
    for (const x of [-21, 21]) {
      const left = px(x - 4), top = pz(6), w = 8 * sx, h = 12 * sz;
      ctx.fillStyle = "#746d58"; ctx.globalAlpha = 0.92; ctx.beginPath(); ctx.roundRect(left, top, w, h, 18); ctx.fill();
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < 45; i++) {
        const cx = left + random() * w, cy = top + random() * h, stoneW = 4 + random() * 6, stoneH = 3 + random() * 4;
        ctx.fillStyle = ["#988d70", "#857d67", "#a39778"][Math.floor(random() * 3)];
        ctx.beginPath(); ctx.roundRect(cx, cy, stoneW, stoneH, 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  private addHills(parent: TransformNode, hx: number, hz: number, mat: (color: string) => StandardMaterial) {
    const colors = ["#526d56", "#60765d", "#496450", "#5a705e"];
    const mound = (x: number, z: number, sx: number, sy: number, sz: number, color: string, name: string) => {
      const mesh = MeshBuilder.CreateSphere(name, { diameter: 2, segments: 12 }, this.scene);
      mesh.position.set(x, sy * 0.23, z); mesh.scaling.set(sx, sy, sz); mesh.parent = parent; mesh.material = mat(color); mesh.isPickable = false;
    };
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, c = colors[i % colors.length];
      const eastWest = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
      const x = eastWest ? Math.sign(Math.cos(a)) * (hx + 8) : Math.cos(a) * (hx + 5);
      const z = eastWest ? Math.sin(a) * (hz + 5) : Math.sign(Math.sin(a)) * (hz + 8);
      mound(x, z, 4 + (i % 4), 1.1 + (i % 3) * 0.25, 3.5 + (i % 3), c, "forest-soft-rolling-hill");
    }
    // Rounded distant ridges sit within the camera's far view and stay beyond the playable edge.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      mound(Math.cos(a) * (hx + 32), Math.sin(a) * (hz + 34), 10 + (i % 3) * 4, 5 + (i % 4), 8 + (i % 4) * 2, "#465f6a", "blue-distant-forest-ridge");
    }
  }
  private async decorate(parent: TransformNode, arena: Arena) {
    const names = ["tree_oak", "tree_pineTallA", "rock_largeB", "flower_purpleA", "tent_detailedOpen", "campfire_stones"];
    const loaded = new Map<string, AssetContainer>();
    await Promise.all(names.map(async name => {
      if (!this.assets.has(name)) this.assets.set(name, LoadAssetContainerAsync(`/assets/kenney-nature/${name}.glb`, this.scene));
      loaded.set(name, await this.assets.get(name)!);
    }));
    if (parent.isDisposed()) return;
    const place = (name: string, x: number, z: number, sx: number, sy = sx, sz = sx, rotation = 0, y = 0) => {
      const wrapper = new TransformNode(`forest-${name}`, this.scene); wrapper.parent = parent;
      if (name.startsWith("tree_")) this.trees.push(wrapper);
      wrapper.position.set(x, y, z); wrapper.scaling.set(sx, sy, sz); wrapper.rotation.y = rotation;
      const instance = loaded.get(name)!.instantiateModelsToScene(n => `forest-${n}`);
      for (const root of instance.rootNodes) root.parent = wrapper;
      for (const mesh of wrapper.getChildMeshes()) mesh.isPickable = false;
    };
    const hx = arena.half_x / 1000, hz = arena.half_z / 1000;
    // Keep tall trees beyond the playable edges so their crowns cannot hide combatants.
    for (let x = -hx - 3, i = 0; x <= hx + 3; x += 3.4, i++) for (const sign of [-1, 1]) {
      place(i % 3 ? "tree_oak" : "tree_pineTallA", x, sign * (hz + 3 + (i % 2)), 5 + i % 3, 5 + i % 3, 5 + i % 3, i * 1.7);
    }
    for (let z = -hz; z <= hz; z += 4) for (const sign of [-1, 1]) place("tree_pineTallA", sign * (hx + 3.3), z, 6, 6, 6, z);
    for (const obstacle of arena.obstacles) {
      const r = obstacle.radius / 1000;
      // A low gravel footprint marks the exact authoritative circle. Rock clusters fit within it.
      const x = obstacle.pos.x / 1000, z = obstacle.pos.z / 1000;
      place("rock_largeB", x, z, r * 1.55, 6.8, r * 1.55, 0, 0.3);
      for (const sign of [-1, 1]) place("rock_largeB", x + sign * r * 0.4, z, r * 0.8, 3.8, r * 0.8, 0, 0.15);
    }
    for (const sign of [-1, 1]) {
      place("tent_detailedOpen", sign * (hx + 2.7), -6, 5, 5, 5, -sign * Math.PI / 2);
      place("campfire_stones", sign * (hx + 1.6), 5, 3);
    }
    this.addGrass(parent, arena);
    for (let i = 0; i < 18; i++) {
      const x = -hx + 2 + (i * 7.37) % (hx * 2 - 4), z = -hz + 2 + (i * 4.61) % (hz * 2 - 4);
      if (Math.abs(z) < 4 || Math.abs(Math.abs(z) - 10.5) < 3 || Math.abs(x) > 17) continue;
      place("flower_purpleA", x, z, 0.75, 0.75, 0.75, i);
    }
    for (const mesh of parent.getChildMeshes()) if (mesh.metadata?.coverFallback) mesh.setEnabled(false);
    document.querySelector<HTMLCanvasElement>("#arena")!.dataset.arenaArt = "kenney-forest";
  }
  private addGrass(parent: TransformNode, arena: Arena) {
    let seed = 0x71eaf;
    const random = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 0x100000000; };
    const hx = arena.half_x / 1000, hz = arena.half_z / 1000;
    const positions: number[] = [], indices: number[] = [], colors: number[] = [];
    const tint = [[0.67, 0.79, 0.46], [0.76, 0.82, 0.48], [0.48, 0.68, 0.40], [0.57, 0.74, 0.42]];
    for (let i = 0; i < 260; i++) {
      const x = -hx + 0.5 + random() * (hx * 2 - 1), z = -hz + 0.5 + random() * (hz * 2 - 1);
      if (Math.abs(z) < 3.3 || Math.abs(Math.abs(z) - 10.5) < 2.7 || Math.abs(x) > 17) continue;
      if (arena.obstacles.some(o => Math.hypot(x - o.pos.x / 1000, z - o.pos.z / 1000) < o.radius / 1000 + 1.2)) continue;
      const blades = 3 + Math.floor(random() * 3), shade = tint[Math.floor(random() * tint.length)];
      for (let b = 0; b < blades; b++) {
        const a = random() * Math.PI * 2, w = 0.035 + random() * 0.035, h = 0.18 + random() * 0.22;
        const dx = Math.cos(a) * w, dz = Math.sin(a) * w, lean = 0.04 + random() * 0.07, n = positions.length / 3;
        positions.push(x - dx, 0.005, z - dz, x + dx, 0.005, z + dz, x + Math.sin(a) * lean, h, z + Math.cos(a) * lean);
        indices.push(n, n + 1, n + 2, n + 2, n + 1, n);
        for (let v = 0; v < 3; v++) colors.push(shade[0], shade[1], shade[2], 1);
      }
    }
    if (!positions.length) return;
    const mesh = new Mesh("bounded-batched-painted-grass", this.scene); mesh.parent = parent; mesh.isPickable = false;
    const data = new VertexData(); data.positions = positions; data.indices = indices; data.colors = colors;
    data.normals = []; VertexData.ComputeNormals(positions, indices, data.normals); data.applyToMesh(mesh, false);
    const material = new StandardMaterial("forest-grass", this.scene); material.backFaceCulling = false; material.specularColor = Color3.Black();
    mesh.material = material;
  }
}
