import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
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
    box("forest-floor", 0, 0, hx * 2, hz * 2, "#45513a");
    box("forest-earth", 0, 0, 90, 75, "#24352e", -0.6, 0.6);
    // Three readable routes join the two bases. Dirt is decorative and fully walkable.
    for (const z of [-10.5, 0, 10.5]) for (let i = 0; i < 8; i++) {
      const segment = box("dirt-lane", -hx + 3.25 + i * 6.5, z + Math.sin(i * 1.7) * 0.35, 7.2, (z === 0 ? 4.7 : 3.6) + i % 3 * 0.2, "#55462f", -0.015 + i * 0.0005, 0.04);
      segment.rotation.y = Math.sin(i * 2.3) * 0.035;
    }
    for (const x of [-21, 21]) {
      box("base-courtyard", x, 0, 8, 12, "#52574d", 0.005, 0.05);
      box("base-crossing", x, 0, 4, hz * 2, "#55462f", -0.005, 0.04);
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
    // A low boundary marks the authoritative edge; forest scenery stays outside it.
    for (const z of [-hz - 0.25, hz + 0.25]) box("forest-boundary", 0, z, hx * 2 + 1, 0.45, "#536447", 0.15, 0.5);
    for (const x of [-hx - 0.25, hx + 0.25]) box("forest-boundary", x, 0, 0.45, hz * 2, "#536447", 0.15, 0.5);
    const batches = new Map<StandardMaterial, Mesh[]>();
    for (const mesh of root.getChildMeshes()) if (mesh instanceof Mesh && mesh.material instanceof StandardMaterial && !mesh.metadata?.coverFallback) {
      mesh.computeWorldMatrix(true);
      const group = batches.get(mesh.material) ?? []; group.push(mesh); batches.set(mesh.material, group);
    }
    for (const group of batches.values()) if (group.length > 1) {
      const merged = Mesh.MergeMeshes(group, true, true); if (merged) { merged.parent = root; merged.isPickable = false; }
    }
    // Per-map materials are released only after their meshes are gone.
    root.onDisposeObservable.add(() => { for (const m of materials.values()) m.dispose(); });
    void this.decorate(root, arena).catch((error) => console.warn("Forest art unavailable; terrain and cover remain playable", error));
    return root;
  }
  private async decorate(parent: TransformNode, arena: Arena) {
    const names = ["tree_oak", "tree_pineTallA", "rock_largeB", "grass_large", "flower_purpleA", "tent_detailedOpen", "campfire_stones"];
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
    for (let i = 0; i < 54; i++) {
      const x = -hx + 1 + (i * 7.37) % (hx * 2 - 2), z = -hz + 1 + (i * 4.61) % (hz * 2 - 2);
      if (Math.abs(z) < 3 || Math.abs(Math.abs(z) - 10.5) < 2.4 || Math.abs(x) > 17) continue;
      place(i % 4 ? "grass_large" : "flower_purpleA", x, z, 1.2, 1.2, 1.2, i);
    }
    for (const mesh of parent.getChildMeshes()) if (mesh.metadata?.coverFallback) mesh.setEnabled(false);
    document.querySelector<HTMLCanvasElement>("#arena")!.dataset.arenaArt = "kenney-forest";
  }
}
