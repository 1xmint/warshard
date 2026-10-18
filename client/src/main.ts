import { ArcanistUI } from "./arcanist-ui";
import { CombatPresentation } from "./combat-presentation";
import { spellIcon } from "./spell-icons";
import { MouseControls } from "./controls";
import { updateObjectives } from "./objectives";
import "./style.css";
import "./arcanist.css";
import "./menus.css";
import { ArenaRenderer } from "./renderer";
import { Connection } from "./network";
import { Menus } from "./menus";
import { Prediction } from "./movement";
import type { Ability, PlayerView, Snapshot } from "./protocol";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const net = new Connection();
let renderer: ArenaRenderer;
try {
  renderer = new ArenaRenderer($<HTMLCanvasElement>("#arena"));
} catch (error) {
  $("#lobby-error").textContent =
    "WebGL could not start. Enable hardware acceleration or try another browser.";
  throw error;
}
const controls = new MouseControls(
  renderer.canvas,
  renderer.camera,
  () =>
    status === "CONNECTED" &&
    !document.querySelector("dialog[open]") &&
    ["front", "modes", "queue-panel", "results", "lobby"].every((id) =>
      $("#" + id).classList.contains("hidden"),
    ),
  (x, y) => renderer.pickAt(x, y),
  () => notice("Mouse lock is unavailable here; camera drag still works."),
  (x, y) => renderer.pointAt(x, y),
);
const combat = new CombatPresentation(renderer);
const prediction = new Prediction();
const keys = new Set<string>();
let selectedClass = "briarwarden";
let selectedTarget: number | null = null;
let placement: number | null = null;
let status = "OFFLINE";
let currentForm = "";
let previous: Snapshot | null = null;
let noticeUntil = 0;
let stateAt = 0;
let roomName = "";
const help = $<HTMLDialogElement>("#help");
const menus = new Menus({
  queue: (playlist, practice) => {
    $("#lobby-error").textContent = "";
    menus.queueing(playlist);
    net.queue(playlist, selectedClass, practice);
  },
  leave: () => $("#leave").click(),
  quality: (scale) => {
    renderer.engine.setHardwareScalingLevel(scale);
    renderer.engine.resize();
  },
});
const heroUI = new ArcanistUI({
  quick: () => {
    document
      .querySelector<HTMLButtonElement>('[data-class="arcanist"]')!
      .click();
    menus.queueing("arena_1");
    net.queue("arena_1", "arcanist", true);
  },
  reset: (difficulty) => {
    keys.clear();
    controls.release();
    cancelPlacement();
    net.send({ type: "reset_practice", difficulty });
  },
  barrier: () => cast(6),
  sound: () => {
    combat.muted = !combat.muted;
    return combat.muted;
  },
});
document.body.insertAdjacentHTML(
  "beforeend",
  '<aside id="battle-map" class="battle-map hidden"></aside><section id="objectives" class="objective-hud hidden"><strong id="score"></strong><span id="match-clock"></span><div id="flag-status"></div></section><button id="mobility" class="mobility-button hidden">Q · Mobility</button>',
);
$("#mobility").onclick = () =>
  self()?.class_id === "arcanist"
    ? cast(5)
    : net.send({ type: "mobility", target: selectedTarget });
