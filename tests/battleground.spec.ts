import { test, expect, type Page } from "@playwright/test";
import type { ServerMessage, Snapshot } from "../client/src/protocol";

function observe(page: Page) {
  const record = { id: 0, welcomes: 0, state: null as Snapshot | null };
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      const message = JSON.parse(String(payload)) as ServerMessage;
      if (message.type === "welcome") {
        record.id = message.id;
        record.welcomes++;
        record.state = message.state;
      }
      if (message.type === "state") record.state = message.state;
    }),
  );
  return record;
}
async function choose(page: Page, size: string) {
  await page.locator("#play").click();
  await page
    .locator(".playlist-card")
    .filter({ has: page.getByText(size, { exact: true }) })
    .click();
  await expect(page.locator("#lobby")).toBeVisible();
}

test("menus, human queue cancellation, CTF practice, movement and recovery", async ({
  page,
}, info) => {
  const record = observe(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Equipment/ })).toBeDisabled();
  await page.locator("#settings").click();
  await page.locator("#render-quality").selectOption("1.5");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("warshard.quality")))
    .toBe("1.5");
  await page.locator("#settings-close").click();
  await page.locator("#classes").click();
  await expect(page.locator("#class-inspect")).toContainText("Briar Rush");
  await page.locator("#classes-close").click();
  await page.locator("#play").click();
  await expect(page.locator(".playlist-card")).toHaveCount(9);
  await expect(
    page
      .locator(".playlist-card")
      .filter({ has: page.getByText("20 vs 20", { exact: true }) }),
  ).toBeDisabled();
  await page
    .locator(".playlist-card")
    .filter({ has: page.getByText("6 vs 6", { exact: true }) })
    .click();
  await page.locator("#join").click();
  await expect(page.locator("#queue-count")).toHaveText("1 / 12 humans");
  await page.locator("#cancel-queue").click();
  await expect(page.locator("#front")).toBeVisible();
  await choose(page, "6 vs 6");
  await page.locator("#practice").click();
  await expect.poll(() => record.state?.phase).toBe("active");
  expect(record.state!.match_info.map).toBe("riftwood_crossing");
  expect(record.state!.players).toHaveLength(12);
  expect(record.state!.players.filter((p) => p.bot)).toHaveLength(11);
  await expect(page.locator("#flag-status")).toContainText("Jade flag:");
  const before = record.state!.players.find((p) => p.id === record.id)!.pos.x;
  await page.keyboard.down("KeyD");
  await expect
    .poll(() => record.state!.players.find((p) => p.id === record.id)!.pos.x)
    .toBeGreaterThan(before + 1000);
  await page.keyboard.up("KeyD");
  await page.keyboard.press("Tab");
  await expect(page.locator("#target-frame")).toBeVisible();
  const id = record.id;
  await page.reload();
  await expect.poll(() => record.welcomes).toBe(2);
  expect(record.id).toBe(id);
  expect(record.state!.players.filter((p) => p.bot)).toHaveLength(11);
  await page.screenshot({ path: info.outputPath("ctf-practice.png") });
  await page.locator("#leave").click();
  await expect(page.locator("#front")).toBeVisible();
  expect(errors).toEqual([]);
});

test("arena bot finishes a real round, results return to menu and a new queue", async ({
  page,
}, info) => {
  const record = observe(page);
  await page.goto("/");
  await choose(page, "1 vs 1");
  await page.locator('[data-class="ashweaver"]').click();
  await expect(page.locator("#practice")).toBeVisible();
  await page.locator("#join").click();
  await expect(page.locator("#queue-count")).toHaveText("1 / 2 humans");
  await page.getByRole("button", { name: "Play now with bots" }).click();
  await expect.poll(() => record.state?.phase).toBe("active");
  expect(record.state!.players).toHaveLength(2);
  expect(record.state!.players.filter((p) => p.bot)).toHaveLength(1);
  expect(record.state!.match_info.practice).toBe(true);
  await expect(page.locator("#results")).toBeVisible({ timeout: 45000 });
  await expect(page.locator("#result-title")).toHaveText("Defeat");
  await expect(page.locator("#result-roster")).toContainText("[BOT]");
  expect(record.state!.match_info.reason).toBe("elimination");
  expect(
    Object.values(record.state!.match_info.stats).some((s) => s.damage >= 1250),
  ).toBeTruthy();
  await page.screenshot({ path: info.outputPath("arena-results.png") });
  await page.locator("#results-menu").click();
  await choose(page, "3 vs 3");
  await page.locator("#practice").click();
  await expect.poll(() => record.state?.match_info.team_size).toBe(3);
  expect(record.state!.players.filter((p) => p.bot)).toHaveLength(5);
  await page.locator("#leave").click();
});

