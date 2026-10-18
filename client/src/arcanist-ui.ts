import type { BotDifficulty, Content, Snapshot } from "./protocol";

export class ArcanistUI {
  private difficulty: BotDifficulty = "trained";
  private debug = false;
  private proc = document.createElement("div");
  private panel = document.createElement("aside");
  constructor(actions: {
    quick: () => void;
    reset: (difficulty: BotDifficulty) => void;
    sound: () => boolean;
  }) {
    const quick = document.createElement("button");
    quick.id = "arcanist-duel";
    quick.textContent = "Cinderborn duel · Play now";
    quick.onclick = actions.quick;
    document.querySelector(".front-actions")!.prepend(quick);
    this.proc.id = "proc-banner";
    this.proc.className = "proc-banner hidden";
    this.proc.setAttribute("role", "status");
    this.panel.id = "duel-controls";
    this.panel.className = "duel-controls hidden";
    this.panel.innerHTML = `<span class="eyebrow">DUEL LAB</span><div class="difficulty"><button data-difficulty="easy">Easy</button><button data-difficulty="trained">Trained</button><button data-difficulty="skilled">Skilled</button></div><button id="restart-duel">Restart duel</button><div class="duel-options"><button id="combat-sound">Sound: on</button><button id="combat-debug">Bot insight</button></div><p id="bot-insight" class="hidden"></p>`;
    const retry = document.createElement("button");
    retry.id = "retry-duel";
    retry.className = "hidden";
    retry.textContent = "Fight again";
    retry.onclick = () => actions.reset(this.difficulty);
    document.querySelector("#results-menu")!.before(retry);
    document.querySelector("#hud")!.prepend(this.proc);
    document.body.append(this.panel);
    for (const button of this.panel.querySelectorAll<HTMLButtonElement>(
      "[data-difficulty]",
    ))
      button.onclick = () => {
        this.difficulty = button.dataset.difficulty as BotDifficulty;
        actions.reset(this.difficulty);
      };
    this.panel.querySelector<HTMLButtonElement>("#restart-duel")!.onclick =
      () => actions.reset(this.difficulty);
    this.panel.querySelector<HTMLButtonElement>("#combat-sound")!.onclick = (
      event,
    ) => {
      (event.currentTarget as HTMLButtonElement).textContent = actions.sound()
        ? "Sound: off"
        : "Sound: on";
    };
    this.panel.querySelector<HTMLButtonElement>("#combat-debug")!.onclick =
      () => {
        this.debug = !this.debug;
        this.panel
          .querySelector("#bot-insight")!
          .classList.toggle("hidden", !this.debug);
      };
  }
  hide() {
    this.panel.classList.add("hidden");
    this.proc.classList.add("hidden");
  }
  update(state: Snapshot, id: number, content: Content) {
    const own = state.players.find((p) => p.id === id);
    if (!own?.private) return;
    const arcanist = own.class_id === "arcanist";
    const practice =
      state.match_info.practice && state.match_info.kind === "arena";
    this.panel.classList.toggle("hidden", !practice);
    document
      .querySelector("#retry-duel")!
      .classList.toggle("hidden", !practice);
    this.difficulty = state.match_info.bot_difficulty;
    for (const button of this.panel.querySelectorAll<HTMLButtonElement>(
      "[data-difficulty]",
    ))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.difficulty === this.difficulty),
      );
    const ready = own.private.embers >= 3;
    this.proc.classList.toggle("hidden", !arcanist || state.phase !== "active");
    this.proc.classList.toggle("ready", ready);
    this.proc.classList.toggle("prepared", own.private.embers > 0 && !ready);
    const name = content.abilities[content.forms[own.form].abilities[2]].name;
    this.proc.textContent = `${"●".repeat(own.private.embers)}${"○".repeat(3-own.private.embers)} EMBERS · ${ready ? `${name.toUpperCase()} READY · Press 3` : "Build with 1/2 · commit to 4 when safe"}${own.sun ? ` · LIVING SUN: ${own.sun.charges} echoes` : ""}`;
    document.querySelector('[data-slot="2"]')?.classList.toggle("proc-ready", arcanist && ready);    const insight = state.players
      .filter((p) => p.bot)
      .map(
        (p) =>
          `${content.classes[p.class_id].name}: ${p.bot_action ?? "Preparing"}`,
      )
      .join(" · ");
    if (this.debug)
      this.panel.querySelector("#bot-insight")!.textContent = insight;
  }
}
