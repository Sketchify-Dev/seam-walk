# touchgrass

You are always mid-build. Stepping outside loses the thread, so the next thing on screen always wins, and the walk never happens.

touchgrass watches your own work for a pause where stepping away costs you nothing, then tells you one specific thing to go and do. It runs an open-weight model on your machine, makes no network call, and costs nothing per run.

```
  You have 15 minutes. Walk to the bench by the water tower and come straight back.
```

That is the whole interface. You read one line and leave.

## Why this is not a reminder app

A timer fires while you are mid-thought, so you dismiss it, correctly. touchgrass fires on a **seam**: a moment your own work has already reached a stopping point.

Two triggers, both derived from what you are actually doing:

- **commit** — a new line appeared in `.git/logs/HEAD`
- **activity-gap** — files were being edited, then went quiet

Neither is a schedule. A machine that is simply left running, with no edits and no commits, produces nothing at all. An activity gap requires activity first, because silence on its own is not a seam. That property is enforced by a test, not by intention.

## Why open weights matter here, specifically

This is the part the tool could not do any other way.

**It reads your git history and your file activity.** That is a log of what you work on and when you stop. It is exactly the kind of data that should not leave your machine, and with a local model it never does. There is no API call to omit, no telemetry setting to trust, no key to leak.

**It runs on hardware nobody would provision for inference.** This was built and tested on:

```
Intel Core i5-7300U (2017, 2 cores / 4 threads)
No GPU
3.8 GB RAM total under WSL2, ~2.3 GB actually available
```

Gemma 3 1B at Q4 is about 769 MB. A 2 B model at the same quantisation does not safely coexist with anything else on this machine. The constraint picked the model, and the design then worked around the constraint: the model is asked for one short sentence, at a moment when nothing is waiting on it, so a few tokens per second is irrelevant.

**The deterministic work stays deterministic.** Seam detection, pause sizing, and sunrise/sunset are plain code. Sunset comes from the NOAA solar position algorithm computed locally, which is why the daylight logic works with the interface down. The model does one job: turn facts that code already established into a sentence worth obeying. If it were doing the arithmetic, this would be a wrapper.

**The model cannot invent a destination.** Suggestions may only name places you typed in yourself, verified character for character before anything is printed. If the model will not produce a valid sentence in two attempts, a deterministic one is used and the fallback is recorded in the log. The write-up reports how often that happened, because a tool that quietly falls back is a tool that was never load bearing.

## Install

Requires Node 20 or newer. No sudo, nothing installed system wide.

```bash
# 1. the weights (769 MB, ungated, no token needed)
curl -L -o ~/.touchgrass/models/gemma3-1b-q4.gguf \
  https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf

# 2. the inference binary, CPU build
curl -L -o /tmp/l.tgz \
  https://github.com/ggml-org/llama.cpp/releases/download/b11514/llama-b11514-bin-ubuntu-x64.tar.gz
mkdir -p ~/.local/llama && tar -xzf /tmp/l.tgz -C ~/.local/llama

# 3. setup
node bin/grass.js init
node bin/grass.js doctor
```

## Use

```bash
grass init     # coordinates, and three or more places you can walk to
grass sun      # sunrise, sunset, daylight left, computed offline
grass doctor   # check the model and the inference binary
grass watch    # watch for a seam, then say one thing
grass log      # the evidence table
grass went     # answer a pending confirm
```

Leave `grass watch` running in a visible pane. It prints nothing until your work reaches a pause.

When there is not enough daylight left for the pause it found, it says so and suggests nothing:

```
  No daylight left. Next window opens 06:41 tomorrow.
```

## The log is the point

An outing is inferred from a gap in your file activity, then confirmed by one keypress when you get back. Suggestions that got ignored are logged too, with `confirmed: false`, because a log that only records successes is not evidence of anything.

```
$ grass log

when              trigger       est   away   went  suggestion
------------------------------------------------------------
2026-10-09 16:12  commit        15m   18m    yes   You have 15 minutes. Walk to ...
2026-10-09 18:40  activity-gap  15m   -      -     (no_daylight)

1 outing(s) confirmed, 18 minutes outside, 2 seam(s) detected.
```

Stored as JSONL at `~/.touchgrass/log.jsonl`. Plain text, append mostly, readable without this tool.

## Tests

```bash
npm test
```

The solar tests assert physics rather than almanac values: day length at both solstices, equatorial day length across four dates, seasonal inversion in the southern hemisphere, polar night and midnight sun at Tromsø, and the equation-of-time bound on solar noon. A radians slip, a sign error, or a wrong Julian epoch fails at least one of them.

## Built for

The [Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05).

## Licence

MIT. See [LICENSE](LICENSE).
