import { test, expect } from "@playwright/test";
import type {
  ClientMessage,
  ServerMessage,
  Snapshot,
} from "../client/src/protocol";

test("cursor batches pointer samples per frame and keeps the latest position", async ({
  page,
}) => {
  await page.goto("/health");
  const result = await page.evaluate(async () => {
    const path = "/src/game-cursor.ts";
    const { GameCursor } = await import(path);
    const picks: number[][] = [];
    const cursor = new GameCursor((x: number, y: number) => picks.push([x, y]));
    for (let i = 0; i < 100; i++) cursor.set(i, i);
    const beforeFrame = picks.length;
    cursor.render();
    cursor.render(); // An unchanged frame must not repeat picking or DOM work.
    const afterIdleFrame = picks.length;
    cursor.set(200, 300);
    cursor.render();
    return { beforeFrame, afterIdleFrame, picks };
  });
  expect(result).toEqual({
    beforeFrame: 0,
    afterIdleFrame: 1,
    picks: [
      [99, 99],
      [200, 300],
    ],
  });
});

for (const allowLock of [true, false]) {
  test(`mouse orbit, steering and cleanup (${allowLock ? "native pointer lock" : "lock denied fallback"})`, async ({
    page,
    context,
  }) => {
    let state: Snapshot | null = null,
      id = 0;
    page.on("websocket", (s) =>
      s.on("framereceived", ({ payload }) => {
        const m = JSON.parse(String(payload)) as ServerMessage;
        if (m.type === "welcome") {
          state = m.state;
          id = m.id;
        }
        if (m.type === "state") state = m.state;
      }),
    );
    if (!allowLock)
      await page.addInitScript(() => {
        HTMLCanvasElement.prototype.requestPointerLock = () =>
          Promise.reject(
            new DOMException("Blocked for fallback test", "NotAllowedError"),
          );
      });
    await page.addInitScript(() => {
      const native = HTMLCanvasElement.prototype.requestPointerLock;
      HTMLCanvasElement.prototype.requestPointerLock = function () {
        document.documentElement.dataset.lockRequests = String(
          Number(document.documentElement.dataset.lockRequests ?? 0) + 1,
        );
        return native.call(this);
      };
    });
    let lastInput: Extract<ClientMessage, { type: "steer" }> | null = null;
    page.on("websocket", (socket) =>
      socket.on("framesent", ({ payload }) => {
        const m = JSON.parse(String(payload)) as ClientMessage;
        if (m.type === "steer") lastInput = m;
      }),
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const room = `camera-${Date.now()}`;
    await page.goto("/?direct=1");
    await page.locator('[data-class="ashweaver"]').click();
    await page.locator("#room").fill(room);
    await page.locator("#join").click();
    const opponent = await context.newPage();
    await opponent.goto("/health");
    await opponent.evaluate((room) => {
      const ws = new WebSocket(`ws://${location.host}/ws`);
      let seq = 0;
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            type: "join",
            version: 6,
            room,
            class_id: "ashweaver",
            resume: null,
          }),
        );
      const heartbeat = setInterval(() => {
        if (ws.readyState === 1)
          ws.send(JSON.stringify({ type: "input", seq: ++seq, dx: 0, dz: 0 }));
        if (ws.readyState === 3) clearInterval(heartbeat);
      }, 50);
    }, room);
    await page.bringToFront();
    const current = () => state!.players.find((p) => p.id === id)!;
    const settledPosition = async () => {
      await expect
        .poll(
          () => lastInput !== null && lastInput.dx === 0 && lastInput.dz === 0,
        )
        .toBe(true);
      const stopSeq = lastInput!.seq;
      await expect
        .poll(() => current().private!.ack)
        .toBeGreaterThanOrEqual(stopSeq);
      const pos = { ...current().pos },
        tick = state!.tick;
      await expect.poll(() => state!.tick).toBeGreaterThan(tick + 6);
      expect(current().pos).toEqual(pos);
      return pos;
    };
    // Three seconds of countdown plus first-use shader work on software GPUs.
    await expect.poll(() => state?.phase, { timeout: 15000 }).toBe("active");
    const origin = { ...current().pos },
      facing = current().facing;
    await page.mouse.move(650, 650);
    const enemy = page.locator(".actor-label.enemy");
    await expect(enemy).toBeVisible();
    const hit = (await enemy.boundingBox())!;
    await page.mouse.click(hit.x + hit.width / 2, hit.y + hit.height + 28);
    await expect(page.locator("#target-frame")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.mouse.move(650, 650);
    const before = (await enemy.boundingBox())!.x;
    await page.mouse.down({ button: "left" });
    await page.mouse.move(760, 620, { steps: 10 });
    await page.mouse.up({ button: "left" });
    await expect
      .poll(async () => Math.abs((await enemy.boundingBox())!.x - before))
      .toBeGreaterThan(40);
    expect(current().pos).toEqual(origin);
    expect(current().facing).toBe(facing);
    await expect(page.locator("#target-frame")).toBeHidden();
    await page.mouse.down({ button: "right" });
    if (allowLock)
      await expect
        .poll(() => page.evaluate(() => document.pointerLockElement?.id))
        .toBe("arena");
    else {
      await expect(page.locator("#notice")).toContainText(
        "Mouse lock is unavailable",
      );
      await expect
        .poll(() => page.evaluate(() => document.pointerLockElement))
        .toBeNull();
    }
    await page.mouse.move(690, 650, { steps: 10 });
    await expect.poll(() => current().facing).not.toBe(facing);
    expect(current().pos).toEqual(origin);
    await page.mouse.down({ button: "left" });
    await expect
      .poll(
        () =>
          Math.abs(current().pos.x - origin.x) +
          Math.abs(current().pos.z - origin.z),
      )
      .toBeGreaterThan(1000);
    expect(current().pos.x).not.toBe(origin.x);
    expect(current().pos.z).not.toBe(origin.z);
    await page.mouse.up({ button: "left" });
    const stopped = await settledPosition();
    await page.mouse.up({ button: "right" });
    if (allowLock) {
      await expect
        .poll(() => page.evaluate(() => document.pointerLockElement?.id))
        .toBe("arena");
      const cursor = page.locator("#game-cursor");
      await expect(cursor).toBeVisible();
      const anchor = await cursor.boundingBox();
      for (let n = 0; n < 3; n++) {
        await page.mouse.down({ button: "right" });
        await expect(cursor).toBeHidden();
        await page.mouse.up({ button: "right" });
        await expect(cursor).toBeVisible();
        expect(await cursor.boundingBox()).toEqual(anchor);
      }
      await expect(page.locator("html")).toHaveAttribute(
        "data-lock-requests",
        "1",
      );
      // Move the logical cursor using real relative mouse events, not DOM clicks.
      const moveCursor = async (x: number, y: number) => {
        await page.mouse.move(0, 0);
        const at = (await cursor.boundingBox())!;
        await page.mouse.move(x - at.x, y - at.y, { steps: 5 });
        await expect
          .poll(async () => (await cursor.boundingBox())!.x)
          .toBeCloseTo(Math.floor(x), 0);
        await expect
          .poll(async () => (await cursor.boundingBox())!.y)
          .toBeCloseTo(Math.floor(y), 0);
      };
      const virtualClick = async () => {
        await page.mouse.down();
        await page.mouse.up();
      };
      const hit = (await enemy.boundingBox())!;
      await moveCursor(hit.x + hit.width / 2, hit.y + hit.height + 28);
      await virtualClick();
      await expect(page.locator("#target-frame")).toBeVisible();
      const groundButton = page.getByRole("button", {
        name: "5: Cinderfall",
        exact: true,
      });
      const ability = (await groundButton.boundingBox())!;
      await moveCursor(
        ability.x + ability.width / 2,
        ability.y + ability.height / 2,
      );
      await expect(page.locator(".cursor-tooltip")).toContainText("Cinderfall");
      await virtualClick();
      await expect(page.locator("#notice")).toContainText("click the arena");
      const ownLabel = (await page
        .locator(".actor-label:not(.enemy)")
        .boundingBox())!;
      await moveCursor(
        ownLabel.x + ownLabel.width / 2,
        ownLabel.y + ownLabel.height + 70,
      );
      await virtualClick();
      await expect.poll(() => current().casting?.ability).toBe("rain");
      await expect.poll(() => state!.areas.length).toBeGreaterThan(0);
      await expect(page.locator("html")).toHaveAttribute(
        "data-lock-requests",
        "1",
      );
    } else {
      await expect
        .poll(() => page.evaluate(() => document.pointerLockElement))
        .toBeNull();
      await expect(page.locator("#game-cursor")).toBeHidden();
    }
    // Start the chord in the reverse order too; then simulate losing focus.
    await page.mouse.down({ button: "left" });
    await page.mouse.down({ button: "right" });
    await expect.poll(() => current().pos).not.toEqual(stopped);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect
      .poll(() => page.evaluate(() => document.pointerLockElement))
      .toBeNull();
    await settledPosition();
    await page.mouse.up({ button: "right" });
    await page.mouse.up({ button: "left" });
    // Escape releases native lock and mouse autorun even while the physical buttons stay held.
    await page.mouse.down({ button: "right" });
    if (allowLock)
      await expect
        .poll(() => page.evaluate(() => document.pointerLockElement?.id))
        .toBe("arena");
    await page.mouse.down({ button: "left" });
    await page.keyboard.press("Escape");
    await expect
      .poll(() => page.evaluate(() => document.pointerLockElement))
      .toBeNull();
    await settledPosition();
    await page.mouse.up({ button: "left" });
    await page.mouse.up({ button: "right" });
    if (allowLock) {
      // A grant arriving after Escape canceled capture must immediately unlock.
      await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("#arena")!;
        const native = canvas.requestPointerLock.bind(canvas);
        canvas.requestPointerLock = () =>
          new Promise<void>((resolve, reject) => {
            window.addEventListener(
              "finish-lock-request",
              () => {
                canvas.requestPointerLock = native;
                Promise.resolve(native())
                  .then(() => {
                    canvas.dataset.lateLockGranted = "true";
                    resolve();
                  }, reject)
                  .finally(() =>
                    window.dispatchEvent(new Event("late-lock-complete")),
                  );
              },
              { once: true },
            );
          });
      });
      await page.mouse.down({ button: "right" });
      await page.mouse.up({ button: "right" });
      await page.keyboard.press("Escape");
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            window.addEventListener("late-lock-complete", () => resolve(), {
              once: true,
            });
            window.dispatchEvent(new Event("finish-lock-request"));
          }),
      );
      await expect(page.locator("#arena")).toHaveAttribute(
        "data-late-lock-granted",
        "true",
      );
      await expect
        .poll(() => page.evaluate(() => document.pointerLockElement))
        .toBeNull();
      expect(
        await page
          .locator("#arena")
          .evaluate((el) => (el as HTMLElement).style.cursor),
      ).not.toBe("none");
    }
    if (allowLock) {
      await page.mouse.move(650, 650);
      await page.mouse.down({ button: "right" });
      await page.mouse.up({ button: "right" });
      await expect(page.locator("#game-cursor")).toBeVisible();
      const clickHud = async (selector: string) => {
        await page.mouse.move(0, 0);
        const cursor = (await page.locator("#game-cursor").boundingBox())!;
        const button = (await page.locator(selector).boundingBox())!;
        await page.mouse.move(
          button.x + button.width / 2 - cursor.x,
          button.y + button.height / 2 - cursor.y,
        );
        await page.mouse.down();
        await page.mouse.up();
      };
      await clickHud("#soundless");
      await expect(page.locator("#help")).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.pointerLockElement))
        .toBeNull();
      await page.locator("#close-help").click();
      await page.mouse.move(650, 650);
      await page.mouse.down({ button: "right" });
      await page.mouse.up({ button: "right" });
      await expect(page.locator("#game-cursor")).toBeVisible();
      await clickHud("#leave");
      await expect(page.locator("#front")).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.pointerLockElement))
        .toBeNull();
      await expect(page.locator("#game-cursor")).toBeHidden();
    }
    expect(errors).toEqual([]);
    await opponent.close();
  });
}
