import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Snapshot, Pos } from "./protocol";
import type { ArenaRenderer } from "./renderer";

/** Local sound and bounded visual cues consume server events; never decide hits. */
export class CombatPresentation {
  private state: Snapshot | null = null;
  private at = 0;
  private lastEvent = 0;
  private shots = new Map<number, { core: Mesh; trail: Mesh; glow: Mesh }>();
  private bursts: { meshes: Mesh[]; born: number; life: number; ward?: boolean }[] = [];
  private numbers: { element: HTMLElement; pos: Pos; born: number }[] = [];
  private materials = new Map<string, StandardMaterial>();
  private halo: DynamicTexture | null = null;
  private audio: AudioContext | null = null;
  private voices = 0;
  private ready = false;
  muted = false;
  constructor(private renderer: ArenaRenderer) {
    const unlock = () => {
      try {
        this.audio ??= new AudioContext();
        void this.audio.resume();
      } catch {
        /* Audio is optional. */
      }
    };
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock);
  }
  private tone(frequency: number, length = 0.1, bright = false) {
    if (
      this.muted ||
      !this.audio ||
      this.audio.state !== "running" ||
      this.voices >= 12
    )
      return;
    const audio = this.audio,
      oscillator = audio.createOscillator(),
      gain = audio.createGain();
    oscillator.type = bright ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(40, frequency * 0.45),
      audio.currentTime + length,
    );
    gain.gain.setValueAtTime(0.035, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + length);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + length);
    this.voices++;
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      this.voices--;
    };
  }
  private material(color: string) {
    if (!this.materials.has(color)) {
      const m = new StandardMaterial(`spell-${color}`, this.renderer.scene);
      m.diffuseColor = Color3.FromHexString(color);
      m.emissiveColor = m.diffuseColor;
      m.disableLighting = true;
      m.alpha = 0.85;
      this.materials.set(color, m);
    }
    return this.materials.get(color)!;
  }
  private glowMaterial(color: string) {
    const key = `halo-${color}`;
    if (!this.materials.has(key)) {
      if (!this.halo) {
        this.halo = new DynamicTexture("spell-halo", 64, this.renderer.scene, false);
        const context = this.halo.getContext() as CanvasRenderingContext2D;
        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, "rgba(255,255,255,0.65)");
        gradient.addColorStop(0.25, "rgba(255,255,255,0.25)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
        this.halo.hasAlpha = true; this.halo.update();
      }
      const material = new StandardMaterial(key, this.renderer.scene);
      material.emissiveColor = Color3.FromHexString(color);
      material.diffuseTexture = this.halo;
      material.useAlphaFromDiffuseTexture = true;
      material.disableLighting = true; material.disableDepthWrite = true;
      material.alphaMode = Constants.ALPHA_ADD;
      material.backFaceCulling = false;
      this.materials.set(key, material);
    }
    return this.materials.get(key)!;
  }
  receive(state: Snapshot, localId: number, welcome: boolean) {
    this.state = state;
    this.at = performance.now();
    if (welcome) this.lastEvent = state.events.at(-1)?.id ?? 0;
    const self = state.players.find((p) => p.id === localId);
    const ready = (self?.private?.chain.ready_until ?? 0) > state.tick;
    if (ready && !this.ready) {
      this.tone(1050, 0.22, true);
    }
    this.ready = ready;
    for (const event of state.events) {
      if (event.id <= this.lastEvent) continue;
      this.lastEvent = event.id;
      const source = state.players.find((p) => p.id === event.source);
      if (event.kind === "cast")
        this.renderer.cue(event.source, source?.class_id === "briarwarden");
      if (event.kind === "cast" && event.ability === "prism_ward") {
        const shell = MeshBuilder.CreateSphere(
          "prism-ward-activation",
          { diameter: 1.7, segments: 12 },
          this.renderer.scene,
        );
        shell.position.set(event.pos.x / 1000, 1.05, event.pos.z / 1000);
        shell.material = this.glowMaterial("#57ddeb");
        shell.isPickable = false;
        const footRim = MeshBuilder.CreateTorus(
          "prism-ward-foot-rim",
          { diameter: 2.15, thickness: 0.075, tessellation: 32 },
          this.renderer.scene,
        );
        footRim.position.set(event.pos.x / 1000, 0.16, event.pos.z / 1000);
        footRim.rotation.x = Math.PI / 2;
        footRim.material = this.material("#b3fbff");
        footRim.isPickable = false;
        const crownRim = MeshBuilder.CreateTorus(
          "prism-ward-crown-rim",
          { diameter: 2.05, thickness: 0.055, tessellation: 32 },
          this.renderer.scene,
        );
        crownRim.position.set(event.pos.x / 1000, 1.15, event.pos.z / 1000);
        crownRim.rotation.y = Math.PI / 2;
        crownRim.material = this.material("#57ddeb");
        crownRim.isPickable = false;
        this.bursts.push({
          meshes: [shell, footRim, crownRim],
          born: performance.now(),
          life: 850,
          ward: true,
        });
      }
      const sunderflare =
        event.ability === "unweave" &&
        (event.kind === "hit" || event.kind === "crit");
      if (sunderflare) {
        const origin = source?.pos ?? event.pos;
        const start = new Vector3(0, 1.15, 0);
        const offset = new Vector3(
          (event.pos.x - origin.x) / 1000,
          -0.1,
          (event.pos.z - origin.z) / 1000,
        );
        const side = new Vector3(-offset.z, 0, offset.x).normalize();
        const lash = Array.from({ length: 7 }, (_, index) =>
          start
            .add(offset.scale(index / 6))
            .add(side.scale(index === 0 || index === 6 ? 0 : (index % 2 ? 0.36 : -0.3)))
            .add(new Vector3(0, index === 3 ? 0.32 : 0, 0)),
        );
        const arc = MeshBuilder.CreateLineSystem(
          "sunderflare-arc",
          { lines: [lash] },
          this.renderer.scene,
        );
        arc.position.set(origin.x / 1000, 0, origin.z / 1000);
        arc.color = Color3.FromHexString(event.kind === "crit" ? "#fff0a3" : "#ff8746");
        arc.isPickable = false;
        const flash = MeshBuilder.CreateTorus(
          "sunderflare-impact",
          { diameter: 1.45, thickness: 0.11, tessellation: 24 },
          this.renderer.scene,
        );
        flash.position.set(event.pos.x / 1000, 1.0, event.pos.z / 1000);
        flash.material = this.material(event.kind === "crit" ? "#fff0a3" : "#ff9b55");
        flash.isPickable = false;
        this.bursts.push({
          meshes: [arc, flash],
          born: performance.now(),
          life: 460,
        });
      }
      if (
        ["hit", "crit", "blink", "depart", "ascend", "interrupt", "nova"].includes(
          event.kind,
        ) && !sunderflare
      ) {
        const blink = event.kind === "blink" || event.kind === "depart";
        const ascension = event.kind === "ascend";
        const glasswake = event.ability === "glasswake";
        const flashkindle = event.ability === "flashkindle" && event.kind === "crit";
        const color = blink
          ? "#8cdce8"
          : glasswake
            ? "#71e8f1"
          : ascension
            ? "#ffc95c"
            : flashkindle
              ? "#fff1b5"
            : event.kind === "crit"
              ? "#fff0ad"
              : event.ability === "sunshard"
                ? "#ffe6a1"
                : "#ff8746";
        const meshes = [0, ...(ascension || flashkindle ? [1, 2] : [])].map((ring) => {
          const mesh = MeshBuilder.CreateTorus(
            "spell-impact",
            { diameter: glasswake ? 5.4 : flashkindle ? 1.25 + ring * 0.58 : ascension ? 1.4 + ring * 0.55 : 1.05, thickness: glasswake ? 0.13 : ascension || flashkindle ? 0.12 : 0.09, tessellation: glasswake || flashkindle ? 40 : 20 },
            this.renderer.scene,
          );
          mesh.position.set(event.pos.x / 1000, blink || glasswake ? 0.18 : flashkindle ? 0.8 + ring * 0.18 : 1.05 + ring * 0.18, event.pos.z / 1000);
          mesh.material = this.material(color);
          mesh.isPickable = false;
          return mesh;
        });
        // A single line mesh supplies the burst of embers, rather than many particle draw calls.
        if (!blink && !glasswake && event.kind !== "interrupt") {
          const lines = Array.from({ length: ascension ? 12 : flashkindle ? 10 : 7 }, (_, i) => {
            const angle = i * 2.39996 + event.id;
            const radius = ascension ? 1.6 : flashkindle ? 1.15 : event.ability === "sunshard" ? 1.25 : 0.75;
            const from = new Vector3(Math.cos(angle) * radius * 0.35, 0.2 + i % 3 * 0.13, Math.sin(angle) * radius * 0.35);
            return [from, from.scale(2.1)];
          });
          const sparks = MeshBuilder.CreateLineSystem("impact-embers", { lines }, this.renderer.scene);
          sparks.color = Color3.FromHexString(color);
          sparks.position.set(event.pos.x / 1000, 0.6, event.pos.z / 1000);
          sparks.isPickable = false;
          meshes.push(sparks);
        }
        this.bursts.push({
          meshes,
          born: performance.now(),
          life: ascension ? 1200 : flashkindle ? 760 : 520,
        });
      }
      if (event.amount > 0 || event.kind === "interrupt") {
        const element = document.createElement("span");
        element.className = `combat-number ${event.kind}`;
        element.textContent =
          event.kind === "interrupt"
            ? event.ability === "unweave" ? "SUNDERED" : "INTERRUPTED"
            : `${event.kind === "crit" ? "✦ " : ""}${event.amount}`;
        document.body.append(element);
        this.numbers.push({ element, pos: event.pos, born: performance.now() });
      }
      if (event.source === localId || event.target === localId) {
        if (event.kind === "crit") this.tone(670, 0.16, true);
        else if (event.kind === "hit") this.tone(260, 0.08);
        else if (event.kind === "cast")
          this.tone(event.ability === "sunshard" ? 180 : 450, 0.09, true);
        else if (event.kind === "ascend") this.tone(110, 0.7, true);
        else if (event.kind === "blink") this.tone(800, 0.18);
      }
    }
    while (this.bursts.length > 64)
      this.bursts.shift()!.meshes.forEach((mesh) => mesh.dispose());
    while (this.numbers.length > 32) this.numbers.shift()!.element.remove();
  }
  render() {
    const state = this.state;
    if (!state) return;
    const now = performance.now(),
      tick = state.tick + Math.min(2, (now - this.at) / 50);
    // Visual work has a hard ceiling independently of future match roster sizes.
    const visibleShots = state.projectiles.slice(-96);
    for (const shot of visibleShots) {
      let meshes = this.shots.get(shot.id);
      if (!meshes) {
        const sunshard = shot.ability === "sunshard";
        const flare = shot.ability === "flare_lance";
        const core = MeshBuilder.CreateSphere(
          `projectile-${shot.id}`,
          { diameter: sunshard ? 0.27 : flare ? 0.17 : 0.12, segments: 8 },
          this.renderer.scene,
        );
        core.material = this.material(sunshard ? "#fff0bd" : flare ? "#fff1bd" : "#ffe0a0");
        core.scaling.z = sunshard ? 4.2 : flare ? 5.2 : 2.8;
        core.isPickable = false;
        const trail = MeshBuilder.CreateSphere(
          `projectile-trail-${shot.id}`,
          { diameter: sunshard ? 0.36 : flare ? 0.24 : 0.17, segments: 6 },
          this.renderer.scene,
        );
        trail.material = this.material(sunshard ? "#ffad47" : flare ? "#f05a31" : "#de7940");
        trail.scaling.z = sunshard ? 6.5 : flare ? 8 : 4;
        trail.isPickable = false;
        const glow = MeshBuilder.CreatePlane(`bolt-glow-${shot.id}`, { size: sunshard ? 2.7 : flare ? 1.8 : 1.1 }, this.renderer.scene);
        glow.material = this.glowMaterial(sunshard ? "#ffbc5c" : "#ff873f");
        glow.billboardMode = Mesh.BILLBOARDMODE_ALL;
        glow.isPickable = false;
        meshes = { core, trail, glow };
        this.shots.set(shot.id, meshes);
      }
      const target =
        state.players.find((p) => p.id === shot.target)?.pos ?? shot.to;
      const start = new Vector3(shot.from.x / 1000, 1.25, shot.from.z / 1000),
        end = new Vector3(target.x / 1000, 1.2, target.z / 1000);
      const progress = Math.max(0, Math.min(1, (tick - shot.started) / (shot.ends - shot.started)));
      const position = Vector3.Lerp(
          start,
          end,
          progress,
      );
      for (const mesh of [meshes.core, meshes.trail]) {
        mesh.position.copyFrom(position);
        mesh.lookAt(end);
      }
      meshes.glow.position.copyFrom(position);
      meshes.trail.position.subtractInPlace(end.subtract(start).normalize().scale(shot.ability === "sunshard" ? 0.55 : 0.35));
    }
    for (const [id, mesh] of this.shots)
      if (!visibleShots.some((p) => p.id === id)) {
        mesh.core.dispose();
        mesh.trail.dispose();
        mesh.glow.dispose();
        this.shots.delete(id);
      }
    this.bursts = this.bursts.filter((effect) => {
      const age = (now - effect.born) / effect.life;
      if (age >= 1) {
        effect.meshes.forEach((mesh) => mesh.dispose());
        return false;
      }
      if (effect.ward) {
        const pulse = 0.82 + Math.sin(age * Math.PI * 4) * 0.12;
        effect.meshes.forEach((mesh, i) => {
          mesh.scaling.setAll(pulse + age * (i === 0 ? 0.3 : 0.18));
          if (i > 0) mesh.rotation.y = age * Math.PI * (i === 1 ? 2 : -2);
          mesh.visibility = Math.max(0, 1 - age * 0.82);
        });
        return true;
      }
      effect.meshes.forEach((mesh, i) => {
        mesh.scaling.setAll(0.4 + age * (i === 0 ? 2.7 : 3.4));
        mesh.visibility = Math.max(0, 1 - age);
      });
      return true;
    });
    this.numbers = this.numbers.filter((number) => {
      const age = (now - number.born) / 900;
      if (age >= 1) {
        number.element.remove();
        return false;
      }
      const screen = this.renderer.project(number.pos);
      number.element.style.transform = `translate(${screen.x}px, ${screen.y - age * 60}px)`;
      number.element.style.opacity = String(1 - age);
      return true;
    });
  }
}
