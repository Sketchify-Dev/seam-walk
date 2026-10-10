# touchgrass

**One sentence.** A developer who never finds a good moment can be handed one specific outing at a detected pause in their own build, so that they go outside before dark.
**Owner.** Sketchify-Dev
**Date.** 2026-10-08
**Status.** AGREED 2026-10-09
**Path.** docs/spec-touchgrass.md

---

## 1. Who it is for

**Role.** Solo developer working long unbroken sessions at a desk, who is the author of this tool and its first user.
**How many.** 1 on day one.
**Where they are.** At a laptop, mid-build, usually with a terminal visible.
**What they already have.** A git repository they are actively committing to, a terminal, Node 22, and a willingness to walk for 15 minutes if given a reason.

## 2. Today, without this

The developer intends to go outside and does not. Stepping away mid-task feels like losing the thread, so the next thing on screen always wins. Existing options do not fit: a timer fires while they are mid-thought and gets dismissed, a calendar block gets ignored, and a habit app asks them to remember to open it. None of them know what the developer is doing at the moment they interrupt, so every interruption arrives at the wrong time and is correctly ignored.

## 3. Must do

1. Notice when the developer's own work has reached a pause where stepping away costs nothing.
2. Work out how long that pause is likely to last.
3. Know whether there is usable daylight left, without using the network.
4. Say one short specific thing to go and do, naming a real place the developer listed themselves.
5. Say nothing at all when there is no pause, and nothing when there is no daylight.
6. Record whether the developer actually went, in a file a stranger would believe.
7. Run start to finish on a 2017 laptop with no GPU and no internet connection.

## 4. Non-goals

- No mobile app. The tool runs on the machine where the work happens, because that is where the pause is detectable.
- No accounts, login, or identity. One local user, one config file.
- No cloud or hosted component. Nothing leaves the machine, which is the entire open-source argument.
- No streaks, points, badges, or gamification. The developer is not being scored, and this is the first thing that would make it read as a habit app.
- No interface beyond lines of terminal text. Execution over surface, per the house doctrine and the contest rubric.
- No weather API in the shipped build. Daylight is computed offline from coordinates. Weather needs the network, which would break the offline claim, so it sits in the cut list.
- No Next.js front end. The existing scaffold in this repository is abandoned.
- No place name the model invented. Suggestions only name places the developer entered at init.

## 5. Assumed decisions

- `ASSUMED 2026-10-08` An outing is inferred from a gap in local file activity, then confirmed by one keypress on the developer's return. Rules out zero-typing operation, and rules out a log that cannot distinguish a walk from a nap.
- `ASSUMED 2026-10-08` When remaining daylight is shorter than the detected pause, the tool prints the next usable window and makes no suggestion. Rules out doorstep or balcony fallback suggestions.
- `ASSUMED 2026-10-08` Location is a config value entered at init rather than a named city in the source. Rules out naming the city in the write-up, which costs some concreteness.

## 6. Open questions

1. What city or coordinates does the developer want as their default? Asked of: Sketchify-Dev, three times, not yet answered. Waiting on it: verification of AC-2 against a published sunset time, and one concrete sentence in the write-up. Not blocking, because the value is read from config.

## 7. Constraints

**Deadline.** 2026-10-11, 23:59 PDT, because that is the submission cutoff for the DEV Hacktoberfest Open-Source AI Challenge Week 1. No extension exists.
**Must use.** Open-source AI as the load-bearing component, per the contest prompt. Gemma 3 1B at Q4 served locally by Ollama. Node 22 CLI. Local inference only.
**Must not touch.** Nothing outside the home directory and this repository. No git history rewriting. No commits made on the developer's behalf.
**People.** One developer, 4 to 6 hours per day, roughly 15 usable hours total across three days.
**Legal or policy.** Entry requires age 18 or over. Repository must carry an open-source licence. Submission must carry tags `#devchallenge` and `#hf26challenge`.

## 8. Failure and empty states

