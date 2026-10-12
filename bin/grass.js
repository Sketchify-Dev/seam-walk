#!/usr/bin/env node
// touchgrass: get told to go outside at the one moment it costs you nothing.
//
// Commands:
//   grass init     set coordinates and the places you can walk to
//   grass sun      sunrise, sunset, daylight left, computed offline
//   grass doctor   check weights, binary, and whether the model is warm
//   grass warm     load the model now so the first suggestion is not slow
//   grass try      run 3 suggestions now and show the AC-5/AC-11 numbers
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
const ui = require("../src/ui.js");

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
  const home = process.env.HOME || "";
  const candidates = [
    cfg[name === "llama-server" ? "serverBin" : "llamaBin"],
    // The official llama.cpp release tarball extracts binaries under
    // build/bin, so that is checked first, then the flatter layouts people
    // make by hand.
    path.join(home, ".local", "llama", "build", "bin", name),
    path.join(home, ".local", "llama", "bin", name),
    path.join(home, ".local", "llama", name),
    path.join(home, ".local", "bin", name),
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
  return {
    ...cfg,
    serverBin: findBin(cfg, "llama-server"),
    model: findModel(cfg),
  };
}

/**
 * Find the weights wherever they actually landed, so a setup made before the
 * default path changed keeps working. Reports the configured path unchanged
 * when nothing is found, so `grass doctor` can say exactly what is missing.
 */
