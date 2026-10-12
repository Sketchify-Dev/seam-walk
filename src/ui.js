// The terminal is the entire product surface, so it gets treated like one.
//
// Three rules, applied everywhere:
//
// 1. ONE accent colour. Grass green marks the single thing that matters on
//    any given screen and nothing else. A terminal where six things are
//    coloured is a terminal where nothing is emphasised.
// 2. Hierarchy comes from weight and space, not from colour. Labels recede
//    (dim), values hold (plain), the suggestion leads (bold). This still
//    reads correctly with colour stripped entirely.
// 3. Colour is never the only carrier of meaning. Every status prints a word
//    as well as a hue, because a red dot and a green dot are the same dot to
//    a red-green colourblind reader, and identical in a piped log file.
//
// Colour is disabled automatically when NO_COLOR is set, when --no-color is
// passed, or when stdout is not a TTY. That last one matters more than it
// sounds: `grass log > evidence.txt` has to produce a clean file, because the
// log is meant to be readable by a stranger without this tool.

const ACCENT = 114; // #87d787, a soft grass green, legible on light and dark
const DIM = 244;
const AMBER = 179;
const RED = 174;

const enabled =
  !process.env.NO_COLOR &&
  !process.argv.includes("--no-color") &&
  process.stdout.isTTY === true;

const paint = (code, s) => (enabled ? `\x1b[38;5;${code}m${s}\x1b[0m` : String(s));

const green = (s) => paint(ACCENT, s);
const dim = (s) => paint(DIM, s);
const amber = (s) => paint(AMBER, s);
const red = (s) => paint(RED, s);
const bold = (s) => (enabled ? `\x1b[1m${s}\x1b[0m` : String(s));

/** Prose measure. Capped well below most terminal widths: long lines are
 *  harder to read, and this tool's whole case is that you read one line. */
const measure = () => Math.min(process.stdout.columns || 76, 72);

const LABEL_W = 14;
const INDENT = "  ";

function wrap(text, width = measure() - INDENT.length) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > width) {
      lines.push(line);
      line = w;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** "2h 28m", "48m", "0m". Used anywhere minutes are shown to a human. */
function duration(min) {
  if (min === Infinity) return "all night";
  if (min == null || Number.isNaN(min)) return "n/a";
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

/** Aligned label/value pair. The label column is what makes a screen scan. */
function kv(label, value, tone) {
  const v = tone ? tone(value) : String(value);
  return INDENT + dim(String(label).padEnd(LABEL_W)) + v;
}

/**
 * A status row that carries its meaning in the word, not the colour.
 * @param {"ok"|"warn"|"fail"} state
 */
function status(label, value, state) {
  const tone = state === "ok" ? green : state === "warn" ? amber : red;
  const mark = state === "ok" ? "ok" : state === "warn" ? "!!" : "xx";
  return (
    INDENT +
    dim(String(label).padEnd(LABEL_W)) +
    tone(mark.padEnd(4)) +
    String(value)
  );
}

function heading(text) {
  return "\n" + INDENT + bold(text) + "\n";
}

function note(text) {
  return wrap(text, measure() - INDENT.length)
    .map((l) => INDENT + dim(l))
    .join("\n");
}

function rule(width = measure() - INDENT.length) {
  return INDENT + dim("─".repeat(width));
}

/**
 * The one moment the product exists for.
 *
 * Everything else in this file is chrome around this block, so it gets the
 * vertical space, the accent rule, and the only bold text on screen. If a
 * user reads exactly one thing and leaves, this is the thing.
 */
function hero(sentence, meta) {
  const lines = wrap(sentence, measure() - 7);
  const out = [""];
  for (const l of lines) out.push(INDENT + green("▌") + "  " + bold(l));
  if (meta) {
    out.push("");
    out.push(INDENT + " " + "  " + dim(meta));
  }
  out.push("");
  return out.join("\n");
}

/**
 * A fuel gauge for daylight. `fraction` is how much of the day's light is
 * still left, so the green drains toward sunset: a nearly empty bar says "go
 * now" off its shape, before the figure beside it is read.
 */
function bar(fraction, width = 26) {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const filled = Math.round(f * width);
  return green("█".repeat(filled)) + dim("░".repeat(width - filled));
}

module.exports = {
  enabled,
  green,
  dim,
  amber,
  red,
  bold,
  wrap,
  duration,
  kv,
  status,
  heading,
  note,
  rule,
  hero,
  bar,
  measure,
  INDENT,
  LABEL_W,
};
