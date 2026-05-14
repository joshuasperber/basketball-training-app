import { spawnSync } from "node:child_process";

const url = process.env.LIGHTHOUSE_URL || "http://127.0.0.1:3001";
const out = process.env.LIGHTHOUSE_OUT || "lighthouse-report.html";

const result = spawnSync(
  "npx",
  ["--yes", "lighthouse@11.6.0", url, "--preset=desktop", "--output=html", `--output-path=${out}`, "--chrome-flags=--headless=new"],
  { stdio: "inherit", shell: process.platform === "win32" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