function findModel(cfg) {
  const candidates = [
    cfg.model,
    path.join(process.env.HOME || "", ".touchgrass", "models", "gemma3-1b-q4.gguf"),
    "/tmp/g.gguf",
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return cfg.model;
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
  const q =
    "\n" +
    ui.INDENT +
    ui.dim(`You were away ${ui.duration(pending.awayMin)} after:`) +
    "\n" +
    ui.INDENT +
    ui.bold(pending.suggestion) +
    "\n\n" +
    ui.INDENT +
    "Did you go out? " +
    ui.dim("[y/n] ");
  const answer = await new Promise((resolve) => {
    rl.question(q, (a) => resolve(a.trim().toLowerCase()));
  });
  rl.close();

  const went = answer.startsWith("y");
  logStore.update(pending.id, { confirmed: went });
  console.log(
    ui.INDENT +
      (went ? ui.green("Logged.") : ui.dim("Logged as not taken.")) +
      "\n"
  );
  return true;
}

async function cmdSun() {
  const cfg = loadConfigOrExit();
  const now = new Date();
  const t = sun.sunTimes(cfg.lat, cfg.lon, now);
  const left = sun.daylightMinutesLeft(cfg.lat, cfg.lon, now);

  console.log(ui.heading("Daylight"));
  console.log(ui.kv("location", `${cfg.lat}, ${cfg.lon}`));

  if (t.polar) {
    const midnightSun = t.polar === "midnight-sun";
    console.log(
      ui.kv(
        "condition",
        midnightSun ? "midnight sun" : "polar night",
        midnightSun ? ui.green : ui.dim
      )
    );
  } else {
    console.log(ui.kv("sunrise", hhmm(t.sunrise)));
    console.log(ui.kv("solar noon", hhmm(t.solarNoon)));
    console.log(ui.kv("sunset", hhmm(t.sunset)));
  }

  // A shrinking fuel gauge of daylight: the green empties as the day ends, so
  // "go now" reads off the shape before the figure beside it is read.
  const total = t.sunrise && t.sunset ? (t.sunset - t.sunrise) / 60000 : null;
  const frac = left === Infinity ? 1 : total ? left / total : 0;
  console.log("");
  console.log(
    ui.INDENT +
      ui.dim("left".padEnd(ui.LABEL_W)) +
      ui.bar(frac) +
      "  " +
      ui.bold(ui.duration(left))
  );
  console.log("");
  console.log(
    ui.note(
      "Computed locally from your coordinates with the NOAA solar algorithm. No network call was made."
    )
  );
  console.log("");
}

async function cmdDoctor() {
  const cfg = resolved(loadConfigOrExit());
  const modelOk = fs.existsSync(cfg.model);
  const modelSize = modelOk ? Math.round(fs.statSync(cfg.model).size / 1048576) : 0;
  const warm = await model.health(cfg);
  const coordsOk = cfg.lat != null && cfg.lon != null;
  const placesOk = cfg.places.length >= 3;

  console.log(ui.heading("Readiness"));
  console.log(
    ui.status(
      "coordinates",
      coordsOk ? `${cfg.lat}, ${cfg.lon}` : "not set, run: grass init",
      coordsOk ? "ok" : "fail"
    )
  );
  console.log(
    ui.status(
      "places",
      placesOk ? `${cfg.places.length} set` : `${cfg.places.length} set, need 3, run: grass init`,
      placesOk ? "ok" : "fail"
    )
  );
  console.log(
    ui.status(
      "weights",
      modelOk ? `${modelSize} MB` : `missing at ${cfg.model}`,
      modelOk ? "ok" : "fail"
    )
  );
  console.log(
    ui.status(
      "llama-server",
      cfg.serverBin || "not found, see README install",
      cfg.serverBin ? "ok" : "fail"
    )
  );
  console.log(
    ui.status(
      "model",
      warm ? `warm on port ${cfg.port || model.DEFAULT_PORT}` : "cold, run: grass warm",
      warm ? "ok" : "warn"
    )
  );

  console.log("");
  console.log(ui.kv("config", config.CONFIG_PATH));
  console.log(ui.kv("log", logStore.LOG_PATH));
  console.log("");

  const problems = [];
  if (!modelOk) problems.push("weights missing");
  if (!cfg.serverBin) problems.push("llama-server not found");
  if (!coordsOk) problems.push("coordinates not set");
  if (!placesOk) problems.push("fewer than 3 places");

  if (problems.length) {
    console.log(ui.INDENT + ui.red("Not ready") + ui.dim(` · ${problems.join(", ")}`));
    console.log("");
    process.exit(1);
  }
  console.log(
    ui.INDENT +
      ui.green("Ready") +
      ui.dim(warm ? "" : " · first load takes about 150s, run: grass warm")
  );
  console.log("");
}

async function warmUp(cfg) {
  const already = await model.health(cfg);
  if (!already) {
    console.log(
      ui.note(
        "Loading the model. Cold load measured at about 148s on this hardware, 59s with a warm page cache. Paid once."
      )
    );
  }
  process.stdout.write(ui.INDENT);

  const r = await model.ensureServer(cfg, (secs, phase) => {
    if (phase === "priming") process.stdout.write(ui.dim("priming prompt cache "));
    else if (secs % 10 === 0) process.stdout.write(ui.dim(`${secs}s `));
  });

  console.log("");
  if (!r.ok) {
    console.log(ui.INDENT + ui.red("Failed") + ui.dim(` · ${r.error}`));
    return false;
  }
  if (r.primeMs != null) {
    console.log(
      ui.dim(
        `  Prompt cache primed in ${(r.primeMs / 1000).toFixed(0)}s${r.primed ? "" : " (prime failed, suggestions will be slow)"}.`
      )
    );
  }
  console.log(
    ui.INDENT + ui.green("Warm.") + ui.dim(" Suggestions now reuse the cached prefix.")
  );
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
    const tag = r.source === "model" ? ui.green(r.source) : ui.amber(r.source);
    console.log("");
    console.log(
      ui.INDENT +
        ui.dim(`[${i}] ${(r.ms / 1000).toFixed(1)}s · `) +
        tag +
        ui.dim(` · ${words} words`)
    );
    console.log(ui.INDENT + "    " + r.sentence);
    if (r.reason) console.log(ui.INDENT + "    " + ui.dim(`reason: ${r.reason}`));
  }

  clearInterval(sampler);

  const within = recent.every(
    (s) => s.includes(PLACE) && s.split(/\s+/).filter(Boolean).length <= MAX_WORDS_LOCAL
  );

  console.log("");
  console.log(ui.INDENT + "  " + ui.dim("measured"));
  console.log(
    ui.INDENT +
      ui.dim("AC-5".padEnd(ui.LABEL_W)) +
      (within ? ui.green("pass") : ui.red("fail")) +
      ui.dim("  word limit and place named")
  );
  console.log(
    ui.INDENT +
      ui.dim("AC-11".padEnd(ui.LABEL_W)) +
      (peak && peak < 1800 ? ui.green("pass") : ui.amber("check")) +
      ui.dim(`  peak llama-server RSS ${peak} MB, ceiling 1800 MB`)
  );
  console.log("");
  console.log(ui.note("Nothing was written to the log. This used a throwaway place."));
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

  console.log(ui.heading("Watching"));
  console.log(ui.kv("directories", cfg.watchDirs.join(", ")));
  console.log(ui.kv("places", `${cfg.places.length} walkable`));
  console.log("");
  console.log(
    ui.note(
      "Nothing prints until your work reaches a pause. Leave this in a visible pane. Ctrl-C stops watching; the model stays warm."
    )
  );
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
      console.log("");
      console.log(
        ui.INDENT +
          ui.amber("No daylight left.") +
          ui.dim(
            ` Next window opens ${hhmm(w.at)} ${w.sameDay ? "today" : "tomorrow"}.`
          )
      );
      console.log("");
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

    const meta = `${ui.duration(seam.estimateMin)} window · ${ui.duration(
      daylightLeft
    )} daylight left · ${seam.trigger}`;
    console.log(ui.hero(result.sentence, meta));

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
      if (!(await askPending())) {
        console.log(ui.INDENT + ui.dim("Nothing waiting to be confirmed."));
      }
      break;
    default: {
      console.log(ui.heading("touchgrass"));
      console.log(
        ui.note("Get told to go outside at the one moment it costs you nothing.")
      );
      console.log("");
      const cmds = [
        ["init", "set coordinates and walkable places"],
        ["sun", "sunrise, sunset, daylight left, offline"],
        ["doctor", "check weights, binary, warm state"],
        ["warm", "load the model now (about 150s, once)"],
        ["try", "run 3 suggestions now, see the model work"],
        ["watch", "watch for a seam, then say one thing"],
        ["log", "the evidence table"],
        ["went", "answer a pending confirm"],
        ["stop", "shut the model server down"],
      ];
      for (const [c, d] of cmds) {
        console.log(ui.INDENT + ui.green("grass " + c.padEnd(8)) + ui.dim(d));
      }
      console.log("");
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
