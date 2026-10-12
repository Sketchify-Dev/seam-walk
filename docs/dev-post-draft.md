---
title: I built the thing that tells me to go outside, because I am the person who never does
published: false
tags: devchallenge, hf26challenge
---

> **Fill before publishing.** Every `TODO(real)` below is a hole that must be filled from an actual run or an actual walk, never by guessing. If a number is not measured, cut the sentence instead of inventing one. Checklist at the bottom. Publishing notes: set `published: true`, confirm the two tags survived, and delete this quote block.

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/devteam/join-the-hacktoberfest-open-source-ai-challenge-week-1-touch-grass-2450-in-prizes-across-17-4pom).*

## What I Built

I do not go outside. Not as a lifestyle, as a failure.

It is never a decision I make and lose. It is a decision I never reach. I am always mid-build, and the moment I think about stepping out, there is one more thing on screen that would be easier to finish first. Then it is dark.

I have tried the obvious fixes. A timer goes off while I am halfway through a thought, so I dismiss it, and I am right to dismiss it. A calendar block for a walk is a block I schedule around. A habit app wants me to remember to open the habit app. Every one of those fails for the same reason: **none of them know what I am doing when they interrupt me.** They interrupt at a *time*. The problem was never time. The problem is that I am mid-thing.

So I built **touchgrass**, a terminal tool that waits for the *seam*: a moment my own work has already reached a stopping point. When it finds one, it says exactly one thing, then I leave.

```
  ▌  You have 15 minutes. Walk to the bench by the water tower and come straight back.

     15m window · 2h 28m daylight left · commit
```

It finds the seam two ways, both derived from what I am actually doing, neither of them a clock:

- **commit**: a new line appeared in `.git/logs/HEAD`. I just declared the work at a stopping point.
- **activity-gap**: files were being edited, and then went quiet. I am stuck, thinking, or already drifting.

A machine left simply running produces nothing at all, because an activity gap requires activity first. That is not a design intention, it is a test (`AC-6`). Before it ever speaks it checks, offline, whether there is enough daylight left for the walk it is about to suggest. If there is not, it stays quiet and tells me when the next window opens.

**Who it is for:** developers, writers, anyone who works in long unbroken sessions at a machine and keeps meaning to step outside. It runs where the work happens, because that is the only place the pause is detectable.

## Demo

TODO(real): a short screen recording (30 to 60 s) of `grass watch` reacting to a real `git commit`, then paste the asciinema or YouTube embed here. Suggested capture, with the model already warm:

```bash
grass sun      # the offline daylight screen
grass try      # 3 suggestions now, with the AC-5/AC-11 numbers, nothing logged
grass watch    # in another pane, make a commit and watch the suggestion appear
grass log      # the evidence table afterwards
```

TODO(real): drop in the screenshots. The strongest set is the daylight screen (`grass sun`), the model actually writing (`grass try`, which shows three sentences and the pass/fail numbers beside them), and the evidence table (`grass log`). The hero suggestion from `grass watch` is the best shot of all if you catch one. They live in the repo once captured.

It is a local offline CLI, so there is no hosted link to click. The repository below runs end to end on the hardware described.

## Code

