import { test, expect, type Page } from "@playwright/test";
import type { Content, ServerMessage, Snapshot } from "../client/src/protocol";

test.beforeAll(() => console.info("[arena] worker ready"));

function observe(page: Page) {
  const record: {
    state: Snapshot | null;
    id: number;
    content: Content | null;
    errors: string[];
    welcomeCount: number;
  } = { state: null, id: 0, content: null, errors: [], welcomeCount: 0 };
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(payload)) as ServerMessage;
      } catch {
        return;
      }
      if (message.type === "welcome") {
        record.state = message.state;
        record.id = message.id;
        record.content = message.content;
        record.welcomeCount++;
      } else if (message.type === "state") record.state = message.state;
      else if (message.type === "error") record.errors.push(message.code);
    }),
  );
  return record;
}
type RecordState = ReturnType<typeof observe>;
const own = (r: RecordState) => r.state?.players.find((p) => p.id === r.id);
const rival = (r: RecordState) => r.state?.players.find((p) => p.id !== r.id);
async function join(page: Page, room: string, classId: string) {
  await page.goto("/?direct=1");
  await page.locator(`[data-class="${classId}"]`).click();
  await page.locator("#room").fill(room);
  await page.getByRole("button", { name: "ENTER ARENA" }).click();
  await expect(page.locator("#connection")).toHaveText("CONNECTED");
}

