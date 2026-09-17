import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const url = process.env.LIGHTHOUSE_URL || "http://127.0.0.1:3001";
const htmlOut = process.env.LIGHTHOUSE_OUT || "lighthouse-report.html";
const workdir = mkdtempSync(join(tmpdir(), "bt-lighthouse-"));
const reportBase = join(workdir, "report");

const result = spawnSync(
  "npx",
  [
    "--yes",
    "lighthouse@12.8.2",
    url,
    "--preset=desktop",
    "--output=json",
    "--output=html",
    `--output-path=${reportBase}`,
    "--chrome-flags=--headless=new",
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

if (result.error || result.status !== 0) {
  console.error(result.error?.message ?? "Lighthouse konnte nicht ausgeführt werden.");
  rmSync(workdir, { recursive: true, force: true });
  process.exit(result.status ?? 1);
}

const report = JSON.parse(readFileSync(`${reportBase}.report.json`, "utf8"));
copyFileSync(`${reportBase}.report.html`, htmlOut);

const categories = report.categories ?? {};
const audits = report.audits ?? {};
const checks = [
  ["Performance", categories.performance?.score ?? 0, Number(process.env.LH_PERFORMANCE_MIN ?? 0.9)],
  ["Accessibility", categories.accessibility?.score ?? 0, Number(process.env.LH_ACCESSIBILITY_MIN ?? 0.95)],
  ["Best Practices", categories["best-practices"]?.score ?? 0, Number(process.env.LH_BEST_PRACTICES_MIN ?? 0.9)],
  ["SEO", categories.seo?.score ?? 0, Number(process.env.LH_SEO_MIN ?? 0.9)],
];
const metrics = [
  ["LCP", audits["largest-contentful-paint"]?.numericValue ?? Infinity, Number(process.env.LH_LCP_MAX_MS ?? 2500), "ms"],
  ["CLS", audits["cumulative-layout-shift"]?.numericValue ?? Infinity, Number(process.env.LH_CLS_MAX ?? 0.1), ""],
  ["TBT", audits["total-blocking-time"]?.numericValue ?? Infinity, Number(process.env.LH_TBT_MAX_MS ?? 300), "ms"],
];

let failed = false;
for (const [name, score, minimum] of checks) {
  const ok = score >= minimum;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${Math.round(score * 100)} (Minimum ${Math.round(minimum * 100)})`);
  failed ||= !ok;
}
for (const [name, value, maximum, unit] of metrics) {
  const ok = value <= maximum;
  const rounded = name === "CLS" ? Number(value).toFixed(3) : Math.round(value);
  console.log(`${ok ? "✅" : "❌"} ${name}: ${rounded}${unit} (Maximum ${maximum}${unit})`);
  failed ||= !ok;
}

console.log(`Lighthouse-Bericht: ${htmlOut}`);
rmSync(workdir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
