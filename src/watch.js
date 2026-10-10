// Seam detection. This file is the reason the project is not a reminder app.
//
// Two triggers, both derived from what the developer is actually doing:
//
//   commit        a new line appeared in .git/logs/HEAD
//   activity-gap  files were being edited, then went quiet
//
// Neither is a timer, and AC-6 is the proof: a machine that is simply left
// running, with no edits and no commits, produces nothing at all. An
// activity gap requires activity first. Silence on its own is not a seam.
//
// Polling rather than fs.watch, because recursive watching is unreliable
// across the WSL filesystem boundary. A 5 second poll that works beats an
// event API that silently misses writes.

const fs = require("fs");
const path = require("path");

const POLL_MS = 5000;
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache"]);

/** Newest mtime under a directory, ignoring the usual noise. */
function newestMtime(dir, depth = 0) {
  if (depth > 6) return 0;
  let newest = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".git") continue;
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    try {
      if (e.isDirectory()) {
        newest = Math.max(newest, newestMtime(full, depth + 1));
      } else if (e.isFile()) {
        newest = Math.max(newest, fs.statSync(full).mtimeMs);
      }
    } catch {
      // A file that vanished mid-scan is not an error worth stopping for.
    }
  }
  return newest;
}

/** Size of .git/logs/HEAD, which grows by one line per commit. */
function commitMarker(dir) {
  const p = path.join(dir, ".git", "logs", "HEAD");
  try {
    return fs.statSync(p).size;
  } catch {
    return null; // not a repo, or no commits yet
  }
}

/**
 * Emits seam events. Owns no policy about what to do with them, so it can
 * be tested without a model, a config, or daylight.
 *
 * @param {object} cfg
 * @param {(seam: {trigger: string, estimateMin: number}) => void} onSeam
 * @param {(info: {awayMin: number}) => void} onReturn
 */
function start(cfg, onSeam, onReturn) {
  const dirs = cfg.watchDirs && cfg.watchDirs.length ? cfg.watchDirs : [process.cwd()];

  let lastMtime = Math.max(...dirs.map((d) => newestMtime(d)), 0);
  let lastCommit = commitMarker(dirs[0]);
  let lastActivityAt = Date.now();

  // Set once we have seen real activity. Until then an activity gap is
  // just an idle machine, and idle machines are not seams.
  let sawActivity = false;

  // Stops the gap trigger firing repeatedly through one long silence.
  let gapFired = false;

  // Set when a suggestion goes out, so a later return can be measured.
  let awaySince = null;

  const tick = () => {
    const now = Date.now();

    const mtime = Math.max(...dirs.map((d) => newestMtime(d)), 0);
    const commit = commitMarker(dirs[0]);

    const filesChanged = mtime > lastMtime;
    const committed = commit !== null && lastCommit !== null && commit > lastCommit;

    if (filesChanged) {
      lastMtime = mtime;
      sawActivity = true;

      // Activity after a suggestion means they are back.
      if (awaySince) {
        const awayMin = Math.round((now - awaySince) / 60000);
        awaySince = null;
        if (awayMin >= cfg.awayThresholdMin) onReturn({ awayMin });
      }

      lastActivityAt = now;
      gapFired = false;
    }

    if (committed) {
      lastCommit = commit;
      sawActivity = true;
      lastActivityAt = now;
      gapFired = false;
      awaySince = now;
      onSeam({ trigger: "commit", estimateMin: cfg.defaultEstimateMin });
      return;
    }
    if (commit !== null && lastCommit === null) lastCommit = commit;

    const quietMin = (now - lastActivityAt) / 60000;
    if (sawActivity && !gapFired && quietMin >= cfg.activityGapMin) {
      gapFired = true;
      awaySince = now;
      onSeam({
        trigger: "activity-gap",
        estimateMin: Math.max(cfg.minWindowMin, cfg.defaultEstimateMin),
      });
    }
  };

  const handle = setInterval(tick, POLL_MS);
  return () => clearInterval(handle);
}

module.exports = { start, newestMtime, commitMarker, POLL_MS };
