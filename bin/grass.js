#!/usr/bin/env node
// touchgrass: get told to go outside at the one moment it costs you nothing.
//
// Commands:
//   grass init     set coordinates and the places you can walk to
//   grass sun      sunrise, sunset, daylight left, computed offline
//   grass doctor   check weights, binary, and whether the model is warm
//   grass warm     load the model now so the first suggestion is not slow
//   grass watch    watch for a seam and say one thing when it appears
//   grass log      the evidence table
//   grass went     answer a pending confirm
//   grass stop     shut the local model server down

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const sun = require("../src/sun.js");
const logStore = require("../src/log.js");
const config = require("../src/config.js");
const model = require("../src/model.js");
const watcher = require("../src/watch.js");

const hhmm = (d) =>
  d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "n/a";

function loadConfigOrExit() {
  const cfg = config.read();
  if (cfg === null) {
    console.log("No config yet. Run: grass init");
    process.exit(1);
  }
  if (cfg === "MALFORMED") {
    console.log(`Config unreadable at ${config.CONFIG_PATH}. Run: grass init`);
    process.exit(1);
  }
  return cfg;
}

/**
 * Resolve a llama.cpp binary without assuming where it was installed.
 * Note llama-cli is chat-only in build 11514 and dropped -no-cnv, so the
 * server is what we actually want.
 */
function findBin(cfg, name) {
  const candidates = [
    cfg[name === "llama-server" ? "serverBin" : "llamaBin"],
    path.join(process.env.HOME || "", ".local", "llama", name),
    path.join(process.env.HOME || "", ".local", "bin", name),
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch {
      // keep looking
    }
  }
  return null;
}

function resolved(cfg) {
  return { ...cfg, serverBin: findBin(cfg, "llama-server") };
}

/**
 * Asks about an outing that already happened. One keypress, because asking
 * for more than that is how logs stop being filled in.
 */
async function askPending() {
  const pending = logStore.pendingConfirm();
  if (!pending) return false;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise((resolve) => {
    rl.question(
      `\nYou were away ${pending.awayMin} minutes after: "${pending.suggestion}"\nDid you go out? [y/n] `,
      (a) => resolve(a.trim().toLowerCase())
    );
  });
  rl.close();

  const went = answer.startsWith("y");
  logStore.update(pending.id, { confirmed: went });
  console.log(went ? "Logged.\n" : "Logged as not taken.\n");
  return true;
}

async function cmdSun() {
  const cfg = loadConfigOrExit();
  const now = new Date();
  const t = sun.sunTimes(cfg.lat, cfg.lon, now);
  const left = sun.daylightMinutesLeft(cfg.lat, cfg.lon, now);

  console.log("");
  console.log(`  coordinates   ${cfg.lat}, ${cfg.lon}`);
  if (t.polar) {
    console.log(`  condition     ${t.polar}`);
  } else {
    console.log(`  sunrise       ${hhmm(t.sunrise)}`);
    console.log(`  solar noon    ${hhmm(t.solarNoon)}`);
    console.log(`  sunset        ${hhmm(t.sunset)}`);
  }
  console.log(`  daylight left ${left === Infinity ? "all night" : left + " min"}`);
  console.log("");
  console.log("  Computed locally from coordinates. No network call was made.");
  console.log("");
}

async function cmdDoctor() {
  const cfg = resolved(loadConfigOrExit());
  const modelOk = fs.existsSync(cfg.model);
  const modelSize = modelOk ? Math.round(fs.statSync(cfg.model).size / 1048576) : 0;
  const warm = await model.health(cfg);

  console.log("");
  console.log(`  config       ${config.CONFIG_PATH}`);
  console.log(`  coordinates  ${cfg.lat ?? "NOT SET"}, ${cfg.lon ?? "NOT SET"}`);
  console.log(`  places       ${cfg.places.length}${cfg.places.length < 3 ? "  (need 3, run: grass init)" : ""}`);
  console.log(`  weights      ${modelOk ? `${cfg.model} (${modelSize} MB)` : `MISSING at ${cfg.model}`}`);
  console.log(`  llama-server ${cfg.serverBin || "NOT FOUND"}`);
  console.log(`  model warm   ${warm ? `yes, on port ${cfg.port || model.DEFAULT_PORT}` : "no"}`);
  console.log(`  log          ${logStore.LOG_PATH}`);
  console.log("");

  const problems = [];
  if (!modelOk) problems.push("weights missing");
  if (!cfg.serverBin) problems.push("llama-server not found");
  if (cfg.lat == null || cfg.lon == null) problems.push("coordinates not set");
  if (cfg.places.length < 3) problems.push("fewer than 3 places");

  if (problems.length) {
    console.log(`  Not ready: ${problems.join(", ")}.`);
    console.log("");
    process.exit(1);
  }
  console.log(warm ? "  Ready." : "  Ready. First load takes about 150 seconds, so run: grass warm");
  console.log("");
}

