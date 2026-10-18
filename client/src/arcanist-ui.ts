import type { BotDifficulty, Content, Snapshot } from "./protocol";

export class ArcanistUI {
  private difficulty: BotDifficulty = "trained";
  private debug = false;
  private proc = document.createElement("div");
  private panel = document.createElement("aside");
  private barrier = document.createElement("button");
  constructor(actions: {
    quick: () => void;
    reset: (difficulty: BotDifficulty) => void;
    barrier: () => void;
    sound: () => boolean;
  }) {
    const quick = document.createElement("button");
    quick.id = "arcanist-duel";
    quick.textContent = "Arcanist duel · Play now";
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
    this.barrier.id = "arcanist-barrier";
    this.barrier.className = "arcanist-barrier hidden";
    this.barrier.textContent = "E · Prism Ward";
    this.barrier.onclick = actions.barrier;
    document.body.append(this.proc, this.panel, this.barrier);
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
    this.barrier.classList.add("hidden");
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
    this.barrier.classList.toggle(
      "hidden",
      !arcanist || state.phase !== "active",
    );
    this.difficulty = state.match_info.bot_difficulty;
    for (const button of this.panel.querySelectorAll<HTMLButtonElement>(
      "[data-difficulty]",
    ))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.difficulty === this.difficulty),
      );
    const cooldown = Math.max(
      0,
      (own.private.cooldowns.prism_ward ?? 0) - state.tick,
    );
    this.barrier.textContent = `E · Prism Ward${cooldown ? ` · ${Math.ceil(cooldown / 20)}s` : ""}`;
    this.barrier.title = content.abilities.prism_ward.description;
    const ready = own.private.chain.ready_until > state.tick;
    const prepared = own.private.chain.prepared_until > state.tick;
    this.proc.classList.toggle("hidden", !arcanist || state.phase !== "active");
    this.proc.classList.toggle("ready", ready);
    this.proc.classList.toggle("prepared", prepared && !ready);
    const text = ready
      ? `SUNSHARD READY · Press 4 · ${Math.ceil((own.private.chain.ready_until - state.tick) / 20)}s`
      : prepared
        ? `KINDLING · A critical hit readies Sunshard · ${Math.ceil((own.private.chain.prepared_until - state.tick) / 20)}s`
        : "Build Kindling with critical hits · Flashkindle can force the next critical hit";
    if (this.proc.textContent !== text) this.proc.textContent = text;
    const sun = document.querySelector('[data-slot="3"]');
    sun?.classList.toggle("proc-ready", arcanist && ready);
    const insight = state.players
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
