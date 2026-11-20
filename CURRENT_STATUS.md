# Current project checkpoint

Updated 2026-11-20. Read this first after resuming; then follow the cited receipts.
This is a navigation/checkpoint document, not a replacement for the complete
specification or [requirement audit](REMAINING_WORK.md). The goal is NOT complete.

## Active implementation: private VP9 CPU specialist

Attempt14 is now TERMINAL FAILED, not live: run44733153901, exact head
eb482a8fc20ac97728625fb94a47850c939d37f6, completed12:15:11Z. Both cleanup
steps passed. The unchanged native inventory guard caught missing AC3_PARSER:
removing unrelated muxers removed its automatic dependency. Fix explicitly
retains ALL11baseline parsers (as already done for8BSFs), not a weaker guard.
Corrected full native-source suite59/59PASS,0skip,2438.5451ms; related asset/
HTTP/source suite34/34PASS,0skip,2548.4623ms; affected lint PASS. No browser run.
Inspection initially failed because `gh run view --log` cached a ZIP on full C:.
Controller now uses the direct job-logs API without that persistent cache; no
unrelated data removed. H: has about698GiB free. Terminal receipt:
`evidence/2026-11-20-vp9-cpu-specialist-build-44733153901-terminal.json`.
Next: one corrected-source build attempt15, then artifact authentication. Never
repeat attempt14 or interpret the historical live-build notes below as current.

The latest retained CPU original9 is389.296875MiB FAIL, not merely the older
300.87MiB small fallback. Packed-token normal-HTTP small control had passed at
203.73046875MiB, but original startup later adds an unclassified large child;
its role cannot be retroactively guessed. Do not replay the unchanged failure.

Distinct source candidate now limits only private profiles10/11 OUTPUT to VP9/
WebM, rejects unrelated profiles before I/O, and retains ALL baseline19decoders,
18demuxers,11parsers and8BSFs. All codec settings, pixels, width, threads, packed
tokens/lazy buffers,96MiB Wasm cap and250MiB whole-tree formula remain unchanged.
Builder must prove exact actual configured inventories, final source and layout.
Default packed build recipe remains byte-identical; public sources/assets/routes
unchanged.18source/build-recipe tests and affected lint PASS, no native/browser
saving inferred. Plan: evidence/2026-11-20-vp9-cpu-specialist-plan.json.
Full native recipe gate59/59 PASS,0skip,3860.8438ms, including real host C allocator/
token controls. First57/59 caught two stale exact wiring assertions; updated to
require the guarded specialist option/identity, no safety check removed.

The private workflow is not registered by its filename on main. The established
isolated-index builder will put its selected workflow at the already-registered
reproduction path ONLY on a new codex build branch. Main and the local checkout
workflow remain untouched. One native job was dispatched:44733153901/attempt1,
exact sourceeb482a8fc20ac97728625fb94a47850c939d37f6, branch
codex/vp9-cpu-specialist-source-20261120-attempt14. Last observed12:10:14Z:
in_progress at compilation after both source gates and pinned SDK installation
passed. Never redispatch from a stale note: inspect this exact job with
`scripts/vp9-duration-build-control.mjs inspect 14`; after actual success use
`scripts/collect-vp9-duration-native.mjs 14` to authenticate artifacts. Native
collection and explicit specialist HTTP loader prepared;27related asset/guard/
prior-evidence checks and affected lint PASS. No compiled success or browser
memory/speed result inferred from this live-build checkpoint.

## Current capability increment: private DOCX hyperlinks

