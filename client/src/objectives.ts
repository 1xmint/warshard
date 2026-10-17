import type { Content, Snapshot } from "./protocol";

/** Displays only public authoritative positions; there is no fog-of-war rule yet. */
export function updateObjectives(
  state: Snapshot,
  content: Content,
  id: number,
) {
  const panel = document.querySelector<HTMLElement>("#battle-map")!;
  panel.classList.toggle("hidden", state.match_info.kind !== "ctf");
  if (state.match_info.kind !== "ctf") return;
  const map = content.arena;
  const color = (team: number) => (team === 0 ? "#6ad9bb" : "#e49b73");
  const x = (value: number) => value + map.half_x;
  const y = (value: number) => map.half_z - value;
  const obstacles = map.obstacles
    .map(
      (o) =>
        `<circle cx="${x(o.pos.x)}" cy="${y(o.pos.z)}" r="${o.radius}" fill="#537071"/>`,
    )
    .join("");
  const players = state.players
    .filter((p) => p.health > 0)
    .map(
      (p) =>
        `<circle cx="${x(p.pos.x)}" cy="${y(p.pos.z)}" r="${p.id === id ? 700 : 380}" fill="${color(p.team)}" stroke="${p.id === id ? "#fff4cf" : "#14272c"}" stroke-width="200"/>`,
    )
    .join("");
  const flags = state.match_info.flags
    .map(
      (f) =>
        `<rect x="${x(f.pos.x) - 650}" y="${y(f.pos.z) - 650}" width="1300" height="1300" fill="${color(f.team)}" stroke="#fff4cf" stroke-width="200"/>`,
    )
    .join("");
  const team = state.players.find((p) => p.id === id)?.team;
  const own = state.match_info.flags.find((f) => f.team === team);
  const carrying = state.match_info.flags.some((f) => f.carrier === id);
  panel.innerHTML = `<span class="eyebrow">${map.name.toUpperCase()} · YOU ARE ${team === 0 ? "JADE" : "EMBER"}</span><svg viewBox="0 0 ${map.half_x * 2} ${map.half_z * 2}" role="img" aria-label="Battle map: team dots, square flags, outlined local player">${obstacles}${players}${flags}</svg><small>${carrying ? (own?.carrier !== null || own?.dropped_until ? "Return your own flag before capturing." : "Carry the flag to your home base.") : "Steal their flag. Bring it home. First to 3."}</small>`;
}
