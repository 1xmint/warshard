import { test, expect } from "@playwright/test";
import type { ServerMessage, Snapshot } from "../client/src/protocol";

test("Arcanist quick duel: licensed models, critical chain, instant payoff, barrier, blink and repeatable difficulty", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  let state: Snapshot | null = null,
    id = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      const message = JSON.parse(String(payload)) as ServerMessage;
      if (message.type === "welcome") {
        state = message.state;
        id = message.id;
      }
      if (message.type === "state") state = message.state;
      if (message.type === "error") errors.push(message.code);
    }),
  );
  const own = () => state!.players.find((p) => p.id === id)!;
  const ready = async () => {
    await expect.poll(() => state?.phase).toBe("active");
  };
  const gcd = async () => {
    await expect.poll(() => own().private!.gcd_until <= state!.tick).toBe(true);
  };
  await page.goto("/");
  await page
    .getByRole("button", { name: "Arcanist duel · Play now", exact: true })
    .click();
  await ready();
  expect(own().class_id).toBe("arcanist");
  expect(state!.match_info.bot_difficulty).toBe("trained");
  await expect
    .poll(() => state!.players.find((p) => p.bot)?.bot_action)
    .toBeTruthy();
  await expect(page.locator("#arena")).toHaveAttribute(
    "data-arena-art",
    "kenney",
    { timeout: 15000 },
  );
  await expect(page.locator('.actor-label[data-model="kaykit"]')).toHaveCount(
    2,
    { timeout: 15000 },
  );
  const oldRound = state!.round;
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await expect.poll(() => state!.round).toBeGreaterThan(oldRound);
  await ready();
  expect(state!.match_info.bot_difficulty).toBe("easy");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Digit3");
  await expect(page.locator("#proc-banner")).toContainText("KINDLING");
  await gcd();
  await page.keyboard.press("Digit3");
  await expect(page.locator("#proc-banner")).toContainText("SUNSHARD READY");
  await expect(page.locator('[data-slot="3"]')).toHaveClass(/proc-ready/);
  expect(own().private!.charges.flashkindle.count).toBe(0);
  await page.screenshot({ path: info.outputPath("arcanist-ready.png") });
  await gcd();
  await page.keyboard.press("Digit4");
  await expect
    .poll(() =>
      state!.projectiles.some(
        (p) => p.owner === id && p.ability === "sunshard",
      ),
    )
    .toBe(true);
  expect(own().casting).toBeNull();
  expect(own().private!.chain.ready_until).toBe(0);
  await page.keyboard.press("KeyE");
  await expect.poll(() => own().shield).toBeGreaterThan(0);
  await gcd();
  const before = { ...own().pos };
  await page.keyboard.press("Digit5");
  await expect
    .poll(
      () => Math.abs(own().pos.x - before.x) + Math.abs(own().pos.z - before.z),
    )
    .toBeGreaterThan(3000);
  await page.getByRole("button", { name: "Bot insight", exact: true }).click();
  await expect(page.locator("#bot-insight")).toContainText("Easy:");
  await page.getByRole("button", { name: "Skilled", exact: true }).click();
  await expect.poll(() => state!.match_info.bot_difficulty).toBe("skilled");
  await ready();
  expect(own().private!.charges.flashkindle).toBeUndefined();
  expect(own().health).toBe(1550);
  const round = state!.round;
  await page.getByRole("button", { name: "Restart duel", exact: true }).click();
  await expect.poll(() => state!.round).toBeGreaterThan(round);
  await ready();
  await page.locator("#leave").click();
  await expect(page.locator("#front")).toBeVisible();
  await expect(page.locator("#duel-controls")).toBeHidden();
  expect(errors).toEqual([]);
});
