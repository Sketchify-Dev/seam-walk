// The log is the evidence. It is the thing a judge reads to decide whether
// any of this actually happened, so it is append only, plain JSONL, and
// written before anything else in the pipeline gets clever.
//
// Deliberately built early rather than last: outings cannot accumulate
// retroactively, and AC-12 needs three real ones.

const fs = require("fs");
const path = require("path");
const os = require("os");
const ui = require("./ui.js");

const HOME = path.join(os.homedir(), ".touchgrass");
const LOG_PATH = path.join(HOME, "log.jsonl");

function ensureHome() {
  fs.mkdirSync(HOME, { recursive: true });
}

/**
 * Build the row that gets written for one seam. Pure, so the exact shape can
 * be tested without writing to the real evidence log on disk.
 *
 * `source` and `modelMs` are not decoration. The README claims the model is
 * load bearing, and the only thing that can settle that is a count of how
 * often it actually produced the sentence versus how often the deterministic
 * fallback did. An earlier version built this row from a whitelist that
 * silently dropped both fields, so every row written before 2026-10-11
 * reports `source: null` and cannot be used as evidence either way. The
 * regression test in test/run.js exists to stop that happening again.
 */
function buildRow(entry) {
  return {
    id: entry.id || new Date().toISOString(),
    trigger: entry.trigger, // "commit" | "activity-gap"
    estimateMin: entry.estimateMin ?? null,
    suggestion: entry.suggestion ?? null,
    daylightLeftMin: entry.daylightLeftMin ?? null,
    outcome: entry.outcome, // "suggested" | "model_timeout" | "no_daylight" | "no_places"
    source: entry.source ?? null, // "model" | "fallback"
    modelMs: entry.modelMs ?? null,
    awayMin: entry.awayMin ?? null,
    confirmed: entry.confirmed ?? null, // null until the user answers
  };
}

/**
 * One row per seam that fired. Written the moment the suggestion is shown,
 * not when the user returns, so a suggestion that got ignored still leaves
 * a trace. Honest logs include the ignored ones.
 */
function append(entry) {
  ensureHome();
  const row = buildRow(entry);
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

/** "10-09 16:12". The year goes in the header, not in every row. */
const stamp = (iso) => {
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const clip = (s, n) =>
  String(s).length <= n ? String(s) : String(s).slice(0, n - 1).trimEnd() + "…";

/**
 * How often the model actually produced the sentence.
 *
 * This is the number that decides whether the open-weight model is load
 * bearing or ornamental, so it is computed from the log rather than asserted
 * in prose. Rows written before source tracking existed are counted
 * separately instead of being quietly folded into either side.
 */
function modelRate(rows = readAll()) {
  const suggested = rows.filter((r) => r.outcome === "suggested");
  const model = suggested.filter((r) => r.source === "model").length;
  const fallback = suggested.filter((r) => r.source === "fallback").length;
  const untracked = suggested.filter((r) => r.source == null).length;
  // `total` is the attributed denominator the write-up stands on: the
  // suggestions whose source is known. Rows that predate source tracking
  // cannot inform the model-versus-fallback ratio, so they are reported
  // separately rather than folded into the total, where they would quietly
  // drag the rate toward zero.
  return { model, fallback, untracked, total: model + fallback };
}

/**
 * The table that goes in the DEV post, so it is formatted for a human
 * reading a terminal and kept under 80 columns to survive being pasted into
 * a code block. The full untruncated text of every suggestion stays in the
 * JSONL, which is the actual record.
 */
function formatTable(rows = readAll()) {
  if (!rows.length) {
    return ui.note("No entries yet. Start the watcher with: grass watch");
  }

  const W = Math.max((process.stdout.columns || 80) - 2, 78);
  const SUGG_W = W - 44;

  const head =
    pad("when", 13) +
    pad("trigger", 8) +
    pad("est/away", 9) +
    pad("went", 5) +
    pad("wrote", 9) +
    "suggestion";

  const lines = [ui.INDENT + ui.dim(head), ui.INDENT + ui.dim("─".repeat(Math.min(W, head.length + SUGG_W)))];

  for (const r of rows) {
    const went =
      r.confirmed === true ? "yes" : r.confirmed === false ? "no" : "-";
    const est = r.estimateMin != null ? `${r.estimateMin}m` : "-";
    const away = r.awayMin != null ? `${r.awayMin}m` : "-";
    const trigger = r.trigger === "activity-gap" ? "gap" : r.trigger || "-";
    const wrote = r.outcome === "suggested" ? r.source || "untracked" : "-";
    const text =
      r.outcome === "suggested" ? clip(r.suggestion || "", SUGG_W) : `(${r.outcome})`;

    // Confirmed outings are the evidence, so they are the only rows that get
    // the accent. An unconfirmed row is not a failure, it is just not proof.
    const row =
      pad(stamp(r.id), 13) +
      pad(trigger, 8) +
      pad(`${est}/${away}`, 9) +
      pad(went, 5) +
      pad(wrote, 9) +
      text;

    lines.push(ui.INDENT + (r.confirmed === true ? ui.green(row) : row));
  }

  const confirmed = rows.filter((r) => r.confirmed === true);
  const totalMin = confirmed.reduce((a, r) => a + (r.awayMin || 0), 0);
  const rate = modelRate(rows);

  lines.push("");
  lines.push(
    ui.INDENT +
      ui.bold(
        `${confirmed.length} outing${confirmed.length === 1 ? "" : "s"} confirmed`
      ) +
      ui.dim(
        ` · ${ui.duration(totalMin)} outside · ${rows.length} seam${rows.length === 1 ? "" : "s"} detected`
      )
  );

  if (rate.total || rate.untracked) {
    const parts = [];
    if (rate.total) {
      parts.push(`model wrote ${rate.model} of ${rate.total}`);
      if (rate.fallback) parts.push(`${rate.fallback} fell back`);
    }
    if (rate.untracked) parts.push(`${rate.untracked} predate source tracking`);
    lines.push(ui.INDENT + ui.dim(parts.join(", ")));
  }

  return lines.join("\n");
}

module.exports = {
  HOME,
  LOG_PATH,
  buildRow,
  append,
  readAll,
  update,
  pendingConfirm,
  confirmedOutings,
  modelRate,
  formatTable,
};
