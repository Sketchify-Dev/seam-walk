// Config lives in ~/.touchgrass/config.json and is the only place the tool
// learns about the world. Two things matter here.
//
// 1. Coordinates come from the user, not from an IP lookup, because an IP
//    lookup is a network call and the offline claim has to hold.
// 2. Places come from the user too. The model is never allowed to invent a
//    destination, which is what AC-5 checks. Grounding the suggestion in a
//    list a human typed is also the difference between a real tool and a
//    sentence generator.

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { HOME } = require("./log.js");

const CONFIG_PATH = path.join(HOME, "config.json");

const DEFAULTS = {
  lat: null,
  lon: null,
  places: [],
  // Path to the GGUF weights. Swappable by hand, which is the point of
  // using open weights at all.
  model: "/tmp/g.gguf",
  // Resolved by `grass doctor` if left null. llama-cli is chat-only in
  // build 11514, so the server is what we drive.
  serverBin: null,
  port: 8757,
  threads: 4,
  // A seam shorter than this is not worth interrupting for.
  minWindowMin: 10,
  // How long a commit-triggered pause is assumed to be worth.
  defaultEstimateMin: 15,
  // Silence in a watched directory for this long counts as a seam.
  activityGapMin: 12,
  // How long of a real absence counts as having gone out.
  awayThresholdMin: 10,
  watchDirs: [process.cwd()],
};

function exists() {
  return fs.existsSync(CONFIG_PATH);
}

function read() {
  if (!exists()) return null;
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
  } catch {
    return "MALFORMED";
  }
}

function write(cfg) {
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  return cfg;
}

function ask(rl, question, fallback) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      const v = answer.trim();
      resolve(v === "" ? fallback : v);
    });
  });
}

/**
 * Interactive setup. Short on purpose: four questions, then it is done.
 * Anything longer and the tool has already cost more attention than the
 * walk it is trying to buy.
 */
async function init() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("");
  console.log("touchgrass setup. Four questions, then nothing else to configure.");
  console.log("");
  console.log("Coordinates are used to work out sunset locally. Nothing is sent anywhere.");
  console.log("Find yours by searching your town plus \"latitude longitude\".");
  console.log("");

  const existing = read();
  const prev = existing && existing !== "MALFORMED" ? existing : DEFAULTS;

  const latRaw = await ask(
    rl,
    `  latitude${prev.lat != null ? ` [${prev.lat}]` : ""}: `,
    prev.lat
  );
  const lonRaw = await ask(
    rl,
    `  longitude${prev.lon != null ? ` [${prev.lon}]` : ""}: `,
    prev.lon
  );

  console.log("");
  console.log("Now three or more real places within walking distance.");
  console.log("Be specific. \"the bench by the water tower\" beats \"the park\",");
  console.log("because a specific instruction is harder to ignore.");
  console.log("Blank line to finish.");
  console.log("");

  const places = [];
  for (let i = 1; ; i++) {
    const p = await ask(rl, `  place ${i}: `, "");
    if (!p) break;
    places.push(p);
  }

  rl.close();

  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  const finalPlaces = places.length ? places : prev.places;

  const problems = [];
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    problems.push("latitude must be a number between -90 and 90");
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    problems.push("longitude must be a number between -180 and 180");
  }
  if (finalPlaces.length < 3) {
    problems.push("at least 3 places are needed, per AC-1");
  }

  if (problems.length) {
    console.log("");
    console.log("Not saved:");
    for (const p of problems) console.log(`  - ${p}`);
    console.log("");
    console.log("Run: grass init");
    return null;
  }

  const cfg = write({ ...prev, lat, lon, places: finalPlaces });
  console.log("");
  console.log(`Saved to ${CONFIG_PATH}`);
  console.log(`${finalPlaces.length} places, coordinates ${lat}, ${lon}`);
  console.log("");
  console.log("Next: grass sun     (check the daylight maths)");
  console.log("      grass watch   (start watching for a seam)");
  console.log("");
  return cfg;
}

module.exports = { CONFIG_PATH, DEFAULTS, exists, read, write, init };