Current-model large hyperlink scaling gate CLOSED for the tested pattern:
fixed1024relationships/64bookmarks,2048/32768 genuine stored-ZIP paragraphs,
three repeats each plus one largest in a distinct clean browser. Inputs9,462,927/
148,388,967B -> outputs9,295,737/148,682,577B. Every paragraph, both links, tooltip,
emphasis and bookmark position independently verified; largest4outputs identical
SHA98acd389…7231712. Whole controls187.2734375/184.8515625MiB over their respective
original stable blanks; max per-run cleanup69.6875MiB over original loaded idle,
250/96limits unchanged.1768native rows retained,1321valid/2unavailable active
samples (not zero). Payload cancellation/write-error/exact recovery both sessions.
Owned files/profiles/runtime/server gone, original pre/post fullSHA/size unchanged;
first52observed owned PIDs reconciled by birth (one unrelated PID reuse left
untouched), second numeric PID absence proved. No app/native source change,
service disabling, public/full Word/native external destination/other-browser,
universal flat-memory/leak-free or matched speedup claim. Actual combined JSON/
CSV/HTML: `evidence/2026-11-20T11-46-04-089Z-docx-hyperlink-scaling-series.json`.
30focused tests and affected lint PASS. Initial13/14 evidence tests had a numeric
timestamp compared with an ISO string in a mutation fixture; corrected to select
the real native window, no browser replay or changed gate. Final checkpoint:
`evidence/2026-11-20-docx-hyperlink-scaling-checkpoint.json`.

Implemented and small production-browser qualification PASS, still private.
Explicit HTTP/HTTPS/mailto links, escaped tooltips and bookmark positions retain
text/emphasis without fetching targets. Unsafe/relative/package links keep
inactive text with a content-free warning. Relationship metadata caps at1MiB/
4096entries/1024links; bookmark names/references cap4096each;64KiB backpressured
output unchanged. Nested links reject; frame/history/docLocation, field-code
links and Word's missing-bookmark fallback are not reproduced.

[Actual receipt](evidence/2026-11-20T11-26-08-834Z-docx-html-qualification.json):
37,974B genuine python-docx package -> four identical211,913B HTML outputs.
Chrome158.0.8127.36 headless, three same-page repeats plus payload cancellation,
injected write failure and exact recovery. Independent hardcoded10-link semantic
oracle verifies targets, text, tooltips, emphasis, forward/backward bookmarks and
nested tables; nine rejecting validator mutations. Peak84.23828125MiB over SAME
blank,445valid/0missing active samples; complete795-row native journal retained.
Cleanup max30.62109375MiB over original loaded idle.36static requests/0forbidden;
48observed owned PIDs absent, owned files/profile/runtime/server removed, original
test.mkv pre/post full SHA/size unchanged. No public promotion, large-link scaling,
native picker/external drive, headed/manual, full Word fidelity or speedup claim.

The first11:24:08Z runner failed before launching Chrome because Python's Windows
cp1252 output could not print the Unicode reference; retained zero-case failure,
owned runtime removed. Explicit UTF-8 fixed the helper. Earlier unit8/9 fixture
failure was corrected to exercise image-vs-hyperlink type, not missing styles;
no safety guard weakened.96related and61overlapping checks PASS; after strengthened
caps/actual-evidence checks,14/14 PASS. Build/TypeScript/scoped lint PASS. Portable
snapshot **2917/2917 PASS**,0fail/skip/cancel,111559.0123ms/784selected files;
164 prerequisite qualification files not run. The new evidence-test file and
strengthened cap assertions were verified separately in the14checks, not claimed
as part of that earlier inventory snapshot. All32 browser source pins freshly
reverified;402-entry public evidence audit PASS. Final checkpoint:
[DOCX hyperlink verification](evidence/2026-11-20-docx-hyperlinks-checkpoint.json).

Do not replay this passed scaling series unchanged. Broader Word font/theme,
complex-script/layout and source-element preservation and cross-browser/native
destination coverage remain open in N-08. Return to the retained M-09 CPU-fallback
allocation controls for the next distinct low-memory implementation hypothesis;
do not rerun the unchanged300.87MiB fallback or405.11MiB MKV failure.

## Current critical path

The corrected private MKV-to-MP4 core preserves the complete original's packets,
timestamps, decoded video and audio. Its production-staged repeat gate is still
FAILED: first two full outputs validated, third job reached **405.11328125 MiB**
above the SAME original blank, over the unchanged **250 MiB** whole-tree limit.
The route is withheld from public selection; withdrawal is not implementation
completion. No validated third output or clean-session repeat pass exists.

