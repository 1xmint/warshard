import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const text = execFileSync(
  "cargo",
  ["run", "--quiet", "-p", "warshard-sim", "--bin", "export"],
  { encoding: "utf8" },
).replaceAll("\r\n", "\n");
const file = "client/src/protocol.ts";
if (process.argv.includes("--check")) {
  if (readFileSync(file, "utf8").replaceAll("\r\n", "\n") !== text)
    throw Error("Protocol drift: run npm run protocol");
} else writeFileSync(file, text);
