# DEV post draft: touchgrass

> Status: DRAFT. Every `[NEEDS REAL DATA]` marker below is a hole that must be
> filled from an actual run or an actual walk. None of them may be filled by
> guessing. If a number is not measured, the sentence comes out instead.
>
> Required tags: `#devchallenge` `#hf26challenge`
> Must use the official DEV submission template.

---

## Working titles

1. I built the thing that gets me outside, because I am the person who never goes
2. Touch grass is advice. I made it a program that knows when I can actually take it
3. My laptop is from 2017 and it tells me to go outside

Pick one before publishing. Title 1 leads with the honesty, which is the strongest card.

---

## Opening (the part that decides whether the rest gets read)

I do not go outside. Not as a lifestyle, as a failure.

It is never a decision I make and lose. It is a decision I never reach. I am always mid-build, and the moment I think about stepping out, there is one more thing on screen that would be easier to finish first. Then it is dark.

I have tried the obvious fixes. A timer goes off while I am halfway through a thought, so I dismiss it, and I am right to dismiss it. A calendar block for a walk is a block I schedule around. A habit app wants me to remember to open the habit app.

Every one of those fails for the same reason: **none of them know what I am doing when they interrupt me.** They interrupt at a time. The problem is not time. The problem is that I am mid-thing.

So I built the version that waits for the seam.

---

## What it does

`touchgrass` watches my own work for a pause where stepping away costs nothing. When it finds one, it says exactly one thing:

```
  You have 15 minutes. Walk to the bench by the water tower and come straight back.
```

Then I leave. That is the entire interface. The screen is the shortest part, which is what this week's theme asked for.

Two triggers, both derived from what I am actually doing, neither of them a clock:

- **commit**: a new line appeared in `.git/logs/HEAD`. The work is at a natural stopping point by definition, because I just declared it one.
- **activity-gap**: files were being edited, and then went quiet. I am stuck, or thinking, or already drifting.

A machine simply left running produces nothing at all. An activity gap requires activity first, because silence on its own is not a seam. That is not a design intention, it is a test:

```
[NEEDS REAL DATA: paste the AC-6 result. 60 idle minutes, zero suggestions.]
```

---

## Why open weights are the whole project, not a box I ticked

This is the part I would have gotten wrong if I had started from the technology instead of the problem.

**It reads my git history and my file activity.** That is a record of what I work on and when I stop working on it. It is the last data I would post to someone else's inference endpoint. With an open-weight model running locally there is no endpoint to trust, no telemetry setting to audit, no key to leak. The privacy property is not a promise in a policy, it is the absence of a network call.

**It runs on hardware nobody would choose for inference.** Here is the machine:

```
Intel Core i5-7300U (2017, 2 cores / 4 threads)
No GPU
3.8 GB RAM total under WSL2, about 2.3 GB actually free
```

Gemma 3 1B at Q4_K_M is 769 MB. A 2B model at the same quantisation does not safely share this machine with anything else, so the constraint chose the model, and then the design worked around the constraint instead of fighting it. The model is asked for one short sentence, at a moment when nothing is waiting on it. A few tokens per second stops mattering when the alternative to waiting is that I was going to sit there anyway.

```
[NEEDS REAL DATA: measured wall time for one suggestion, and peak RSS.
 Target was under 20 s and under 1800 MB. Report what actually happened,
 including if it failed and we fell back to Gemma 3 270M.]
```

**The deterministic work stayed deterministic.** This is the line I would defend hardest. Seam detection, pause sizing and sunset are plain code. Sunset comes from the NOAA solar position algorithm computed locally, which is why the daylight logic keeps working with the interface down:

```
[NEEDS REAL DATA: grass sun output, ideally with networking disabled.]
```

The model does one job: turn facts that code already established into a sentence worth obeying. If the model were doing the arithmetic, this would be a wrapper with a personality, and it would deserve to lose.

**The model is not allowed to invent a destination.** Suggestions may only name places I typed in myself, checked character for character before anything prints. If it cannot produce a valid sentence in two attempts, a deterministic one is used and the fallback is recorded.

That last clause matters more than it looks. A tool that quietly falls back is a tool whose model was never load bearing. So here is the honest number:

```
[NEEDS REAL DATA: how many suggestions came from the model vs the fallback.
 If the fallback rate is high, say so and say why. A high rate is a finding
 about 1B models on CPU, not a thing to hide.]
```

---

## The log, which is the only evidence that matters

I could have written all of the above and gone outside zero times.

An outing gets inferred from a gap in my file activity, then confirmed with one keypress when I get back. Suggestions I ignored are logged too, with `confirmed: false`, because a log that only records successes is not evidence of anything.

```
[NEEDS REAL DATA: paste real grass log output. Minimum 3 confirmed outings.
 Include the ignored ones. Include the no_daylight rows.]
```

```
[NEEDS REAL DATA: at least one photograph taken on one of those walks.]
```

### What actually happened when I used it

```
[NEEDS REAL DATA: this is the section that wins or loses the post.
 What broke in real conditions? Did the suggestion arrive at a genuinely
 good moment or did it misjudge? Did you ignore one, and why? Was the
 estimate wrong? Did you come back and finish the thing you were doing,
 or did the walk cost you the thread after all?

 Write what happened, including the parts that make the tool look bad.
 A write-up that admits the second suggestion came at a terrible moment
 is worth more than one that claims three for three.]
```

---

## What I would not build

Scoped on day one and held to it:

- No mobile app. The pause is only detectable on the machine where the work happens.
- No accounts, no cloud, no sync. One local user, one config file, one log.
- No streaks, points or badges. The moment this scores me, it becomes another screen.
- No weather API. It needs the network, and it would sit directly beside a claim that nothing needs the network.
- No UI beyond terminal text.

The spec with the numbered acceptance criteria is in the repo, written before any code, including the ones I cut when the deadline compressed and the change log row that records the trade.

---

## Try it

```
[NEEDS REAL DATA: repo URL]
```

Node 20+, no sudo, two downloads. Install steps are in the README.

---

## Checklist before publishing

- [ ] Every `[NEEDS REAL DATA]` marker replaced with a measured value or removed
- [ ] Tags `#devchallenge` and `#hf26challenge` present
- [ ] Official DEV submission template used
- [ ] Repo link works and repo is public
- [ ] LICENSE present
- [ ] At least 3 confirmed outings in the pasted log
- [ ] At least one outdoor photograph
- [ ] Zero em dashes
- [ ] The "what broke" section is honest enough to be uncomfortable
