import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { CharacterVisual } from "./character-models";

/** Original temporary elemental: molten core, orbiting crust and a changing flame crown. */
export function fireElemental(parent: TransformNode, id: number, scene: Scene): CharacterVisual {
  const root = new TransformNode(`cinderborn-${id}`, scene); root.parent = parent;
  const material = (name: string, color: string, glow: boolean) => {
    const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(color);
    m.specularColor = Color3.Black(); if (glow) { m.emissiveColor = m.diffuseColor; m.disableLighting = true; } return m;
  };
  const stone = material("cinderborn-obsidian", "#332b32", false), ember = material("cinderborn-core", "#ff8029", true), light = material("cinderborn-heart", "#ffec8c", true);
  const sphere = (name: string, size: number, x: number, y: number, z: number, mat = ember) => {
    const mesh = MeshBuilder.CreateSphere(name, { diameter: size, segments: 8 }, scene);
    mesh.parent = root; mesh.position.set(x, y, z); mesh.material = mat; mesh.metadata = { playerId: id }; return mesh;
  };
  const core = sphere("molten-heart", 0.85, 0, 1.15, 0);
  core.scaling.y = 1.3;
  sphere("living-fire-face", 0.53, 0, 1.83, 0.02, stone);
  for (const x of [-0.14, 0.14]) sphere("ember-eye", 0.12, x, 1.87, 0.255, light);
  const hands = [-1, 1].map(side => sphere("molten-hand", 0.38, side * 0.65, 1.18, 0.12));
  const crust = Array.from({ length: 7 }, (_, i) => {
    const angle = i * Math.PI * 2 / 7;
    const shard = MeshBuilder.CreatePolyhedron("obsidian-crust", { type: 1, size: 0.24 }, scene);
    shard.parent = root; shard.position.set(Math.cos(angle) * 0.43, 1.08 + i % 2 * 0.27, Math.sin(angle) * 0.36);
    shard.material = stone; shard.metadata = { playerId: id }; return shard;
  });
  const flames = Array.from({ length: 5 }, (_, i) => {
    const flame = MeshBuilder.CreateCylinder("elemental-plume", { height: 0.9, diameterBottom: 0.3, diameterTop: 0.01, tessellation: 6 }, scene);
    flame.parent = root; flame.material = i % 2 ? light : ember;
    flame.position.set(Math.sin(i * 2.4) * 0.26, 2.17 + i % 2 * 0.18, Math.cos(i * 2.4) * 0.2);
    flame.metadata = { playerId: id }; return flame;
  });
  const sun = new TransformNode("living-sun", scene); sun.parent = root;
  const sunCore = sphere("living-sun-core", 0.48, 0, 0, 0, light); sunCore.parent = sun; sunCore.isPickable = false;
  const sunRing = MeshBuilder.CreateTorus("living-sun-corona", { diameter: 0.85, thickness: 0.07, tessellation: 20 }, scene);
  sunRing.parent = sun; sunRing.material = ember; sunRing.isPickable = false;
  let cueUntil = 0;
  return {
    cue: () => { cueUntil = performance.now() + 430; },
    update: (moving, casting, dead, ascended, companion) => {
      const t = performance.now() / 1000;
      root.position.y = dead ? -0.6 : Math.sin(t * 3 + id) * 0.08 + (moving ? 0.05 : 0);
      root.rotation.z = dead ? Math.PI / 2 : 0;
      core.scaling.x = 1 + Math.sin(t * 6) * 0.04;
      hands.forEach((hand, i) => { hand.position.y = 1.18 + Math.sin(t * 4 + i * 3) * 0.08; hand.position.z = casting || performance.now() < cueUntil ? 0.55 : 0.12; });
      flames.forEach((flame, i) => { flame.scaling.y = (ascended ? 1.7 : 0.65) * (1 + Math.sin(t * 8 + i) * 0.16); flame.scaling.x = flame.scaling.z = ascended ? 1.4 : 0.8; });
      crust.forEach((shard, i) => { shard.rotation.y = t * 0.4 + i; });
      sun.setEnabled(!!companion && !dead);
      sun.position.set(Math.cos(t) * 1.1, 2.4 + Math.sin(t * 2) * 0.1, Math.sin(t) * 0.6);
      sunRing.rotation.z = t; sunRing.rotation.x = t * 0.7;
    },
    dispose: () => { root.dispose(); stone.dispose(); ember.dispose(); light.dispose(); },
  };
}
