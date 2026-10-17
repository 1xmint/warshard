import { test, expect } from "@playwright/test";
import type { ServerMessage, Snapshot } from "../client/src/protocol";

test("mouse orbit, steering, both-button movement, release order and blur", async ({
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
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const room = `camera-${Date.now()}`;
  await page.goto("/?direct=1");
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
          version: 3,
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
  await expect.poll(() => state?.phase).toBe("active");
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
  const stopTick = state!.tick;
  await expect.poll(() => state!.tick).toBeGreaterThan(stopTick + 2);
  const stopped = { ...current().pos };
  await expect.poll(() => state!.tick).toBeGreaterThan(stopTick + 8);
  expect(current().pos).toEqual(stopped);
  await page.mouse.up({ button: "right" });
  // Start the chord in the reverse order too; then simulate losing focus.
  await page.mouse.down({ button: "left" });
  await page.mouse.down({ button: "right" });
  await expect.poll(() => current().pos).not.toEqual(stopped);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const blurTick = state!.tick;
  await expect.poll(() => state!.tick).toBeGreaterThan(blurTick + 2);
  const blurred = { ...current().pos };
  await expect.poll(() => state!.tick).toBeGreaterThan(blurTick + 8);
  expect(current().pos).toEqual(blurred);
  await page.mouse.up({ button: "right" });
  await page.mouse.up({ button: "left" });
  expect(errors).toEqual([]);
  await opponent.close();
});