async function warmUp(cfg) {
  const already = await model.health(cfg);
  if (!already) {
    console.log("Loading the model. Cold load measured at ~148s on this hardware,");
    console.log("~59s with a warm page cache. Paid once.");
  }
  process.stdout.write("  ");

  const r = await model.ensureServer(cfg, (secs, phase) => {
    if (phase === "priming") process.stdout.write("priming prompt cache ");
    else if (secs % 10 === 0) process.stdout.write(`${secs}s `);
  });

  console.log("");
  if (!r.ok) {
    console.log(`Failed: ${r.error}`);
    return false;
  }
  if (r.primeMs != null) {
    console.log(
      `Prompt cache primed in ${(r.primeMs / 1000).toFixed(0)}s${r.primed ? "" : " (prime failed, suggestions will be slow)"}.`
    );
  }
  console.log("Warm. Suggestions now reuse the cached prefix.");
  return true;
}

async function cmdWarm() {
  const cfg = resolved(loadConfigOrExit());
  if (!cfg.serverBin) {
    console.log("llama-server not found. Run: grass doctor");
    process.exit(1);
  }
  const ok = await warmUp(cfg);
  process.exit(ok ? 0 : 1);
}

function cmdStop() {
  try {
    const pid = Number(fs.readFileSync(model.PID_FILE, "utf8").trim());
    process.kill(pid, "SIGTERM");
    fs.unlinkSync(model.PID_FILE);
    console.log(`Stopped model server (pid ${pid}).`);
  } catch {
    console.log("No model server recorded as running.");
  }
}

async function cmdTry() {
  const cfg = resolved(loadConfigOrExit());
  if (!(await model.health(cfg))) {
    console.log("Model not warm. Run: grass warm");
    process.exit(1);
  }

  // A throwaway place, so this writes nothing to the evidence log. The log
  // may only contain outings that physically happened.
  const PLACE = "the bench by the water tower";
  const recent = [];
  let peak = 0;

  const sample = () => {
    try {
      const out = require("child_process").execSync("ps -o rss= -C llama-server", {
        encoding: "utf8",
      });
      const vals = out.trim().split("\n").map(Number).filter(Boolean);
      if (vals.length) peak = Math.max(peak, Math.round(Math.max(...vals) / 1024));
    } catch {
      // ps missing or process gone, not worth failing the run over
    }
  };

  sample();
  const sampler = setInterval(sample, 400);

  for (let i = 1; i <= 3; i++) {
    const r = await model.suggest(cfg, {
      minutes: 15,
      place: PLACE,
      daylightLeftMin: 95,
      trigger: i === 1 ? "commit" : "activity-gap",
      recent: [...recent],
    });
    recent.push(r.sentence);
    const words = r.sentence.split(/\s+/).filter(Boolean).length;
    console.log("");
    console.log(`  [${i}] ${(r.ms / 1000).toFixed(1)}s   ${r.source}   ${words} words`);
    console.log(`      ${r.sentence}`);
    if (r.reason) console.log(`      reason: ${r.reason}`);
  }

  clearInterval(sampler);

  const within = recent.every(
    (s) => s.includes(PLACE) && s.split(/\s+/).filter(Boolean).length <= MAX_WORDS_LOCAL
  );

  console.log("");
  console.log("  --- measured ---");
  console.log(`  AC-5  word limit and place named : ${within ? "PASS" : "FAIL"}`);
  console.log(`  AC-11 peak llama-server RSS      : ${peak} MB   (ceiling 1800 MB)  ${peak && peak < 1800 ? "PASS" : "CHECK"}`);
  console.log("");
  console.log("  Nothing was written to the log. This used a throwaway place.");
  console.log("");
}

