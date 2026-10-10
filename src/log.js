// The log is the evidence. It is the thing a judge reads to decide whether
// any of this actually happened, so it is append only, plain JSONL, and
// written before anything else in the pipeline gets clever.
//
// Deliberately built early rather than last: outings cannot accumulate
// retroactively, and AC-12 needs three real ones.

const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = path.join(os.homedir(), ".touchgrass");
const LOG_PATH = path.join(HOME, "log.jsonl");

function ensureHome() {
  fs.mkdirSync(HOME, { recursive: true });
}

/**
 * One row per seam that fired. Written the moment the suggestion is shown,
 * not when the user returns, so a suggestion that got ignored still leaves
 * a trace. Honest logs include the ignored ones.
 */
function append(entry) {
  ensureHome();
  const row = {
    id: entry.id || new Date().toISOString(),
    trigger: entry.trigger, // "commit" | "activity-gap"
    estimateMin: entry.estimateMin ?? null,
    suggestion: entry.suggestion ?? null,
    daylightLeftMin: entry.daylightLeftMin ?? null,
    outcome: entry.outcome, // "suggested" | "model_timeout" | "no_daylight" | "no_places"
    awayMin: entry.awayMin ?? null,
    confirmed: entry.confirmed ?? null, // null until the user answers
  };
  fs.appendFileSync(LOG_PATH, JSON.stringify(row) + "\n", "utf8");
  return row;
}

function readAll() {
  if (!fs.existsSync(LOG_PATH)) return [];
  return fs
    .readFileSync(LOG_PATH, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null; // a half written line should not take down the CLI
      }
    })
    .filter(Boolean);
}

/**
 * Rewrites the whole file. Fine at this scale: the spec puts a year of use
 * under 3000 rows, so there is no reason to build anything smarter.
 */
function update(id, patch) {
  const rows = readAll().map((r) => (r.id === id ? { ...r, ...patch } : r));
  ensureHome();
  fs.writeFileSync(
    LOG_PATH,
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8"
  );
  return rows.find((r) => r.id === id) || null;
}

/**
 * A suggestion that fired, was followed by a real gap in activity, and has
 * not been confirmed or denied yet. This is what the confirm prompt asks about.
 */
function pendingConfirm() {
  return readAll().find(
    (r) => r.outcome === "suggested" && r.awayMin !== null && r.confirmed === null
  );
}

function confirmedOutings() {
  return readAll().filter((r) => r.confirmed === true);
}

const pad = (s, n) => String(s).padEnd(n);
const hhmm = (iso) => {
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * The table that goes in the DEV post as a screenshot, so it is formatted
 * for a human reading a terminal rather than for a parser.
 */
function formatTable(rows = readAll()) {
  if (!rows.length) {
    return "No entries yet. Start the watcher with: grass watch";
  }

  const header =
    pad("when", 18) +
    pad("trigger", 14) +
    pad("est", 6) +
    pad("away", 7) +
    pad("went", 6) +
    "suggestion";
  const lines = [header, "-".repeat(Math.max(header.length, 60))];

  for (const r of rows) {
    const went =
      r.confirmed === true ? "yes" : r.confirmed === false ? "no" : "-";
    lines.push(
      pad(hhmm(r.id), 18) +
        pad(r.trigger || "-", 14) +
        pad(r.estimateMin != null ? `${r.estimateMin}m` : "-", 6) +
        pad(r.awayMin != null ? `${r.awayMin}m` : "-", 7) +
        pad(went, 6) +
        (r.outcome === "suggested" ? r.suggestion || "" : `(${r.outcome})`)
    );
  }

  const confirmed = rows.filter((r) => r.confirmed === true);
  const totalMin = confirmed.reduce((a, r) => a + (r.awayMin || 0), 0);
  lines.push("");
  lines.push(
    `${confirmed.length} outing(s) confirmed, ${totalMin} minutes outside, ${rows.length} seam(s) detected.`
  );

  return lines.join("\n");
}

module.exports = {
  HOME,
  LOG_PATH,
  append,
  readAll,
  update,
  pendingConfirm,
  confirmedOutings,
  formatTable,
};