[Reconciled diagnosis](evidence/2026-11-17-mkv-staged-attribution-reconciliation.json):
the exact native birth of the large child was classified by the already-retained
observer as Chrome's on-device model service. The separate later census missed
it. Both observations remain preserved. At the overall peak the child accounts
for 289.3125 MiB, INCLUDED in acceptance. App-triggered service allocation is not
proven. With this same child, passing would require the rest of the tree to fall
39.3125 MiB BELOW the original blank; a saver micro-optimization is not evidence
of such a reduction. Do not exclude the child, disable services, raise limits,
rebase the blank, or rerun the unchanged failed configuration.

The classifier helper was missing from the original receipt's transitive source
pins. Its tracked bytes at the recorded executed commit match current bytes;
this is disclosed, not retroactively called a runtime pin. Future MKV runs now
pin the classifier and native observer directly. Current reporting reconciles
both witnesses; original raw JSON/native journal/historical HTML are untouched.

## Last optimization decision: REJECTED

Holding one writable-stream writer for the entire final stage copy did not
improve the actual saver screen. Interleaved baseline/candidate/candidate/
baseline/baseline/candidate, 256 MiB minus 17 bytes per copy, all six full hashes
identical: baseline median **1586.84 ms**, candidate **1590.01 ms** (0.20% slower).
The proposed runtime was removed; production saver remains byte-identical to
commit 4093c44f. This is isolated saver I/O, NOT a video conversion speed test.
The initial worker-header setup failure is retained separately, not a passing
copy. [Actual comparison](evidence/2026-11-16T23-24-56-258Z-staged-writer-control.json).
Do not retry this candidate unchanged or claim it speeds up conversion.

## Previous completed capability increment

Private bounded DOCX list-numbering preservation: genuine production-browser
small-repeat/cancellation/write-error/recovery proof, 83.296875 MiB peak; still
not full Word fidelity, large-list scaling, external-drive/manual qualification
or public promotion. [Checkpoint](evidence/2026-11-16-docx-numbering-checkpoint.json).
Its historical whole-portable result is 2887/2887; that count does NOT include
new tests added after that checkpoint.

## Next distinct work and stop rules

Historical November17 checkpoint verification: **39/39 PASS**, zero skips/failures,
11.60 seconds, including unchanged saver and historical TypeScript overlay
checks, actual archived comparison/attribution and ledger-history preservation.
Affected lint PASS. No full portable/build/browser rerun or release pass claimed.
Post-review malformed-witness guards: all 10 affected checks and affected lint PASS.
Exact command and file list: [verification receipt](evidence/2026-11-17-current-checkpoint-verification.json).

1. Use the reconciled native-birth evidence rather than repeat the diagnosis.
   No large browser replay is needed to authenticate these retained data.
2. Before any further MKV stress run, identify an implementation or environment
   change genuinely allowed by the unchanged constraints. Faster writer copies
   alone cannot resolve the observed service-sized excess. Additional required
   browser coverage must not replace the failed Chrome acceptance gate.
3. Continue a concrete open implementation from M-04/M-08/M-09/N-08 in the full
   audit while the Chrome repeat condition remains unresolved; inspect its last
   failed hypothesis before choosing a different one. Keep broader stream and
   metadata preservation, real encoding, CPU fallback, image/document coverage,
   scaling, compatibility and release/reproducibility gates in scope.

For every experiment, record hypothesis, exact change/input/settings, result,
decision, cleanup and next action BEFORE starting another experiment. Retain
failures; never replay an expensive test solely because chat context was lost.
Update this short file plus the manual block of [TESTED.md](TESTED.md) and the
[full audit](REMAINING_WORK.md) after meaningful cycles. Preserve older history.

## Safety and evidence boundaries

Headless only; no Docker; no unrelated application/service termination. All
generated media, profiles and scratch stay in approved repository directories
and disposable owned data is removed in finally. Preserve test.mkv exactly.
The saver screen's six owned source/output pairs and both run profiles/runtimes
were removed according to the retained cleanup receipts. No conversion, browser
launch or test.mkv mutation was performed by the attribution reconciliation.
Headed/manual and native-picker/external-drive coverage remain unverified.