const MAX_WORDS_LOCAL = 20;

async function cmdWatch() {
  const cfg = resolved(loadConfigOrExit());

  if (cfg.places.length < 3) {
    console.log("Fewer than 3 places set. Run: grass init");
    process.exit(1);
  }
  if (!cfg.serverBin) {
    console.log("llama-server not found. Run: grass doctor");
    process.exit(1);
  }

  await askPending();

  // Load the weights before watching, not on the first seam. A seam is a
  // 15 minute window, and spending 150 of those seconds loading a model
  // would waste the very thing the tool exists to protect.
  if (!(await warmUp(cfg))) process.exit(1);

  console.log("");
  console.log(`Watching ${cfg.watchDirs.join(", ")}`);
  console.log("Nothing prints until your work reaches a pause.");
  console.log("Ctrl-C to stop watching. The model stays warm.");
  console.log("");

  // Hold the prompt cache open. A seam that arrives after a quiet stretch
  // would otherwise pay the full prefix pass and fall back, which is the one
  // moment the tool cannot afford to be slow.
  model.startKeepalive(cfg);

  const recent = logStore
    .confirmedOutings()
    .slice(-3)
    .map((r) => r.suggestion)
    .filter(Boolean);

  const onSeam = async (seam) => {
    const now = new Date();
    const daylightLeft = sun.daylightMinutesLeft(cfg.lat, cfg.lon, now);

    // AC-7: not enough daylight means no suggestion at all, and no place name.
    if (daylightLeft < seam.estimateMin) {
      const w = sun.nextWindow(cfg.lat, cfg.lon, now);
      console.log(
        `No daylight left. Next window opens ${hhmm(w.at)} ${w.sameDay ? "today" : "tomorrow"}.`
      );
      logStore.append({
        trigger: seam.trigger,
        estimateMin: seam.estimateMin,
        daylightLeftMin: daylightLeft,
        outcome: "no_daylight",
      });
      return;
    }

    const place = cfg.places[Math.floor(Math.random() * cfg.places.length)];
    const result = await model.suggest(cfg, {
      minutes: seam.estimateMin,
      place,
      daylightLeftMin: daylightLeft,
      trigger: seam.trigger,
      recent,
    });

    console.log("");
    console.log(`  ${result.sentence}`);
    console.log("");

    logStore.append({
      trigger: seam.trigger,
      estimateMin: seam.estimateMin,
      daylightLeftMin: daylightLeft,
      suggestion: result.sentence,
      outcome: "suggested",
      source: result.source,
      modelMs: result.ms,
    });
  };

  const onReturn = ({ awayMin }) => {
    const rows = logStore.readAll();
    const last = [...rows]
      .reverse()
      .find((r) => r.outcome === "suggested" && r.awayMin === null);
    if (last) logStore.update(last.id, { awayMin });
  };

  watcher.start(cfg, onSeam, onReturn);
}

async function main() {
  switch (process.argv[2]) {
    case "init":
      await config.init();
      break;
    case "sun":
      await cmdSun();
      break;
    case "doctor":
      await cmdDoctor();
      break;
    case "warm":
      await cmdWarm();
      break;
    case "try":
      await cmdTry();
      break;
    case "stop":
      cmdStop();
      break;
    case "watch":
      await cmdWatch();
      break;
    case "log":
      await askPending();
      console.log("");
      console.log(logStore.formatTable());
      console.log("");
      break;
    case "went":
      if (!(await askPending())) console.log("Nothing waiting to be confirmed.");
      break;
    default:
      console.log("");
      console.log("  touchgrass");
      console.log("");
      console.log("    grass init     set coordinates and walkable places");
      console.log("    grass sun      sunrise, sunset, daylight left, offline");
      console.log("    grass doctor   check weights, binary, warm state");
      console.log("    grass warm     load the model now (about 150 s, once)");
      console.log("    grass watch    watch for a seam, then say one thing");
      console.log("    grass log      the evidence table");
      console.log("    grass went     answer a pending confirm");
      console.log("    grass stop     shut the model server down");
      console.log("");
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
