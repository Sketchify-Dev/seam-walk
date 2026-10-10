// Checks that do not require an almanac.
//
// Hardcoding "sunset in London is 20:21" would mean trusting a number I
// cannot verify offline. These assert physical facts instead, which is
// strictly harder to accidentally satisfy with broken maths:
//
//   - the sun rises before noon and sets after it
//   - London gets about 16h38m of daylight at the June solstice and
//     about 7h50m at the December one
//   - the equator gets about 12 hours all year
//   - Tromso has polar night in December and midnight sun in June
//   - solar noon at longitude 0 lands within 17 minutes of 12:00 UTC,
//     which is the range of the equation of time
//
// A sign error, a radians/degrees slip, or a wrong Julian epoch all break
// at least one of these.

const sun = require("../src/sun.js");
const model = require("../src/model.js");

let failures = 0;
let checks = 0;

function ok(name, condition, detail = "") {
  checks++;
  if (condition) {
    console.log(`  pass  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

function near(name, actual, expected, tolerance, unit = "") {
  const delta = Math.abs(actual - expected);
  ok(
    name,
    delta <= tolerance,
    `got ${actual.toFixed(2)}${unit}, expected ${expected}${unit} +/- ${tolerance}${unit}`
  );
}

const dayLengthHours = (lat, lon, iso) => {
  const t = sun.sunTimes(lat, lon, new Date(iso));
  if (!t.sunrise || !t.sunset) return null;
  return (t.sunset - t.sunrise) / 3600000;
};

console.log("\nsun.js\n");

// Ordering
{
  const t = sun.sunTimes(51.5074, -0.1278, new Date("2026-10-09T12:00:00Z"));
  ok("sunrise is before solar noon", t.sunrise < t.solarNoon);
  ok("solar noon is before sunset", t.solarNoon < t.sunset);
}

// London solstices. Well known values, 16h38m and 7h50m.
near(
  "London June solstice day length",
  dayLengthHours(51.5074, -0.1278, "2026-06-21T12:00:00Z"),
  16.63,
  0.15,
  "h"
);
near(
  "London December solstice day length",
  dayLengthHours(51.5074, -0.1278, "2026-12-21T12:00:00Z"),
  7.83,
  0.15,
  "h"
);

// Equator sits near 12 hours all year. Slightly over, because the 90.833
// zenith correction counts the sun as up while it is just below the horizon.
for (const d of ["2026-03-21", "2026-06-21", "2026-09-21", "2026-12-21"]) {
  near(`equator day length ${d}`, dayLengthHours(0, 0, `${d}T12:00:00Z`), 12.12, 0.2, "h");
}

// Southern hemisphere must invert the seasons. A sign error passes every
// northern test and fails this one.
{
  const sydJun = dayLengthHours(-33.8688, 151.2093, "2026-06-21T12:00:00Z");
  const sydDec = dayLengthHours(-33.8688, 151.2093, "2026-12-21T12:00:00Z");
  ok("Sydney December is longer than Sydney June", sydDec > sydJun, `${sydDec?.toFixed(2)}h vs ${sydJun?.toFixed(2)}h`);
}

// Polar cases
ok(
  "Tromso has polar night in December",
  sun.sunTimes(69.6496, 18.956, new Date("2026-12-21T12:00:00Z")).polar === "polar-night"
);
ok(
  "Tromso has midnight sun in June",
  sun.sunTimes(69.6496, 18.956, new Date("2026-06-21T12:00:00Z")).polar === "midnight-sun"
);

// Equation of time bounds solar noon at the prime meridian.
{
  let worst = 0;
  for (let m = 0; m < 12; m++) {
    const d = new Date(Date.UTC(2026, m, 15, 12));
    const noon = sun.sunTimes(0, 0, d).solarNoon;
    const minsFrom12 = Math.abs((noon.getUTCHours() * 60 + noon.getUTCMinutes()) - 720);
    worst = Math.max(worst, minsFrom12);
  }
  ok("solar noon at longitude 0 stays within 17 min of 12:00 UTC", worst <= 17, `worst ${worst} min`);
}

// Daylight left is never negative and is zero after dark.
{
  const afterDark = new Date("2026-12-21T23:30:00Z");
  ok(
    "no negative daylight after sunset",
    sun.daylightMinutesLeft(51.5074, -0.1278, afterDark) === 0
  );
}

// Pre-dawn regression. Found on real Ilesa coordinates at 03:37 local, where
// "time until sunset" reported 891 minutes of daylight while it was pitch
// dark. A seam firing then would have passed the AC-7 gate and sent someone
// out into the night.
{
  const ILESA = [7.6167, 4.7333];
  // 03:37 WAT on 2026-10-10 is 02:37 UTC. Sunrise is about 05:28 UTC.
  const preDawn = new Date("2026-10-10T02:37:00Z");
  ok(
    "zero daylight before sunrise, not time-until-sunset",
    sun.daylightMinutesLeft(ILESA[0], ILESA[1], preDawn) === 0,
    `got ${sun.daylightMinutesLeft(ILESA[0], ILESA[1], preDawn)}`
  );

  // Midday on the same day must still report real daylight, so the fix
  // cannot have simply zeroed everything.
  const midday = new Date("2026-10-10T11:00:00Z");
  const left = sun.daylightMinutesLeft(ILESA[0], ILESA[1], midday);
  ok("real daylight at midday", left > 60 && left < 600, `got ${left}`);

  // The pre-dawn window is today, not tomorrow.
  const w = sun.nextWindow(ILESA[0], ILESA[1], preDawn);
  ok("pre-dawn next window is same day", w.sameDay === true);

  // After sunset it rolls to tomorrow.
  const evening = new Date("2026-10-10T19:00:00Z");
  ok("post-sunset next window is next day", sun.nextWindow(ILESA[0], ILESA[1], evening).sameDay === false);
}

console.log("\nmodel.js\n");

// Gemma turn tokens must not survive into the printed sentence.
{
  const raw = "Walk to the water tower and back.<end_of_turn>\n<start_of_turn>";
  ok("strips gemma turn tokens", model.clean(raw) === "Walk to the water tower and back.", model.clean(raw));
}
ok("collapses whitespace", model.clean("  a   b \n c ") === "a b c");
ok("strips wrapping quotes", model.clean('"go outside"') === "go outside");

// AC-5 is enforced here, not hoped for.
ok(
  "rejects a sentence missing the place",
  model.valid("Go for a short walk right now.", "the water tower") === false
);
ok(
  "rejects a sentence over the word limit",
  model.valid(Array(25).fill("word").join(" ") + " the water tower", "the water tower") === false
);
ok(
  "accepts a short sentence naming the place",
  model.valid("Walk to the water tower and come back.", "the water tower") === true
);

// The fallback must itself satisfy AC-5, or the guarantee leaks.
{
  const place = "the bench by the water tower";
  const s = model.deterministic({ minutes: 15, place });
  ok("fallback satisfies the same rule it protects", model.valid(s, place, 15) === true, s);
}

// Number-accuracy regression. The model produced this verbatim when told the
// window was 15 minutes, and the old validator accepted it:
//   "Walk to the bench by the water tower, five minutes away."
// A tool whose job is telling you how long you have cannot ship a wrong number.
{
  const place = "the bench by the water tower";
  ok(
    "rejects a sentence claiming the wrong duration in words",
    model.valid(`Walk to ${place}, five minutes away.`, place, 15) === false
  );
  ok(
    "rejects a sentence claiming the wrong duration in digits",
    model.valid(`Walk to ${place}, 5 minutes away.`, place, 15) === false
  );
  ok(
    "accepts the correct duration in digits",
    model.valid(`Walk to ${place}, 15 minutes away.`, place, 15) === true
  );
  ok(
    "accepts the correct duration in words",
    model.valid(`Walk to ${place}, fifteen minutes away.`, place, 15) === true
  );
  ok(
    "accepts a sentence that states no duration at all",
    model.valid(`Walk to ${place} and come back.`, place, 15) === true
  );

  // A number inside the place name must not be read as a claimed duration.
  const numbered = "the gate at 5 Ilaro Road";
  ok(
    "a number in the place name is not treated as a duration",
    model.valid(`Walk to ${numbered} and come back.`, numbered, 15) === true
  );

  ok("numbersIn finds digits", model.numbersIn("walk 15 minutes").includes(15));
  ok("numbersIn finds number words", model.numbersIn("walk five minutes").includes(5));

  // Without a minutes argument the check is skipped, so older callers and
  // the two-argument tests above keep working.
  ok(
    "number check is skipped when minutes is omitted",
    model.valid(`Walk to ${place}, five minutes away.`, place) === true
  );
}

console.log("");
console.log(`${checks - failures}/${checks} checks passed`);
console.log("");
process.exit(failures ? 1 : 0);
