import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_transform";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Arena } from "./protocol";

/** Ready-made CC0 arena art. Its placement never adds hidden collision. */
export class ArenaArt {
  private assets = new Map<string, Promise<AssetContainer>>();
  constructor(private scene: Scene) {}
  async decorate(parent: TransformNode, arena: Arena) {
    const names = [
      "floor-detail",
      "floor",
      "column-damaged",
      "wall-corner",
      "wall",
      "wall-gate",
      "column",
      "statue",
      "tree",
      "banner",
    ];
    const loaded = new Map<string, AssetContainer>();
    await Promise.all(
      names.map(async (name) => {
        if (!this.assets.has(name))
          this.assets.set(
            name,
            LoadAssetContainerAsync(
              `/assets/kenney-arena/${name}.glb`,
              this.scene,
            ),
          );
        loaded.set(name, await this.assets.get(name)!);
      }),
    );
    if (parent.isDisposed()) return;
    const place = (
      name: string,
      x: number,
      y: number,
      z: number,
      sx = 1,
      sy = sx,
      sz = sx,
      rotation = 0,
    ) => {
      const wrapper = new TransformNode(`arena-${name}`, this.scene);
      wrapper.parent = parent;
      wrapper.position.set(x, y, z);
      wrapper.scaling.set(sx, sy, sz);
      wrapper.rotation.y = rotation;
      const instance = loaded
        .get(name)!
        .instantiateModelsToScene((n) => `arena-${name}-${n}`);
      for (const root of instance.rootNodes) root.parent = wrapper;
      for (const mesh of wrapper.getChildMeshes()) mesh.isPickable = false;
    };
    for (const mesh of parent.getChildMeshes())
      if (mesh.metadata?.arenaPlaceholder) mesh.setEnabled(false);
    for (let x = -13; x <= 13; x += 2)
      for (let z = -9; z <= 9; z += 2)
        // A worn central fighting floor, framed by less ornate outer flagstones.
        place(Math.abs(x) < 9 && Math.abs(z) < 7 ? "floor-detail" : "floor", x, -0.12, z, 2, 1, 2);
    for (let x = -13; x <= 13; x += 2)
      for (const z of [-10.6, 10.6]) {
        const height = Math.abs(x) > 9 ? 2.3 : Math.abs(x) < 4 ? 0.85 : 1.5;
        place("wall", x, 0, z, 2, height, 1.5);
      }
    for (let z = -9; z <= 9; z += 2)
      for (const x of [-14.6, 14.6])
        if (Math.abs(z) > 2) place("wall", x, 0, z, 2, 1.5, 1.5, Math.PI / 2);
    for (const x of [-14.7, 14.7]) {
      place("wall-gate", x, 0, 0, 4, 3, 2, Math.PI / 2);
      for (const z of [-7, 7]) {
        place("statue", x, 0, z, 2.2);
        place("tree", x + Math.sign(x) * 2.5, -0.3, z, 2);
      }
      for (const z of [-3.3, 3.3]) place("banner", x, 0, z, 2.2);
    }
    // Ruined corner towers sit beyond the boundary, framing the arena without extra collision.
    for (const x of [-15.5, 15.5]) for (const z of [-11.5, 11.5]) {
      place("wall-corner", x, 0, z, 3, 2.5, 3, x * z > 0 ? Math.PI : 0);
      place("column-damaged", x, 0, z, 2, 5, 2);
    }
    for (const obstacle of arena.obstacles)
      place(
        "column",
        obstacle.pos.x / 1000,
        0,
        obstacle.pos.z / 1000,
        obstacle.radius / 425,
        3.5,
        obstacle.radius / 425,
      );
    document.querySelector<HTMLCanvasElement>("#arena")!.dataset.arenaArt =
      "kenney";
  }
}
