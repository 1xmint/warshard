import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

/** Mouse state belongs to the canvas; UI clicks never start steering or movement. */
export class MouseControls {
  facing = 0;
  private buttons = 0;
  private start = { x: 0, y: 0 };
  private last = { x: 0, y: 0 };
  private dragged = false;
  private combined = false;
  private pointer: number | null = null;
  constructor(
    private canvas: HTMLCanvasElement,
    private camera: ArcRotateCamera,
    private enabled: () => boolean,
    click: (x: number, y: number) => void,
  ) {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.enabled() || (e.button !== 0 && e.button !== 2)) return;
      e.preventDefault();
      if (!this.buttons) {
        this.start = { x: e.clientX, y: e.clientY };
        this.dragged = false;
        this.combined = false;
      }
      this.last = { x: e.clientX, y: e.clientY };
      this.buttons = e.buttons;
      this.combined ||= (this.buttons & 3) === 3;
      this.pointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      if (this.buttons & 2) this.faceCamera();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.buttons || !this.enabled()) {
        this.release();
        return;
      }
      if (!(e.buttons & 3)) {
        this.release();
        return;
      }
      this.buttons = e.buttons & 3;
      this.combined ||= this.buttons === 3;
      if (this.buttons & 2) this.faceCamera();
      const dx = e.clientX - this.last.x,
        dy = e.clientY - this.last.y;
      this.last = { x: e.clientX, y: e.clientY };
      if (Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) > 4)
        this.dragged = true;
      if (!this.dragged) return;
      this.camera.alpha -= dx * 0.005;
      this.camera.beta = Math.max(
        0.25,
        Math.min(1.35, this.camera.beta - dy * 0.004),
      );
      if (this.buttons & 2) this.faceCamera();
    });
    // Pointer down/up only fire for the first/last mouse button. Track chord changes too.
    canvas.addEventListener("mousedown", (e) => {
      if (!this.buttons || !this.enabled()) return;
      this.buttons = e.buttons & 3;
      this.combined ||= this.buttons === 3;
      if (this.buttons & 2) this.faceCamera();
    });
    canvas.addEventListener("mouseup", (e) => {
      if (e.buttons) this.buttons = e.buttons & 3;
    });
    canvas.addEventListener("pointerup", (e) => {
      const select =
        this.enabled() &&
        e.button === 0 &&
        this.buttons === 1 &&
        !this.dragged &&
        !this.combined;
      this.buttons = e.buttons & 3;
      if (!this.buttons) this.release();
      if (select) click(e.clientX, e.clientY);
    });
    canvas.addEventListener("pointercancel", () => this.release());
    canvas.addEventListener("lostpointercapture", () => this.release());
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!this.enabled()) return;
        e.preventDefault();
        this.camera.radius = Math.max(
          8,
          Math.min(48, this.camera.radius + e.deltaY * 0.02),
        );
      },
      { passive: false },
    );
    window.addEventListener("blur", () => this.release());
    document.addEventListener("visibilitychange", () => this.release());
  }
  private faceCamera() {
    const angle = -this.camera.alpha - Math.PI / 2;
    this.facing = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }
  release() {
    this.buttons = 0;
    if (this.pointer !== null && this.canvas.hasPointerCapture(this.pointer))
      this.canvas.releasePointerCapture(this.pointer);
    this.pointer = null;
  }
  reset(facing: number) {
    this.release();
    this.facing = facing / 1000;
    this.camera.alpha = -Math.PI / 2 - this.facing;
  }
  movement(strafe: number, forward: number) {
    if ((this.buttons & 3) === 3 && this.enabled()) forward = 1;
    const sin = Math.sin(this.facing),
      cos = Math.cos(this.facing);
    const dx = strafe * cos + forward * sin,
      dz = forward * cos - strafe * sin;
    const scale = 1000 / Math.max(1, Math.hypot(dx, dz));
    return {
      dx: Math.trunc(dx * scale),
      dz: Math.trunc(dz * scale),
      facing: Math.floor(this.facing * 1000),
    };
  }
}