{% embed https://github.com/Sketchify-Dev/seam-walk %}

## How I Built It

The open-source AI is **Gemma 3 1B (instruction tuned, Q4\_K\_M, about 769 MB)**, running locally through **llama.cpp**'s `llama-server`. No hosted API is involved at any point. The whole thing runs on a 2017 laptop:

```
Intel Core i5-7300U (2 cores / 4 threads), no GPU
3.8 GB RAM total under WSL2, about 2.3 GB actually free
```

The design rule I held to: **the model does exactly one job, and it is the only job deterministic code cannot do.** Everything factual is plain code.

- **Daylight** is the NOAA solar position algorithm, computed from coordinates I enter at setup. No GPS, no IP lookup, no weather API, so it works with the network interface down. The tests assert physics (solstice day lengths, southern-hemisphere inversion, polar night and midnight sun at Tromso) rather than almanac values, so broken trig cannot quietly pass.
- **Seam detection** is a 5-second poll of file mtimes and the size of `.git/logs/HEAD`.
- **The model** turns those established facts into one sentence worth obeying. It is never allowed to invent a destination: the output must name a place I typed in myself, verbatim, and must be 20 words or fewer, and must not state a wrong number of minutes. If it fails that check twice, a deterministic sentence is used and the fallback is recorded.

Getting a 1B model to answer fast on this CPU was the real work, and the commit history shows the dead ends. First end-to-end test: 3 of 3 suggestions timed out, because prompt evaluation runs at 2.58 tok/s and the prompt was 160 tokens, which is 62 seconds of reading before a single word comes out. The fix was to cut the prompt to about 40 tokens, put the static instructions first so `llama-server` caches the prefix, prime that cache once at warm time, and keep it warm while watching. After that, suggestions landed in 3 to 10 seconds at about 930 MB peak memory. Rerun on 2026-10-12 after re-downloading the weights: prompt cache primed in 13s, then `grass try` produced 1 model sentence in 16.6s followed by 2 fallback timeouts at 37.4s and 92.8s, peak llama-server RSS 941 MB, with AC-5 and AC-11 both passing. Slower than the earlier 3 to 10s window, which is reported as measured, not hidden.

TODO(real): from your final `grass log`, state how often the model actually wrote the sentence versus fell back. A high fallback rate is a finding about 1B models on CPU, not something to hide. The footer of `grass log` prints this number for you.

The interface got designed like a product, because it is the entire product: one accent colour, hierarchy from weight and spacing rather than colour, a status word next to every colour so it survives a colourblind reader, and colour that switches itself off when output is piped to a file.

## What is tested and what is walked

I want to be exact about which claims here rest on code I ran and which rest on actually going outside.

**Tested by running it.** `npm test` passes 40 of 40 checks: the NOAA solar maths (asserted against physics, not an almanac), the 20-word and verbatim-place rules every model sentence has to clear, and the evidence-log accounting that keeps a model-written suggestion separate from a deterministic fallback. The figures in the performance table were measured on the 2017 laptop named above, not estimated. The offline property is structural, not a setting: there is no network call anywhere in the code to switch off.

**Walked.** TODO(real): state how many confirmed outings are in your `grass log` and whether you photographed one. Write the real number. If it is fewer than three, say that plainly here and let the engineering and the honest fallback rate carry the post. A tool that reports its own fallback rate cannot start padding its outing count.

## Why Does Open Innovation Matter?

This is the part the tool could not do any other way.

**It reads my git history and my file-activity timestamps.** That is a record of what I work on and when I stop. It is the last data I would post to someone else's inference endpoint, and with an open-weight model running locally there is no endpoint to post it to. The privacy property is not a line in a policy I have to trust, it is the plain absence of a network call. I can run `grass watch` with the interface down and nothing about the tool degrades.

**Open weights let the constraint pick the model.** A closed API assumes a datacentre. My machine is a 2017 ThinkPad with no GPU, and the entire design (tiny prompt, warm server, one short sentence, a deterministic fallback for when the small model stumbles) exists because I could hold the model in my hand, measure it, and build around exactly what it could and could not do. I could swap Gemma 3 1B for a 270M or a larger model by changing one path in a config file. A closed API is a fixed ceiling and a running meter; this is zero cost per run, forever, and fully inspectable.

The honest version: a frontier closed model would write a nicer sentence. But the whole value here is that a record of my working habits never leaves my laptop, and that the tool keeps working on hardware and in places where there is no connection to leave it over. Open weights are not the compromise in this project. They are the point of it.

## Prize Categories

**Gemma** (Featured): the load-bearing model is Gemma 3 1B, chosen because at Q4 it is one of the few genuinely capable instruction-tuned models that fits and runs on a no-GPU 2017 laptop with room to spare.

---

### Checklist before publishing

- [ ] Every `TODO(real)` replaced with a measured value, a real screenshot, or removed
- [ ] `published: true` and both tags (`devchallenge`, `hf26challenge`) present
- [ ] GitHub repo embed resolves and the repo is public
- [ ] The outing count in `grass log` is stated truthfully (three is the goal; if fewer, say so plainly and never pad the log)
- [ ] At least one photograph taken on one of those walks
- [ ] The fallback rate stated honestly, whatever it is
- [ ] Zero em dashes
- [ ] This instruction block and the leading quote deleted