| Situation | What the user sees |
| --- | --- |
| No pause detected yet | Nothing. No output of any kind. Silence is the correct behaviour and is covered by AC-6. |
| Pause detected, daylight remaining is shorter than the pause | `No daylight left. Next window opens 06:41 tomorrow.` and no suggestion. |
| Pause detected, no places configured | `No places set. Run: grass init` |
| Ollama is not running or the model is missing | `Model unavailable. Start ollama, or run: grass doctor` and no suggestion. |
| Model takes longer than 20 seconds to answer | The attempt is abandoned, nothing is printed, and the event is recorded in the log with `outcome: "model_timeout"`. |
| Return detected but the developer declines | Log entry written with `confirmed: false`. It still appears in `grass log`. |
| Config file is malformed | `Config unreadable at ~/.touchgrass/config.json. Run: grass init` |

## 9. Acceptance criteria

Must exist by 2026-10-11.

| # | Criterion | Where to check | Pass |
| --- | --- | --- | --- |
| AC-1 | `grass init` writes `~/.touchgrass/config.json` containing a latitude, a longitude, and at least 3 place names entered by the user. | The file on disk | [ ] |
| AC-2 | With the network interface down, `grass sun` prints today's sunset time within 2 minutes of the published time for the configured coordinates. | Terminal output, compared against any published almanac | [ ] |
| AC-3 | A `git commit` in a watched repository causes a suggestion to print within 10 seconds. | The `grass watch` pane | [ ] |
| AC-4 | CUT 2026-10-09, traded out for deadline compression. See change log. | n/a | n/a |
| AC-5 | Every printed suggestion is 20 words or fewer and contains one of the place names from `config.json`, character for character. | The `grass watch` pane, compared against the config file | [ ] |
| AC-6 | A machine left running for 60 minutes with no commit, no long process, and no file-activity gap prints zero suggestions. | The `grass watch` pane after 60 idle minutes | [ ] |
| AC-7 | When remaining daylight is shorter than the estimated pause, the output is the next window line from section 8 and contains no place name. | The `grass watch` pane, tested by setting the system clock past sunset | [ ] |
| AC-8 | After a suggestion fires and local file activity stops for at least 10 minutes, a log entry is written, and the next `grass` command prints a one-keypress confirm prompt. | `~/.touchgrass/log.jsonl` and the terminal | [ ] |
| AC-9 | `grass log` prints one row per event with date, trigger type, estimated minutes, actual minutes away, and confirmed true or false. | Terminal output | [ ] |
| AC-10 | The full path from commit to printed suggestion completes with the network interface down. | `grass watch` with networking disabled | [ ] |
| AC-11 | Peak resident memory of the watcher process plus the Ollama model stays under 1800 MB during a suggestion. | `ps -o rss` sampled during a run | [ ] |
| AC-12 | `~/.touchgrass/log.jsonl` contains at least 3 entries with `confirmed: true` representing outings that physically happened, dated before submission. | The log file | [ ] |
| AC-13 | The repository root contains a `LICENSE` file and a `README.md` stating the hardware the tool was built and run on. | Repository root | [ ] |
| AC-14 | The DEV post is published, carries `#devchallenge` and `#hf26challenge`, uses the official submission template, links the repository, and contains a section arguing why the open approach was better here. | The published post URL | [ ] |
| AC-15 | The DEV post contains the output of `grass log` showing the entries from AC-12, and at least one photograph taken on one of those outings. | The published post | [ ] |

Only if time remains, in this order.

| # | Criterion | Where to check | Pass |
| --- | --- | --- | --- |
| AC-16 | Pause length for a repeated build command is estimated from the median of previous recorded durations of that same command rather than a fixed default. | `grass log` showing estimate converging across runs | [ ] |
| AC-17 | `grass say` speaks the suggestion aloud so the suggestion can be received without looking at the screen. | Audio output | [ ] |
| AC-18 | Swapping the model to Gemma 3 270M by changing one config value produces a suggestion that still satisfies AC-5. | Config file and the watch pane | [ ] |
| AC-19 | When the network is available, a rain probability above 70 percent suppresses the suggestion and prints the next dry window. | The watch pane with networking enabled | [ ] |

## 10. Data and scale

**Source.** Local only. Git commit timestamps from repositories the user names, process names and start times from the local process table, file modification times inside watched directories, and coordinates plus place names the user typed at init.
**Freshness.** Seam detection polls every 10 seconds. Daylight is computed per call, so it is never stale.
**Day one.** 1 user, roughly 3 to 8 log rows per day.
**In a year.** Same single user, under 3000 log rows. No scaling work required.
**Personal data.** Commit messages, project paths, process names, and activity timestamps are read. All of it stays in `~/.touchgrass/`. None of it is transmitted anywhere, and no network call is made in the shipped path. This is the concrete form of the contest's open-innovation argument.

