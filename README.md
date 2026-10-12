# touchgrass

![Node 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen) ![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Network: none](https://img.shields.io/badge/network-none-lightgrey) ![Dependencies: zero](https://img.shields.io/badge/dependencies-zero-brightgreen)

**Get told to go outside at the one moment it costs you nothing.** touchgrass runs an open-weight model on your own machine, makes no network call, and costs nothing per run.

You are always mid-build. Stepping outside loses the thread, so the next thing on screen always wins, and the walk never happens. touchgrass watches your own work for a pause where stepping away costs nothing, then says one specific thing to go and do:

```
  ▌  You have 15 minutes. Walk to the bench by the water tower and come straight back.

     15m window · 2h 28m daylight left · commit
```

That is the whole interface. You read one line and leave.

## Why this is not a reminder app

A timer fires while you are mid-thought, so you dismiss it, correctly. touchgrass fires on a **seam**: a moment your own work has already reached a stopping point.

Two triggers, both derived from what you are actually doing, neither of them a clock:

- **commit** — a new line appeared in `.git/logs/HEAD`. You just declared the work at a stopping point.
- **activity-gap** — files were being edited, then went quiet. You are stuck, thinking, or already drifting.

A machine simply left running, with no edits and no commits, produces nothing at all. An activity gap requires activity first, because silence on its own is not a seam. That property is enforced by a test, not by intention (`test/run.js`, AC-6).

## Why open weights are the whole project, not a box ticked

This is the part the tool could not do any other way.

**It reads your git history and your file activity.** That is a log of what you work on and when you stop. It is exactly the kind of data that should not leave your machine, and with a local model it never does. There is no API call to omit, no telemetry setting to trust, no key to leak. The privacy property is not a promise in a policy, it is the absence of a network call.

**It runs on hardware nobody would provision for inference.** This was built and tested on:

```
Intel Core i5-7300U (2017, 2 cores / 4 threads)
No GPU
3.8 GB RAM total under WSL2, about 2.3 GB actually available
```

Gemma 3 1B at Q4_K_M is about 769 MB. A 2B model at the same quantisation does not safely coexist with anything else on this machine. The constraint picked the model, and the design then worked around the constraint: the model is asked for one short sentence, at a moment when nothing is waiting on it, so a few tokens per second stops mattering.

**The deterministic work stays deterministic.** Seam detection, pause sizing, and sunrise/sunset are plain code. Sunset comes from the NOAA solar position algorithm computed locally, which is why the daylight logic works with the interface down. The model does one job: turn facts that code already established into a sentence worth obeying. If it were doing the arithmetic, this would be a wrapper with a personality.

**The model cannot invent a destination.** Suggestions may only name places you typed in yourself, verified character for character before anything is printed. If the model will not produce a valid sentence in two attempts, a deterministic one is used and the fallback is recorded in the log. The write-up reports how often that happened, because a tool that quietly falls back is a tool whose model was never load bearing.

## The interface is the product, so it was designed like one

The terminal is the entire surface, so it gets treated like one. Three rules, in `src/ui.js`:

- **One accent colour.** Grass green marks the single thing that matters on any screen and nothing else. The suggestion is the only bold text; labels recede, values hold.
- **Hierarchy from weight and space, not colour.** The output reads correctly with colour stripped entirely.
- **Colour is never the only carrier of meaning.** `grass doctor` prints `ok`, `!!`, or `xx` next to every row, not just a hue, so it survives a colourblind reader and a piped log file.

Colour disables itself automatically when `NO_COLOR` is set, when `--no-color` is passed, or when stdout is not a TTY. That last one matters: `grass log > evidence.txt` produces a clean file, because the log is meant to be readable by a stranger without this tool.

## Install

Requires Node 20 or newer. No sudo, nothing installed system wide. Clone, then two downloads.

```bash
# 0. the code
git clone https://github.com/Sketchify-Dev/seam-walk.git
cd seam-walk

# 1. the weights (about 769 MB, ungated, no token needed)
mkdir -p ~/.touchgrass/models
curl -L -o ~/.touchgrass/models/gemma3-1b-q4.gguf \
  https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf

# 2. the inference binary, CPU build (ggml-org llama.cpp release)
mkdir -p ~/.local/llama
curl -L -o /tmp/llama.tgz \
  https://github.com/ggml-org/llama.cpp/releases/download/b11514/llama-b11514-bin-ubuntu-x64.tar.gz
tar -xzf /tmp/llama.tgz -C ~/.local/llama

# 3. set up and check
node bin/grass.js init
node bin/grass.js doctor
```

`grass doctor` resolves the weights and the `llama-server` binary across the usual locations and tells you exactly what is missing. If it cannot find the binary, set `serverBin` in `~/.touchgrass/config.json` to its full path.

No environment variables and no secrets are required: the tool holds no API keys, because it calls no API. Everything it reads and writes lives under `~/.touchgrass/`.

## Use

```bash
grass init     # coordinates, and three or more places you can walk to
grass sun      # sunrise, sunset, daylight left, computed offline
grass doctor   # check the weights and the inference binary
grass warm     # load the model now so the first suggestion is not slow
grass try      # run 3 suggestions now, logging nothing, to see the model work
grass watch    # watch for a seam, then say one thing
grass log      # the evidence table
grass went     # answer a pending confirm
grass stop     # shut the local model server down
```

Leave `grass watch` running in a visible pane. It prints nothing until your work reaches a pause. When there is not enough daylight left for the pause it found, it says so and suggests nothing:

```
  No daylight left. Next window opens 06:41 tomorrow.
```

## The log is the point

An outing is inferred from a gap in your file activity, then confirmed by one keypress when you get back. Suggestions that got ignored are logged too, with `confirmed: false`, because a log that only records successes is not evidence of anything. The footer reports how many suggestions the model actually wrote versus how many fell back, computed from the log rather than asserted. The table below shows the shape of it with example rows; real captures live in the DEV write-up.

```
$ grass log

  when         trigger est/away went wrote    suggestion
  ──────────────────────────────────────────────────────────────────
  10-09 16:12  commit  15m/18m  yes  model    Walk to the water tower, 15 ...
  10-10 14:03  gap     15m/22m  yes  fallback You have 15 minutes. Walk to ...
  10-10 18:40  commit  15m/-    -    -        (no_daylight)

  2 outings confirmed · 40m outside · 3 seams detected
  model wrote 1 of 2, 1 fell back
```

Stored as JSONL at `~/.touchgrass/log.jsonl`. Plain text, append mostly, readable without this tool. Confirmed outings are the only rows printed in the accent colour, because an unconfirmed row is not a failure, it is just not yet proof.

## Measured on the target machine

Numbers from real runs on the i5-7300U above, recorded in `docs/spec-touchgrass.md`:

| Metric | Value |
| --- | --- |
| Weights (Gemma 3 1B, Q4_K_M) | 769 MB |
| Cold model load | about 148 s |
| Warm page-cache load | about 59 s |
| Prompt eval | 2.58 tok/s |
| Generation | 4.53 tok/s |
| Suggestion latency, warm cache | 3 to 10 s |
| Rerun 2026-10-12 (`grass try`) | 1 model sentence in 16.6 s, then 2 fallback timeouts at 37.4 s and 92.8 s |
| Peak resident memory during a suggestion | about 930 MB (ceiling 1800 MB); rerun peaked at 941 MB |

The load cost is paid once, by a local `llama-server` the tool starts and keeps warm, so every suggestion after the first reuses the loaded weights and the cached prompt prefix. See `src/model.js` for why the prompt is cut to the bone.

## Demo and screenshots

This is a local, offline CLI, so there is no deployment to link. To see it:

```bash
grass sun        # the daylight screen, works with networking off
grass doctor     # the readiness screen
grass try        # the fastest proof: 3 suggestions and the AC-5/AC-11 numbers
grass watch      # make a commit in a watched repo and watch a suggestion appear
```

`grass try` is the quickest thing to capture, because it runs the model end to end against a throwaway place without waiting for a real seam, and it prints the word-limit and memory numbers beside each sentence. It writes nothing to the log, so the evidence table stays only real outings. Real output from 2026-10-12 on the i5-7300U above (2 of 3 fell back; reported, not hidden):

```
[1] 16.6s · model · 11 words
    Walk to the bench by the water tower, 15 minutes away.

[2] 37.4s · fallback · 16 words
    You have 15 minutes. Walk to the bench by the water tower and come straight back.
    reason: timeout

[3] 92.8s · fallback · 16 words
    You have 15 minutes. Walk to the bench by the water tower and come straight back.
    reason: timeout

  measured
AC-5          pass  word limit and place named
AC-11         pass  peak llama-server RSS 941 MB, ceiling 1800 MB

Nothing was written to the log. This used a throwaway place.
```

Screenshots and a short screen recording are in the DEV write-up (`docs/dev-post-draft.md`). The log table and outdoor photographs there come from real use, not mock-ups.

## Tests

```bash
npm test   # currently 40/40 passing
```

The solar tests assert physics rather than almanac values: day length at both solstices, equatorial day length across four dates, seasonal inversion in the southern hemisphere, polar night and midnight sun at Tromso, and the equation-of-time bound on solar noon. A radians slip, a sign error, or a wrong Julian epoch fails at least one of them. The model tests enforce the 20-word limit, the verbatim place name, and the number-accuracy rule, including the exact sentence that once slipped through.

## Limitations

- Gemma 3 1B on a 2017 CPU is slow to load and modest in quality, which is why there is a deterministic fallback and why the log reports the fallback rate honestly.
- Daylight is computed from coordinates you enter, not from GPS or an IP lookup, both because an IP lookup is a network call and because this is one user on one machine.
- No weather. Rain gating would need the network, which would sit directly beside the claim that nothing needs the network, so it is cut.

## Built for

The [Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass](https://dev.to/devteam/join-the-hacktoberfest-open-source-ai-challenge-week-1-touch-grass-2450-in-prizes-across-17-4pom).

## Licence

MIT. See [LICENSE](LICENSE).
