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
  private lockPending = false;
  private hadLock = false;
  private unlockRequested = false;
  private denied = false;
  private savedCursor: string | null = null;
  constructor(
    private canvas: HTMLCanvasElement,
    private camera: ArcRotateCamera,
    private enabled: () => boolean,
    click: (x: number, y: number) => void,
    private lockUnavailable: () => void = () => {},
  ) {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    const begin = (e: MouseEvent) => {
      if (!this.enabled() || (e.button !== 0 && e.button !== 2)) return;
      e.preventDefault();
      if (!this.buttons) {
        this.start = { x: e.clientX, y: e.clientY };
        this.dragged = false;
        this.combined = false;
      }
      this.last = { x: e.clientX, y: e.clientY };
      const wasRight = (this.buttons & 2) !== 0;
      this.buttons = e.buttons & 3;
      this.combined ||= this.buttons === 3;
      if (this.buttons & 2) {
        this.faceCamera();
        if (!wasRight) this.lock();
      }
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.enabled() || (e.button !== 0 && e.button !== 2)) return;
      this.pointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      begin(e);
    });
    canvas.addEventListener("mousedown", begin);

    const move = (e: MouseEvent) => {
      if (!this.buttons || !this.enabled()) {
        this.release();
        return;
      }
      if (!(e.buttons & 3)) {
        this.release();
        return;
      }
      const wasRight = (this.buttons & 2) !== 0;
      this.buttons = e.buttons & 3;
      if (this.buttons & 2 && !wasRight) {
        this.faceCamera();
        this.lock();
      }
      this.combined ||= this.buttons === 3;
      const locked = document.pointerLockElement === canvas;
      const dx = locked ? e.movementX : e.clientX - this.last.x;
      const dy = locked ? e.movementY : e.clientY - this.last.y;
      this.last = { x: e.clientX, y: e.clientY };
      if (
        locked
          ? dx !== 0 || dy !== 0
          : Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) > 4
      )
        this.dragged = true;
      if (!this.dragged) return;
      this.camera.alpha -= dx * 0.005;
      this.camera.beta = Math.max(
        0.25,
        Math.min(1.35, this.camera.beta - dy * 0.004),
      );
      if (this.buttons & 2) this.faceCamera();
    };
    canvas.addEventListener("pointermove", (e) => {
      if (document.pointerLockElement !== canvas) move(e);
    });
    canvas.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === canvas) move(e);
    });

    const end = (e: MouseEvent) => {
      if (!this.buttons) return;
      const select =
        this.enabled() &&
        e.button === 0 &&
        this.buttons === 1 &&
        !this.dragged &&
        !this.combined;
      this.buttons = e.buttons & 3;
      if (!(this.buttons & 2)) this.unlock();
      if (!this.buttons) this.release();
      if (select) click(e.clientX, e.clientY);
    };
    canvas.addEventListener("pointerup", (e) => {
      if (document.pointerLockElement !== canvas) end(e);
    });
    document.addEventListener("mouseup", (e) => {
      if (document.pointerLockElement === canvas || e.buttons) end(e);
    });
    canvas.addEventListener("pointercancel", () => this.release());
    canvas.addEventListener("lostpointercapture", () => {
      // Lock acquisition can release pointer capture; mouse events now belong to the lock.
      if (!this.lockPending && document.pointerLockElement !== canvas)
        this.release();
    });
    document.addEventListener("pointerlockchange", () => {
      const locked = document.pointerLockElement === canvas;
      if (locked) {
        this.hadLock = true;
        this.unlockRequested = false;
        if (!(this.buttons & 2) || !this.enabled()) this.unlock();
      } else if (this.hadLock) {
        this.hadLock = false;
        if (!this.unlockRequested) this.release(); // Escape/browser cancellation must stop autorun.
        this.unlockRequested = false;
      }
    });
    document.addEventListener("pointerlockerror", () => this.lockFailed());
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape") this.release();
    });
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
  private lock() {
    if (this.lockPending || document.pointerLockElement === this.canvas) return;
    this.denied = false;
    if (!this.canvas.requestPointerLock) {
      this.lockFailed();
      return;
    }
    this.lockPending = true;
    this.savedCursor = this.canvas.style.cursor;
    this.canvas.style.cursor = "none";
    try {
      // Both promise and legacy void implementations are supported.
      Promise.resolve(this.canvas.requestPointerLock())
        .catch(() => this.lockFailed())
        .finally(() => {
          this.lockPending = false;
        });
    } catch {
      this.lockPending = false;
      this.lockFailed();
    }
  }
  private restoreCursor() {
    if (this.savedCursor !== null) this.canvas.style.cursor = this.savedCursor;
    this.savedCursor = null;
  }
  private lockFailed() {
    this.restoreCursor();
    if (!this.denied) {
      this.denied = true;
      this.lockUnavailable();
    }
  }
  private unlock() {
    this.restoreCursor();
    if (document.pointerLockElement === this.canvas) {
      this.unlockRequested = true;
      document.exitPointerLock();
    }
  }
  private faceCamera() {
    const angle = -this.camera.alpha - Math.PI / 2;
    this.facing = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }
  release() {
    this.buttons = 0;
    this.unlock();
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