## 11. Cut list

First out at the top.

1. AC-19, rain gating. Needs the network, which weakens the offline claim it would sit beside.
2. AC-18, model swap demonstration.
3. AC-17, spoken output.
4. AC-16, learned pause estimation. The fixed default is adequate for the write-up.
5. AC-4, long-process detection. The commit trigger alone still satisfies AC-6 and the no-timer rule.

Nothing below this line is cuttable. AC-12, AC-14, and AC-15 carry the submission, and AC-6 is what stops the project reading as a reminder app.

## 12. Hour budget

Roughly 15 usable hours. Writing is the most heavily weighted judging criterion, so it gets real time rather than the leftovers.

| Block | Hours |
| --- | --- |
| Ollama install, Gemma 3 1B pull, feasibility test on this CPU | 1.5 |
| Offline daylight calculation and `grass init` config | 1.5 |
| Seam detection: commit hook, process scan, activity gap | 3.0 |
| Model call, prompt, grounding against the configured places | 2.0 |
| Log, confirm prompt, `grass log` output | 1.5 |
| Field test, at least 3 real outings including photographs | 1.5 |
| Writing and publishing the DEV post | 3.5 |
| Licence, README, screenshots, submission mechanics | 0.5 |

## 13. Riskiest assumption, test first

That Gemma 3 1B at Q4 on an i5-7300U with roughly 2.3 GB of available RAM can return a usable one-sentence suggestion inside 20 seconds without the machine swapping.

Everything else in this document depends on it. It is cheap to test and it is the first thing built: install Ollama, pull the model, hand it the real prompt shape, and time it while watching resident memory.

If it fails, the fallback order is Gemma 3 270M, then a shorter prompt with fewer input tokens, then the concept needs reworking on day one rather than day three. Test this inside the first 90 minutes.

## 14. Change log

| Date | Request | Verdict | Cost |
| --- | --- | --- | --- |
| 2026-10-09 | Usable time dropped from ~15 hours to ~10 because two days remain, not three. | TRADE | AC-4 long-process detection comes out. Saves ~1 hour of build plus process-table debugging. AC-6 still holds via the commit hook and activity-gap triggers, so the no-timer guarantee survives. Must-have count 15 to 14. |
| 2026-10-10 | Measured the riskiest assumption. Gemma 3 1B on this CPU: 148 s to load the weights, 7.5 s to answer. Spawning a process per suggestion would pay the 148 s every time. | IN | Architecture change, no new criteria. `src/model.js` now drives a local `llama-server` on 127.0.0.1:8757 instead of spawning `llama-cli` per call, so the load is paid once. Added `grass warm` and `grass stop`. Also forced by build 11514 dropping the `-no-cnv` flag and making `llama-cli` chat-only. AC-11's 1800 MB ceiling now applies to a resident process rather than a transient one and must be re-measured. |
| 2026-10-10 | First end-to-end model test: 3/3 suggestions timed out and fell back. Cause was prompt eval at 2.58 tok/s against a 160 token prompt, so 62 s of reading before any generation. | IN | Prompt cut to ~40 tokens with the static instructions first so `llama-server` can cache the prefix, primed once at warm time. Context 1024 to 512, threads 4 to 2, `n_predict` 48 to 32. Request timeout 20 s to 30 s, which amends the section 8 failure row. Result: 3/3 from the model at 10.2 s, 4.0 s, 3.1 s as the cache warms. Peak RSS 930 MB, so AC-11 passes. |
| 2026-10-10 | Model wrote "five minutes away" when the window was 15 minutes, and the validator accepted it because it only checked word count and place name. | IN | `valid()` takes an optional `minutes` and rejects any sentence stating a number that is not the given window, in digits or words, ignoring numbers that belong to the place name. 11 new tests, including the exact sentence that slipped through. No criteria added: this closes a hole in AC-5 rather than widening it. |

## 15. Sign-off

Anything not in this document is not in this build.

- Sketchify-Dev, pending
