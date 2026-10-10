// Sunrise and sunset from coordinates, computed locally.
// No network call, no API key, no lookup table. This is the NOAA solar
// position algorithm, which is why AC-2 can pass with the interface down.
//
// Accuracy is within about a minute for latitudes under 60 degrees, which
// is well inside the 2 minute tolerance AC-2 asks for.

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// Atmospheric refraction plus solar radius put the visible sunset slightly
// after geometric sunset. 90.833 degrees is the standard correction.
const ZENITH = 90.833;

function julianCenturyFor(date) {
  // Anchor on UTC midnight of the given calendar date, which is what the
  // NOAA worksheet expects.
  const utcMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  const jd = utcMidnight / 86400000 + 2440587.5;
  return { jd, t: (jd - 2451545.0) / 36525.0, utcMidnight };
}

function solarGeometry(t) {
  // Geometric mean longitude of the sun, degrees, normalised to 0..360
  let L0 = 280.46646 + t * (36000.76983 + t * 0.0003032);
  L0 = ((L0 % 360) + 360) % 360;

  // Geometric mean anomaly, degrees
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);

  // Eccentricity of Earth's orbit
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  // Equation of the centre
  const C =
    Math.sin(rad(M)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * t) +
    Math.sin(rad(3 * M)) * 0.000289;

  const trueLong = L0 + C;

  // Nutation correction
  const omega = 125.04 - 1934.136 * t;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));

  // Mean obliquity of the ecliptic, then corrected
  const e0 =
    23 +
    (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliq = e0 + 0.00256 * Math.cos(rad(omega));

  // Solar declination
  const decl = deg(Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(appLong))));

  // Equation of time, in minutes
  const y = Math.tan(rad(obliq / 2)) ** 2;
  const eqTime =
    4 *
    deg(
      y * Math.sin(2 * rad(L0)) -
        2 * e * Math.sin(rad(M)) +
        4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) -
        0.5 * y * y * Math.sin(4 * rad(L0)) -
        1.25 * e * e * Math.sin(2 * rad(M))
    );

  return { decl, eqTime };
}

/**
 * Sunrise, solar noon and sunset for a coordinate and a date.
 *
 * @param {number} lat  latitude, north positive
 * @param {number} lon  longitude, east positive
 * @param {Date}   date any instant on the calendar day wanted
 * @returns {{sunrise: Date|null, sunset: Date|null, solarNoon: Date, polar: string|null}}
 *          polar is "midnight-sun" or "polar-night" when the sun does not
 *          cross the horizon, and sunrise/sunset are then null.
 */
function sunTimes(lat, lon, date = new Date()) {
  const { t, utcMidnight } = julianCenturyFor(date);
  const { decl, eqTime } = solarGeometry(t);

  const solarNoonMin = 720 - 4 * lon - eqTime;
  const solarNoon = new Date(utcMidnight + solarNoonMin * 60000);

  const cosH =
    Math.cos(rad(ZENITH)) / (Math.cos(rad(lat)) * Math.cos(rad(decl))) -
    Math.tan(rad(lat)) * Math.tan(rad(decl));

  if (cosH > 1) {
    return { sunrise: null, sunset: null, solarNoon, polar: "polar-night" };
  }
  if (cosH < -1) {
    return { sunrise: null, sunset: null, solarNoon, polar: "midnight-sun" };
  }

  const H = deg(Math.acos(cosH));
  return {
    sunrise: new Date(utcMidnight + (solarNoonMin - 4 * H) * 60000),
    sunset: new Date(utcMidnight + (solarNoonMin + 4 * H) * 60000),
    solarNoon,
    polar: null,
  };
}

/**
 * Minutes of usable daylight left after a given instant.
 *
 * Returns 0 both after sunset AND before sunrise. The second case is not
 * obvious and was a real bug: measuring only "time until sunset" reports
 * almost fifteen hours of daylight at 03:37, because sunset is indeed far
 * away. It is also pitch dark. A seam firing pre-dawn would then pass the
 * daylight gate and send someone out into the night.
 */
function daylightMinutesLeft(lat, lon, now = new Date()) {
  const { sunrise, sunset, polar } = sunTimes(lat, lon, now);
  if (polar === "midnight-sun") return Infinity;
  if (polar === "polar-night" || !sunset) return 0;

  // Sun is not up yet. There is daylight coming, but none to spend now.
  if (sunrise && now.getTime() < sunrise.getTime()) return 0;

  return Math.max(0, Math.round((sunset.getTime() - now.getTime()) / 60000));
}

/**
 * The next time the sun is up, for the "no daylight left" message.
 * Returns the instant plus whether it falls on the current local date, so
 * the caller can say "today" or "tomorrow" without recomputing.
 */
function nextWindow(lat, lon, now = new Date()) {
  const today = sunTimes(lat, lon, now);
  if (today.sunrise && today.sunrise.getTime() > now.getTime()) {
    return { at: today.sunrise, sameDay: true };
  }
  const tomorrow = new Date(now.getTime() + 86400000);
  return { at: sunTimes(lat, lon, tomorrow).sunrise, sameDay: false };
}

/** Kept for callers that only want the instant. */
function nextSunrise(lat, lon, now = new Date()) {
  return nextWindow(lat, lon, now).at;
}

module.exports = {
  sunTimes,
  daylightMinutesLeft,
  nextWindow,
  nextSunrise,
};
