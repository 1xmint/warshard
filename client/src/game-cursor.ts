/** Presentation for a cursor whose position comes from relative mouse motion. */
export class GameCursor {
  x = 0;
  y = 0;
  private arrow = document.createElement("div");
  private tooltip = document.createElement("div");
  private hovered: HTMLButtonElement | null = null;

  constructor(private point: (x: number, y: number) => void) {
    this.arrow.id = "game-cursor";
    this.arrow.className = "game-cursor hidden";
    this.tooltip.className = "cursor-tooltip hidden";
    this.arrow.setAttribute("aria-hidden", "true");
    this.tooltip.setAttribute("aria-hidden", "true");
    document.body.append(this.arrow, this.tooltip);
  }

  set(x: number, y: number) {
    this.x = Math.max(0, Math.min(innerWidth - 1, x));
    this.y = Math.max(0, Math.min(innerHeight - 1, y));
    this.point(this.x, this.y);
  }

  button() {
    return document.elementFromPoint(this.x, this.y)?.closest("button") ?? null;
  }

  show(visible: boolean) {
    this.arrow.classList.toggle("hidden", !visible);
    this.arrow.style.transform = `translate(${this.x}px, ${this.y}px)`;
    const hovered = visible ? this.button() : null;
    if (hovered !== this.hovered) {
      this.hovered?.classList.remove("mouse-hover");
      hovered?.classList.add("mouse-hover");
      this.hovered = hovered;
    }
    const title = hovered?.title ?? "";
    this.tooltip.textContent = title;
    this.tooltip.classList.toggle("hidden", !title);
    this.tooltip.style.left = `${Math.max(8, Math.min(innerWidth - 328, this.x + 20))}px`;
    this.tooltip.style.top = `${Math.max(8, this.y - this.tooltip.offsetHeight - 12)}px`;
  }
}
