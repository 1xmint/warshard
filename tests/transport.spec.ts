import { test, expect } from "@playwright/test";

test("guest admission capacity, private state, socket replacement and invalid intent", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    type Message = {
      type: string;
      code?: string;
      id?: number;
      token?: string;
      state?: {
        players: { id: number; connected: boolean; private: unknown }[];
      };
    };
    const sockets: WebSocket[] = [];
    function next(
      ws: WebSocket,
      predicate: (m: Message) => boolean,
    ): Promise<Message> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.removeEventListener("message", read);
          reject(Error("message timeout"));
        }, 5000);
        function read(event: MessageEvent) {
          const m = JSON.parse(String(event.data)) as Message;
          if (predicate(m)) {
            clearTimeout(timeout);
            ws.removeEventListener("message", read);
            resolve(m);
          }
        }
        ws.addEventListener("message", read);
      });
    }
    async function open(resume: string | null = null) {
      const ws = new WebSocket(`ws://${location.host}/ws`);
      sockets.push(ws);
      const response = next(
        ws,
        (m) => m.type === "welcome" || m.type === "error",
      );
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            type: "join",
            version: 3,
            room: "contract-" + seed,
            class_id: "ashweaver",
            resume,
          }),
        );
      return { ws, message: await response };
    }
    const seed = Date.now();
    try {
      const a = await open();
      const b = await open();
      const full = await open();
      const state = await next(
        a.ws,
        (m) => m.type === "state" && m.state?.players.length === 2,
      );
      const hidden = state.state!.players.find(
        (p) => p.id !== a.message.id,
      )!.private;
      const replacement = await open(a.message.token!);
      const obsolete = next(a.ws, (m) => m.type === "error");
      a.ws.send(JSON.stringify({ type: "ultimate" }));
      const stale = await obsolete;
      const after = await next(replacement.ws, (m) => m.type === "state");
      const invalid = next(b.ws, (m) => m.type === "error");
      b.ws.send(JSON.stringify({ type: "input", seq: 1, dx: 2, dz: 0 }));
      const invalidMessage = await invalid;
      const forged = next(b.ws, (m) => m.type === "error");
      b.ws.send(
        JSON.stringify({ type: "input", seq: 2, dx: 1, dz: 0, health: 9999 }),
      );
      const unknownField = await forged;
      return {
        full: full.message.code,
        hidden,
        stale: stale.code,
        retainedId: replacement.message.id === a.message.id,
        connected: after.state!.players.find((p) => p.id === a.message.id)!
          .connected,
        invalid: invalidMessage.code,
        forged: unknownField.code,
      };
    } finally {
      sockets.forEach((ws) => ws.close());
    }
  });
  expect(result).toEqual({
    full: "room_full",
    hidden: null,
    stale: "stale_session",
    retainedId: true,
    connected: true,
    invalid: "invalid_movement",
    forged: "invalid_message",
  });
});

test("upgrade rejects an unapproved Origin", async ({ request }) => {
  const response = await request.get("http://127.0.0.1:3001/ws", {
    headers: {
      Origin: "https://unapproved.invalid",
      Connection: "Upgrade",
      Upgrade: "websocket",
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
      "Sec-WebSocket-Version": "13",
    },
  });
  expect(response.status()).toBe(403);
});
