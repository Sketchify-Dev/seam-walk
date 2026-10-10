// The only place the model is used. It gets one job: turn facts that
// deterministic code already worked out into one sentence worth obeying.
//
// WHY A SERVER AND NOT A SUBPROCESS
//
// Measured on the target machine (i5-7300U, no GPU, 2 cores):
//
//   cold load        147,793 ms    paid on every spawn
//   warm-cache load   59,000 ms
//   prompt eval        2.58 tok/s
//   generation         4.53 tok/s
//
// Loading 769 MB off a WSL2 virtual disk at ~5 MB/s is the expensive part,
// so the weights are loaded once by a local llama-server and every
// suggestion after that reuses them.
//
// WHY THE PROMPT IS SO SHORT
//
// At 2.58 tok/s, a 160 token prompt costs 62 seconds to read before a
// single word is generated. The first version of this file had exactly that
// prompt, and all three test suggestions timed out and fell back. A tool
// whose model always falls back has no model in it.
//
// So: the prompt is cut to the bone, the static instructions come FIRST so
// llama-server's prompt cache can reuse them across calls, and only the
// short variable tail is re-evaluated each time. The cache is primed once at
// warm time, which means the first real suggestion is already cheap.
//
// Request goes to 127.0.0.1. Nothing leaves the machine.
//
// Two guarantees enforced here, not hoped for:
//   - output is 20 words or fewer                 (AC-5)
//   - output names a place from config, verbatim  (AC-5)
// If the model cannot satisfy both, a deterministic sentence is used and the
// fallback is recorded, so the write-up can state how often the model
// actually carried its weight.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const REQUEST_TIMEOUT_MS = 30000;
// A cold prompt cache costs the whole prefix pass at 2.58 tok/s. Measured
// first-call cost after idle was over 30 s, so the first attempt gets room
// and the retry, which runs on the cache the first attempt rebuilt, does not.
const FIRST_ATTEMPT_TIMEOUT_MS = 60000;
// Re-send the cached prefix on this interval while watching, so a real seam
// finds a hot cache and gets a 3 s answer instead of a 30 s timeout.
const KEEPALIVE_MS = 240000;
const LOAD_TIMEOUT_MS = 300000;
const MAX_WORDS = 20;
const DEFAULT_PORT = 8757;
const N_PREDICT = 32;

const PID_FILE = path.join(os.homedir(), ".touchgrass", "server.pid");

// Static, cacheable prefix. Keep this stable: every byte that changes
// invalidates the prompt cache and costs 0.4 seconds per token to rebuild.
const PREFIX =
  "<start_of_turn>user\n" +
  "One sentence, under 20 words, telling someone to walk to a place and come back. " +
  "Use the place name exactly. No quotes, no emoji.\n";

/** The prefix alone, used to prime the server's prompt cache at warm time. */
const PRIME = PREFIX + "Place: the gate. Minutes: 10.<end_of_turn>\n<start_of_turn>model\n";

function buildPrompt({ minutes, place }) {
  // Variable tail only. Short on purpose: this is what gets re-evaluated.
  return (
    PREFIX +
    `Place: ${place}. Minutes: ${minutes}.<end_of_turn>\n<start_of_turn>model\n`
  );
}

const portOf = (cfg) => cfg.port || DEFAULT_PORT;
const baseOf = (cfg) => `http://127.0.0.1:${portOf(cfg)}`;

async function health(cfg, timeoutMs = 1500) {
  try {
    const res = await fetch(`${baseOf(cfg)}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function complete(cfg, prompt, timeoutMs = REQUEST_TIMEOUT_MS) {
  try {
    const res = await fetch(`${baseOf(cfg)}/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        n_predict: N_PREDICT,
        temperature: 0.7,
        top_p: 0.9,
        stop: ["<end_of_turn>", "<start_of_turn>", "\n"],
        cache_prompt: true,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { text: null, reason: `http-${res.status}` };
    const json = await res.json();
    return { text: json.content ?? "", reason: null };
  } catch (e) {
    const timedOut = e && (e.name === "TimeoutError" || e.name === "AbortError");
    return { text: null, reason: timedOut ? "timeout" : `request-failed: ${e.message}` };
  }
}

/**
 * Sends one throwaway completion so llama-server caches the static prefix.
 * Generous timeout: this is the call that pays for the whole prefix, and it
 * happens while the user is starting the watcher, not during a seam.
 */
async function primeCache(cfg) {
  const t0 = Date.now();
  const r = await complete(cfg, PRIME, 180000);
  return { ok: r.text !== null, ms: Date.now() - t0, reason: r.reason };
}

/**
 * Starts llama-server if it is not already answering, waits for the model to
 * load, then primes the prompt cache. Detached, so the warm model survives
 * this process.
 */
async function ensureServer(cfg, onProgress = () => {}) {
  let alreadyUp = await health(cfg);

  if (!alreadyUp) {
    if (!cfg.serverBin || !fs.existsSync(cfg.serverBin)) {
      return { ok: false, started: false, waitedMs: 0, error: "llama-server binary not found" };
    }
    if (!fs.existsSync(cfg.model)) {
      return { ok: false, started: false, waitedMs: 0, error: `weights missing at ${cfg.model}` };
    }

    const child = spawn(
      cfg.serverBin,
      [
        "-m", cfg.model,
        "--port", String(portOf(cfg)),
        "--host", "127.0.0.1",
        "-c", "512",
        "-t", String(cfg.threads || 2),
        "--no-webui",
      ],
      { detached: true, stdio: "ignore" }
    );
    child.unref();

    try {
      fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
      fs.writeFileSync(PID_FILE, String(child.pid), "utf8");
    } catch {
      // PID file is a convenience for `grass doctor`, not load bearing.
    }

    const t0 = Date.now();
    let up = false;
    while (Date.now() - t0 < LOAD_TIMEOUT_MS) {
      if (await health(cfg)) {
        up = true;
        break;
      }
      onProgress(Math.round((Date.now() - t0) / 1000), "loading");
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!up) {
      return {
        ok: false,
        started: true,
        waitedMs: Date.now() - t0,
        error: `model did not load within ${LOAD_TIMEOUT_MS / 1000}s`,
      };
    }
  }

  onProgress(0, "priming");
  const p = await primeCache(cfg);

  return {
    ok: true,
    started: !alreadyUp,
    waitedMs: 0,
    primeMs: p.ms,
    primed: p.ok,
  };
}

function clean(raw) {
  if (!raw) return "";
  return raw
    .replace(/<end_of_turn>[\s\S]*$/, "")
    .replace(/<start_of_turn>/g, "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[!]+/g, ".")
    .trim()
    .split("\n")[0]
    .trim();
}

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90,
};

/**
 * Every number the sentence claims, as digits or as words.
 * "five minutes away" and "15 minutes" both resolve to a number here.
 */
function numbersIn(sentence) {
  const found = [];
  for (const m of sentence.matchAll(/\d+/g)) found.push(Number(m[0]));
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(sentence)) found.push(value);
  }
  return found;
}