const errors: Record<string, string> = {
  rooted: "You cannot use mobility while rooted.",
  mobility_cooldown: "Your mobility ability is recharging.",
  no_path: "Terrain blocks that movement.",
  select_target: "Select an enemy first.",
  invalid_target: "Choose a living enemy.",
  out_of_range: "Target is out of range.",
  line_of_sight: "Line of sight is blocked.",
  global_cooldown: "Ability is not ready yet.",
  cooldown: "That ability is recharging.",
  school_locked: "Your spell school is interrupted.",
  resource: "Not enough focus.",
  already_casting: "Already casting. Move to cancel.",
  round_not_active: "Wait for the round to begin.",
  dead: "You have fallen. Check your respawn timer or match results.",
  energy: "Reach 100% energy to ascend.",
  already_transformed: "Your transformation is already active.",
  room_full:
    "This arena is full. Choose another channel or resume your existing tab.",
  session_expired:
    "Your guest session expired. Return to the menu and queue again.",
  connection_lost: "Connection lost. Return to the lobby and try again.",
  protocol_version:
    "Client/server versions differ. Reload after updating both.",
  stale_session: "This session was opened in another connection.",
  input_backlog: "Connection is falling behind.",
  rate_limit: "Too many commands. Reconnecting…",
  server_busy: "Server is busy. Try again.",
};
function notice(message: string) {
  $("#notice").textContent = message;
  noticeUntil = performance.now() + 2300;
}
function log(message: string) {
  const entry = document.createElement("p");
  entry.textContent = message;
  $("#log").append(entry);
  while ($("#log").children.length > 5) $("#log").firstElementChild?.remove();
}
function self(): PlayerView | undefined {
  return net.state?.players.find((p) => p.id === net.id);
}
function active(): boolean {
  return net.state?.phase === "active" && status === "CONNECTED";
}
function cancelPlacement() {
  placement = null;
  renderer.setPlacement(null);
}
function target(id: number | null) {
  const valid = net.state?.players.find(
    (p) => p.id === id && p.team !== self()?.team && p.health > 0,
  );
  selectedTarget = valid?.id ?? null;
  updateHud();
}
function cast(slot: number) {
  const p = self();
  if (!p || !net.content) return;
  const id =
    slot < 5
      ? net.content.forms[p.form].abilities[slot]
      : net.content.classes[p.class_id].utilities[slot - 5];
  if (!id) return;
  const a = net.content.abilities[id];
  if (!active()) {
    notice(errors.round_not_active);
    return;
  }
  if (a.target === "ground") {
    placement = slot;
    const effect = a.effects.find((e) => e.kind === "area");
    renderer.setPlacement(effect?.kind === "area" ? effect.radius : 2700);
    notice(`${a.name}: click the arena to place · Esc to cancel`);
    updateHud();
    return;
  }
  cancelPlacement();
  net.send({
    type: "cast",
    slot,
    target: a.target === "enemy" ? selectedTarget : null,
    point: null,
  });
}
function ascend() {
  cancelPlacement();
  net.send({ type: "ultimate", form: null });
}
renderer.onPick = (id, point) => {
  if (placement !== null && point) {
    const slot = placement;
    cancelPlacement();
    net.send({ type: "cast", slot, target: null, point });
  } else if (id !== null) target(id);
};
function focusedInput(event: KeyboardEvent) {
  return (
    event.target instanceof HTMLInputElement ||
    !!document.querySelector("dialog[open]")
  );
}
window.addEventListener("keydown", (event) => {
  if (
    focusedInput(event) ||
    ["front", "modes", "queue-panel", "results", "lobby"].some(
      (id) => !$("#" + id).classList.contains("hidden"),
    )
  )
    return;
  if (["KeyW", "KeyA", "KeyS", "KeyD", "Tab", "Space"].includes(event.code))
    event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === "Tab") {
    const opponents =
      net.state?.players
        .filter((p) => p.team !== self()?.team && p.health > 0)
        .sort((a, b) => a.id - b.id) ?? [];
    target(
      opponents[
        (opponents.findIndex((p) => p.id === selectedTarget) + 1) %
          opponents.length
      ]?.id ?? null,
    );
  } else if (/^Digit[1-5]$/.test(event.code))
    cast(Number(event.code.slice(-1)) - 1);
  else if (event.code === "KeyR") ascend();
  else if (event.code === "KeyQ")
    self()?.class_id === "arcanist"
      ? cast(5)
      : net.send({ type: "mobility", target: selectedTarget });
  else if (event.code === "KeyE" && self()?.class_id === "arcanist") cast(6);
  else if (event.code === "Escape") {
    if (placement !== null) {
      cancelPlacement();
      notice("Placement canceled.");
    } else target(null);
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => keys.clear());
$("#soundless").onclick = () => {
  keys.clear();
  controls.release();
  help.showModal();
};
$("#close-help").onclick = () => help.close();
$("#ultimate").onclick = ascend;
for (const card of document.querySelectorAll<HTMLButtonElement>("[data-class]"))
  card.onclick = () => {
    selectedClass = card.dataset.class!;
    for (const other of document.querySelectorAll("[data-class]")) {
      const chosen = other === card;
      other.classList.toggle("selected", chosen);
      other.setAttribute("aria-pressed", String(chosen));
    }
  };
$("#join-form").onsubmit = (event) => {
  event.preventDefault();
  roomName = $<HTMLInputElement>("#room").value.trim();
  $("#lobby-error").textContent = "";
  $<HTMLButtonElement>("#join").disabled = true;
  if (location.search.includes("direct=1")) net.join(roomName, selectedClass);
  else {
    menus.queueing(menus.playlist);
    net.queue(menus.playlist, selectedClass, false);
  }
};
$("#leave").onclick = () => {
  net.send({ type: "leave_match" });
  net.cancelQueue();
  sessionStorage.removeItem("warshard.join");
  keys.clear();
  controls.release();
  heroUI.hide();
  cancelPlacement();
  menus.main();
  $<HTMLButtonElement>("#join").disabled = false;
  for (const id of [
    "battle-map",
    "objectives",
    "mobility",
    "hud",
    "session",
    "chronicle",
    "self-frame",
    "target-frame",
    "match-status",
  ])
    $(`#${id}`).classList.add("hidden");
};
net.onQueue = (playlist, waiting, needed) =>
  menus.queued(playlist, waiting, needed);
net.onStatus = (text) => {
  status = text;
  if (text !== "CONNECTED") controls.release();
  $("#connection").textContent = text;
  $("#light").classList.toggle("online", text === "CONNECTED");
  if (text === "RECONNECTING") {
    keys.clear();
    notice("Connection interrupted. Recovering your character…");
  }
  if (text === "OFFLINE" || text === "SESSION REPLACED")
    $<HTMLButtonElement>("#join").disabled = false;
};
net.onError = (code) => {
  const message = errors[code] ?? code.replaceAll("_", " ");
  menus.error(message);
  notice(message);
  if (!$("#lobby").classList.contains("hidden"))
    $("#lobby-error").textContent = message;
};
net.onState = (state, welcome) => {
  stateAt = performance.now();
  const p = state.players.find((p) => p.id === net.id);
  if (!p || !net.content) return;
  combat.receive(state, net.id, welcome);
  heroUI.update(state, net.id, net.content);
  if (welcome) {
    prediction.reset(p);
    controls.reset(p.facing);
    renderer.configure(net.content);
    menus.connected(net.content);
    $("#objectives").classList.remove("hidden");
    $("#mobility").classList.remove("hidden");
    $("#lobby").classList.add("hidden");
    for (const id of [
      "hud",
      "session",
      "chronicle",
      "self-frame",
      "match-status",
    ])
      $(`#${id}`).classList.remove("hidden");
    $(".location span").textContent = net.content.arena.name.toUpperCase();
    $(".location small").textContent = state.match_info.name.toUpperCase();
    $("#match-status .eyebrow").textContent =
      state.match_info.kind === "ctf" ? "CAPTURE THE FLAG" : "TEAM ELIMINATION";
    $("#room-label").textContent =
      state.match_info.name + (state.match_info.practice ? " · PRACTICE" : "");
    log(`You entered ${state.match_info.name}.`);
    currentForm = "";
    previous = null;
  }
  prediction.reconcile(
    p,
    net.content.arena,
    state.tick,
    state.phase === "active",
  );
  renderer.receive(state, welcome);
  if (
    selectedTarget !== null &&
    !state.players.some((p) => p.id === selectedTarget && p.health > 0)
  )
    selectedTarget = null;
  if (previous) {
    for (const player of state.players) {
      const old = previous.players.find((p) => p.id === player.id);
      if (!old) continue;
      const name =
        player.id === net.id
          ? "You"
          : net.content.classes[player.class_id].name;
      if (old.health > player.health)
        log(
          `${name} ${player.id === net.id ? "take" : "takes"} ${old.health - player.health} damage.`,
        );
      if (old.form !== player.form)
        log(`${name}: ${net.content.forms[player.form].name}.`);
      if (old.casting?.ability !== player.casting?.ability && player.casting)
        log(
          `${name} ${player.id === net.id ? "cast" : "casts"} ${net.content.abilities[player.casting.ability].name}.`,
        );
    }
    if (previous.phase !== "finished" && state.phase === "finished")
      log(
        state.match_info.winner_team === self()?.team
          ? "Victory. The court is yours."
          : "Defeat. Rise again next round.",
      );
    if (previous.round !== state.round) {
      prediction.reset(p, true);
      controls.reset(p.facing);
      selectedTarget = null;
      cancelPlacement();
      log(`Round ${state.round} begins shortly.`);
    }
  }
  previous = state;
  updateHud();
  menus.update(state, net.id);
};

function tooltip(a: Ability) {
  return `${a.name}\n${a.description}\n${a.target === "own" ? "Self" : `${a.range / 1000}m range`} · ${a.cast ? `${a.cast / 20}s cast` : "Instant"} · ${a.cooldown / 20}s cooldown · ${a.cost} focus`;
}
function updateHud() {
  const p = self();
  const state = net.state;
  const content = net.content;
  if (!p || !state || !content || !p.private) return;
  const tick = state.tick;
  const info = content.classes[p.class_id];
  if (status === "CONNECTED") updateObjectives(state, content, net.id);
  $("#self-name").textContent = info.name;
  $("#self-health").style.width = `${(p.health / p.max_health) * 100}%`;
  $("#self-hp").textContent =
    `${p.health} / ${p.max_health}${p.shield ? ` + ${p.shield}` : ""}`;
  $("#resource").style.width = `${p.private.resource}%`;
  $("#self-status").textContent =
    p.health <= 0
      ? "Fallen"
      : p.root_until > tick
        ? "Rooted"
        : p.slow_until > tick
          ? "Slowed"
          : Object.values(p.private.lockouts).some((t) => t > tick)
            ? "Spell school interrupted"
            : `${p.private.resource} focus`;
  const enemy = state.players.find((t) => t.id === selectedTarget);
  $("#target-frame").classList.toggle("hidden", !enemy);
  if (enemy) {
    $("#target-name").textContent = content.classes[enemy.class_id].name;
    $("#target-health").style.width =
      `${(enemy.health / enemy.max_health) * 100}%`;
    $("#target-hp").textContent =
      `${enemy.health} / ${enemy.max_health}${enemy.shield ? ` + ${enemy.shield}` : ""}`;
    $("#target-status").textContent = enemy.casting
      ? `Casting ${content.abilities[enemy.casting.ability].name}`
      : !enemy.connected
        ? "Disconnected · still in combat"
        : enemy.root_until > tick
          ? "Rooted"
          : "Enemy combatant";
  }
  $("#round-label").textContent =
    `${state.players.length}/${state.match_info.team_size * 2} combatants · ${state.players.filter((p) => p.bot).length} bots`;
  const remaining = Math.max(0, Math.ceil((state.starts_at - tick) / 20));
  $("#phase").textContent =
    state.phase === "waiting"
      ? "Assembling teams"
      : state.phase === "countdown"
        ? `Prepare · ${remaining}`
        : state.phase === "finished"
          ? state.match_info.winner_team === self()?.team
            ? "Victory"
            : "Defeat"
          : `Round ${state.round}`;
  $("#phase-detail").textContent =
    state.phase === "waiting"
      ? location.search.includes("direct=1")
        ? "Invite a second browser to this arena channel."
        : "Waiting for assigned players to load."
      : state.phase === "countdown"
        ? "Know your abilities. Choose your moment."
        : state.phase === "finished"
          ? location.search.includes("direct=1")
            ? `The court awakens again in ${remaining}s.`
            : "Match complete. Results are ready."
          : "Steel. Spell. Resolve.";
  $("#score").textContent =
    `JADE ${state.match_info.scores[0]} : ${state.match_info.scores[1]} EMBER`;
  const seconds = Math.max(
    0,
    Math.ceil((state.match_info.ends_at - tick) / 20),
  );
  $("#match-clock").textContent =
    state.phase === "active"
      ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
      : state.phase;
  $("#flag-status").textContent = state.match_info.flags
    .map(
      (f) =>
        `${f.team === 0 ? "Jade" : "Ember"} flag: ${f.carrier !== null ? `carried by #${f.carrier}` : f.dropped_until ? "dropped" : "home"}`,
    )
    .join(" · ");
  $("#mobility").textContent = info.utilities.length
    ? `Q · ${content.abilities[info.utilities[0]].name}`
    : `Q · ${info.mobility.name}${p.private.mobility_until > tick ? " · " + Math.ceil((p.private.mobility_until - tick) / 20) + "s" : ""}`;
  if (p.health <= 0 && p.respawn_at > tick)
    $("#phase-detail").textContent =
      `Respawn in ${Math.ceil((p.respawn_at - tick) / 20)}s`;
  if (currentForm !== p.form) {
    currentForm = p.form;
    cancelPlacement();
    $("#abilities").replaceChildren();
    content.forms[p.form].abilities.forEach((id, slot) => {
      const ability = content.abilities[id];
      const button = document.createElement("button");
      button.className = "ability";
      button.title = tooltip(ability);
      button.dataset.slot = String(slot);
      button.setAttribute("aria-label", `${slot + 1}: ${ability.name}`);
      button.innerHTML = `<span class="key">${slot + 1}</span><span class="ability-icon">${spellIcon(ability.icon)}</span><span class="ability-name">${ability.name}</span><span class="cooldown-shade"></span><span class="cooldown-label"></span><span class="charge-count"></span>`;
      button.onclick = () => cast(slot);
      $("#abilities").append(button);
    });
  }
  $("#form-name").textContent =
    `${content.forms[p.form].name}${p.form_until > tick ? ` · ${Math.ceil((p.form_until - tick) / 20)}s` : " · PRIMARY FORM"}`;
  const form = content.forms[p.form];
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    ".ability",
  )) {
    const slot = Number(button.dataset.slot);
    const id = form.abilities[slot];
    const a = content.abilities[id];
    const left = Math.max(
      0,
      (p.private.cooldowns[id] ?? 0) - tick,
      a.charges > 1 && p.private.charges[id]?.count === 0
        ? p.private.charges[id].next_at - tick
        : 0,
      a.effects.some((effect) => effect.kind === "blink")
        ? 0
        : p.private.gcd_until - tick,
    );
    button.classList.toggle("counting-down", left > 0);
    button.querySelector(".cooldown-label")!.textContent =
      left > 0
        ? left < 20 ? (left / 20).toFixed(1) : String(Math.ceil(left / 20))
        : "";
    button.querySelector(".charge-count")!.textContent =
      a.charges > 1
        ? `${p.private.charges[id]?.count ?? a.charges}/${a.charges}`
        : "";
    button.classList.toggle(
      "unavailable",
      left > 0 || p.private.resource < a.cost || !active(),
    );
    button.classList.toggle("placing", placement === slot);
    button.classList.toggle(
      "proc-ready",
      p.class_id === "arcanist" &&
        slot === 3 &&
        p.private.chain.ready_until > tick,
    );
  }
  $("#ult-energy").textContent =
    p.form_until > tick
      ? `${Math.ceil((p.form_until - tick) / 20)}s`
      : `${p.private.energy}%`;
  $("#ultimate").classList.toggle(
    "ready",
    p.private.energy >= 100 && !p.form_until,
  );
}

