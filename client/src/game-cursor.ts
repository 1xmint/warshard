/** Presentation for a cursor whose position comes from relative mouse motion. */
export class GameCursor {
  x = 0;
  y = 0;
  private arrow = document.createElement("div");
  private tooltip = document.createElement("div");
  private hovered: HTMLButtonElement | null = null;
  private visible = false;
  private dirty = true;

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
    this.dirty = true;
  }

  button() {
    return document.elementFromPoint(this.x, this.y)?.closest("button") ?? null;
  }

  show(visible: boolean) {
    if (this.visible !== visible) this.dirty = true;
    this.visible = visible;
  }

  /** Coalesce high-frequency mouse events into the existing display frame. */
  render() {
    if (!this.dirty) return;
    this.dirty = false;
    const visible = this.visible;
    this.point(this.x, this.y);
    this.arrow.classList.toggle("hidden", !visible);
    this.arrow.style.transform = `translate(${this.x}px, ${this.y}px)`;
    const hovered = visible ? this.button() : null;
    if (hovered !== this.hovered) {
      this.hovered?.classList.remove("mouse-hover");
      hovered?.classList.add("mouse-hover");
      this.hovered = hovered;
    }
    const title = hovered?.title ?? "";
    if (this.tooltip.textContent !== title) this.tooltip.textContent = title;
    this.tooltip.classList.toggle("hidden", !title);
    if (title) {
      this.tooltip.style.left = `${Math.max(8, Math.min(innerWidth - 328, this.x + 20))}px`;
      this.tooltip.style.top = `${Math.max(8, this.y - this.tooltip.offsetHeight - 12)}px`;
    }
  }
}