function wordCount(s) {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * @param {string} sentence
 * @param {string} place    must appear verbatim
 * @param {number} [minutes] if given, any number the sentence states must
 *                           equal this. A 1B model will happily write "five
 *                           minutes" when told fifteen, and a tool whose job
 *                           is telling you how long you have cannot ship that.
 */
function valid(sentence, place, minutes) {
  if (!sentence) return false;
  if (wordCount(sentence) > MAX_WORDS) return false;
  if (!sentence.includes(place)) return false;

  if (typeof minutes === "number") {
    const claimed = numbersIn(sentence).filter((n) => !place.includes(String(n)));
    if (claimed.some((n) => n !== minutes)) return false;
  }
  return true;
}

/** Used when the model will not cooperate. Never names a place it invented. */
function deterministic({ minutes, place }) {
  return `You have ${minutes} minutes. Walk to ${place} and come straight back.`;
}

/**
 * @returns {{sentence: string, source: "model"|"fallback", attempts: number,
 *            ms: number, reason: string|null}}
 */
async function suggest(cfg, facts) {
  const prompt = buildPrompt(facts);
  const t0 = Date.now();
  let lastReason = null;

  // The first attempt may land on a cold prompt cache, which costs the full
  // prefix pass. Give it room; the retry runs against a cache the first
  // attempt just rebuilt, so it should be quick.
  const timeouts = [FIRST_ATTEMPT_TIMEOUT_MS, REQUEST_TIMEOUT_MS];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await complete(cfg, prompt, timeouts[attempt - 1]);

    if (r.text === null) {
      lastReason = r.reason;
      // A first-attempt timeout still warmed the cache, so the retry is
      // worth taking. A second timeout means give up.
      if (r.reason === "timeout" && attempt === 2) break;
      continue;
    }

    const sentence = clean(r.text);
    if (valid(sentence, facts.place, facts.minutes)) {
      return {
        sentence,
        source: "model",
        attempts: attempt,
        ms: Date.now() - t0,
        reason: null,
      };
    }
    const claimed = numbersIn(sentence).filter((n) => !facts.place.includes(String(n)));
    lastReason = `rejected: ${wordCount(sentence)} words, place ${
      sentence.includes(facts.place) ? "present" : "missing"
    }, numbers [${claimed.join(",")}] vs ${facts.minutes}`;
  }

  return {
    sentence: deterministic(facts),
    source: "fallback",
    attempts: 2,
    ms: Date.now() - t0,
    reason: lastReason,
  };
}

/**
 * Keeps the prompt cache hot while the watcher runs. Without this the first
 * seam after a quiet stretch pays the full prefix pass and times out, which
 * is exactly the moment the tool needs to be fast.
 *
 * @returns {() => void} stop function
 */
function startKeepalive(cfg, onPing = () => {}) {
  const handle = setInterval(async () => {
    const t0 = Date.now();
    const r = await complete(cfg, PRIME, 90000);
    onPing({ ok: r.text !== null, ms: Date.now() - t0 });
  }, KEEPALIVE_MS);
  handle.unref?.();
  return () => clearInterval(handle);
}

module.exports = {
  suggest,
  ensureServer,
  primeCache,
  startKeepalive,
  health,
  buildPrompt,
  clean,
  valid,
  numbersIn,
  deterministic,
  PREFIX,
  PID_FILE,
  DEFAULT_PORT,
  REQUEST_TIMEOUT_MS,
  FIRST_ATTEMPT_TIMEOUT_MS,
  KEEPALIVE_MS,
  MAX_WORDS,
};