test("real human queues fill balanced arena and battleground rosters; cancel and expired admission", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  const result = await page.evaluate(async () => {
    type Peer = {
      socket: WebSocket;
      last: ServerMessage | null;
      welcome: Extract<ServerMessage, { type: "welcome" }> | null;
      errors: string[];
      seq: number;
      goal: { x: number; z: number } | null;
    };
    const peers: Peer[] = [];
    const wait = async (check: () => boolean) => {
      const until = Date.now() + 12000;
      while (!check()) {
        if (Date.now() > until)
          throw new Error(
            "queue condition timed out: " +
              JSON.stringify(
                peers.map((p) => ({
                  last: p.last?.type,
                  queued: p.last?.type === "queued" ? p.last.waiting : null,
                  needed: p.last?.type === "queued" ? p.last.needed : null,
                  welcome: !!p.welcome,
                  errors: p.errors,
                  ready: p.socket.readyState,
                })),
              ),
          );
        await new Promise((r) => setTimeout(r, 25));
      }
    };
    function connect(playlist: string, extra: object = {}) {
      const peer: Peer = {
        socket: new WebSocket(`ws://${location.host}/ws`),
        last: null,
        welcome: null,
        errors: [],
        seq: 0,
        goal: null,
      };
      peers.push(peer);
      peer.socket.onopen = () => {
        const payload =
          (extra as { type?: string }).type === "join"
            ? { type: "join", version: 4, class_id: "briarwarden", ...extra }
            : {
                type: "queue",
                version: 4,
                playlist,
                class_id: "briarwarden",
                practice: false,
                ...extra,
              };
        peer.socket.send(JSON.stringify(payload));
      };
      peer.socket.onmessage = (e) => {
        const m = JSON.parse(String(e.data)) as ServerMessage;
        if (m.type === "welcome") peer.welcome = m;
        if (m.type === "error") peer.errors.push(m.code);
        peer.last = m;
      };
      return peer;
    }
    const heartbeat = setInterval(() => {
      for (const p of peers)
        if (p.welcome && p.socket.readyState === 1) {
          const state =
            p.last?.type === "state" ? p.last.state : p.welcome.state;
          const pos = state.players.find((q) => q.id === p.welcome!.id)!.pos;
          const axis = (delta: number) =>
            Math.abs(delta) > 300 ? Math.sign(delta) : 0;
          p.socket.send(
            JSON.stringify({
              type: "input",
              seq: ++p.seq,
              dx: p.goal ? axis(p.goal.x - pos.x) : 0,
              dz: p.goal ? axis(p.goal.z - pos.z) : 0,
            }),
          );
        }
    }, 50);
    const stateOf = (peer: Peer) =>
      peer.last?.type === "state" ? peer.last.state : peer.welcome!.state;
    const own = (peer: Peer) =>
      stateOf(peer).players.find((p) => p.id === peer.welcome!.id)!;
    const move = async (peer: Peer, x: number, z: number) => {
      peer.goal = { x, z };
      await wait(
        () =>
          Math.abs(own(peer).pos.x - x) < 500 &&
          Math.abs(own(peer).pos.z - z) < 500,
      );
      peer.goal = null;
    };
    const sizes: unknown[] = [];
    let combat = { kills: 0, respawned: false, captures: 0 };
    try {
      const disabled = connect("ctf_20");
      await wait(() => disabled.errors.length > 0);
      for (const [playlist, size] of [
        ["arena_2", 2],
        ["ctf_6", 6],
        ["ctf_10", 10],
      ] as const) {
        const roster = [connect(playlist), connect(playlist)];
        await wait(
          () =>
            roster[0].last?.type === "queued" && roster[0].last.waiting === 2,
        );
        if (playlist === "ctf_6") {
          roster[1].socket.send(JSON.stringify({ type: "cancel_queue" }));
          await wait(
            () =>
              roster[0].last?.type === "queued" && roster[0].last.waiting === 1,
          );
          roster.pop();
        }
        while (roster.length < size * 2) roster.push(connect(playlist));
        await wait(() => roster.every((p) => p.welcome));
        await wait(() =>
          roster.every(
            (p) => p.last?.type === "state" && p.last.state.phase === "active",
          ),
        );
        const message = roster[0].last;
        if (message?.type !== "state")
          throw new Error("expected active snapshot");
        const state = message.state;
        sizes.push({
          playlist,
          rooms: new Set(roster.map((p) => p.welcome!.room)).size,
          count: state.players.length,
          teams: [0, 1].map(
            (t) => state.players.filter((p) => p.team === t).length,
          ),
          bots: state.players.filter((p) => p.bot).length,
        });
        if (playlist === "ctf_6") {
          const ownId = roster[0].welcome!.id;
          const ally = state.players.find(
            (p) =>
              p.id !== ownId &&
              p.team === state.players.find((q) => q.id === ownId)!.team,
          );
          roster[0].socket.send(
            JSON.stringify({
              type: "cast",
              slot: 0,
              target: ally!.id,
              point: null,
            }),
          );
          await wait(() => roster[0].errors.includes("invalid_target"));
          const fighter = roster[0];
          const enemy = roster.find((p) => own(p).team !== own(fighter).team)!;
          await Promise.all([
            move(fighter, own(fighter).pos.x, 12000),
            move(enemy, own(enemy).pos.x, 12000),
          ]);
          await Promise.all([
            move(fighter, -500, 12000),
            move(enemy, 500, 12000),
          ]);
          while (own(enemy).health > 0) {
            const tick = stateOf(fighter).tick;
            fighter.socket.send(
              JSON.stringify({
                type: "cast",
                slot: 0,
                target: enemy.welcome!.id,
                point: null,
              }),
            );
            await wait(() => stateOf(fighter).tick >= tick + 21);
          }
          await wait(() => own(enemy).health === own(enemy).max_health);
          const enemyFlag = stateOf(fighter).match_info.flags.find(
            (f) => f.team !== own(fighter).team,
          )!;
          const home = stateOf(fighter).match_info.flags.find(
            (f) => f.team === own(fighter).team,
          )!.home;
          await move(fighter, enemyFlag.home.x, 12000);
          await move(fighter, enemyFlag.home.x, enemyFlag.home.z);
          await wait(() =>
            stateOf(fighter).match_info.flags.some(
              (f) => f.carrier === fighter.welcome!.id,
            ),
          );
          await move(fighter, enemyFlag.home.x, 12000);
          await move(fighter, home.x, 12000);
          await move(fighter, home.x, home.z);
          await wait(
            () => stateOf(fighter).match_info.scores[own(fighter).team] === 1,
          );
          const stats = stateOf(fighter).match_info.stats[fighter.welcome!.id];
          combat = {
            kills: stats.kills,
            respawned: own(enemy).health === own(enemy).max_health,
            captures: stats.captures,
          };
        }
        for (const p of roster) {
          p.socket.send(JSON.stringify({ type: "leave_match" }));
          p.socket.close();
        }
      }
      const expired = connect("", {
        type: "join",
        room: "match-expired",
        resume: null,
      });
      await wait(() => expired.errors.length > 0);
      return {
        sizes,
        combat,
        disabled: disabled.errors,
        expired: expired.errors,
      };
    } finally {
      clearInterval(heartbeat);
      for (const p of peers) p.socket.close();
    }
  });
  expect(result.disabled).toEqual(["playlist_unavailable"]);
  expect(result.expired).toEqual(["session_expired"]);
  expect(result.combat).toEqual({ kills: 1, respawned: true, captures: 1 });
  expect(result.sizes).toEqual([
    { playlist: "arena_2", rooms: 1, count: 4, teams: [2, 2], bots: 0 },
    { playlist: "ctf_6", rooms: 1, count: 12, teams: [6, 6], bots: 0 },
    { playlist: "ctf_10", rooms: 1, count: 20, teams: [10, 10], bots: 0 },
  ]);
});
