import { spawn } from "node:child_process";
import { resolve } from "node:path";
const children = new Set();
let ending = false;
function start(file, args, onExit = (code) => stop(code ?? 1)) {
  if (ending) return;
  const child = spawn(file, args, {
    stdio: "inherit",
    windowsHide: true,
    detached: process.platform !== "win32",
    env: { ...process.env, RUST_LOG: process.env.RUST_LOG || "info" },
  });
  children.add(child);
  child.on("error", (e) => {
    console.error(e);
    stop(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
    onExit(code);
  });
}
function stop(code = 0) {
  if (ending) return;
  ending = true;
  for (const child of children) {
    if (process.platform === "win32" && child.pid)
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    else if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* Already exited. */
      }
    }
  }
  process.exitCode = code;
}
start("cargo", ["build", "-p", "warshard-server"], (code) => {
  if (code !== 0) return stop(code ?? 1);
  start(
    resolve(
      "target",
      "debug",
      `warshard-server${process.platform === "win32" ? ".exe" : ""}`,
    ),
    [],
  );
});
start(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "--host",
  process.env.CLIENT_HOST || "127.0.0.1",
]);
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
