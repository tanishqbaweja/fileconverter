# Current project checkpoint

Updated 2026-11-21. Read this first after resuming; then follow the cited receipts.
This is a navigation/checkpoint document, not a replacement for the complete
specification or [requirement audit](REMAINING_WORK.md). The goal is NOT complete.

## Latest implementation: private DOCX text color

Direct RGB/automatic and inherited document-default, paragraph and character
run colors now stream to static HTML. Referenced internal theme/settings XML
are capped at 1 MiB each, retain at most 12 palette slots and 12 mappings, and
never fetch external parts. Theme RGB/system lastClr and HSL tint/shade are
supported; legacy Word rounding may differ. Unresolved theme color uses saved
RGB or browser text color, with one content-free warning. No raw CSS emitted.
The 64 KiB awaited writer and private registry status are unchanged.

188 DOCX/lifecycle checks, production build, TypeScript, affected lint and
402 public evidence entries PASS. This is source/build evidence only, not
runtime/browser/memory qualification for the new color behavior. Earlier
hyperlink/numbering receipts still authenticate their exact historical source
without being treated as proof of current color output. C: reported zero free
bytes; no browser launched, conversion output created or unrelated data removed.
The next fixture/oracle gate is now prepared and checked. Two fresh,
deterministic python-docx 1.2.0 fixture preflights produced the same 37,948 B
DOCX (ZIP CRC and Word package reopen checked) and 295,342 B HTML from the
worker function outside Chrome. The independent parser verified all 14
color/text/emphasis segments; a positive reference passed and all ten
mutations failed. Max 65,536 B writes, one pending, owned scratch removed.
191 focused DOCX/lifecycle checks and affected lint pass. The unchanged
250 MiB whole-tree and 96 MiB cleanup browser gates are wired to
`node scripts/qualify-docx-html.mjs --color-control` (python-docx 1.2.0 on PATH).
An actual pre-launch guard check refused C: with 0 bytes free (requires 512 MiB
system-drive headroom); no browser, test.mkv read, or new browser report.
Do not replay the preflight unchanged. When host is safe, run the new headless
color browser control; do not treat this fixture preflight as browser evidence.
No unchanged video run. See `evidence/2026-11-21-docx-color-fixture-preflight.json`.

## Active implementation: private VP9 CPU specialist

LATEST ORIGINAL GATE FAILED; do NOT replay. Actual receipt prefix:
`evidence/2026-11-20-vp9-cpu-specialist-original-startup-44735542199`, fullSHA
59ee51e70d057c3ce19e22552774d6c238657015d34af144092059b9dd2e5b6e.
Same untouched2,958,573,265B original/1920x804/24fps/4Mbps/250MiB originalblank.
After155.083s CPU work, whole-tree380.58203125MiB FAIL; normal cancellation,
29,451,841B read/22,962,542B written/96writes before transactional abort0B.
FULL1675native100ms records replayed,1420valid/0missing active. Raw5,592,378B
verified/compressed to84,709B, raw removed. CSV all1675rows + HTML graph + compact
analysis JSON retained. All47sourcepins/HTTP/trace/original integrity verified.

This run NOW has contemporary exact-birth attribution: PID20340,parent10428,
FILETIME134396524431630101 is on_device_model.mojom.OnDeviceModelService.
It contributes237.09765625MiB AT THE WHOLE-TREE PEAK, INCLUDED. Its separate
later component-only peak249.38671875MiB is not substituted into that total.
Pre-child full-journal203.5546875MiB is diagnostic ONLY, not a passing subwindow.
Application-triggered service allocation unproven; never retroactively label
Nov6's unclassified child using this Nov20 observation.

All47observed owned births and3roots absent; one unrelated reusedPID24444 left
untouched. Exact runtime/stages gone, partial media/profile removed; original
pre/post fullSHA+size unchanged. No full output/frame count/fidelity/scaling/
speed/public acceptance. New18focused checks + affected lint +402public audit
PASS, not a release pass. Initial17/18 evidence assertions wrongly equated the
component-only maximum with its contribution at the global peak; corrected to
verify BOTH observations, without rerunning browser or changing measured failure.
No live job.26.76% smaller static core does NOT solve this default-Chrome gate.
Final12evidence/recipe/suite-contract checks also PASS; no old portable gate
removed. C: has only about7MiB free at final observation; unrelated files and
applications were left alone. All conversion data/profile/journal stayed in repo.

Small specialist browser gate CLOSED, still private. Actual receipt:
`evidence/2026-11-20-vp9-cpu-specialist-qualification-44735542199.json`, SHA256
a934fafbbd6f128b2049f39f9476d990394dfc159d86adc19e99213584118ee7.
Chrome158.0.8127.36 headless, same automatic candidate-attempt -> CPU-fallback,
same pinned58,389B input/settings, four99,413B outputs all golden82bdfd66…82267b.
All48frames/PTS/durations/8metadata fields/SSIM0.993273 independently verified.
Six jobs include real-write cancellation, write failure, three exact recoveries.
Whole active peak186.7734375MiB over SAME earliest stable blank (326598656B ->
522444800B),75valid/0missing active samples; max cleanup1.76171875MiB above
original loaded idle, unchanged250/96MiB gates. Full473sample counts, phase true
peaks and64bounded graph buckets retained, NOT a complete100ms raw journal.
38source pins/HTTP headers+full bytes/trace independently checked; trace has
screenshots/API but no DOM snapshots or response bodies.42observed browser PIDs,
all3roots absent, exact owned runtime/stages absent; disposable outputs/profile
removed, test.mkv pre/post fullSHA+size unchanged. No headed/native-picker/full
original/scaling/other-browser/public/speedup claim.7evidence checks PASS.

Native attempt15 run44735542199/source980c4a934cd1bdf4f05bc957c2bc4440adaabc63
compiled/authenticated, both remote cleanup steps PASS. Actual19decoders,
18demuxers,11parsers,8BSFs preserved; onlyVP9/WebM output, same packed4B tokens,
32/96MiB Wasm, one codec thread/no helper pool, settings/I/O unchanged. Wasm
7,234,214B vs9,877,633B baseline:26.76% STATIC reduction, not matched runtime
savings. Reusable code/proofs9,517,143B in work/vp9-duration-input-44735542199.
Native receipt: evidence/2026-11-20-vp9-cpu-specialist-native-44735542199.json.
59native-source,34related,25recipe/cleanup and7actual-evidence checks PASS in
separate overlapping groups, not an additive distinct-test total; affected lint PASS.
Final27focused checks and unchanged402public evidence audit PASS. New7evidence
checks explicitly require retained native files/trace and belong to mandatory
artifact qualification; recipe tests remain portable, all235prior hosted files
remain portable. No full portable/build/release suite rerun or pass inferred.

Attempt14 terminal44733153901 remains FAILED: removing unrelated muxers removed
automatic AC3_PARSER; exact native inventory guard caught it. Explicit all11parser
retention fixed the cause without weakening support/guard. GH logs now use direct
API, avoiding `gh run view --log` persistent system-drive cache. C: was full,
only~117MiB free after browser test; no unrelated data deleted. No job is live.

NEXT: continue other incomplete original requirements with constraints intact.
Any further video run needs a DISTINCT implementation or explicit browser-specific
hypothesis, not another default-Chrome original replay or service exclusion.
Current exact original CPU profile remains private/unqualified; broader M-09 is
partial, not silently completed or globally unsupported. Preserve this measured
failure and old original9's389.296875MiB/unclassified-child failure separately.
Do not rebuild or repeat passed small control. Production integration, compatible
stream preservation, scaling, matched speed and entire project remain incomplete.

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
