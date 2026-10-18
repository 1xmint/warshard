import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Snapshot, Pos } from "./protocol";
import type { ArenaRenderer } from "./renderer";

/** Local sound and bounded visual cues consume server events; never decide hits. */
export class CombatPresentation {
  private state: Snapshot | null = null;
  private at = 0;
  private lastEvent = 0;
  private shots = new Map<number, Mesh>();
  private bursts: { mesh: Mesh; born: number; life: number }[] = [];
  private numbers: { element: HTMLElement; pos: Pos; born: number }[] = [];
  private materials = new Map<string, StandardMaterial>();
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
      if (
        ["hit", "crit", "blink", "depart", "ascend", "interrupt"].includes(
          event.kind,
        )
      ) {
        const blink = event.kind === "blink" || event.kind === "depart";
        const mesh = MeshBuilder.CreateTorus(
          "spell-impact",
          { diameter: 1.1, thickness: 0.1, tessellation: 20 },
          this.renderer.scene,
        );
        mesh.position.set(
          event.pos.x / 1000,
          blink ? 0.15 : 1.1,
          event.pos.z / 1000,
        );
        mesh.material = this.material(
          blink ? "#8cdce8" : event.kind === "crit" ? "#fff0ad" : "#f39751",
        );
        mesh.isPickable = false;
        this.bursts.push({
          mesh,
          born: performance.now(),
          life: event.kind === "ascend" ? 1200 : 450,
        });
      }
      if (event.amount > 0 || event.kind === "interrupt") {
        const element = document.createElement("span");
        element.className = `combat-number ${event.kind}`;
        element.textContent =
          event.kind === "interrupt"
            ? "UNWOVEN"
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
    while (this.bursts.length > 64) this.bursts.shift()!.mesh.dispose();
    while (this.numbers.length > 32) this.numbers.shift()!.element.remove();
  }
  render() {
    const state = this.state;
    if (!state) return;
    const now = performance.now(),
      tick = state.tick + Math.min(2, (now - this.at) / 50);
    for (const shot of state.projectiles) {
      let mesh = this.shots.get(shot.id);
      if (!mesh) {
        mesh = MeshBuilder.CreateSphere(
          `projectile-${shot.id}`,
          {
            diameter:
              shot.ability === "sunshard"
                ? 0.7
                : shot.ability === "flare_lance"
                  ? 0.4
                  : 0.23,
            segments: 8,
          },
          this.renderer.scene,
        );
        mesh.material = this.material(
          shot.ability === "sunshard"
            ? "#ffe4a0"
            : shot.ability === "flare_lance"
              ? "#ff8a49"
              : "#f4bb6b",
        );
        mesh.isPickable = false;
        mesh.scaling.z = 1.8;
        this.shots.set(shot.id, mesh);
      }
      const target =
        state.players.find((p) => p.id === shot.target)?.pos ?? shot.to;
      const start = new Vector3(shot.from.x / 1000, 1.25, shot.from.z / 1000),
        end = new Vector3(target.x / 1000, 1.2, target.z / 1000);
      mesh.position.copyFrom(
        Vector3.Lerp(
          start,
          end,
          Math.max(
            0,
            Math.min(1, (tick - shot.started) / (shot.ends - shot.started)),
          ),
        ),
      );
      mesh.lookAt(end);
    }
    for (const [id, mesh] of this.shots)
      if (!state.projectiles.some((p) => p.id === id)) {
        mesh.dispose();
        this.shots.delete(id);
      }
    this.bursts = this.bursts.filter((effect) => {
      const age = (now - effect.born) / effect.life;
      if (age >= 1) {
        effect.mesh.dispose();
        return false;
      }
      effect.mesh.scaling.setAll(0.5 + age * 2.5);
      effect.mesh.visibility = 1 - age;
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