test("two real browser players: movement, targeting, interrupt, ground cast, forms, recovery and rematch", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  console.info("[duel] browser launched");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(() => localStorage.setItem("warshard.quality", "2"));
  const a = await context.newPage();
  const b = await context.newPage();
  const runtimeErrors: string[] = [];
  a.on("pageerror", (e) => runtimeErrors.push(e.message));
  b.on("pageerror", (e) => runtimeErrors.push(e.message));
  const ra = observe(a);
  const rb = observe(b);
  const room = `duel-${Date.now()}`;
  await join(a, room, "briarwarden");
  await join(b, room, "ashweaver");
  console.info("[duel] both players admitted");
  await expect.poll(() => ra.state?.phase).toBe("active");
  await a.bringToFront();
  await a.keyboard.press("Tab");
  await expect(a.locator("#target-name")).toHaveText("Ashweaver");
  await a.keyboard.down("KeyD");
  await expect
    .poll(() => own(ra)?.pos.x ?? -5500, { timeout: 5000, intervals: [50] })
    .toBeGreaterThanOrEqual(3500);
  await a.keyboard.up("KeyD");
  await expect
    .poll(() => Math.abs((own(rb)?.pos.x ?? 0) - (rival(rb)?.pos.x ?? 0)))
    .toBeLessThan(2500);
  await a.keyboard.press("Escape");
  await expect(a.locator("#target-frame")).toBeHidden();
  const label = await a.locator(".actor-label.enemy").boundingBox();
  expect(label).not.toBeNull();
  await a.mouse.click(
    label!.x + label!.width / 2,
    label!.y + label!.height + 28,
  );
  await expect(a.locator("#target-frame")).toBeVisible();
  await b.bringToFront();
  await b.keyboard.press("Tab");
  await b.keyboard.press("Digit1");
  await expect.poll(() => own(rb)?.casting?.ability).toBe("bolt");
  await a.keyboard.press("Digit4");
  await expect.poll(() => own(rb)?.casting).toBeNull();
  expect(own(rb)?.private?.lockouts.ember ?? 0).toBeGreaterThan(rb.state!.tick);
  const untouched = own(ra)!.health;
  await expect
    .poll(() => ra.state!.tick - (own(rb)!.private!.lockouts.ember ?? 0), {
      timeout: 5000,
    })
    .toBeGreaterThanOrEqual(0);
  expect(own(ra)!.health).toBe(untouched);
  console.info("[duel] movement, mouse targeting and interrupt verified");
  await b.keyboard.press("Digit5");
  await expect(b.locator("#notice")).toContainText("click the arena");
  const floor = await b.locator(".actor-label.enemy").boundingBox();
  await b.mouse.click(
    floor!.x + floor!.width / 2,
    floor!.y + floor!.height + 75,
  );
  await expect.poll(() => own(rb)?.casting?.ability).toBe("rain");
  expect(ra.state!.areas).toHaveLength(0);
  await expect.poll(() => ra.state?.areas.length).toBe(1);
  await expect.poll(() => own(ra)!.health).toBeLessThan(untouched);
  // Recovery must retain combat state rather than constructing a fresh character.
  const oldHealth = own(rb)!.health;
  const oldId = rb.id;
  const oldTick = rb.state!.tick;
  await b.reload();
  // Recovery includes a fresh WebGL context on CI's shared software GPU.
  await expect(b.locator("#connection")).toHaveText("CONNECTED", {
    timeout: 15000,
  });
  await expect.poll(() => rb.welcomeCount).toBe(2);
  expect(rb.id).toBe(oldId);
  expect(own(rb)!.health).toBe(oldHealth);
  expect(rb.state!.tick).toBeGreaterThan(oldTick);
  await expect.poll(() => ra.state?.areas.length, { timeout: 6000 }).toBe(0);
  console.info("[duel] area and session recovery verified");
  await b.keyboard.press("Tab");
  // Effective combat earns energy; no test-only server state injection.
  await a.bringToFront();
  while ((own(ra)?.private?.energy ?? 0) < 100) {
    const tick = ra.state!.tick;
    await a.keyboard.press("Digit1");
    await expect
      .poll(() => ra.state!.tick, { timeout: 3000 })
      .toBeGreaterThanOrEqual(tick + 21);
    expect(ra.state!.phase).toBe("active");
  }
  await a.keyboard.press("KeyR");
  await expect(a.locator("#form-name")).toContainText("Verdant Crown");
  await expect(
    a.getByRole("button", { name: "1: Crownstrike", exact: true }),
  ).toBeVisible();
  await b.bringToFront();
  while ((own(rb)?.private?.energy ?? 0) < 100) {
    await expect
      .poll(() => (own(rb)?.private?.cooldowns.bolt ?? 0) <= rb.state!.tick)
      .toBe(true);
    await b.keyboard.press("Digit1");
    await expect.poll(() => own(rb)?.casting?.ability).toBe("bolt");
    await expect.poll(() => own(rb)?.casting).toBeNull();
    expect(rb.state!.phase).toBe("active");
  }
  await b.keyboard.press("KeyR");
  await expect(b.locator("#form-name")).toContainText("Solar Ascendant");
  await expect(
    b.getByRole("button", { name: "1: Starthread", exact: true }),
  ).toBeVisible();
  console.info("[duel] both earned transformations verified");
  await b.screenshot({ path: testInfo.outputPath("arena.png") });
  // Confirm expiry through authoritative states, including the independent class kit.
  await expect.poll(() => own(ra)?.form, { timeout: 16000 }).toBe("warden");
  await expect.poll(() => own(rb)?.form, { timeout: 16000 }).toBe("weaver");
  while (rb.state!.phase === "active") {
    await b.keyboard.press("Digit1");
    const tick = rb.state!.tick;
    await expect
      .poll(() => rb.state!.tick, { timeout: 4000 })
      .toBeGreaterThanOrEqual(tick + 30);
  }
  expect(rb.state!.phase).toBe("finished");
  expect(rb.state!.winner).toBe(rb.id);
  await expect.poll(() => rb.state?.phase, { timeout: 10000 }).toBe("active");
  expect(own(rb)!.health).toBe(1250);
  expect(own(ra)!.health).toBe(1500);
  expect(runtimeErrors).toEqual([]);
  console.info("[duel] expiry, defeat and rematch verified");
  await context.close();
  console.info("[duel] browser context closed");
});

test("protocol rejects wrong versions and malformed admission", async ({
  page,
}) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    function request(message: object): Promise<string> {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://${location.host}/ws`);
        const timeout = setTimeout(() => reject(Error("timeout")), 4000);
        ws.onopen = () => ws.send(JSON.stringify(message));
        ws.onmessage = (e) => {
          clearTimeout(timeout);
          const data = JSON.parse(String(e.data)) as {
            code?: string;
            type: string;
          };
          resolve(data.code ?? data.type);
          ws.close();
        };
        ws.onerror = reject;
      });
    }
    return [
      await request({
        type: "join",
        version: 999,
        room: "bad",
        class_id: "briarwarden",
        resume: null,
      }),
      await request({
        type: "join",
        version: 4,
        room: "../bad",
        class_id: "briarwarden",
        resume: null,
      }),
      await request({ type: "input", seq: 1, dx: 99, dz: 0 }),
    ];
  });
  expect(results).toEqual([
    "protocol_version",
    "invalid_room",
    "join_required",
  ]);
});
