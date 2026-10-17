import type { Arena, PlayerView, Pos } from "./protocol";

export function moveStep(
  pos: Pos,
  dx: number,
  dz: number,
  step: number,
  arena: Arena,
): Pos {
  const walkable = (p: Pos) =>
    Math.abs(p.x) <= arena.half_x - 350 &&
    Math.abs(p.z) <= arena.half_z - 350 &&
    arena.obstacles.every(
      (o) =>
        (p.x - o.pos.x) ** 2 + (p.z - o.pos.z) ** 2 > (o.radius + 350) ** 2,
    );
  let next = { ...pos };
  const x = { x: pos.x + Math.trunc((dx * step) / 1000), z: pos.z };
  if (walkable(x)) next = x;
  const z = { x: next.x, z: pos.z + Math.trunc((dz * step) / 1000) };
  if (walkable(z)) next = z;
  return next;
}
type Input = { seq: number; dx: number; dz: number };
export class Prediction {
  seq = 0;
  pos: Pos = { x: 0, z: 0 };
  pending: Input[] = [];
  reset(player: PlayerView) {
    this.seq = player.private?.ack ?? 0;
    this.pending = [];
    this.pos = { ...player.pos };
  }
  reconcile(player: PlayerView, arena: Arena, tick: number, active: boolean) {
    const ack = player.private?.ack ?? 0;
    this.pending = this.pending.filter((i) => i.seq > ack);
    this.pos = { ...player.pos };
    if (active && player.health > 0 && player.root_until <= tick)
      for (const input of this.pending)
        this.pos = moveStep(
          this.pos,
          input.dx,
          input.dz,
          player.slow_until > tick ? 125 : 250,
          arena,
        );
  }
  sample(
    dx: number,
    dz: number,
    player: PlayerView,
    arena: Arena,
    tick: number,
    active: boolean,
  ): Input {
    const input = { seq: ++this.seq, dx, dz };
    this.pending.push(input);
    if (this.pending.length > 10) this.pending.shift();
    if (active && player.health > 0 && player.root_until <= tick)
      this.pos = moveStep(
        this.pos,
        dx,
        dz,
        player.slow_until > tick ? 125 : 250,
        arena,
      );
    return input;
  }
}
