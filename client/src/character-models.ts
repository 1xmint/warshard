import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

export type CharacterVisual = {
  update: (
    moving: boolean,
    casting: boolean,
    dead: boolean,
    ascended: boolean,
  ) => void;
  cue: (melee: boolean) => void;
  dispose: () => void;
};

/** Two cached containers; geometry/materials are shared, rigs belong to each actor. */
export class CharacterModels {
  private assets = new Map<string, Promise<AssetContainer>>();
  constructor(private scene: Scene) {}
  async attach(
    parent: TransformNode,
    id: number,
    melee: boolean,
  ): Promise<CharacterVisual | null> {
    const kind = melee ? "Knight" : "Mage";
    if (!this.assets.has(kind))
      this.assets.set(
        kind,
        LoadAssetContainerAsync(`/assets/kaykit/${kind}.glb`, this.scene),
      );
    const assets = await this.assets.get(kind)!;
    if (parent.isDisposed()) return null;
    const instance = assets.instantiateModelsToScene(
      (name) => `${id}:${name}`,
      false,
      { doNotInstantiate: true },
    );
    const wrapper = new TransformNode(`model-${id}`, this.scene);
    wrapper.parent = parent;
    // KayKit faces the opposite direction to the procedural fallback rig.
    wrapper.rotation.y = Math.PI;
    for (const root of instance.rootNodes) root.parent = wrapper;
    const hide = new Set(
      melee
        ? [
            "1H_Sword_Offhand",
            "2H_Sword",
            "Rectangle_Shield",
            "Round_Shield",
            "Spike_Shield",
          ]
        : ["Spellbook", "Spellbook_open", "1H_Wand"],
    );
    for (const mesh of wrapper.getChildMeshes()) {
      if (hide.has(mesh.name.split(":").at(-1)!)) mesh.setEnabled(false);
      mesh.isPickable = true;
      mesh.metadata = { playerId: id };
    }
    for (const group of instance.animationGroups) {
      group.stop();
      group.enableBlending = true;
      group.blendingSpeed = 0.15;
    }
    let playing = "",
      cueUntil = 0,
      cueName = "";
    const play = (name: string, loop: boolean) => {
      if (playing === name) return;
      playing = name;
      for (const group of instance.animationGroups) group.stop();
      instance.animationGroups
        .find((group) => group.name.endsWith(name))
        ?.start(loop);
    };
    return {
      update: (moving, casting, dead, ascended) => {
        wrapper.scaling.setAll(ascended ? 1.12 : 1);
        const name = dead
          ? "Death_A"
          : casting
            ? "Spellcasting"
            : performance.now() < cueUntil
              ? cueName
              : moving
                ? "Running_A"
                : "Idle";
        play(name, name !== "Death_A" && name !== cueName);
      },
      cue: (meleeAttack) => {
        cueName = meleeAttack
          ? "1H_Melee_Attack_Slice_Diagonal"
          : "Spellcast_Shoot";
        cueUntil = performance.now() + 450;
      },
      dispose: () => {
        instance.dispose();
        wrapper.dispose();
      },
    };
  }
}