setInterval(() => {
  const p = self();
  if (!p || !net.content || status !== "CONNECTED") return;
  const moving =
    !document.querySelector("dialog[open]") && !document.hidden && active();
  if (!moving) controls.release();
  const dx = moving ? Number(keys.has("KeyD")) - Number(keys.has("KeyA")) : 0;
  const dz = moving ? Number(keys.has("KeyW")) - Number(keys.has("KeyS")) : 0;
  if (net.socket?.bufferedAmount && net.socket.bufferedAmount > 16_384) return;
  const direction = controls.movement(dx, dz);
  const input = prediction.sample(
    direction.dx,
    direction.dz,
    p,
    net.content.arena,
    net.state!.tick,
    active(),
  );
  if (!net.send({ type: "steer", ...input, facing: direction.facing }))
    prediction.pending = [];
}, 50);
renderer.engine.runRenderLoop(() => {
  // Let connection/recovery handshakes run before expensive shader work.
  // Background tabs retain networking without competing for the GPU.
  if (document.hidden || status === "CONNECTING" || status === "RECONNECTING")
    return;
  controls.renderCursor();
  combat.render();
  renderer.render(
    net.id,
    status === "CONNECTED" ? prediction.pos : null,
    selectedTarget,
    controls.facing,
  );
  if (performance.now() > noticeUntil) $("#notice").textContent = "";
  const p = self();
  const cast = p?.casting;
  $(".cast-wrap").classList.toggle("visible", !!cast);
  if (cast && net.content && net.state) {
    const tick =
      net.state.tick + Math.min(2, (performance.now() - stateAt) / 50);
    $("#cast-label").textContent = net.content.abilities[cast.ability].name;
    $("#cast-progress").style.width =
      `${Math.min(100, Math.max(0, ((tick - cast.started) / (cast.ends - cast.started)) * 100))}%`;
  }
});

const stored = sessionStorage.getItem("warshard.join");
if (stored) {
  try {
    const prefs = JSON.parse(stored) as { room: string; classId: string };
    roomName = prefs.room;
    selectedClass = prefs.classId;
    $<HTMLInputElement>("#room").value = roomName;
    $<HTMLButtonElement>("#join").disabled = true;
    net.join(roomName, selectedClass);
  } catch {
    sessionStorage.removeItem("warshard.join");
  }
}
