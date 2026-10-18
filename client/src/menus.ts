import definitions from "../../data/game.json";
import type { Content, Snapshot } from "./protocol";

const node = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id)! as T;
export class Menus {
  playlist = "ctf_6";
  private content: Content | null = null;
  private resultKey = "";
  constructor(
    private actions: {
      queue: (playlist: string, practice: boolean) => void;
      leave: () => void;
      quality: (scale: number) => void;
    },
  ) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<section id="front" class="front-menu"><span class="eyebrow">WARSHARD · EARLY PLAYABLE</span><h1>Every shard<br>has a battle.</h1><p>Steel, spell, and the ground between.<br>Enter the court or carry your colors through Riftwood.</p><div class="front-actions"><button id="play">Play <span>↗</span></button><button id="classes">Classes <span>Ⅱ</span></button><button disabled>Equipment <small>COMING LATER</small></button><button id="settings">Settings <span>⚙</span></button></div><small class="build-note">Guest play · Original 3D fantasy PvP</small></section>
    <section id="modes" class="menu-panel hidden"><span class="eyebrow">CHOOSE YOUR BATTLE</span><h1>A place to make your stand.</h1><div id="playlist-grid"></div><button id="modes-back" class="text-button">← Main menu</button></section>
    <section id="queue-panel" class="menu-panel hidden"><span class="eyebrow">SERVER MATCHMAKING</span><h1>Gathering the warband.</h1><p id="queue-name"></p><strong id="queue-count">Connecting…</strong><p id="queue-error" role="alert"></p><p>Waiting for human opponents?<br>Start a practice match now. Bots fill the other slots.</p><button id="queue-bots">Play now with bots</button><button id="cancel-queue">Cancel queue</button></section>
    <section id="results" class="menu-panel hidden"><span class="eyebrow">MATCH COMPLETE</span><h1 id="result-title"></h1><p id="result-reason"></p><div id="result-roster"></div><button id="results-menu">Return to main menu</button></section>
    <dialog id="settings-dialog"><button id="settings-close">×</button><span class="eyebrow">FIELD SETTINGS</span><h2>Make the battlefield yours.</h2><label>Render quality <select id="render-quality"><option value="1">Standard</option><option value="1.5">Performance</option><option value="2">Low resolution</option></select></label><p>WASD · Move relative to facing<br>Left-drag · Look around<br>Right-drag · Turn character and camera<br>Both mouse buttons · Run forward<br>Wheel · Zoom<br>Tab or click · Target<br>1–5 · Current kit<br>Q · Class mobility<br>R · Ascension<br>Escape · Cancel placement / clear target</p></dialog>
    <dialog id="classes-dialog"><button id="classes-close">×</button><span class="eyebrow">TWO CALLINGS</span><h2>Steel and spell.</h2><div id="class-inspect"></div></dialog>`,
    );
    const entries = Object.entries(definitions.playlists);
    for (const [id, p] of entries) {
      const button = document.createElement("button");
      button.className = "playlist-card";
      button.disabled = !p.enabled;
      button.innerHTML = `<span class="eyebrow">${p.kind === "ctf" ? "CAPTURE THE FLAG" : "TEAM ELIMINATION"}</span><strong>${p.team_size} vs ${p.team_size}</strong><span>${definitions.maps[p.map as keyof typeof definitions.maps].name}</span><small>${p.enabled ? "Choose battle →" : "LATER · NOT YET VALIDATED"}</small>`;
      button.onclick = () => {
        this.playlist = id;
        this.showClasses();
      };
      node("playlist-grid").append(button);
    }
    node("play").onclick = () => this.screen("modes");
    node("modes-back").onclick = () => this.main();
    node("cancel-queue").onclick = () => {
      this.actions.leave();
      this.main();
    };
    node("queue-bots").onclick = () => this.actions.queue(this.playlist, true);
    node("results-menu").onclick = () => {
      this.actions.leave();
      this.main();
    };
    node("settings").onclick = () =>
      node<HTMLDialogElement>("settings-dialog").showModal();
    node("settings-close").onclick = () =>
      node<HTMLDialogElement>("settings-dialog").close();
    node("classes").onclick = () =>
      node<HTMLDialogElement>("classes-dialog").showModal();
    node("classes-close").onclick = () =>
      node<HTMLDialogElement>("classes-dialog").close();
    for (const info of Object.values(definitions.classes)) {
      const section = document.createElement("section");
      section.innerHTML = `<h2>${info.name}</h2><p>${info.description}</p><p>Q · ${info.mobility.name}</p>`;
      const form =
        definitions.forms[info.base_form as keyof typeof definitions.forms];
      for (const id of form.abilities) {
        const a =
          definitions.abilities[id as keyof typeof definitions.abilities];
        const p = document.createElement("p");
        p.textContent = `${a.name}: ${a.description}`;
        section.append(p);
      }
      node("class-inspect").append(section);
    }
    const quality = node<HTMLSelectElement>("render-quality");
    quality.value = localStorage.getItem("warshard.quality") ?? "1";
    quality.onchange = () => {
      localStorage.setItem("warshard.quality", quality.value);
      this.actions.quality(Number(quality.value));
    };
    this.actions.quality(Number(quality.value));
    node("join").insertAdjacentHTML(
      "beforebegin",
      '<button type="button" id="practice" class="practice-button">Play solo with bots →</button><p class="play-choice">Start immediately with bots, or queue below for human opponents.</p>',
    );
    node("lobby").insertAdjacentHTML(
      "beforeend",
      '<button id="class-back" class="text-button">← Choose another battle</button>',
    );
    node("practice").onclick = () => this.actions.queue(this.playlist, true);
    node("class-back").onclick = () => {
      node("lobby").classList.add("hidden");
      this.screen("modes");
    };
    if (location.search.includes("direct=1")) {
      this.screen(null);
      node("lobby").classList.remove("hidden");
      node("practice").classList.add("hidden");
      document.querySelector(".play-choice")!.classList.add("hidden");
      node("class-back").classList.add("hidden");
    } else this.main();
  }
  private screen(id: string | null) {
    for (const name of ["front", "modes", "queue-panel", "results"])
      node(name).classList.toggle("hidden", name !== id);
  }
  main() {
    this.resultKey = "";
    this.screen("front");
    node("lobby").classList.add("hidden");
  }
  showClasses() {
    this.screen(null);
    node("lobby").classList.remove("hidden");
    node("room").closest("label")!.classList.add("hidden");
    node("join").textContent = "Queue for human opponents →";
    node("lobby-error").textContent = "";
    node("join").removeAttribute("disabled");
    node("lobby").querySelector(".eyebrow")!.textContent =
      definitions.playlists[
        this.playlist as keyof typeof definitions.playlists
      ].name;
  }
  queued(playlist: string, waiting: number, needed: number) {
    this.screen("queue-panel");
    node("lobby").classList.add("hidden");
    node("queue-name").textContent =
      definitions.playlists[playlist as keyof typeof definitions.playlists]
        ?.name ?? playlist;
    node("queue-count").textContent = `${waiting} / ${needed} humans`;
  }
  queueing(playlist: string) {
    this.queued(playlist, 0, 0);
    node("queue-count").textContent = "Connecting to queue…";
    node("queue-error").textContent = "";
  }
  error(message: string) {
    if (!node("queue-panel").classList.contains("hidden"))
      node("queue-error").textContent = message;
  }
  connected(content: Content) {
    this.content = content;
    this.resultKey = "";
    this.screen(null);
    node("lobby").classList.add("hidden");
  }
  update(state: Snapshot, id: number) {
    if (state.phase !== "finished" && this.resultKey) {
      this.resultKey = "";
      this.screen(null);
    }
    if (
      state.phase !== "finished" ||
      !this.content ||
      location.search.includes("direct=1")
    )
      return;
    const key = `${state.match_info.playlist}-${state.round}`;
    if (key === this.resultKey) return;
    this.resultKey = key;
    const team = state.players.find((p) => p.id === id)?.team;
    node("result-title").textContent =
      state.match_info.winner_team === null
        ? "Draw"
        : state.match_info.winner_team === team
          ? "Victory"
          : "Defeat";
    node("result-reason").textContent =
      `${state.match_info.scores.join(" : ")} · ${state.match_info.reason.replaceAll("_", " ")}${state.match_info.practice ? " · PRACTICE" : ""}`;
    node("result-roster").replaceChildren();
    const table = document.createElement("table");
    table.innerHTML =
      "<thead><tr><th>Combatant</th><th>Team</th><th>K / D</th><th>Damage</th><th>Caps / Returns</th></tr></thead>";
    for (const [playerId, s] of Object.entries(state.match_info.stats)) {
      const p = {
        id: Number(playerId),
        class_id: s.class_id,
        team: s.team,
        bot: s.bot,
      };
      const row = document.createElement("tr");
      for (const value of [
        `${this.content.classes[p.class_id].name} ${p.bot ? "[BOT]" : p.id === id ? "[YOU]" : "[HUMAN]"}`,
        p.team === 0 ? "Jade" : "Ember",
        `${s?.kills ?? 0} / ${s?.deaths ?? 0}`,
        s?.damage ?? 0,
        `${s?.captures ?? 0} / ${s?.returns ?? 0}`,
      ]) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.append(cell);
      }
      table.append(row);
    }
    node("result-roster").append(table);
    this.screen("results");
  }
}
