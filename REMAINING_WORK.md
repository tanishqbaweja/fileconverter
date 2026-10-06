# Remaining work audit

Updated 2026-10-06. This is the living requirement audit for the original
privacy-first browser converter specification. It is deliberately stricter than
the public route ledger: a green route registry proves the advertised routes,
not the entire product specification.

## 2026-10-06 — Private alignment-reuse build candidate prepared, not accepted

Added a separate, opt-in no-Docker build candidate without changing the frozen
baseline recipe, public engines, codec options or 32+16MiB fixed memories.
For posix_memalign requests of at least256KiB with alignment16, the wrapper tries
malloc and returns its pointer ONLY when actually16-byte aligned; otherwise it
frees only that freshly acquired, unexposed pointer and calls upstream.
FFmpeg av_malloc admission/initialization and live codec references are unchanged.
The generated recipe reverses byte-for-byte to the pinned baseline. The builder
requires a six-case synthetic C dispatch test, an actually linked wrapper and
byte-identical companion encoder, with identity-owned scratch cleanup. Those
native build gates have NOT executed yet; local C compilation was unavailable.

Local source/recipe/provenance tests passed4/4; complete unit suite581/581,
TypeScript and scoped zero-warning ESLint passed. Workflow YAML parsed without
duplicate keys. Historical workflow evidence remains valid only by reversing
the exact four paired additions; missing/mutated additions are rejected.
No source video read, converted copy, hosted build or browser conversion in this
cycle. Actual allocator alignment/reuse, fidelity, speed and complete-process
250MiB acceptance remain unproved. This is private candidate infrastructure,
not a new advertised route or completion of the project.

## 2026-10-06 — Failure-time free space and aligned-reservation fragmentation measured

ONE changed, failure-only original-source browser run inspected allocator FREE
HEADERS on the exact unchanged32MiB decoder, not decoded pixels or native
allocator APIs. Static analysis first identified the pinned Emscripten6.0.4
DLmalloc root1786392 and corroborated maps/dv/top/bin/footprint/mutex/segment
addresses against byte-exact original function bodies. The whole-module text
attempt exceeded its64MiB cap and was rejected/cleaned. The corrected static
analysis uses a541841-byte NONEXECUTED derivative:3 selected function bodies
remain byte-identical with original indices/types/names,4607 unrelated bodies
become unreachable solely for disassembly. No derivative entered Chromium,
media conversion or publication. Temporary pinned Wabt1.0.39/npm cache removed
in identity-checked finally; no source video read or Wasm function executed by
the static audit. Compact proof:evidence/split-dlmalloc-static-layout-2026-10-06.json.

At the original failure after243 genuine1920x804 HEVC -> MPEG2 handoffs/mux-
accepted packets, the COMPLETE free-header traversal measured241 free chunks,
8940352 aggregate free CHUNK bytes, largest1597472, top2664, designated victim232.
Dynamic allocator footprint30000128/segmentbase2182144, additional1372160bytes
above the segment. Traversal reads889 header words only, no heap copy/payload,
native call, lock, allocator mutation, codec/reference release or debugger
tier-down. Hard caps4096chunks/32768words/64tree-frontier entries; bitmap/index,
size/state, backward links, parent links, cycles and single-segment checks fail
closed with NULL unavailable state. Scalar output <=8192chars and <=2 events,
original abort handling preserved even when inspection/emission fails.

The prior actual av_buffer_allocz/av_malloc size1597463 and SAME compiled
dlposix_memalign body prove plain padded chunk1597472; aligned temporary malloc
request1597500 (also captured in prior real native local), requiring1597504
chunk bytes. Thus the aligned reservation is32bytes larger than every existing
free chunk despite8.94MB aggregate free space. Failed fixed-heap MORECORE cannot
claim the extra contiguous allocation. Alignment-related fragmentation at abort
is now evidenced; arbitrary malloc alignment, successful reuse, complete codec
fit, live-frame ownership/count and idle-plane-cache bytes remain unproven.
Do not free live reference pictures, return misaligned pointers, lower quality,
raise heaps, or retry unchanged. Next separate pinned private native candidate:
alignment-preserving reuse, retaining upstream fallback and all codec/I/O gates.

Diagnostic blank273862656/complete native peak482115584bytes(all descendants),
198.60546875MiB INCOMPLETE is not completed250MiB acceptance or a speed/memory
comparison with a different blank. Decoder32+encoder16MiB,256KiB native stacks,
codec options/quality, native core bytes, original source and250MiB fail-fast
gate unchanged. Source pre/post size+SHA and independent final verification
passed; allfive cleanup flags/no OPFSlock error, original intact, owned browser/
server/observer PIDs/profile/runtime absent, six assets restored and all12 private
assets absent. Partial converted copy deleted. Compact measured report,
compiled-formula corroboration and source pins:
evidence/split-free-headers-measured-2026-10-06.json.

577/577 unit tests, TypeScript and scoped zero-warning ESLint pass. Public
registry/application/engines unchanged; no unchanged production build or costly
acceptance suite repeated. Obsolete pre-lint static-disassembly report removed
after compact final evidence; rejected whole-text report retained. No Docker,
native conversion, public-route promotion or goal-completion claim.

## 2026-10-06 — Actual original failed plane-buffer request measured

ONE changed original-source diagnostic now measures the native allocation size,
not just its call path. First a real Chrome154 dedicated-worker prerequisite
used a 57-byte Wasm module with known argument123456; the same event-capable CDP
transport captured that native scalar and resumed. No original/media/codec I/O
in that prerequisite. Its profile was deleted in finally. The superseded broad
prototype only ran that tiny probe; the executed production inspector now skips
all JavaScript frames, getters, typed arrays, Modules and media buffers. It reads
only verified Wasm scalar wrappers, at most64 property operations/128KiB output,
one abort pause; normal execution resumes even after unavailable local reads.

The original1920x804 HEVC -> MPEG2 run again stopped after243 genuine handoffs
and mux-accepted packets. At the existing abort callback, BOTH av_buffer_allocz
and av_malloc local0 were1597463bytes. Actual pinned binary function indices,
single-i32 signatures and pause offsets within their body extents independently
corroborate this request against pinned FFmpeg8.1.2 size-argument source. This
1,597,463-byte PLANE request is not the33,779,712-byte requested TOTAL heap end.
Decoder32MiB/encoder16MiB, native256KiB stacks, options, quality, native code,
one-pending256KiB I/O caps and the250MiB complete-process-tree fail-fast gate
remain unchanged. No successful allocation/output, public promotion, comparable
speed improvement or completed250MiB acceptance is claimed. Debugger tier-down
perturbs execution. The observed incomplete increase was204.5625MiB, complete
native peak481521664 minus same blank267022336bytes; never substitute that
partial result for completed acceptance or compare it to another baseline.

Live-frame count, largest free block, cached-plane bytes and capacity-versus-
fragmentation remain NULL/unproven. Optimized nonparameter locals are recorded
without guessing their meaning. Next inspect actual DLmalloc free blocks and
live HEVC ownership at this exact failure, not another unchanged conversion or
speculative release of still-live reference pictures.

evidence/mpeg2-split-oom-locals-measured-2026-10-06.json retains compact actual
scalar values/binary types/extents/source hashes/report hashes/full native peak.
Original pre/post size+SHA plus independent final verification passed. Allfive
cleanup flags passed with no OPFS lock error; owned browser/server/observer PIDs
and runtime/profile independently absent. All six generated assets match their
published hashes; every private helper/core asset absent. Partial converted copy
deleted, original untouched. Historical executed drivers/stagers and evidence
source pins are preserved. No Docker command or native conversion ran.

Cycle regression:566/566 unit tests, TypeScript, scoped zero-warning ESLint and
git diff whitespace checks pass. No public engine/registry/application code
changed, so unchanged production build and expensive stress suites were not
repeated. The obsolete25,602-byte broad tiny-probe report was removed after the
safer2,628-byte dedicated-worker prerequisite and compact proof superseded it;
neither probe used the source video or performed conversion.

## 2026-10-06 — Actual original OOM call path identified: HEVC decoded-frame buffer

ONE changed, explicitly non-accepting original-source browser diagnostic uses
Emscripten's existing onAbort callback; actual Wasm/native code/options/quality
remain byte-identical. Capture is failure-only, maximum2 records/8192stackchars,
512messagechars; temporary32-frame Error stack limit restored in finally, normal
abort callback preserved even if instrumentation fails. No per-frame allocation
history, module growth, native conversion, heap-limit relaxation or retry loop.
Private generated stager owns one extra small helper asset and restores all six
published assets; prior executed stager/driver/helper source pins unchanged.

Actual Chrome154 failure reproduces243 original1920x804 frames/packets accepted
by mux, reads2417508/progresswrites1092290bytes, decoder32MiB requests33779712
and aborts. Captured15 native frames independently mapped from the ACTUAL pinned
Wasm's name section (4655names), not guessed external symbol names:
sbrk -> emscripten_builtin_malloc -> dlposix_memalign -> av_malloc ->
av_buffer_allocz -> avcodec_default_get_buffer2 -> ff_get_buffer ->
ff_thread_get_buffer -> alloc_frame -> hevc_receive_frame -> decode/send path.
This proves the failed allocation call path is the decoded-frame-buffer path,
NOT the previous auxiliary av_refstruct_pool_get failure. Stock pinned8.1.2
get_buffer.c and the existing uncached-HEVC-plane patch confirm that code path.
Requested PLANE size, live-frame count, largest free block, cache bytes and
capacity-vs-fragmentation cause remain NULL/unproven; requested33779712 is total
heap end, not the plane buffer's size. No unchanged retry or speculative pool
release: never free live reference pictures to force fit.

Diagnostic blank267800576, complete native peak500875264bytes/all descendants,
222.27734375MiB INCOMPLETE, not a250MiB certificate or like-for-like speed/memory
comparison. Original pre/post size+SHA and independent final hash verified;
allfive cleanup flags, no OPFSlock error, normal worker replacement and storage
usage0. Browser/server/observer PIDs and owned runtime/profile independently
absent; six dist assets match published and extra diagnostic assets absent.
Partial output deleted; only compact JSON/CSV/HTML and small failure trace kept.
evidence/mpeg2-split-oom-stack-measured-2026-10-06.json pins report, unchanged
actual binary, native names/offsets, source hashes, full peak and scope limits.
Next measure actual plane request/free blocks/live-frame state and static/heap
footprint before choosing a changed specialist build. No route promoted;
original completion/repeats/scaling/speed and full specification remain open.

Actual split binary component/linker audit (no media or codec function calls):
decoder code6387878bytes/passive385131/579segments, native stack1920000..2182144;
encoder code527648/passive142665/265segments, stack468144..730288. Each pure
stack accessor confirms256KiB; zero imported callbacks. These are NOT available
heap/free-block/capacity measurements. Compact evidence/mpeg2-split-static-layout-2026-10-06.json
pins exact unchanged binaries and executed audit source. Prior combined-module
specialization evidence had only157072-byte linker-bound reduction, not measured
usable free space; do not assume smaller code alone solves this plane allocation.
Regression555/555 unit tests, TypeScript, scoped zero-warning lint and diff checks
pass. No application/public asset/registry changes and no accepted speed or memory
improvement claimed from this failure-only diagnostic. Checkpoint ready to push.

## 2026-10-06 — Startup attribution measured; single-navigation original reaches encoding then OOM

Two actual Chrome154 component-only diagnostics use the same pinned fixed32MiB
decoder/mux and16MiB encoder, without codec open/send or media I/O. No original
read or conversion acceptance. First detailed trace exceeded the8MiB cap and
reported data loss: preserved as failed attribution, not retried unchanged.
Narrowed memory-infra-only light trace completed,1911events/8261053-byte file,
no overflow or data loss. All eight explicit global dump GUIDs are joined to
their validated trace-time intervals; serialized dump IDs are different ordinals,
NOT interchangeable with request GUIDs. Hex scalar bytes/missing-null preserved.
Allocator categories overlap and are never summed into a fake private total.

In narrowed run, single navigation has6282nodes/6documents/164listeners,
312.41015625MiB OS private; redundant navigation12586nodes/10documents/329listeners,
355.296875MiB immediate,360.1328125MiB after3s. Trace renderer Blink15.875->30.75MiB;
page embedder15552824->30895392bytes. This identifies a concrete redundant-document
effect, not the exact cause of the prior full-original259.79MiB failure.
Same component run both actual modules441.375MiB OS private; worker termination
352.71875MiB after3s. Memory tracing itself perturbs allocations; these are NOT
250MiB stress certificates, speed results or evidence of encoded-video quality.

Both owned browser/server/observer PIDs and profile/runtime directories verified
absent, cleanup errors/forbidden requests empty, six dist assets match unchanged
published originals. Frozen269909-byte evidence/mpeg2-split-initialization-attribution-2026-10-06.json
retains both raw report hashes, complete process phase peaks/realms and compact
allocator summaries. The exact owned8261053-byte trace was deleted after
compaction; raw scalar JSON reports retained, no converted media created.

Separately pinned scripts/mpeg2-split-single-navigation-memory.mjs changes ONLY
page reuse and its own report/source identity; historical executed driver and
core source pins unchanged. It reuses production worker replacement, keeps all
three full2958573265-byte original repeats,32GiB preflight, pre/post source hash,
unchanged48MiB heaps/native stacks/options/quality/1920x804/SSIM>=.98/<=1msPTS,
full-tree100ms monitoring/250MiB fail-fast and cancellation-before-cleanup.
ONE changed original run is terminal FAILED (requested3/attempted1/completed0).
Decoder/mux32MiB heap aborts at requested33779712bytes after actual243 original
1920x804 HEVC->MPEG2 frames/packets/mux-accepted completions. Progress reads2417508
and writes1092290bytes; packet-copy total1492086 is NOT independently verified
disk output. Session encoder closes/held packets0, normal production worker
replacement runs, terminalerror and OPFSusage0; no complete output/fidelity gate.
Exact failed native allocation/function/free blocks/fragmentation unproven.

Early blank271507456, loaded318738432, complete native peak487358464bytes, all9
processes counted:205.8515625MiB INCOMPLETE, not a250MiB stress certificate.
Blank differs from prior242483200 baseline, so no like-for-like memory-saving
or speed claim. Native stacks256K each/aggregate48MiB/AVIO64K/one write and64K
peak queue unchanged. Allfive cleanup flags true, no intermediate OPFSlock
error, original pre/post size+SHA verified plus independent final hash/PID/runtime
absence/sixasset restoration. JSON/CSV/HTML and small failure trace retained;
partial output/profile removed. Frozen evidence/mpeg2-split-single-navigation-original-failed-2026-10-06.json
pins full raw report/actual full peak/243frame ownership/metrics/source hashes.
Five new focused tests pass. No unchanged retry: next attribute decoder
static/heap footprint and actual failing allocation before choosing a changed
specialist build. Original fit/repeats/clean sessions/scaling/speed/public release
and the full requirement audit remain open. Regression547/547 unit tests,
TypeScript and scoped zero-warning lint pass. No application/core/buffer/quality
or public registry change; production assets verified restored, not rebuilt or
mistakenly promoted from the private diagnostics.

## 2026-10-06 — Actual separated original memory gate FAILED; cancellation cleanup repaired

Corrected full original2958573265-byte test.mkv attempt loads both actual fixed
32MiB decoder/mux and16MiB encoder, checked256KiB native stacks. Stable clean
blank242483200, loaded314413056, actual complete native peak514895872bytes at
sequence499:259.79296875MiB increase, above unchanged250MiB. The driver fails
immediately; last state input222785/output0/running, no independent output
acceptance and no accepted full original encoded frame/fit/speed result. Do NOT
repeat unchanged core or substitute loaded baseline/smaller samples/omit processes.

All nine peak processes are retained, including native unknown classifications.
Same-identity CIM diagnostic types show dominant renderer private growth
217776128bytes and GPU57192448bytes versus blank; an exited spare renderer and
new renderer are separately accounted, and every delta sums exactly to the
primary full-tree increase. Accessible workerJS1608096/pageJS9767260 and actual
fixed48MiB Wasm do NOT explain all renderer allocations. Native-code/JIT, UI,
reload/duplicate document retention and graphics allocation sources remain to
attribute; no exact underlying allocator cause is yet proven. Frozen compact
evidence/mpeg2-split-original-memory-failed-2026-10-06.json pins raw381252-byte
JSON SHA3c223301d91db27fbe62db09e1abe6cc8fd1d8bc81ba119a1871148d0435554e,
full actual peak/process identities, delta accounting, realm metrics and source
hashes; JSON/CSV/HTML plus trace retained. Original pre/post SHA unchanged.

Final browser-root/runtime/profile/output removal and six generated asset
restoration succeed, but an intermediate OPFS removeEntry fails with a live
SyncAccessHandle because fail-fast interrupted a still-running job. This is
explicitly preserved, not hidden behind successful final directory deletion.
Changed helper now invokes normal production Cancel and waits at most30s for
cancelled/error/complete BEFORE observer/storage cleanup. Failure to quiesce is
reported, never silently claimed as resource release. Two mock ordering/error
units pass.

Actual Chrome cleanup test1/1 PASS9s uses real synthetic HEVC source through the
same split production codec/direct-module/staged writer. Parent guard exception
is deliberately simulated ONLY to exercise failure cleanup, not to certify
memory. Actual18 frames sent/17 packets produced, native close/held0, normal
cancelled terminal, locked OPFS removed without error, forbidden requests[],
fixture/profile/runtime removed and generated assets restored. Compact proof
evidence/mpeg2-split-memory-abort-cleanup-passed-2026-10-06.json pins1042-byte
rawreport SHA9c97eee694ea9c0b65255a09da18ad57f5311490470c76d0c9d117e7f020eaf3
and exact executed helpers. Original unused in this small cleanup check. No
unchanged full-size retry; next concrete memory work must attribute renderer/GPU
growth while preserving all processes, fixed heaps, original settings/fidelity
and250MiB formula. Full specification, stress/repeats/scaling/speed/public release
remain incomplete; goal stays active.

## 2026-10-06 — Corrected split direct module genuine small gate passed

Changed direct stager/native write audit: actual Chrome5/5 PASS44.7s. MPEG4→MPEG2
OPFS and HEVC→MPEG2 both OPFS and selected-destination fallback produce the exact
earlier golden321692/652521-byte outputs,48/96frames, SSIM0.992146/0.985963.
All original independent video/audio/decodedPCM-priming/artwork/metadata/chapter/
<=1ms presentation validators pass. Third actual direct-module conversion is
now independently verified, not inferred from compatible remux completion.
All five codec closes have actual48MiB aggregate/zero held packets and separately
audited maximum native AVIO65536bytes under the unchanged262144-byte cap. The
production512KiB fallback copy remains separately bounded/disclosed, with
scratch0 after completion and one operation; no buffer/growth/250MiB change.
HEVC direct copy write-fault and cancellation-after-real-output pass, no partial
files or pending/queued bytes. Fixtures/outputs/profiles/runtime removed; six
generated media assets restored, nine private additions absent. Protected original
unused in this small cycle. Raw534515-byte report SHA
2266614cb5312bb87bab50b52df21dbaa14cd8a9c55ea785d37f3d9fd5f80497 and compact
evidence/mpeg2-split-direct-small-passed-2026-10-06.json retain exact source pins,
actual module/memory/ownership/IO proof. Short samples are NOT stable-baseline
250MiB stress acceptance, suite/fixture timings are NOT speed A/B. The next
original test is now concretely changed and correctly exercises both modules;
full three-repeat/clean-session/scaling/speed/legal/public-release goal remains.

## 2026-10-06 — Original split attempt rejected: unstaged direct-module bypass

The first full-size split driver attempt completed a published remux, NOT the
separate MPEG2 conversion. Only four generated assets had been substituted;
the selected direct-output path loads within-direct.mjs, which remained published.
Recorded exact52887552bytes Wasm, no split/native-stack console
records and2962151522-byte output identify the bypass. Driver correctly rejects
the48MiB expected-heap assertion before independent acceptance;71.108s and
198.2578125MiB observed whole-tree increase are NOT MPEG2 speed or memory results.
All five cleanup flags pass; original pre/post exact hash unchanged, complete
converted copy and owned profile removed, generated assets restored. Normal
cancel was attempted after the process had already entered cleanup; helper found
its runtime absent and made no mutation. No conversion proof inferred from it.

Compact evidence/mpeg2-split-direct-adapter-rejected-2026-10-06.json freezes raw
report SHA1b161aeae7d66f1ebf88edc0808163e95456bf285953aa295b7d4245c8c445c6,
the actual telemetry, failure and precise cause. Dedicated direct stager replaces
all six generated module assets, translates the actual9-argument direct ABI into
the unchanged12-argument native kernel, and leaves public assets plus the already
executed small-gate stager unchanged. Active nonzero heap telemetry must now be
actual48MiB immediately, not only checked after a full remux has completed.
New small direct-compatible HEVC→MPEG2 route and HEVC direct write-fault validator
exercise this previously missed path before ONE changed full-original attempt.
No native rebuild, threshold weakening or unchanged expensive retry is justified.

Changed direct-module small gate then ran5 cases:4pass/1fail30.8s. Direct HEVC
conversion reports actual48MiB and96 genuinely encoded packets, but aggregate
maxWriteChunkBytes524288 triggered the old native256KiB assertion before independent
output validation. The source of this value is the existing production final
OPFS→selected-destination512KiB copy, not the64KiB codec AVIO. No buffer was grown.
Four ordinary/adverse cases pass; two raw reports are retained because Playwright
replaced its worker after the failed case. Fixtures/outputs/runtime removed,
generated assets restored. Compact frozen
evidence/mpeg2-split-direct-copy-metric-rejected-2026-10-06.json records both raw
hashes and explicitly NO acceptance for that direct result.

Correction wraps actual native asynchronous/synchronous write callbacks with the
unchanged256KiB hard cap and bounded maximum telemetry. Independently checks the
already documented512KiB fallback-copy chunk/scratch/queue limits. Main250MiB
formula, quality, metadata and timing requirements stay unchanged. The aggregate
final-write metric is no longer falsely used as native AVIO evidence. Selected
fallback-copy mode is disclosed, not advertised as native writing straight into
the final file. Changed small gate must pass before the original is retried.

## 2026-10-06 — Split production pipeline compiled; genuine small/adverse gate passed

No-Docker run37444860342/job112207132777/head881913b SUCCESS:536s build,
580s job, not conversion time. Hosted finally cleanup succeeds. Nine reusable
static tools/license/compact contract files,7958435bytes total, remain only in
work/mpeg2-split-pipeline-37444860342. All26 source pins, seven artifact hashes,
actual fixed shared512/256page memories and zero encoders in decoder/mux module
verified. Broad seven requested decoders retain the explicitly audited H263/VP3
upstream dependencies; an initial ad-hoc seven-only audit assumption was corrected
against the unchanged decoder-selection contract, not by changing the build.
Exact hosted artifact11403345701 deleted/API0; no download ZIP remains.

Actual production Chrome small suite4/4 PASS23.5s. MPEG4 and reordered HEVC
genuinely decode/re-encode48/96 MPEG2 frames. Independent output hashes match
the earlier validated golden files exactly:321692/652521bytes, ordinal SSIM
0.992146/0.985963. Full native decode, every video presentation timestamp within
1ms, exact copied AAC and decoded PCM/priming, two audio tracks/languages,
PNG250x140 compressed artwork, compatible Unicode container metadata and chapter
checks pass without lowered thresholds. Actual fixed32MiB decoder+16MiB encoder
and checked256KiB native stacks are measured; production worker reports48MiB
aggregate, not32MiB. Codec handoff closes with zero held packets, no frame/packet
queue or extra JS pixel/packet buffer. Mux-accepted packet counts match frames
on successful outputs; these counters do not alone prove external disk writes.

Write failure propagates and removes partial output. Cancellation observes
116246 genuine output bytes before Cancel,471427 at cancelled terminal, zero
pending/queued bytes and no partial files. All synthetic fixtures, outputs,
profiles and owned runtime removed; independent inventory confirms no matching
live Chrome/runtime, nine private additions absent, six public/generated media
asset hashes identical. No original fixture read or modified in this small gate.
Raw337349-byte browser report and compact frozen
evidence/mpeg2-split-pipeline-small-passed-2026-10-06.json preserve provenance.
Short diagnostic memory samples are NOT a stable-baseline250MiB certificate;
~0.8s small conversions are NOT an identical-input speed A/B measurement.

New separate protected-source driver keeps the existing full test.mkv byte/hash,
32GiB free-disk preflight, production direct writer, stable blank baseline,
whole Chromium tree/native100ms observer, unchanged250MiB fail-fast formula,
independent original-resolution/color/timing/SSIM/audio/artwork/metadata validators
and three required repeats. It additionally verifies both actual fixed heaps,
aggregate48MiB and closed codec ownership. It does not rerun the unchanged combined
32MiB failure. Full original-file fit, stress/repeats, clean sessions, scaling,
speed A/B and public/legal/reproducibility release gates remain pending. Full
original scope remains incomplete; public assets and selectors unchanged.

## 2026-10-06 — Split pipeline initial build path failure; precise correction

Run37444418032/job112205680985/9660746 FAILED5s build/48s job BEFORE
compilation. Upstream/archive and prior patches all pass hashes, then the old
HEVC policy CLI explicitly refuses the new split-pipeline path because its
strict guard permits only mpeg2-candidate-build. Root cause proven by exact
AssertionError actual/expected paths. No C/codecs compiled, no conversion or
original access; enclosing cleanup SUCCESS/artifacts API0. New dedicated helper
calls the same exported pinned apply/reverse transform, checks only the exact
new owned file, realpath/nonlink/size, and leaves the historical CLI unchanged.
Regression guard prevents calling the old CLI or widening the new boundary.
The next build is changed for this proven cause, not an unchanged retry.

## 2026-10-06 — Split production AVIO integration implemented (native build pending)

Connected the separate encoder through synchronous same-worker handoffs to the
original native decoder/mux loop. Exactly five checked/reversible substitutions
recover every byte of the old private kernel; original CFR checks, user-selected
settings, dimensions, native packet time rescaling/source-offset restoration,
metadata/artwork/audio/chapter handling and actual production AVIO callbacks stay
unchanged. Encoder lives16MiB, decoder/mux32MiB; both must be measured, not counted
as one32MiB heap. Encoded bytes copy directly into one mux-owned native AVPacket,
with zero padding and bounded side data, not an extra payload staging array.
The original mux writes with backpressure before encoder packet release. No
nested Asyncify call or native reentry is needed during this handoff.

Synchronous JS owner preserves exact BigInt clocks, clears foreign pointers
before native import, retains one packet until mux acknowledgement, distinguishes
copied/released versus completed writes, rejects malformed transfers before
writes, and closes native codec/JS references in finally including cancellation,
bad descriptors and unknown release failures. Three executable mock-protocol
units plus three kernel/source/workflow guards pass; five historical workflow
guards still pass with byte-exact old hashes. An initial source guard matched an
English comment containing 'await'; corrected the guard to inspect C/JS code
without comments, no runtime contract change.

New no-Docker pipeline build preserves pinned existing mux/HEVC cache patches,
the broad seven-decoder set,64KiB AVIO and checked256KiB stacks, while disabling
encoding in the decoder/mux module. It separately rebuilds the unchanged proven
16MiB actual encoder. Native compilation, production-browser conversion,
fidelity/adverse/output cleanup, aggregate telemetry and original-size250MiB
repeat/scaling/speed gates remain to execute. Public assets/selector unchanged.

## 2026-10-06 — Actual separate encoder compiled and initialized; browser integration remains

No-Docker run37442072537/job112197987211/026a736 SUCCESS:213s build/262s
job, NOT conversion time. Actual FFmpeg MPEG2 encoder opens18x10 and original
1920x804,420/422, with native settings and imported parameters field/payload
comparison.100 prepare/abort cycles per layout preserve actual native backing
and one owned reference; close releases it to0 and zeroes bounded slots. All15
previous bitrate/quality pairs initialize unchanged;13 malformed/unsupported
configurations fail without retained input refs. Actual binary has fixed shared
256pages/16MiB,256KiB checked stack, MPEG2 encoder only, no decoders or FS.
The native final-ref-only accessory lifecycle gate passes as well.

Downloaded only13 reusable small static tool/source/license/report files,
902729bytes total, under work/mpeg2-split-encoder-37442072537. Exact10 source pins,
five artifact hashes, copied wrappers, actual binary memory section and7332-byte
report SHA2bc5d26960d2a14ad8b86f4dff3484a2be452a6ae916dc70ffd50a4ab4f3f227
verified locally. Independently opened the actual downloaded module at1920x804,
checked actual native settings/parameters, prepared/aborted/released input,
closed refs0: zero frames encoded/packets produced. Hosted recipe EXIT/finally
cleanup SUCCESS; exact artifact11401926260 deleted and API remaining0; no ZIP
left. Original/media/profile/converted output never read/generated here.

Frozen evidence/mpeg2-split-encoder-initialized-2026-10-06.json and two regression
guards preserve exact provenance/scope. This proves buildability and actual
codec initialization, NOT packet encoding/fidelity, complete production-browser
conversion, original-file allocation fit,250MiB acceptance or speed improvement.
Next real implementation step: connect this codec to the production decoder,
native timestamp rescaling/mux, existing AVIO/writer/backpressure/cancellation,
then genuine small fidelity/adverse tests before original-size stress/repeats.
No public route or previous accepted module was changed; full goal incomplete.

Packet release-failure telemetry is conservative: unknown active native packet
ownership is null, never false zero. The JS handoff closes its references after
failure, while the enclosing codec owner must always close native resources in
finally. This is unit-tested; production integration remains the next step.
Final focused/regression checks:528/528 unit tests PASS3.26s; TypeScript,
scoped lint, actual Bash syntax and diff checks PASS. No production/browser
conversion rerun was warranted before the missing integration is implemented.

## 2026-10-06 — Separate actual encoder implementation (initial source checkpoint)

Implemented a private MPEG2 libavcodec owner in mpeg2-split-encoder.c, separate
from the decoder/mux module, with a fixed16MiB heap, unchanged original dimensions,
bitrate/quality pairs, single-thread/GOP48/no-B-frame settings, native pixel
ownership and send/receive/flush state handling. Encoded packets remain owned
until an awaited mux consumer finishes; one packet, no queue or extra JS payload
buffer. Packet records preserve int64 clocks as BigInt, native flags and bounded
side data, including empty side-data-only packets. The bridge becomes failed
after cancellation, malformed records, native failure or partial destination
failure; it cannot retry a partially written mux transaction.

Codec parameters now have an explicit bounded144-byte-header/64KiB-total wire
serializer, not a foreign AVCodecParameters pointer/struct transfer. Extradata
gets zero native padding; CPB fields are explicit little-endian int64 values;
unsupported side types fail rather than disappear. Initialization audit imports
into another actual native object and compares its real fields, payloads and
extradata padding with avcodec_parameters_from_context. No-Docker recipe pins
FFmpeg8.1.2/SDK6.0.4, actual final-ref-only encoder cache patches,16MiB DL/256KiB
checked stack, and enables only MPEG2 encoding, no decoder or filesystem.

Seven executable JS protocol units pass, including100 handoffs, awaited packet
lifetime, cancellation, phase/backing/side-budget failures, heap replacement and
combined consume/release errors. Four source/provenance guards pass; five old
workflow guards still pass with exact historical hashes unchanged. This is
implementation progress, NOT yet native compile evidence, genuine conversion,
browser fidelity, memory acceptance, speed improvement or public support.
Next: compile/initialize this actual encoder, then integrate actual decoded
frames and returned packets with the production native demux/mux/AVIO pipeline,
preserving settings, timestamps, audio, metadata and original source. The full
goal remains incomplete, and the previous combined-module original-file
allocation failure must not be retried unchanged.

## 2026-10-06 — Native pixel/property ownership passed with exact independent byte evidence

Corrected no-Docker run37438448154/job112185969488/ea5597d SUCCESS:202s build,
245s job, NOT conversion speed. All12 real libavutil synthetic frame cases pass
18x10/1920x804,420/422,positive/negative source/negative target strides. Each source
property record637 bytes; exact native fields, metadata entries5, raw-byte side
entries4 and their metadata/bytes checked independently in C, then re-exported.
Native signed64-bit ±2^60/INT64_MIN/MAX remain exact. Source backing/properties
unchanged, pixel refs unchanged, zero refs after finally destruction.17 malformed
record rejects preserve old destination;100 replacements preserve actual fields/
contents and refcount;7 oversized/unsupported source rejects leave export slot
unchanged; empty source actually clears stale metadata/side data. No queued frame,
third pixel buffer or additional SAB; actual shared fixed512/256-page memories,
256KiB stacks,64KiB property slots INSIDE those native heaps (not separate heaps).

Only15115-byte report downloaded to work/mpeg2-split-properties-37438448154,
SHAb05a75e9...a025; all10 source hashes match current files. Independent test-side
serialization reconstructs every scalar, Unicode/empty/case-sensitive/duplicate
dictionary entry, four raw payloads and side metadata: all12 complete wire hashes
match, no production serializer import. Frozen full compact native evidence at
evidence/mpeg2-split-properties-native-measured-2026-10-06.json with two guards.
Recipe EXIT cleanup and enclosing hosted finally cleanup SUCCESS; artifact11400496349
deleted after verification/API0/no download ZIP. No local media/browser profiles,
binaries or source bundle downloaded; only compact reports retained. Earlier
cleanup failure remains separately frozen; no failed-result relabeling.

This is still a PRIVATE COMPONENT test, not a video converter, codec execution,
browser250MiB acceptance or speed improvement. Four raw side types only; structured
HDR/other side serializers still need audit/implementation or explicit destination
incompatibility disclosures. Next implement actual separate codec ownership,
unchanged encoder settings/parameters/extradata, packet timing/flags/side-data and
production AVIO integration. Then genuine browser fidelity/adverse tests followed
by changed original three-run full-tree250MiB/scaling and identical-setting speed
gates.515/515 unit tests, TypeScript, scoped zero-warning lint, Bash syntax,
three non-mutating Bash cleanup-stub cases and whitespace checks PASS. No unchanged
production browser conversion/build repeated for this private-only component cycle.
Full original requirement audit below remains intact and incomplete.

## 2026-10-06 — Property native assertions ran; recipe cleanup guard rejected its own path

ONE run37437720261/job112183554158/4d7525f FAILED after native assertions completed:
actual log reports12 cases,17 malformed rejects,100 repeated transfers, not conversion.
128s build/168s job. The EXIT guard I copied still compared the property build root
to the old pixel-test directory, so it exited2 before cleanup. Full report was not
uploaded/downloaded; its individual values remain unverified, not a passing job.
Enclosing hosted finally cleanup SUCCESS/API artifacts0; no local media or profile.
Frozen evidence/mpeg2-split-properties-cleanup-failure-2026-10-06.json records the
exact mismatch/log/job facts. Corrected only the guard literal, added an exact path
agreement regression and non-mutating actual Bash cleanup-stub checks. Next ONE
changed build to verify the report and complete recipe cleanup; never same terminal
run restart, no unchanged original conversion retry. Native source/budgets/settings
unchanged. Actual codec/production browser250MiB/fidelity/speed gates still pending.

## 2026-10-06 — Bounded frame property handoff implemented; native execution pending

Added private pointer-free160-byte scalar header plus bounded native dictionary/
byte-side records, one64KiB native slot inside EACH existing32/16MiB heap. No
third pixel buffer, JS metadata decode, retained record/history or additional SAB.
PTS/DTS/best-effort/duration use exact64-bit little-endian values, never JS Number;
picture/quality/repeat/flags/error/SAR/time-base/color/chroma/alpha fields preserved.
Frame metadata and side metadata retain UTF-8 bytes, empty values, case-sensitive
keys and duplicate entries. Bounds:64 dictionary entries each,16 side entries,
1024-byte keys/8192-byte values,64KiB TOTAL wire including all payloads/headers.

Export preflights everything before writing. Import validates entire record before
allocation, builds bounded metadata in a fresh property-only native frame, then
transactionally replaces destination metadata/side data without touching pixel
storage or native pixel refs. Every rejection/allocation failure preserves the
old destination. Empty source clears stale properties; old metadata is freed.
Decoder private_ref is NEVER inspected/changed/transferred (upstream prohibition).
Opaque/hardware/audio/crop properties refuse explicitly. Current side payloads
are only documented raw bytes:A53 CC,unregistered SEI,ICC,EXIF; structured/unknown
side data explicitly refuse, not silently omitted. Broader audited side payload
serializers remain needed; this is NOT a narrowed definition of project success.

New synthetic native fixture checks actual fields/dictionaries/payloads independently
of re-export, ±2^60 timestamps/INT64_MIN/MAX, Unicode/duplicate/case/empty metadata,
12 pixel+property cases,17 malformed records,100 replacements,7 rejected sources,
empty replacement and final zero refs. Dedicated optional mode in EXISTING no-Docker
workflow retains only compact report, finally exact owned build scratch removed.
Five precise additions reverse to both original workflow hashes; defaults and
historical source hashes unchanged. Four new local/source/provenance guards PASS;
512/512 unit tests, TypeScript, scoped zero-warning lint, Bash syntax and whitespace
checks PASS. Native recipe execution pending. No real codec/file/original/browser conversion,
performance improvement, process-memory fit or public promotion claimed. Next
ONE new property contract compile; then actual encoder configuration/packets/codecs
and production I/O integration, with original full-fidelity250MiB/repeats/scaling.

## 2026-10-06 — Real libavutil split-frame transport contract passed (not conversion)

Previous goal implementation was progress; intervening push verified local/remote
f5bba0c. Revalidated terminal corrected run37435181293/job112175137251 at that
head: SUCCESS,207s build/252s job (NOT conversion speed). Actual native12/12
cases passed:18x10 and1920x804,420/422, positive/negative source/negative target
strides. Actual binary memories fixed shared512/256 pages; stacks256KiB each.
Native source backing and destination padding unchanged, refs1 before/after,
finally destruction verifies0. All cases one frame/copy/completion, no queued
frame/extra pixel buffer;1920x804 active2315520/3087360 bytes, no cropping.

Only12379-byte compact report downloaded under work/mpeg2-split-contract-37435181293;
SHAf368256c...3125. All7 source pins locally matched and all12 active pixel hashes
independently regenerated. Four compiled artifact hashes retained in report;
no binaries/source bundle/media/profile downloaded. Hosted cleanup SUCCESS;
artifact11399630528 deleted after verification/API0; no download ZIP retained.
Frozen evidence/mpeg2-split-frame-native-measured-2026-10-06.json plus two guards
retain executed results, distinct from earlier failed build/source-only checkpoint.

No decoder/encoder codec executed, no original fixture read, no browser conversion,
no speed/process-memory/public acceptance. Prior missing compiler stderr remains
unrecovered; old rootCauseProven:false preserved. Next implement bounded frame
properties/metadata/side-data ownership, encoder configuration and packet transport,
then integrate actual split codecs into production AVIO. Full original specification,
fidelity, three stress repeats, scaling and250MiB remain required and incomplete.

## 2026-10-06 — Synthetic native contract compiler probe failed; package boundary corrected

ONE native contract37434634781/job112173338626/ea0aeb4 FAILED:29s build step/
70s job, not conversion timings. Actual archive/frame.c/frame.h hashes verified;
FFmpeg configure then reported emcc cannot create an executable/C compiler test
failed. Native frame header/test cases never compiled/executed. No original/video
conversion/local scratch; hosted cleanup SUCCESS/API0. Frozen compact failure at
evidence/mpeg2-split-frame-build-failure-2026-10-06.json, no false native pass.

Recipe omitted the owned type:commonjs package boundary used by the successful
existing build; repository is type:module. Added that exact boundary and bounded
120-line configure stderr on failure. Old failure did not retain compiler log,
so this is an evidence-backed integration hypothesis, not proven root cause.
Source pins/pixels/budgets/allocator/quality unchanged. Next ONE changed synthetic
native attempt, never restart the terminal failed run or retry original video.

## 2026-10-06 — Bounded split-frame handoff prototype implemented (source-only checkpoint)

Previous turn was progress: actual uncapped pending MV pool/zero idle inventory,
cleanup and493 guards committed/pushed72a56d5. No unchanged conversion retry.
Implemented browser-neutral private pixel transport between separate fixed
32MiB and16MiB heaps (48MiB total, NOT a48MiB replacement heap). Native codec
modules are NOT yet separated; these are prototype ownership budgets only.
Active pixels move directly into encoder-owned storage, no third pixel buffer,
frame history or queued frames. Contiguous planes use one bounded view/set;
padded/negative strides copy rows and leave target padding untouched. Dimensions/
8-bit420-or422/layout/all three actual native allocation bounds/overlapping spans
validate before any write. No implicit crop/resize or unsupported-format fallback.

Single-flight sender waits for encoder/packet backpressure, refuses another frame
or premature close, releases its OWN handoff storage on cancellation/failure and
keeps both failure causes if cleanup also fails. Live HEVC references remain the
decoder owner's responsibility, never discarded by the bridge. Layouts are
frozen scalar snapshots across awaits, current heap sizes/identities checked;
actual binary maxima must be independently verified by the module owner. Scalar
metrics distinguish copied from completed frames, include failed copies and
actual peak occupancy, and close drops module/callback references.

Native64-byte wasm32 descriptor uses pinned FFmpeg8.1.2's read-only existing
AVBufferRef getter; no ref increment/decrement, allocation or pixel/frame mutation.
Primary frame.c25268/3f004de1...6534 and frame.h42294/91275238...3be9 verified from
the official tagged source; recipe verifies archive464beb5e...24c plus BOTH files.
JS reader preserves signed strides, returns frozen scalars, no borrowed record
view or telemetry addresses. Local guards cover exact1920x804/2315520 active
bytes, source backing unchanged/encoder padding unchanged, both stride signs,
420/422, bounds/overlaps/malformed ABI, cancellation/error cleanup, heap replacement
and100 repeats. These are synthetic transport tests, NOT encoding evidence.

Added standalone no-Docker libavutil-only synthetic native test: compile32/16
fixed shared Wasm heaps with same DL/guarded256KiB stacks, instantiate real native
AVFrames, compare12 small/original-dimension synthetic cases with initially
different destination pixels, unchanged source backing/padding/ref counts and
finally destruction. No codecs/demux/mux/file conversion/original fixture access;
only <=64KiB report retained, build scratch removed by recipe/workflow. Optional
new workflow CORE choice (no extra inputs) has strict exact reversal to BOTH
historical workflow hashes; changed/missing/duplicate report/recipe/cleanup rejects,
frozen proof hashes unchanged.16 focused guards,505/505unit tests, TypeScript,
scoped zero-warning lint, Bash syntax and whitespace checks PASS.

Native test has NOT yet run. Next ONE new synthetic native build, not original
conversion. Remaining split-converter work: exact encoder settings/codec parameters
and extradata/coded side data; all AVFrame timing/flags/SAR/colors/metadata/side
data (never raw FFmpeg struct pointer transfer); encoded packet flags/timestamps/
side data; bounded synchronous/asynchronous ownership and production AVIO callback
integration; all native heaps in runtime metrics; genuine small fidelity/adverse
validation THEN changed original full-tree250MiB/repeats/scaling/speed gates.
No encoder performance/full-source fit/public promotion or full-goal claim.

## 2026-10-06 — Actual allocation-time result: MV pool failure with zero idle backing

Previous implementation goal turn was progress; intervening push confirmed the
remote at21cf480 with a clean tree. Revalidated the SAME live37399371287 job,
never restarted it. No-Docker job112062866531/head21cf480 SUCCESS:282s compile,
329s job (not conversion speed). Downloaded only eight small static tools into
work/mpeg2-artwork-metadata-37399371287; independently verified29 native source
pins/3 artifact hashes, six actual component sets, instrumented refs.c
c7c5d94d...23244, correct observer imports/StackCheck2, actual fixed512 shared
pages, same-DL reader9/selector60/uncached lifecycle proofs. Source bundle not
downloaded; hosted11385110461/11384805868 deleted/API0, own temporary ZIP absent.

Chrome154 small4/4PASS17.6s: genuine48/96-frame MPEG4/HEVC->MPEG2 output hashes
unchanged, SSIM.992146/.985963, full independent video/audio decode, exact AAC/
PCM+priming/artwork/tags/chapters/all frame PTS<=1ms.64KiB read/write/peakqueue,
one outstanding operation. Cancellation349012->599048 terminal bytes/partial[],
write failure output0/partial[], both terminal queues/operations0. Individual
461.135/477.450ms are diagnostic timings, NOT controlled speed A/B. Actual worker
counts and SAB totals retained as observed, not assumed zero or fixed after close.

ONE original2958573265-byte1920x804/default-source diagnostic FAILED before
output; fixed32MiB/quality/live refs unchanged. Bounded extended error stack1,
frameDiagnostic1/allocatorDiagnostic0, no acceptance retry. Heapend34582528,
input222785/output0.146 native events:102 plane (51 completed successful),44 HEVC
pool/encoder events,18 completed successful pool requests; no eviction or cap.
Final event44 is exact pending layer0 tab_mvf get; actual native pool OOM context.
Both inventories complete: MV1163520 payload/1163536 backing/live5/cache0;
RPL152880/152896/live5/cache0. Simultaneous required live backing6582160, inactive
backing0, requested MV entry1163536. DPB flags5active/5short/0long/2output overlap.
No failed plane, free-block capacity, normal-core placement, runtime savings or
safe live-reference removal claim. This rules out further trimming THESE empty
caches at THIS boundary; it does not prove all heap contents or fundamental fit.

EARLY stable blank264339456/loadedidle309243904/nativeprivatepeak460468224/CIM
441614336 =>187.04296875MiB INCOMPLETE, not acceptance.29 valid/0 unavailable
native samples; all observed unknown/updater processes retained in measurement.
All five finally cleanup flags true, forbiddenRequests[]. Independent original
post-hash/six restored assets/both adapters/runtime removal checks PASS;20 full
observed/owned PIDs absent and21 small PIDs absent after full cleanup. Small Chrome
renderer26936 was briefly reused by a different full-run node helper; identity
checked, not killed as a small process. No media/profile/validation copies remain.
Compact raw475863-byte JSON/CSV/HTML/14592-byte diagnostic trace retained, not
converted media. Frozen evidence/mpeg2-hevc-pool-attempts-measured-2026-10-06.json
and read-only freeze-mpeg2-hevc-pool-attempts.mjs reproduce exact measurements;
two new evidence guards pass;493/493 unit tests, TypeScript, scoped zero-warning
lint and whitespace checks PASS. Historical proof/hash artifacts remain unchanged.

Next: do NOT retry the unchanged combined32MiB module, trim empty caches, drop
live HEVC references or relax source/quality. Investigate bounded decoder/encoder
separation with ONE reusable frame bridge, fixed module budgets, same production
I/O/timestamps/audio/artwork/metadata and full-tree250MiB requirement. Audit native
ownership and implement/validate a small split prototype before a changed native
build/full-original run. Separation is not yet implemented or proven to fit;
no uniform heap increase, speed claim or public promotion. Full goal incomplete.

## 2026-10-06 — Allocation-time HEVC observer implemented (historical source-only checkpoint)

Previous turn was progress: actual normal trial failed in HEVC alloc_frame/
av_refstruct_pool_get, exact pool unknown, cleanup/evidence pushed8b26ebd.
Implemented reversible observation at BOTH upstream tab_mvf/rpl_tab get calls.
Each wrapper executes the original getter exactly once and returns its unchanged
result; no pool flags, references, sizes, codec settings or source changes.
Pre/post attempts and encoder boundaries share ONE48-event native counter;
plus192 plane events fits unchanged240 browser ring.48-byte synchronous scalar
inventory/128 inactive-link walk, no addresses/media objects. DPB flag categories
overlap and do not include not-yet-flagged frames; live auxiliary counts may differ.

Pinned primary refs.c21945/340d1607...e5e audited. Three exact substitutions plus
appended read-only wrapper reverse EVERY original byte; changed calls, returned
object, duplicate instrumentation and changed sources reject. Instrumented SHA
c7c5d94d...23244. Frozen source-only audit at
evidence/mpeg2-hevc-pool-attempt-source-audit-2026-10-06.json. Prior source/header/
linkage/failure proofs preserved; current private diagnostic wiring explicitly
uses new observer. Normal generated wrapper5650af19...c88d remains byte-identical.
Manifest verifies actual refs reversal, actual full emitter-header inclusion,
real EM_JS import and29 source pins/corresponding bundle. Existing same-allocator
reader, selector and lifecycle native units remain mandatory.

Strict chronology reducer distinguishes completed pre/post from final unmatched
pre-get, and rejects foreign/oversized/gapped/mismatched telemetry. Only uncapped,
unevicted complete prefix ending at the pending pool get plus native pool OOM
context attributes a class. Incomplete statistics stay NULL; no free-block/live
removal/runtime saving/speed/public acceptance claim. Native context may show
original alloc_frame or the exact pinned HEVC wrapper at the trace depth limit;
unrelated decoder frames do not qualify. Six new focused guards and17 combined
focused guards passed;491/491unit/TypeScript/scopedzero-warninglint/Bash syntax/
whitespace/repeated pinned audit PASS. Initial lint caught a forbidden test-local
module variable, renamed without changing observer. No media/profile generated;
only owned generator-unit scratch, verified removed.

Native observer is NOT yet compiled/measured. Next ONE changed no-Docker
dlmalloc/hevc-mpeg4/frame-diagnostic1/allocator-diagnostic0 build, small strict
fidelity/adverse cases, then ONE unchanged original-source diagnostic. Never an
unchanged normal retry or acceptance run; fixed32MiB/source/quality/live refs/
timestamps and full process-tree formula unchanged. Full goal remains incomplete.

## 2026-10-06 — Actual HEVC admission trial: small fidelity passes, original normal gate fails

Previous turn was progress: implemented/pushed final-unref trial and dispatched
ONE changed build. Same no-Docker37397131884/job112055657628 atcb9ec76 SUCCESS,
194s compile/218s job (not conversion time). Independently verified actual27
source/3 artifact hashes, patched HEVC decoder0c91a162...e67c5, same-DL compiled
60-configuration selector and full lifecycle proof, unchanged normal wrapper
5650af19...c88d/fixed32shared512/guarded256KiB stacks/64KiB I/O. Both diagnostics
off; real Wasm contains guard import but neither diagnostic emitter. Seven small
static tools retained; source bundle undownloaded, hosted11384415314/11384440294
deleted/API0, own temporary ZIP absent.

Chrome154 small4/4PASS18.0s: MPEG4/HEVC sources genuinely encoded48/96 frames
to MPEG2, SSIM.992146/.985963, independent video/audio decode, exact AAC/complete
PCM+priming/artwork/tags/chapters/<=1msPTS. Outputs321692/652521 bytes + SHA are
byte-identical to prior normal candidate.64KiB read/write/peakqueue/one operation;
cancellation232344->599048 terminal bytes/partial[]/zeroqueues, write failure
partial[]/zerooperations. Individual443.355/477.615ms are NOT controlled speed A/B.

ONE normal original2958573265-byte1920x804/default acceptance attempt FAILED,
requested3/attempted1/completed0; heapend34426880/input222785/output0. Actual
stack av_malloc -> av_refstruct_pool_get -> HEVC alloc_frame, now auxiliary-pool
allocation rather than earlier observed encoder-plane path. Exact failed pool,
simultaneous live/cache entries and runtime savings UNKNOWN: this normal build
has no observer. Pinned refs.c has separate tab_mvf then rpl_tab gets; stack cannot
distinguish them. Do NOT transfer earlier instrumented1316432 idle backing or
frame-plane2 attribution to this run, drop required live entries, infer savings
from heap-end changes, or retry unchanged.

EARLYblank266133504/loaded332517376/nativepeak464281600/CIM443949056 =>188.96875
MiB INCOMPLETE, not stress acceptance/savings.26valid/0unavailable, all descendants
retained (including unknowns/updaters). Native RSS peak774115328. All5finally flags
true; independently19 full observed/owned and21 small numericPIDs absent, exact
runtimeymIxMp/fixtures/profiles/adapters gone, six assets restored and original
pre/post checksum unchanged. No unrelated kill or retained converted media.
Compact JSON/CSV/HTML and6,110-byte failure trace retained as diagnostic reports.

Frozen evidence/mpeg2-hevc-auxiliary-trial-failure-2026-10-06.json binds actual
small346273/d501dc17...742e/full277480/ce193ab3...ad5 and read-only source-pinned
reducer; five focused guards and exact reproduction pass with no new conversion.
Next: bounded read-only pre/post at BOTH actual HEVC auxiliary pool-get callsites,
with encoder snapshots sharing48-event budget plus192planes/unchanged240 browser
ring. Measure failed class/live-versus-idle at allocation before choosing further
allocation policy or bounded decoder/encoder separation. No larger heap/source
resize/quality/reference/PTS relaxation, public promotion or full-goal claim.

Post-cycle485/485 unit tests, TypeScript, scoped zero-warning ESLint, whitespace
and exact read-only raw-report reproduction passed. No live build/browser/helper
remains; no unchanged conversion retry performed. Full goal remains active.

## 2026-10-06 — Evidence-supported HEVC auxiliary cache-admission trial implemented

Previous turn was progress: actual HEVC idle-backing evidence and chronology
guards pushed at9a6e452. Implemented private final-reference idle admission
trial for ONLY tab_mvf/rpl_tab, reusing unchanged lifecycle-tested bit30 policy.
Real HEVC decoder/source SHA d6c12610...690974 audited from pinned8.1.2 primary
source; five exact substitutions reverse every byte. Patched SHA0c91a162...e67c5.
Required live refs, DPB flags, allocation sizes, zeroing/reset/free/init, codec
settings, source1920x804, fixed32MiB, guarded stacks and64KiB I/O unchanged.
Selector returns bit30 only for HEVC decoding with exactly one codec thread;
other codecs, encoder and automatic/multiple-thread configurations stay default.

Build now requires an actual compiled C60-configuration selector unit plus the
existing same-allocator allocation-lifecycle unit. Manifest checks actual patched
decoder reversal, exact copied selector-header bytes and exact compiled report;
27 pinned native recipe/source files included in corresponding source bundle.
No workflow/public engine/registry change. Bounded source-only audit frozen at
evidence/mpeg2-hevc-auxiliary-policy-source-2026-10-06.json; mutation negatives
passed and no scratch/media/source copies created.11 focused tests passed.

Native compilation, runtime savings, fit and speed remain UNPROVEN. Next one
changed normal non-Docker dlmalloc/hevc-mpeg4 build, both diagnostic inputs0,
small fidelity/adverse gates then original normal three-run gate (stop on first
failure). No live-reference removal, heap enlargement, quality relaxation or
unchanged failed retry. Full goal remains active/incomplete.

Regression483/483 units, TypeScript, scoped zero-warning ESLint, Bash/JS syntax,
diff whitespace and repeat pinned audit checks passed. Initial whole-suite guard
correctly noticed a fourth allocator-selected compile (the new selector unit);
updated exact call count3->4, preserving every allocator/memory/kernel check.
No native/browser job is live yet at this implementation checkpoint.

Implementation pushedcb9ec7654e6c42985a5155ec5c5d97fd803966b0. ONE changed
normal no-Docker build dispatched: run37397131884/job112055657628, confirmed
in_progress atthat exacthead (checkout running). Inputs corewithin-mpeg2-candidate,
allocator dlmalloc, decoder hevc-mpeg4, bothdiagnostics0. Continue observing this
same run; do not restart because a poll times out. No new media/browser fixtures
or converted files created locally this turn. Build success/browser fit pending.

## 2026-10-06 — Actual HEVC idle backing measured; cache-admission trial justified

Previous turn was progress: recorded real link failure, corrected native/EM_JS
bridge and dispatched ONE changed build. Corrected non-Docker37395126119/
job112049169870 at4ca9822 SUCCESS283s build/328s job (not conversion time).
Actual24 source/3 artifact hashes and both real diagnostic imports were verified;
fixed32MiB shared512pages, same-DL-allocator nine-transition pool-reader and
uncached lifecycle units passed. Eight static tools retained locally; source
bundle not downloaded, hosted11382702760/11382447921 deleted and API confirmed0.

Chrome154 small4/4PASS17.5s:48 MPEG4/96 HEVC frames genuinely encoded to MPEG2;
SSIM.992146/.985963/full v+a decode/exact AAC and complete PCM+priming/artwork/
metadata/chapters/<=1msPTS. Output321692/652521bytes and hashes identical normal
candidate.64KiB read/write/peakqueue/one pending operation. Cancellation observed
232344->471427 terminal bytes, then partial[] and zero queues; write failure
cleans partial[]. These timings are not controlled speed A/B or stress acceptance.

ONE unchanged2958573265-byte1920x804/default original diagnostic FAILED heapend
33771520,input222785/output0. Actual89 ordered scalars:83 planes/41 successes
plus6 HEVC auxiliary snapshots; no eviction or exhausted cap. Complete chronology
links the sixth layer0 snapshot to the failed MPEG2 encoder plane2 request421655.
MV:1163520payload/1163536backing,5live/1cached; reference-list table:152880payload/
152896backing,5live/1cached. SIMULTANEOUS idle backing1316432 bytes versus LIVE
6582160. DPB5short-ref/2output flags overlap and are not additive. No live entry
may be dropped. Idle backing is not contiguous free space, allocator overhead,
measured saving, guaranteed later fit or proof of exact normal-core placement.

EARLYblank265580544/loaded312664064/nativepeak453660672/CIM441507840 =>179.3671875
MiB INCOMPLETE diagnostic, not memory acceptance/saving.29valid/0unavailable,
all unknown/GPU/utility/updater descendants retained. All five finally flags true;
independent20 full owned/observed numericPIDs and21 smallPIDs absent, six assets
restored, exact runtime and all new small fixtures/profiles/adapters removed,
original pre/post size/SHA unchanged and download ZIP absent. No unrelated kill.

Frozen evidence/mpeg2-hevc-auxiliary-measured-2026-10-06.json binds rawsmall343600/
351d7773...16253/full426566/574966de...862e, read-only reducer and strict ordered
boundary/live-cache analysis. No native/browser retry is performed by reduction.
Next: private single-thread cache-admission trial for ONLY these two HEVC pools,
reusing the verified final-unref uncached policy. Preserve required references,
DPB/sizes/reset/free/init/zeroing/strides/pixels/quality/source/fixed memory. This
is now evidence-supported, not an assumed idle-cache or decoder-only fit change.
Then one changed build, small fidelity/adverse cases and original NORMAL gate.
Full M04/repeats/scaling/speed/legal/registry/integration and original scope remain
incomplete; no diagnostic/public acceptance or unchanged failing rerun.

Pre-push regression: 480/480 unit tests, TypeScript, scoped zero-warning ESLint
and git diff whitespace checks passed. Read-only reduction reproduces the frozen
measurement exactly; no additional conversion or native build was run.

## 2026-10-06 — Auxiliary diagnostic linker failure recorded; bridge correction pending

Actual non-Docker run37394428454/job112046909611 at6d08583 FAILED final link:
refs.o could not resolve within_hevc_aux_emit. Build265s/job311s are not conversion
times. No browser conversion, download or retained artifact; API confirms zero
artifacts, runner cleanup passed. Frozen evidence/
mpeg2-hevc-auxiliary-link-build-failure-2026-10-06.json records this failure.
The historical source-only proof/header/helper hashes remain unchanged.

Correction adds a native C bridge that directly calls a renamed EM_JS import;
the generated diagnostic header reverses exactly to its original audited bytes.
Manifest checks the actual renamed import, recipe bundles the new helper (24
native source pins). Normal wrapper and allocation/codec/kernel policies remain
unchanged. Compile/browser verification is still pending; no acceptance claim.
Two bounded scalar-analysis unit tests separately reject unknown/stale/incomplete
pool groups and separate actual live backing from cached backing without free-
block or allocator-overhead guesses. They are not native measurement evidence.

Additional pinned-source finding: MPEG encoder load_input_picture disables its
direct-input path when width OR height is not divisible by16. Original height804
therefore prevents a stride-only zero-copy shortcut. The actual source hash
17eddac164020668201e0b6d25140cf1328db6ba953559587240d8c73199289f was verified;
do not remove that guard or resize/pad the advertised source to make it pass.
Next ONE changed corrected-bridge build, not another unchanged failed compile.
Correction regression:475/475 units, TypeScript, zero-warning scoped ESLint,
Bash syntax and diff checks passed. Generated default wrapper remains unchanged.

## 2026-10-06 — HEVC auxiliary inventory implemented; native measurement pending

The previous cycle made progress: the actual third-plane failure was attributed,
frozen, guarded by 467 passing unit tests and pushed in 2cf4fc5. No unchanged
conversion has been repeated. Pinned HEVC source confirms motion-vector and
reference-list objects remain needed until upstream DPB flags permit release;
outputting a frame alone does not make its auxiliary objects safely disposable.
Whether either pool has idle entries at the current failure remains UNKNOWN.

The existing private plane diagnostic now additionally observes both HEVC pools
immediately before the real encoder send. Addition-only refs.c helper and one
generated-kernel call reverse byte-exactly to upstream/pinned source. No change
to references, allocation, cache policy, source, quality, stride or fixed memory.
48 auxiliary events plus 192 plane events fit the unchanged 240 browser cap;
each native inventory is a 48-byte stack array, inactive walk capped at 128.
Absent/incomplete statistics remain null. DPB flag categories overlap and are
not additive. The existing read-only pool reader and its mandatory compiled
same-allocator synthetic lifecycle unit now also run in this diagnostic mode.
Manifest verifies real source reversal, kernel reversal and actual emitter
import; 23 source pins and corresponding-source bundle include both new files.
Default uninstrumented generated wrapper remains byte-identical.

Source-only audit passed against four exact FFmpeg8.1.2 primary-source hashes;
frozen evidence/mpeg2-hevc-auxiliary-source-audit-2026-10-06.json records actual
reversal and negative controls, not native conversion or measured idle bytes.
No media or scratch file was generated by the source audit. Next one changed
non-Docker build, required small fidelity/adverse tests, then one unchanged
original-source diagnostic. Do not free live references or claim speed/fit.
Regression: 11 focused guards, TypeScript, scoped zero-warning ESLint and Bash
syntax passed. Two old literal reader-condition guards rejected its intentional
extension to the separate plane diagnostic; guards now require the exact paired
condition and still require encoder-release instrumentation to remain exclusive
to allocator mode. Frozen historical source/evidence hashes were not refreshed.
Final regression 471/471 unit tests passed; original test.mkv size/checksum
unchanged and H: has 1752514486272 free bytes. No browser conversion yet.

## 2026-10-06 — Actual plane attribution measured; original conversion still fails

Non-Docker build 37392190577 at a5bdf2f succeeded. All 21 native source pins,
three artifact pins, the real diagnostic import and fixed 32 MiB shared memory
were verified. Four small browser fidelity/adverse cases passed; successful
outputs remain byte-identical to the normal candidate. No speed A/B claim.

One unchanged original test.mkv diagnostic failed with zero output. The complete
83-event scalar trace attributes the abort to MPEG-2 encoder plane index 2:
421655 requested bytes after 2108206 bytes of current-frame payload were already
allocated. This identifies THIS instrumented failure, not the exact normal-core
failure, fragmentation, recoverable cache bytes or simultaneously live buffers.
186.48828125 MiB incremental private memory is an INCOMPLETE diagnostic result,
not a passing conversion or memory acceptance. No heap, quality or source change.

Retained evidence: evidence/mpeg2-frame-plane-measured-2026-10-06.json and its
source-bound read-only reducer. Generated media, profiles and adapters were
cleaned; original checksum and six public assets were independently verified.
All 15 original full-test process identities and 20 small-test PIDs were absent.
One numeric PID had been reused by an unrelated updater; it was not killed.
Hosted artifact archives were deleted; seven reusable local static tools remain.

Next: establish genuinely live versus inactive HEVC auxiliary objects or a bounded
decoder/encoder decomposition before another optimization. Do not repeat the
unchanged failing conversion. Full original scope, stress acceptance, controlled
speed comparisons, legal review and integration remain incomplete.

## 2026-10-06 — Exact plane attribution implemented; source-only audit passed

Previous cycle was progress: actual specialist build/small passes/original failure
were frozen and pushed50fe20e, not a successful conversion or an unchanged wait.
New WITHIN_MPEG2_FRAME_ALLOCATION_DIAGNOSTIC defaults0 and accepts only0/1 before
SDK/scratch. It is independent of malloc implementation and cannot be combined
with emmalloc heap/pool instrumentation (separate caps). Three exact scalar-only
insertions into pinned get_buffer.c: declaration plus before/after each real
video plane acquisition. Records requested bytes, plane index, codec/encoder,
actual context/coded/frame dimensions, pixel format, stride and already allocated
current-frame bytes; before-result NULL, after-result actual bool. No addresses,
media payload, heap/free-block guesses, allocator mutation, pixel-buffer copy,
layout/reference/cache/quality/source/algorithm change. Native cap192/browser240;
unchanged fixed32M, guarded256K stacks,64K I/O, kernel and production gate.

Source-only verifier fetched bounded32K pinned FFmpeg8.1.2 get_buffer.c, applied
the two already audited plane-cache patches, checked existing910da629...c4ab4,
then exact diagnostic71fb08761ce7c72554ec48ec2a64dfa1973d558c21ec1731f82d62939a7f46d7.
Reversing only the three inserted blocks recovers EVERY allocation/source byte.
Duplicate instrumentation, changed allocation and changed insertion rejected;
source artifact and unique owned scratch removed. Frozen evidence/
mpeg2-frame-plane-source-audit-2026-10-06.json pins helper/header/verifier sources;
actual failed plane/runtime saving/speed still NULL, compiled observer not yet
verified. Synthetic scalar emitter tests are not native conversion evidence.

Native recipe/manifest/bundle wired; manifest validates actual source reversal and
presence/absence of the real Wasm scalar import, with21 source pins. Generated
normal wrapper remains byte-exact when feature0. Private full harness captures
events, performs at mostONE diagnostic attempt, and refuses diagnostic acceptance.
Workflow optional default0 paired selector reversal is exact; historical hashes
unchanged, unpaired/default/other changes rejected. Broad decoder module/public
engines/registry retained. Next one changed DL/hevc-mpeg4 diagnostic build and
one full ORIGINAL source attribution, not an unchanged normal conversion retry.
Regression462/462 units,21 focused guards, zero-warning scoped ESLint, TypeScript,
Bash syntax/diff and source-only reversal/cleanup pass. No browser conversion or
Docker ran in this implementation cycle; existing failed evidence is unchanged.
Generated default wrapper actualSHA5650af19...c88d remains identical; removing the
diagnostic header from generated feature1 wrapper recovers feature0 byte-exactly.

## 2026-10-06 — Specialist compiled; small fidelity passes; original still fails

No-Docker run37367996146/job111957771738 at41e0384b1ad815a30487946b6d70fa587dbbe08b
succeeded:279s build/329s job, NOT conversion timing. Actual19 source pins/three
artifact hashes/compiled dlmalloc fingerprint and same-allocator lifecycle proof,
fixed32MiB shared512/512 pages, StackCheck2/guarded256K C+Asyncify/64K AVIO verified.
Actual selected decoders h263/hevc/mpeg4; broad/default nine-decoder module remains
available and all public engines/registry unchanged. Static audit: new Wasm4856513
vs7228748 bytes/code4435283 vs6695682/passive569 vs594/payload336065 vs400158.
Actual stackEnd1822912/base2085056 vs1979984/2242128; boundary reduction157072 is
NOT measured runtime heap saving, free-block capacity or complete-browser memory.
ZERO import callbacks; only pure stack bounds inspected; heapBase remains NULL.

Chrome154 small4/4 passed19.7s. Genuine48 MPEG4/96 HEVC -> MPEG2 frames, SSIM
.992146/.985963, <=1ms actual PTS, exact AAC compressed bytes/full decoded PCM/
priming/artwork/tags/chapters/full video+audio decode;321692/652521 output sizes
and hashes byte-identical to wide allocator candidate.64K read/write/peakqueue,
one pending write, actual guarded256K reserves (not stack high-water). Write
failure/cancellation remove partial[]; cancel observed232344 -> terminal471427
bytes, then zero queues/operations. Individual440.200/513.155ms timings and suite
19.7s are NOT controlled same-input A/B or a public/stress acceptance result.

ONE normal unchanged original2958573265-byte1920x804/default-settings test FAILED
at requested heapend33783808, input222785/output0, stack dlmalloc alignment ->
av_buffer_allocz/default_get_buffer2. Requested3 repeats stopped after first
failure. Exact failed plane/codec context/cache retention/contiguous capacity NULL;
old emmalloc diagnostics cannot be transferred. EARLY stable blank267624448,
loaded316194816/native462700544/CIM462536704 =>186.0390625MiB INCOMPLETE, NOT
primary acceptance, saving or speed.11 valid/0 unavailable native samples; all
descendant/unknown/updater/GPU accounting retained. Smaller specialist did not
solve fixed32MiB source fit. Do not repeat this unchanged candidate or infer that
another decoder-only reduction will solve it. Next: bounded read-only exact
frame-allocation/codec-context attribution before changing allocator/codec policy;
preserve original dimensions/settings/quality/live references/fixed heap/gates.

All5 finally flags true/no cleanup errors. Independent21 full observed/owned PIDs
and22 small PIDs absent; six assets restored exactly; all new profiles/runtime/
fixtures/adapters gone, original size/SHA unchanged. Only7 reusable small static
tool files retained locally; no converted copy outside repository. Hosted artifact
IDs11368414042/11368384228 deleted after verification/API0; source bundle never
downloaded and temporary download ZIP absent. Frozen evidence/
mpeg2-decoder-module-protected-failure-2026-10-06.json pins actual rawsmall341942/
SHA486a6344...81344/full345112/SHAbc4e6316...cceb2 and read-only reducer/audit/
selector sources. Full goal, M-04, repeats/scaling/speed/legal/integration remain
open; no public promotion. Latest implementation41e0384 independently verified
on origin/media-options; main not changed.
Frozen-cycle regression456/456 unit tests and10 focused new/historical guards
pass; TypeScript, scoped zero-warning ESLint, generated ledger and diff checks
pass. No expensive failed conversion or native build repeated unchanged.

## 2026-10-06 — Measured static boundaries; additional decoder module implemented

Read-only scripts/audit-mpeg2-static-layout.mjs validates actual static Wasm
hashes/shared512-page limits, bounds-checks known passive data sections, and
invokes only stack init/bound accessors with every imported callback throwing.
Both runs use ZERO import callbacks/no source media/native conversion. Old wide
EM payload401434/code6561191/stackEnd1981792/base2243936; wide DL payload400158/
code6695682/stackEnd1979984/base2242128.594 passive segments/guarded256K stack each.
Actual boundary delta1808 is NOT runtime heap saving or free-block capacity;
heapBase NULL. File/code size is not linear-memory occupancy. Frozen evidence/
mpeg2-static-layout-decoder-module-2026-10-06.json binds audit/helper source hashes.

New WITHIN_MPEG2_DECODER_SET wide(default unchanged)/hevc-mpeg4 adds a private
specialist candidate without deleting wide nine-decoder availability or any
public profile. Requested HEVC+MPEG4 expects actual h263/hevc/mpeg4 per pinned
FFmpeg8.1.2 dependency selection (MPEG4 selects H263; HEVC still selects shared
CABAC support). No algorithm, live-reference, codec settings, source dimensions,
quality, parser/demuxer/muxer/secondary-stream policy,64K AVIO, fixed32M memory,
guarded256K stacks, lifecycle gate, baseline or validation change. Manifest checks
exact actual selected decoder set rather than trusting a label; new helper is
the19th source pin and included in corresponding source. Invalid selector fails
before SDK/owned scratch. Additional workflow choice stays private/off-by-default;
strict paired reversal preserves every historical workflow byte/hash, with
missing/default/other/duplicate changes rejected. Five focused selector/provenance
tests/Bash syntax/diff pass. Specialist compile, actual footprint comparison,
small4 and unchanged full-source gates pending; no fit/speed/primary-memory or
public support claim. No retry of unchanged failed wide allocator candidate.
Regression454/454 units,13 focused selector/static/historical guards, zero-warning
scoped lint, TypeScript/Bash syntax/diff pass. Initial literal-flag guard failed;
changing that test then correctly failed its frozen historical-source hash. Final
recipe selects complete literal flags and passes the selected flag to configure,
so the ORIGINAL historical test/hash is restored unchanged, while new guards prove
exact broad/default and specialist selection. Frozen proof hashes never refreshed.
Lint-only reserved module variable renamed; repeated actual layout values unchanged.

## 2026-10-06 — Actual dlmalloc compile/small passes; original frame-buffer failure

Non-Docker37364583311/job111946633354 atb0a24676c8a8153812f7943030be428cde371e7d
succeeded (242s build/287s job, NOT conversion time). Independent actual18 source
pins/three artifact hashes/complete five-symbol dlmalloc fingerprint/compiled
same-allocator lifecycle smoke/shared512/512page fixed32MiB/StackCheck2/256KiB
C+Asyncify/64KiB AVIO verified. JS unchangedSHA5af0005d...59b; actual dlmalloc
Wasm0fb2d250d63e3d98451044c94b85ef5697fc5f9733cba6a75ff576a1859f7877.
Only7 small static tool files downloaded into repository work; owned gh ZIP
automatically removed/independently absent. Hosted11368525504/11368460849 deleted
after local verification/API0; source bundle never downloaded.

Chrome154 small4/4 passed21.5s:48 MPEG4/96 HEVC source frames genuinely MPEG2,
SSIM.992146/.985963, <=1ms PTS, exact AAC compressed packets/full decoded PCM/
priming, artwork/tags/chapters/full video/audio decode.321692/652521 output bytes
and SHA identical prior allocator.64KiB reads/writes/peakqueue/one pending, four
actual guarded256K reserves (not stack high-water). Real write failure and
cancellation pass; cancel232344 observed output ->536963 terminal bytes, then
partial[]/zero queues. This timing is NOT same-input controlled A/B or acceptance.

ONE unchanged original2958573265-byte1920x804/default-settings full gate failed
heapend33943552/input222785/output0. Actual stack emscripten_builtin_malloc ->
dlposix_memalign ->av_buffer_allocz/default_get_buffer2. Exact failed plane,
codec context, post-policy pool retention and contiguous capacity remain NULL;
do not transfer old emmalloc diagnostic counts to this changed allocator.
Requested3 repeats stop after first failure. EARLYblank265043968/loaded313118720/
native472100864/CIM466419712 =>197.46484375MiB INCOMPLETE, NOT acceptance/savings.
17 valid/0 unavailable native conversion samples, full descendant/unknown/updater
accounting retained. All5 finally flags true/no cleanup error; later independent
21 full observed/owned and21 small PIDs absent, six assets exact, private adapters/
new runtime/fixtures gone, original SHA unchanged. Earlier numeric-only PID check
found reused43436 belonging to Opera, NOT proof of retained Chrome; no unrelated
process killed. Frozen evidence/mpeg2-dlmalloc-protected-failure-2026-10-06.json
binds rawsmall341525/SHAa5c80818...798ef/full340127/SHAda59b9d1...5f6b4 and
read-only reducer. Changed allocation strategy does NOT solve source fit. Next
audit actual static-data footprint and specialist decoder decomposition while
preserving broad-core availability; no unchanged retry/heap raise/source resize/
live-ref drop/quality relaxation/unsupported emmalloc-on-dlmalloc telemetry or
public promotion. Full goal/M-04/repeats/scaling/speed A/B/legal/integration open.
Frozen-cycle regression450/450 units, scoped zero-warning ESLint, TypeScript and
diff checks pass. Read-only reducer reproduces the retained facts without a
conversion. No browser/native job remains live; public engines/registry untouched.

## 2026-10-06 — Allocator implementation and build-verifier history

Changed diagnostic run37363591010/job111943580063 at9050a4796034614e2396e4c73e6d2d3b24c72526
completed FAILURE at the same check, now with actual15 emitted names/no truncation.
318s build/363s job NOT conversion speed. Actual allocator fingerprint is
dispose_chunk/dlposix_memalign/emscripten_builtin_free/emscripten_builtin_malloc/
emscripten_builtin_realloc; canonical dlmalloc/dlfree absent. SDK6.0.4 source
defines builtin names as aliases of the corresponding dl routines, and defines
both specific internal/alignment routines. The previous canonical-only verifier
was wrong for this real LTO naming, not evidence of allocator/runtime failure.
Frozen evidence/mpeg2-dlmalloc-emitted-fingerprint-2026-10-06.json retains all15
actual observed names and source relationships. No artifacts/browser conversion,
runner cleanup passed/API0; original source size/SHA independently unchanged.
Corrected verifier requires either canonical pair or ALL five actually observed
specific/alias names; generic builtin aliases alone never suffice. Both directions
now reject opposite-allocator fingerprints, including mixed alias maps and unknown
emmalloc-prefixed names. Negative controls remove each of the five, mix both maps,
omit specifics and include wrong signatures. Runtime/codecs/settings/fixed heap/
stacks/quality/AVIO/public bytes unchanged. Next one changed verifier build, then
small4/full unchanged-source gates only if actual build/artifact verification pass.
Corrected fingerprint regression448/448 units, scoped zero-warning lint and diff
checks pass; historical proofs and workflow hashes remain unchanged.

Actual non-Docker run37362351568/job111939735758 at736cda9008d4ea9856972cff478d7b5a4501dacd
is terminal FAILURE:193s build step/232s job, not conversion time. Compilation
reached manifest verification; emitted symbol map did not satisfy the strict
dlmalloc/dlfree fingerprint. Logs show selected dlmalloc system libraries, but
that is not proof of the final function names or allocation behavior. Required
names remain unchanged; no browser test or conversion ran, no artifact retained
(API total_count0), runner-owned build cleanup passed. No source fixture used.
Pinned SDK declares weak generic aliases for dlmalloc/dlfree; an alias naming
effect is a hypothesis, NOT the established cause. New bounded failure-only
diagnostic prints at most24 allocator-related emitted names,128 characters each,
actual total count and truncation. It never prints file/conversion data or accepts
generic malloc/free as allocator proof. One changed diagnostic build is warranted
to obtain missing actual names; no unchanged rerun or public promotion.
Changed diagnostic regression:447/447 units, TypeScript, scoped zero-warning
ESLint and diff checks pass. Original fingerprint requirements remain intact.

Measured encoder entry has2864640 aggregate free/unclaimed bytes split among
16 free regions, but neither exact plane request nor contiguous fit is proven.
Pinned FFmpeg8.1.2 [get_buffer.c](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavcodec/get_buffer.c)
keeps codec alignment, per-plane layout and16+STRIDE_ALIGN-1 padding; those bytes
and the existing exact layout/live-reference patches are unchanged. Emscripten
6.0.4 [settings](https://raw.githubusercontent.com/emscripten-core/emscripten/6.0.4/src/settings.js)
supports dlmalloc; its [implementation](https://raw.githubusercontent.com/emscripten-core/emscripten/6.0.4/system/lib/dlmalloc.c)
uses best-fitting tree chunks for large allocations. That justifies a changed
allocation-strategy trial, NOT proof of fit, less fragmentation or faster speed.

New explicit WITHIN_MPEG2_ALLOCATOR choice emmalloc(default unchanged)/dlmalloc
affects only private core allocation plus BOTH mandatory allocation-only unit
links. All retain fixed32MiB, no growth, guarded256KiB stacks,64KiB AVIO, one
codec thread, exact kernel/quality/dimensions/metadata/lifetime bytes. Existing
emmalloc-specific diagnostic mode rejects dlmalloc before SDK/owned-directory
creation rather than fabricate telemetry. Manifest checks actual emitted
allocator symbols, rejects mixed/mismatched maps, and hashes symbol artifact
alongside JS/Wasm; selection helper included in18 source pins/source bundle.
Compiled smoke is explicitly linked with the SAME selected allocator. No normal
native conversion, source resizing, baseline/threshold changes or public edits.
New workflow selector is private/off-by-default. Frozen workflow hashes remain
unchanged; exact paired input/environment reversal plus the original two unit
artifact-line reversals recovers every historical byte. Negative controls reject
partial/default/other/duplicate changes.9 focused tests, scoped lint/Bash syntax/
diff checks pass; actual old emitted emmalloc fingerprint also checked. Next one
changed non-Docker dlmalloc compile, small4 fidelity/adverse tests, then full
unchanged protected source gate. If it fails, record and do not retry unchanged.
Current447/447 units and TypeScript pass; no native/browser execution of dlmalloc
has occurred yet. Public assets/registry and executed historical proofs unchanged.

## 2026-10-06 — Private 64KiB AVIO tested; original frame-buffer heap failure

**Changed64KiB read-only diagnostic now identifies the encoder boundary.**
Non-Docker37359045127/job111928714852 atd37fff5 passed (305s compile/356s job,
NOT conversion speed);17 source/helper/artifact hashes, actual emitter imports,
9-transition reader and allocation-lifecycle smokes, fixed32/shared512/StackCheck2
verified. Downloaded only8 small static files, no source bundle. One full unchanged
original-file attempt failed at33947688,222785 input/zero output.203 captured
events=70 heap+128 pool+5 encoder release; no eviction. Pool128 cap REACHED, so
post-boundary pool inventory is incomplete, NOT silently complete. Heap96 and
release16 caps not reached. Five measured release groups retain live backing
278222/556444/556444/556444/556444 and cached0/0/0/0/0; known absent mbskip is NULL.
This proves current accessory uncaching at those boundaries, not total heap or
speed savings. The1163536-byte auxiliary entry now succeeds (5->6 checked-out,
same actual pool identity); no inference about all later auxiliary operations.
Last captured heap70/phase17/codec2/encoder=true enters default_get_buffer2 with
internal1952x836, pixel format0, empty frame buffers, free2836176+unclaimed28464=
2864640 aggregate bytes. Protected visible dimensions remain1920x804; internal
encoder padding is NOT source resizing. Exact failed plane/request/contiguous
fit remain NULL; pure fragmentation is NOT proven. No live refs may be released.

EARLYblank261844992/loaded330272768/native478019584/CIM464252928 =>206.16015625MiB
INCOMPLETE/instrumented, NOT acceptance;38 valid/0 unavailable/all descendants.
All5 finally flags true BUT cleanup.errors contains AggregateError, cause NULL;
unqualified cleanup success is NOT claimed. Independent subsequent check finds
all16 native/CIM-observed/owned PIDs absent, runtime/adapter gone, six assets exact,
original size/SHA unchanged. Preserve that reported error rather than deleting it.
Blocked download+scratch-cleanup shell command was rejected BEFORE execution;
that named scratch never existed and its deletion was NOT retried/bypassed.
Installed [gh2.76.2 source](https://raw.githubusercontent.com/cli/cli/v2.76.2/pkg/cmd/run/download/http.go)
shows owned temporary ZIP with automatic close/remove;
download used existing repository work as TEMP/TMP, ZIP independently absent.
Both hosted11366420557/11366515275 deleted/API0; reusable8 static files retained.
Frozen evidence/mpeg2-avio64-allocator-measured-2026-10-06.json binds raw395132/
SHA2131c47e...dfd58 and current read-only reducer/helper bytes. No browser/native
job remains live. Next source-audit padded frame reservation/free-block fit and
investigate changed fixed-heap allocation strategy or smaller specialist core;
do not repeat unchanged normal/diagnostic, increase heap, discard live refs,
resize source, relax quality or claim speed A/B. Full repeats/public/goal open.
Diagnostic evidence regression443/443 units, scoped zero-warning lint,
TypeScript and diff checks pass. Both read-only reducers reproduce the retained
facts without launching a browser or converting data. Historical proofs remain
unchanged. Original test.mkv size/SHA and repository-local cleanup independently
verified after the final diagnostic; no live build/browser handle remains.

**Executed changed candidate, not a speed or support certification.** Non-Docker
run37356848855/job111921324148 at41cc684 succeeded (248s compile/297s job,
NOT conversion speed). Actual17 source/helper/artifact pins, compiled lifecycle
smoke, fixed32MiB/shared512pages and StackCheck2 verified. Chrome154 small4/4
passed in21.7s:48 MPEG4-input and96 HEVC-input genuine MPEG2 frames, SSIM.992146/
.985963, <=1ms PTS, exact compressed AAC/artwork and complete decoded PCM/priming,
tags/chapters/full video/audio decode. Both321692/652521-byte outputs have the
same SHA as the previous candidate. Actual read/write/peakqueue64KiB, one pending
operation. Cancellation after232344 outputbytes reached471427 terminalbytes,
then partial[]; real write rejection cleaned up too. Four actual guarded256KiB
stack reserves are capacities, not high-water or memory acceptance. No speed A/B.

ONE full unchanged2958573265-byte1920x804/default-settings test.mkv attempt
failed at requested heap end33945192,222785 input/zero output. Normal stack now
shows av_buffer_allocz/avcodec_default_get_buffer2; exact failed plane/codec
context and post-policy accessory retention remain NULL. Do not infer them from
the earlier diagnostic layout or interpret changed input buffering as completed
additional frames.3 repeats requested/1 failed attempt; no unchanged normal retry.
EARLYblank271601664/loaded316125184/nativepeak460099584/CIMpeak469655552 =>
188.87890625MiB INCOMPLETE, NOT acceptance.16 valid native samples/0 unavailable;
all unknown/GPU/utility/updater descendants included. All5 finally flags true.
Independent22 full observed/owned and21 small observed PIDs absent; six exact
dist assets restored; candidate adapters, runtime and small fixtures absent;
original size/SHA31f36695...9db34 unchanged. Hosted11365825131/11364957204 deleted,
API0 independently rechecked; no source bundle download. No large output created.
Reusable small7-file tool retained; converted media/profiles removed by finally.

Frozen evidence/mpeg2-avio64-protected-failure-2026-10-06.json binds actual small
raw336844/SHA15bde4ac...04a0b and full341423/SHA0af8ed2a...7b164. Read-only reducer
and two source-bound guards keep requested393216-byte arithmetic separate from
NULL measured heap savings. Subsequent read-only allocator diagnostic above used
this changed64KiB candidate to identify the frame/context boundary and measure
actual post-policy accessory retention. Existing wrapped get_buffer2 snapshots
can distinguish encoder/decoder and allocation phases without changing lifetime,
quality, dimensions, heap or limits. No public promotion; broader goal open.
Evidence-cycle regression441/441 units, scoped zero-warning lint, TypeScript
and diff checks pass. No browser conversion or native build remains live.

Changed only the private generated wrapper's WITHIN_AVIO_BUFFER_SIZE from
256KiB to64KiB; existing output alias inherits64KiB. Requested initial reserves
drop524288->131072 bytes (393216 fewer), NOT measured heap high-water savings.
Both callbacks already clamp to their respective macros; reads/writes/seeking,
truncation/flush/backpressure/cancellation and artwork helper bytes unchanged.
Generator requires one exact original definition plus one output alias; reversing
the single scalar substitution recovers every bridge byte. Public AVIO source
SHAae501a2e...3068 and codec kernel67d3b829...eac0 unchanged. Manifest independently
checks actual generated C64KiB definitions and reports both limits accurately.
No source dimensions/settings/quality/timestamp/live refs/fixed32MiB/stacks or
acceptance threshold changes. Compiled/small4/original-file gate results above;
fit and I/O-crossing performance remain unproven. Do not treat requested-byte arithmetic as an actual
memory/speed improvement or use the prior failed core again unchanged.
Regression439/439 units, scoped zero-warning lint/TypeScript/diff checks pass.
New exact bridge reversal has its own tests; the historically pinned original
source-unit file and frozen proof hashes remain byte-identical. Unit scratch
removed in finally; native compile/browser execution are recorded above.

## 2026-10-05 — Artwork and cancellation pass; original-size codec heap failure

**Encoder-accessory candidate actually tested: small4 pass, full original still OOM.**
Non-Docker37354667903 at6715eab passed (246s build/295s job, NOT conversion
speed). Mandatory compiled lifecycle smoke passed; all17 source/helper/artifact
hashes and actual fixed32MiB/shared512pages/StackCheck2 verified. Real Chrome154
passed4/4 small browser tests in27.7s:48 MPEG4-input and96 HEVC-input MPEG2 frames,
SSIM.992146/.985963, <=1ms PTS, exact compressed AAC/artwork and complete decoded
PCM/priming, tags/chapters, full independent video/audio decode. Both output
SHA/size are byte-identical to the prior core (321692/652521); no speed AB claim.
Cancellation after349012 outputbytes reached732122 terminalbytes and then no
partial file; write-failure cleanup passed. All four measured actual stack bounds
are guarded256KiB; they are reserves, not stack high-water or memory acceptance.

Full original2958573265-byte1920x804/default-settings test.mkv still failed at
heap end33902168,353857 input/zero output, normal alloc_frame/av_refstruct_pool_get
stack.3 repeats requested/only1 failed attempt; no unchanged retry. Actual cache
retention after this patch and exact failing auxiliary pool identity are NULL,
not inferred from the previous instrumented layout. EARLYblank267337728 /
loaded334168064 /native473124864 =>196.25390625MiB INCOMPLETE/not acceptance;
14valid/0unavailable, every unknown/GPU/utility/updater descendant included.
All5finally flags; independent20 full +21 small observed/owned PIDs absent,
six dist assets restored, adapters/runtime gone, original size/SHA unchanged.
Hosted11362984911/11363808426 deleted/API0; no source bundle download. Converted
small files/fixtures/profiles removed by finally, no new large output created.
Frozen evidence/mpeg2-uncached-accessories-protected-failure-2026-10-05.json binds
both raw reports and actual sources. Next scoped experiment: smaller private
AVIO buffers (256KiB each currently524288;64KiB each131072,393216 fewer requested
bytes). That is not proven contiguous/later fit or performance; codec, quality,
source, live refs, heap and acceptance constraints stay unchanged. Goal open.
Current regression437/437 units; scoped zero-warning lint, TypeScript, Bash
syntax, exact source-only policy reversal and diff checks pass. No build/browser
job remains live from this cycle; no speed A/B or original-file success claim.

**Measured encoder-accessory source/lifecycle implementation (executed above).**
Private patch changes only idle-cache admission on final reference return and
the MPEG auxiliary pool flag selector. Only encoding/MPEG2/thread_count1 gets
reserved bit30; default, decoder and other-encoder pools keep stock caching.
Pinned upstream refstruct.h8e7be801...99b19 confirms no flag collision. Normal
reset/free/init-error callbacks, all live references, zeroing, table sizes and
codec algorithms remain upstream. No HEVC auxiliary allocation policy change.
Git/GNU0fuzz and two-file exact byte reversal pass; read-only diagnostic overlay
also applies/reverses without source weakening. First asymmetrical source hunk
failed GNU before dispatch; balanced context corrected and scratch removed.
Patch095c43cf...9f645, normal refstructe31af1df...2e084, diagnostic-overlay
616af422...633f1, MPEG pool initialization4a2b2d1d...45d9f.
Mandatory compiled Wasm allocation-only smoke in BOTH modes checks default cache
reuse, final-reference-only release, new entry initialization, reset-before-free,
owner uninit with live refs, zeroing, init-failure callbacks and overflow refusal.
No media/native conversion in this smoke. Manifest requires exact smoke schema
and actual native-source hashes; patch/smoke retained in corresponding sources.
Workflow additionally retains the smoke JSON; historical compiled hashes stay
unchanged and only exact reversal of both unit-artifact paths recovers the old
workflow. Negative guards reject missing/duplicate paths or any other change.
Small4 fidelity and compiled lifecycle are proven above; full-original fit and
speed remain unproven/failed. Do not promote public support yet.
Changed-source regression435/435 units and zero-warning scoped lint/Bash/diff
checks pass. One old frozen-workflow guard rejected the extra artifact path;
exact single-line reversal for that historical SHA now preserves the executed
workflow bytes without refreshing the old proof or accepting arbitrary changes.

**Actual post-release measurement: 278,222 inactive encoder-accessory bytes.**
Non-Docker run37340665849 at47a942a passed (232s build/298s job, NOT conversion
speed). All15 source pins, actual emitter import, 9-transition compiled reader,
fixed32MiB shared Wasm and guarded256KiB stacks verified. ONE full unchanged
test.mkv attempt still failed at heap end33904664; input353857/output0. Captured
196 ordered events:66heap/125pool/5encoder-release, no eviction/incomplete/cap
exhaustion. Five boundary groups measured live backing278222/556444/556444/
556444/556444 and inactive backing0/0/278222/278222/278222. Absent mbskip is
configured=false/null, not a failed zero. Last release has qscale6430 +mbtype
25672 +2motion98360 +2refindex24700 inactive requested bytes; live556444 is
required and MUST NOT be freed. Seven subsequent events reach HEVC tab_mvf_pool
failure without another encoder operation/get:5live/0cache, requested1163536,
free295380+unclaimed813368=1108748, minimum shortfall54788 BEFORE fragmentation
and unknown overhead. The inactive encoder entries are a measured recovery
candidate, not proof of contiguous fit, later allocation fit or speed.

Earlyblank250310656/loaded310964224/nativepeak479068160 =>218.16015625MiB
INCOMPLETE, NOT acceptance.35valid/0unavailable, all unknown/GPU/utility/updater
descendants retained. All5finally flags true; independent later check finds all
21 distinct owned/observed PIDs absent, six dist assets restored, adapters/runtime
gone, test.mkv2958573265/SHA31f36695...9db34 unchanged. An immediate earlier PID
check reported a live PID without identity output; immediate descendant absence
is NOT claimed. Both hosted artifacts deleted/API0; source bundle not downloaded.
Frozen evidence: evidence/mpeg2-encoder-release-measured-2026-10-05.json, with
actual raw481335-byte report SHA1212856b...d1b5 and source-bound reducer guards.
Next test only inactive MPEG2 encoder accessory uncaching; no HEVC auxiliary
mutation/live reference reduction/heap increase/source resize/unchanged retry.
Public support, full repeats/scaling/speed A/B and goal completion remain open.

**Read-only post-release implementation details (now executed above).**
Actual five-pool retention at the encoder release boundary was not covered by
last-seen getter snapshots. Audit pins MPEG encoder17eddac...99289f, picture
209b4d7d...d25a2, pool initialization80e1e845...95ca4, refstructd8936c...742f.
Picture reset normally unrefs accessory entries and refstruct normally caches
them; measured retained byte counts are recorded above, not an optimization
claim. Diagnostic-only addition calls a scalar reader after the original
cur_pic release, only for MPEG2/thread_count1. All upstream codec/lifetime bytes
otherwise unchanged; no allocation/free/reference mutation, no normal-core patch.
Source check passed Git +GNU0fuzz and exact byte-identical addition reversal.
Initial GNU check rejected asymmetric context; balanced context fixed before
any hosted dispatch. PatchSHAe8925b20...70d92; patchedencoderSHA2b166246...9fb57.
Exactly5 accessory records per event (mbskip/qscale/mbtype/motion/refindex),
maximum16 events,30 native scalar words,128-link reader cap. Absent pools
explicitly configured=false/null; incomplete, aliased, concurrent or malformed
groups unavailable/null, never valid0. Bounded browser total96+128+16=240;
per-event2KiB/history and report caps unchanged. Manifest checks actual upstream
encoder source state in BOTH modes; patch included in corresponding sources.
431/431 units,13focusedguards,zero-warning scoped lint/Bash/diffcheck pass;
all source-check scratch removed. Fixed32MiB/C+Asyncify256KiB/codec/kernel/
dimensions/quality/frames/I/O/baseline/publicassets and registry unchanged.
Native compilation and actual boundary bytes are proven above; successful
original-file fit, fidelity and performance remain unproven.

**Latest changed-layout pool diagnostic: five live MV entries, no cached entry;
stack reallocation still does not solve full-original fit.**
Non-Docker37337524566 at pushed ef4d1bc compiled successfully (281s build /
332s job, NOT conversion speed), with actual9-transition pool-reader smoke,
14 native source/helper/artifact hashes verified, same guarded256KiB C and
Asyncify reserves, fixed32MiB/shared512pages, unchanged codec/settings/kernel.
ONE full-original diagnostic attempt failed at requested heap end33903608,
input353857/output0. Captured191 ordered scalar events (66heap/125pool), no
evictions, incomplete statistics or cap exhaustion. Phase18 HEVC buffer then
first auxiliary phase19 directly identifies tab_mvf_pool:1163520 payload,
1163536 requested backing,5live/0cache,5817680 live requested bytes. Actual
free295380 +unclaimed814424 =1109804 upper bound, leaving at least53732 bytes
short BEFORE fragmentation/unknown allocator overhead. Other pools are not
simultaneously measured. No MV uncaching, dropped references, codec algorithm
rewrite, resize, further blind stack shrink or unchanged conversion retry.
Normal-core288321input failure above and instrumented353857input failure are
distinct actual reports; do not pretend their allocation layouts are identical.

Early blank254464000/loaded316928000/nativepeak465154048 =>200.9296875MiB
INCOMPLETE, NOT250MiB acceptance or a private-memory/speed saving.34 valid
native samples/zero unavailable/all unknown/GPU/utility/updater descendants
counted. Original SHA/size unchanged; all5finally flags and independent20
owned/observedPID absence/sixassets restored/private adapter/runtime absent
verified. Hosted11356967928/11357002856 deleted/API0/source bundle never
downloaded. Only7 reusable static tools retained locally, no converted media.
Compact evidence/mpeg2-guarded-live-pool-measured-2026-10-05.json freezes
actual source/manifest/rawhashes/191events/process peak; read-only reduction
script and strict null/count/chronology/nonacceptance tests retain the result.
Next audit independently required auxiliary lifetimes and actual inactive
encoder-pool retention at release before another memory optimization. Do not
infer idle bytes from stale per-pool samples. Full goal remains incomplete.
Measured-layout regression:428/428 units,8 focused frozen-evidence/stack
guards, zero-warning scoped ESLint and diffcheck pass. No public promotion.

**Guarded stack-reserve candidate compiled and tested: small fidelity passes,
full unchanged original still fails. Not accepted or public.**
Non-Docker run37334670866 at7a9a1f05 succeeded:194s build/246s job, not
conversion speed. All14 native source hashes, both artifact hashes and both
helper hashes verified; actual shared Wasm512/512 pages and compiled guard
imports/exports checked. Six small static tools retained only in the repository.
Required changed small4-case suite passed4/4 in20.2s. Actual native base/end
reported262144 in all4 tests; Asyncify262144/StackCheck2. Both genuine encodes
produce exact prior output hashes/bytes,48/96frames, SSIM.992146/.985963,
full native decode, complete decoded audio equality, exact packet/time/priming,
artwork/tags/chapters; real write failure and cancellation after232344 bytes
passed with no partial output/queued operations. This does not certify stack
high-water, memory acceptance or a speed gain.

ONE uninstrumented original2,958,573,265-byte1920x804/default-settings attempt
failed at av_refstruct_pool_get -> alloc_frame: requested heap end33902168,
input288321/output0. Three runs requested, stopped at first actual failure;
no further unchanged retry. Exact current auxiliary pool/live/cache bytes are
unknown in that normal report: the ordinary stack does NOT justify reusing the earlier layout's
five-live MV attribution. Early blank263700480/loaded305684480/native
peak460505088 =187.6875MiB INCOMPLETE, not memory acceptance or a saving;
16 valid native conversion samples/zero unavailable/all unknown and updater
descendants counted. Reserved-capacity reallocation alone did not solve fit.
All5 finally flags true; independent originalSHA, all21 small-suite IDs/all20
protected owned/observed IDs absent, six assets exact/private adapters and
owned profiles/runtime gone. Hosted11355607602/11355827172 deleted/API0;
source bundle never downloaded. Compact evidence is
evidence/mpeg2-guarded-stack-protected-failure-2026-10-05.json, with raw
timestampedJSON/CSV/HTML/trace hashes and read-only reduction script.
Next measure the changed-layout exact auxiliary pool/live/cache demand before
another optimization. Do not shrink stacks blindly, raise heap/relax quality
or retry this unchanged normal conversion. Public assets/registry unchanged.
Cycle regression:426/426 units and6 focused evidence/stack guards pass;
zero-warning scoped ESLint and diffcheck pass. No acceptance threshold changed.

**Historical source-stage implementation (now tested as recorded above).**
After measured live MV pool shortage (not an idle cache), reduce only private
core C/Asyncify reservations from1MiB each to256KiB each inside the same fixed
32MiB. Keep assertions; strengthen STACK_OVERFLOW_CHECK to2 (all native SP
assignments), rather than letting a smaller C stack silently overwrite heap.
Asyncify retains intrinsic overflow traps. No source/codec/quality/dimension/
frame/AVIO/queue/heap/baseline change and no public-engine/registry mutation.
Native kernel remains exact67d3b829...ac0. This is a candidate, NOT a proven
safe capacity, memory fit, performance saving or supported route.
Manifest inspects actual JS Asyncify size and real Wasm StackCheck2 handler/
limit-setter/bound exports. Both browser adapters read actual native base/end
after the real factory and enforce262144; this is reserved capacity, NOT
stack high-water. Source-pinned helper hash/source bundle retained. Exact
Emscripten6.0.4 source audit covers settings/libasync/libcore, no scratch.
The non-Docker uninstrumented build and changed small4-case fidelity/adverse
suite (required because stack safety changed) were executed above; unchanged
full original three-run gate stopped at its first actual failure. No blind old-core
retry, priming/timestamp tolerance change, dummy conversion or unsupported
profile narrowing. Full goal remains active.
Source-stage validation:424/424 units,10focusedguards,zero-warning scoped
lint/TypeScript/Bash/diffcheck and three exact6.0.4 compiler-source pins pass.
Both staging helpers refuse a mismatched adapter hash before changing assets;
small-browser reports retain at most16 scalar stack-reserve snapshots and
require the actual262144-byte native bound whenever this guarded core is used.
Reserved-capacity reallocation is not a measured private-memory saving.

**Latest: compiled pool reader and full-original diagnostic measured. Route still fails.**
Non-Docker run37331006755 at3a7cc234 succeeded after the recorded runner fix:
243s compile /290s job, not conversion speed. Actual compiled reader passed
all9 synthetic transitions, multireference/cache reuse/129-link cap/null pool.
Downloaded7 small static tool files ONLY into work/mpeg2-artwork-metadata-37331006755.
All14 native sources, helper and artifact hashes match; real Wasm import is
shared512/512pages (fixed32MiB). Source archive was not downloaded. Hosted
artifacts11354591463/11355006298 deleted; run API now returns zero artifacts.

ONE genuine production-browser attempt on the unchanged2,958,573,265-byte
test.mkv (SHA31f36695...9db34), original1920x804/settings/quality, failed:
input353857/output0, attempted heap end34702496. No complete conversion or
accepted profile. Early stable blank268255232, loaded309141504,
native full-tree peak473718784, increment195.9453125MiB BEFORE fatal stop.
This incomplete instrumented reading is NOT250MiB acceptance or a saving
versus another session. All unknown/GPU/utility/updater descendants counted;
19 valid native conversion samples, zero unavailable; frozen per-process peak.

Captured191 ordered scalar events:66heap/frame +125pool, no evictions, no
cap exhaustion or incomplete pool statistics. Final phase19 is directly
after matching HEVC phase18: pinned refs.c alloc_frame's FIRST auxiliary get,
tab_mvf_pool. Payload1163520/requestedbacking1163536 bytes per entry;5checked-out
entries (5817680 requested live bytes),0cached. Free307852/unclaimed15536,
so minimum shortfall840148 BEFORE fragmentation/overhead. Getter includes
the measured16-byte reference header, not allocator overhead (unknown/null).
No guessed multi-reference count or simultaneous state of other pools.
**Do not compile HEVC MV-pool uncaching or repeat this unchanged failing core:**
this exact pool has no inactive entry to release at the failure point.

Evidence: evidence/mpeg2-refstruct-live-pool-measured-2026-10-05.json (27.5KB),
raw445221-byte timestampedJSON/CSV/HTML/trace in outputs/reports,
scripts/freeze-mpeg2-refstruct-measurement.mjs reproduces compact scalar report.
Typed scalar-byte helper keeps incomplete/malformed/overflow samples null;
live/cached requested backing is not allocator-overhead or memory certification.
All5 actual cleanup flags true. Independently verified originalSHA unchanged,
owned runtime/profile/adapter absent, six production assets restored, all17
observed Chrome/updater descendants plus server/observer absent. No converted
copy remains; only compact diagnostics and explicitly reusable static tools.

Next distinct investigation: current recipe reserves1MiB C stack +1MiB
Asyncify save stack. Audit a smaller guarded reservation INSIDE the same
fixed32MiB; neither actual stack demand nor full-source fit is yet proven.
Emscripten's STACK_OVERFLOW_CHECK=2 checks stack-pointer assignments and
Asyncify traps on overflow; keep assertions, quality, frames, dimensions,
EARLY baseline, all-process accounting and every acceptance threshold.
Reference: https://emscripten.org/docs/tools_reference/settings_reference.html.
Pinned MPEG encoder source17eddac164020668201e0b6d25140cf1328db6ba953559587240d8c73199289f
also rejects direct frame sharing when height is not a multiple of16; original
804 meets that rejection. Do not change source dimensions/padding algorithms
merely to bypass it. No stack-reserve optimization or speed gain accepted.
Full original specification/M-04 remains partial; goal stays active.
This measurement cycle passes422/422 units, zero-warning focused lint and
diffcheck. New tests retain exact chronological pool attribution, requested
bytes/null semantics, incomplete memory status, all-process accounting,
compiled provenance and independent cleanup boundaries; no acceptance guard
or fidelity threshold was loosened.

**Earlier source-only implementation stage (before these native runs).**
Remote branch media-options includes diagnostic source commit f6f4ae4. The
non-Docker build workflow now also retains the small compiled-reader smoke
JSON alongside its manifest, with a source guard checking this artifact path.
Build 37329661532 at cb7fe075 is running. Full regression initially found
three historical workflow-hash failures after adding that retention path.
Their frozen evidence remains unchanged: a strict single-line reversal must
recover the exact old workflow hash; any other byte change or duplicate path
is rejected. No codec/build invocation or acceptance gate is exempted.
Regression now passes 418/418 units, including negative controls for extra
workflow changes and duplicate artifact paths. Focused lint (zero warnings)
and TypeScript pass. Six disposable dist media assets match published bytes
before browser staging. Compiled smoke and full-source measurement remain
pending; no new conversion, memory acceptance or speed claim yet.
Build 37329661532 completed with failure: actual patched libavutil and the
private core compiled, but the smoke report was empty and manifest JSON parse
failed. The .mjs suffix implicitly exported an Emscripten factory; direct Node
execution never invoked it. Synthetic reader execution was therefore NOT
proven. Fix: smoke .js in the existing CommonJS build root, explicit
MODULARIZE=0/EXPORT_ES6=0, assertions forced on, immediate nonempty-report
check and exact smoke schema in the manifest. Browser kernel and codec flags
unchanged. Hosted cleanup succeeded; artifact inventory zero; no browser test
or protected-media read occurred. Next build is changed, not a blind retry.
Previous fullfailure normalstack confirms av_refstruct_pool_get/alloc_frame,
but not actual pool/size/live/cache quantities. Added diagnostic-only getter
to pinned8.1.2 libavutil/refstruct.cSHA d8936c56db57fe53d9836e950563483104670c2fc98687f87fb497e078ba742f;
patchedSHA715cba26d3c68d65db8edf584f2dc3daae555de92f1003b5cfe3f32d6ddbb0b2.
Mutex-protected read ofpayload/requestedbackingbytes/checked-out entries and
actual inactive linkedlist. Poolcounter starts1 forowner; extra references
to the same live entry do not count as extra checked-out entries. Walkcap128;
incomplete/uninitialized counts becomeJSnull, notvalidzero. No pool ownership,
allocation/reset/free behavior or media changes. New getter compiled ONLY
whenallocatorDiagnostic1; all upstreambytes restored byremovingtheoneaddition.
Git/GNU0fuzz/source-byte reversal passes; two source-only hunk-context/count
errors corrected beforedispatch, allverifier scratch removed.

Existing96heap/frame events remainindependent; new128poolbefore/afterevents,
browsercollector224 bounded. Linkerwrapper delegates unchangedoriginalget,
captures precise poolidentity/size/counts beforea possibleabortingallocation.
Synthetic compiledlibavutil smoke tests9 known transitions, multiple refs,
cache reuse and129cached entries unavailable; not a native media converter.
Compiledsmoke/nativebrowser evidence **pending**, no measuredidlebytes/fit/speed
claim. Recipe/manifest/sourcebundle includereaderpatch, smoke and bounded
telemetry. **417/417units**,12focused guards, scopedlint/TypeScript/Bash and
diffcheck pass. Old single96-event collector guard was updated to assert
the independent96+128 native budgets and224 browser cap, not removed.
Primarykernel/options/quality/dimensions/fixed32MiB unchanged;
publicengines/registry untouched. Next diagnosticbuild then ONE fulloriginal
instrumented measurement, not another unchanged normalconversion or acceptance.

**Earlier strict small timeline gate passed; full original failed auxiliary heap allocation.**
Investigated the retained94ms scalar mismatch against exact pinned FFmpeg
8.1.2 sources AND the actual independent FFprobe revision7e3781e3ca. Matroska
reads zero-origin Segment Duration directly; fragmented MOV invalidates mvhd
duration and the generic demuxer estimates stream end minus start. In this
genuine HEVC fixture both actual audio endpoints are4.093seconds and first
videoPTS0.083seconds. Sourceheader4.104 has11ms endpoint error; outputheader
span4.010 plusstart0.083 exactly reaches4.093. No94ms content loss exists.
Historical raw failure/threshold/data stay frozen; no output-clock/header
rewriting or changed native artifact. Added independent bounded CFR/AAC
timeline validator: every video PTS and actual per-track audible start/end
<=1ms, exact packet clocks/counts/trim/full decoded PCM, and **BOTH** header
endpoints independently within the original60ms. Wrong headers, shifted or
lost frames, changed PCM/priming, unknowns and excessive histories reject.
This corrects unlike scalar definitions rather than increasing a tolerance.
`evidence/mpeg2-duration-semantics-2026-10-05.json` retains proper per-track
first/final vectors; initial source-only units using global edge ordering
failed, corrected without changing data or adding a native conversion.

One changed realChrome four-case suite on SAME compiled37302858907 artifact
**4/4passed20.1s**: both genuine48/96-frame MPEG2 outputs, exact bothAAC PCM,
art/tags/chapters/quality/actualtiming, realwritefailure/cancel cleanup.
Only then one unchanged full test.mkv1920x804/24fps/defaultcontrols/fixed32
run: **FAILED**,353857input/zerooutput, attemptedheapend34,701,056bytes versus
33,554,432 limit. Normal boundedstack av_refstruct_pool_get->alloc_frame,
HEVC auxiliary path; no further identical stack diagnostic needed. Three
repeats requested/one attempted, no validated output. EARLYblank265129984,
loaded329048064, nativepeak473137152/CIMpeak474566656/increment199.734375MiB,
19valid/zero unavailable native samples are **incomplete diagnostics**, not
memory acceptance. Updater descendants and unknown process types counted.
Allfivecleanupflags/sourceprepost exact; Chrome31968/server26192/observer6168,
smallChrome38488 and four observed updater descendants independently absent;
runtimeueOQ7h and generatedscratch absent, sixassets restored byte-exact.
Hosted373028 artifacts remainAPIzero; no new build/Docker/source archive.
Frozenactualsources/manifest/rawhashes/timing/PCM/safety/fullpeak breakdown:
`evidence/mpeg2-timeline-passed-protected-auxiliary-oom-2026-10-05.json`.
Source audit identifies HEVCtab_mvf_pool andrpl_tab_pool inrefs.c; actual
failingpool/livebytes/idlebytes **unknown**, no speculative cache-saving or
speed claim. Next bounded measurement must distinguish those pools before
an optimization; do not drop needed refs, alter codec algorithms/settings,
resize primary source, raiseheap or repeat unchangedfullconversion.
Current-source **414/414units**, ten focused guards, scopedlint/TypeScript,
six pinned timing-source checks and diffcheck pass. Publicengines/registry
unchanged; complete originalgoal stillopen.

**Earlier raw-scalar gate — compiled AAC priming fix passed audio but failed duration comparison.**
Non-Docker run37302858907/job111739487435 at a5e0b4459f762f529fa61049408ef696735488ca
succeeded332s job/291s native compile (not conversion speed). All12 native
sources/helper/artifacts and actual shared512/512pages verified; allocator
diagnostic off; WasmSHA037d8360118863b1affadac8c2852bf7688aa3b60d5d05fb92bdf139cba4606a.
One changed strict four-case Chrome suite: **3passed/1failed,27.7s**.
Both original MPEG4 and separate HEVC fixtures retain exact1024-sample AAC
priming on both tracks, exact compressed packet hashes, complete decoded
PCM hashes, packet counts95/189, PTS/DTS errors<=0.333ms. The original MPEG4
case passes all gates. HEVC retains96 genuine MPEG2 frames, SSIM0.985963,
full native decode/art/metadata and videoPTS error<=0.313ms, but format
duration4.104->4.010seconds differs94ms and fails the unchanged60ms gate.
Output format start now matches source0.083seconds. Exact audio repair is
not overall mux fidelity, memory, speed or public acceptance. No unchanged
retry and **no full protected conversion** while this small fidelity fails.
Investigate native fragmented MP4/edit-list/header timing; do not normalize
the validator, alter the positive-start fixture, quality, settings or heap.

Frozen actual executed-source hashes/manifest/timelines/decoded audio/packet
edges/safety/raw-report hashes: `evidence/mpeg2-aac-priming-passed-duration-failure-2026-10-05.json`.
Write failure and cancellation after genuine output pass. Generated media,
owned runtime/fixture scratch removed; all four production assets restored
byte-exact, private adapter absent, Chrome roots41180/36936 independently
absent. Protected test.mkv unused; original2,958,573,265-byte size/SHA checked.
HostedIDs11343276036/11342816457 deleted/APIzero; source archive not downloaded.
Latest six-file static tool retained solely for duration diagnosis, not a
converted media copy. Previously policy-blocked static files remain recorded;
no bypass/retry. New compact-proof guard initially assumed scalar partial
bytes; corrected to assert the actual empty file-size arrays and zero queues.
**410/410units** and scopedlint pass; no extra native conversion rerun.
The complete original goal remains open.

**Earlier source-only checkpoint — AAC candidate implemented, not yet compiled:**
Adds only MP4/fragmented/AAC/positive-initial-padding guard and edit-list trim
arithmetic. It preserves copied initial_padding in audio-track sample units
even when first DTS is rounded or positive; the negative/zero-delay branch
does not overwrite that exact trim with rounded timestamp-derived trimming.
Compressed packets/native packet clocks/codec algorithms/source settings/
dimensions/quality/fixed32MiB/I/O/auxiliary references remain unchanged.
No global iTunSMPB tag, audio decoding during conversion, invented packets,
full buffer or public-engine mutation. Sample-perfect fidelity remains
**unproven until browser/native validation**; duration threshold60ms and
frame/packet timing threshold1ms unchanged.

Pinned movenc.c originald7aa80a99efecf757100dbd6d9d7adb84d263cbeed0603873206975405907068;
after existing metadata patches e2d80222a7e8f4c42257540ed9ea011c6a8be7ac447cbf4ed60dae758319f509;
after new priming patch f93e901eef7867d56373d07afc32237e051f28cf64b2d9a0bca2474a36c0fcad.
Three-patch Git/GNUzero-fuzz application passes; reversing only the AAC
arithmetic restores every pre-existing metadata-stage source byte. Minimal
hunk-context variants failed source-only application and were corrected,
not dispatched as native builds. Verifier scratch/source artifacts removed.
Recipe and corresponding-source bundle include the patch; private manifest
discloses unproven priming candidate and exact staged source hashes.
Small browser validator now also computes source/output complete decoded
PCM SHA256 for both AAC tracks, while exact packet/trim/duration/quality
checks remain. **409/409units**, focused12/12, scopedlint/TypeScript/Bash
and source patch application/reversal pass. Next changed uninstrumented
native build and four-case small browser gate. No protected full retry until
small fidelity passes, no speed or memory acceptance claim.

**Latest HEVC-plane follow-up compiled; expanded correctness gate failed:**
Non-Dockerrun37299917049/job111729934445 at0769ecbc succeeded330s job/279s
native compile, not conversion speed. All11 sources/helper/artifacts/actual
fixed shared512/512pages verified; WasmSHA5f372026ef1c2491d55484e014896b32a89e293355ccdc794dd71a094379fa3b.
The old success fixture was MPEG4, so it could not validate changed HEVC
decoder lifetime behavior. Added separate deterministic320×240/24fps/96-frame
HEVC B2 correctness coverage, retaining the original MPEG4 fixture/settings,
AAC/art/text/chapter checks and all quality/timing/cleanup thresholds. Both
new four-case suites returned **3passed/1failed** (27.7s first coverage;
27.3s changed bounded packet diagnostic). HEVC produced all96 MPEG2 frames,
652,521 bytes/SSIM0.985963/full decode/exactAAC compressed hashes/artwork,
but **duration4.104→4.021seconds differs83ms**, exceeding unchanged60ms gate.
No failed route promotion and **no full protected conversion retry** while
this new small fidelity gate fails. Small tests never replace `test.mkv`.

Bounded per-track independent AAC packet diagnostics then show **all95/189
packets retained per track with zero PTS/DTS error**, but priming is not exact:
source1024samples→output1008 in zero-start MPEG4 case, and1024→0 in
positive-start HEVC case, both tracks. Interleave order changes, so comparisons
must group per track, not compare global mux order. Exact packet hashes do
not prove decoded audio trimming/timing. Pinned FFmpegmovenc.cSHA
d7aa80a99efecf757100dbd6d9d7adb84d263cbeed0603873206975405907068,
344,984bytes, `mov_write_edts_tag`line4089 derives trim from DTS/CTS; it
does not use copiedAACinitial_padding. This is the next private mux fix,
**not implemented or verified yet**. Do not normalize away the duration
failure or alter the fixture to hide positive-start timing. Add independent
decoded-audio/sample-trim validation before accepting any fix.

New `scripts/lib/copied-audio-timing.mjs` now independently enforces exact
SkipSamples/discardpadding, per-track clocks≤1ms/counts/durations, unknown
value refusal and a4096-packet small-fixture history cap. It is wired before
the unchanged duration gate. Retained genuine failure vectors reject both
trim-loss cases in focused units; **the strengthened browser guard has not
been rerun against the same known-bad muxer**, avoiding another identical
conversion. Four raw hashes/compiled manifest/actual executed-source hashes/
video timelines/packet scalar summaries/safety/next exact fix:
`evidence/mpeg2-hevc-small-timing-failure-2026-10-05.json`.
All generated media/profile/runtime removed and production assets restored;
hostedIDs11340866879/11340772001 deleted/APIzero/no source archive downloaded.
Exactcontained obsolete diagnostictool37295333393 sixfiles7,321,092bytes
deletion was policy-blocked before execution; no retry/bypass, static files
remain and are not converted copies. This is added to the older blocked
static-tool inventory. Full goal remains open; heap fit/speed/memory/public
acceptance are all unproven for this changed candidate.
Current-source **407/407units**, seven focused new/existing guards, scoped
lint and TypeScript pass. Four production assets independently restored to
their published hashes; all four observed small-test Chrome roots38276/39900/
8372/25124 independently absent, no owned small-test scratch directories remain.

**Latest encoder-cache candidate executed, not accepted:** non-Docker
run37297749321 atdea0e0ac succeeded269s job/223s compile (not conversion speed).
All10 source hashes/helper/artifact hashes and actual shared512/512pages
verified. Uninstrumented WasmSHAebbb59762f15b2a6a783f69d0dfbecfceeb3ee2b9082db5bca19a36dd20f1eed.
Strict Chrome gate **3/3 passed in13.3s**, identical321,692-byte output/SHA
74def572f4ff85144603c7fe579195e44cfc5417d63406d5eb530d377dbf6b4b,
48 genuine MPEG2 frames/ordinalSSIM0.992146/PTS≤1ms/all source container
tags/two exact AAC tracks/PNG250×140 retained; failure/cancel cleanup passed.
Small elapsed500.295ms is **not identical-setting repeated speed A/B**.

Full unchanged original1920×804/24fps/default controls/fixed32MiB retry
**failed before output**: input353,857/output0, attempted heap end34,551,456.
The bounded default stack already identifies **av_refstruct_pool_get →
alloc_frame**, different from the previous pixel-plane pool failure; no
extra identical/stack-diagnostic rerun was necessary. Attempted-end difference
is **not a measured heap saving**. Full-tree increment190.3046875MiB over
EARLY stable blank263,368,704 bytes (loaded312,078,336/native peak462,917,632)
is an incomplete-run diagnostic, not acceptance. All17 native conversion
samples valid/zero unavailable; all five cleanup flags true. PIDs35896/40944/
28240/runtimefXWCpu independently absent, original checksum/size independently
rechecked, no new disposable media/runtime remains. HostedIDs11339952854/
11340727443 deleted/APIzero, source bundle not downloaded. Frozen actual
manifest/executed sources/raw hashes/validators/whole-tree peaks:
`evidence/mpeg2-uncached-encoder-protected-failure-2026-10-05.json`.

**Next changed source candidate, not compiled or accepted:** a separate
source-pinned second patch adds only the HEVC codec-specific pixel-plane
uncaching predicate on top of the encoder patch. Every upstream size/stride/
alignment/padding/zeroing/live frame reference stays unchanged; HEVC auxiliary
reference pools, other decoder pools, algorithms/quality/options/heap unchanged.
Inactive decoder-cache bytes at failure remain unknown. PinnedFFmpeg buffer.c
SHA810049e1ac054af6870a5c58c02903f29a210732ecfe724b79ece8c8a18ad2ac
shows only last normal unref returns a backing plane to its pool; direct
AVBuffer allocation releases at that same lifetime boundary, not early.
Both Git/GNUzero-fuzz patches and exact two-stage reversals pass; final
get_buffer.cSHA910da6292a78066b114da7d26c7c1684969022960efc8becf116dc2b5acc4ab4.
Private manifest/source bundle disclose both cache policies, no public source
or published engine change. **403/403 units**, focused13/13, scopedlint,
TypeScript/Bashsyntax pass. Next uninstrumented native build, strict small
gate, then unchanged full original gate; saving/fit/speed are unproven.

**Measured LOW_DELAY follow-up and new allocation candidate:** diagnostic
run37295333393 at17c0d66 succeeded332s job/288s compile, not conversion speed.
Full original fixture/fixed32MiB yields **65 events, zero evicted**, final
HEVC1920×808 request: dynamic30,357,488/free24,400/unclaimed165,872 bytes.
Five completed encoder buffer requests each2,529,861 bytes (1952×836);
later requests reuse earlier backing allocations, but the snapshots do not
identify which buffers are inactive at the failure. **Idle encoder bytes
remain unknown**. No output, no accepted full conversion; diagnostic
191.42578125MiB increase is not memory acceptance. All cleanup flags true,
protected checksum unchanged, PIDs33840/3604/37240/runtimeyrY6XK absent;
hostedIDs11338687112/11337818921 deleted/APIzero, source not downloaded.
Frozen65 events/manifest/executed sources/raw hashes/actual peaks:
`evidence/mpeg2-low-delay-allocation-measured-2026-10-05.json`.

Implemented **private encoder-only uncached plane candidate**, still uncompiled:
source-pinned `get_buffer.c` adds plane-size bookkeeping and substitutes direct
AVBuffer allocation only for the sole enabled MPEG-2 encoder. Decoder pools,
every original alignment/stride/plane-size/padding calculation, zeroing policy,
active AVBuffer references, algorithms, source dimensions/timing/metadata,
quantizers/bitrate/GOP/threads and fixed heap remain unchanged. Inactive encoder
planes free on the last normal reference release instead of entering cache.
This is a hypothesis, not proven sufficient savings or speed benefit.
Patch/recipe/source hashes are recorded and included in corresponding source;
manifest explicitly states the allocation policy. Git/GNUzero-fuzz source
application succeeds, and reversing only three audited substitutions recovers
every original source byte; patched SHA62a73fe537318e4706f25904022d071e8f8ef9535b5334bf5c7b650e572c0478.
No rewritten codec algorithm or quality/reference reduction. Next uninstrumented
compile, identical strict small gate, then unchanged original protected gate.
Current-source regression **400/400 units**, scoped lint, TypeScript and Bash
syntax pass; pinned source-patch application/reversal passes. Independent
post-cycle original checksum/size recheck matches exactly. Public source and
published engines remain unchanged; no new supported route is claimed.
Candidate/evidence pushed as `dea0e0ac7a9f1f2551fa1468d62cdace83a05fce`.
Uninstrumented non-Docker **run37297749321**, job111722906711, is confirmed
in native compilation from10:38:03UTC, diagnostic0. Follow this same handle;
do not restart on observation expiry. Expected fresh local tool slot after
success:`work/mpeg2-artwork-metadata-37297749321`. Verify all source/artifact
hashes/actual shared512pages/newframeBufferPolicy, run strict small gate,
then unchanged full original protected gate. Earlier small pass does not
certify this changed allocator.

**Current compiled fix/result:** same non-Docker run `37293968193` at
`afa47d4` succeeded (350-second job/306-second native compile, not conversion
speed). Exact sources/artifacts/actual fixed shared 32 MiB verified, no native
diagnostic. Strict real Chrome suite **3/3 passed in 14.3 seconds**: every
source container tag including encoder/creation time now matches, exact
compressed PNG250×140/two AAC tracks, 48 genuine MPEG-2 frames, full decode,
≤1 ms PTS error, ordinal SSIM0.992146; 321,692-byte output. Write rejection
and cancellation after116,246 actual output bytes passed, no partial output
or terminal queue/pending operations. Generated media/runtime removed and
production assets restored. Hosted artifacts11338285895/11338285893 deleted,
APIzero/source bundle not downloaded.

The resulting **full original unchanged `test.mkv` retry failed** fixed-heap
OOM: attempted end34,985,384 bytes vs fixed33,554,432, 353,857 input/zero
output. No accepted full conversion or memory certificate: observed full-tree
increment192.65625MiB over stable EARLY blank263,901,184 bytes is diagnostic
for this incomplete run only. Loaded idle330,948,608, native active peak
465,915,904; 17 valid native conversion observations/zero unavailable. All
five cleanup flags true, protected pre/post checksum unchanged; PIDs42848/
5504/42676 absent, owned runtime`mpeg2-large-runtime-ZNpJpy` absent.
Normal raw:`outputs/reports/2026-10-05T10-10-41-311Z-private-mpeg2-protected-direct-native-100ms.json`.
LOW_DELAY is therefore **not proven fit**; no blind acceptance retry, resized
source, raised heap, omitted process or relaxed quality/metadata check.
Existing bounded deeper-stack diagnostic on this same native artifact is
running once (one attempt, cannot certify acceptance) to identify whether
the remaining caller differs from the previous encoder failure.
That diagnostic **finished failed with a changed caller**:
`ff_thread_get_buffer → alloc_frame → hevc_receive_frame → avcodec_send_packet`,
not the earlier encoder`prepare_picture`. Same attempted end34,985,384,
353,857 input/zero output, diagnostic increment198.2890625MiB, all cleanup
flags true; PIDs17816/27496/40884 and runtime`mpeg2-large-runtime-0FTq2h`
absent, source unchanged. Both executions and strict passed small gate frozen
in `evidence/mpeg2-metadata-passed-decoder-oom-2026-10-05.json`, including
actual simultaneous full-tree peaks, raw hashes and executed sources.
Exact resolved-target deletion of superseded static tool
`work/mpeg2-artwork-metadata-37291658159` (six files/7,318,040 bytes) was
policy-blocked before execution; no bypass/retry, static files remain.
No generated/converted media remains from these executions.

Changed bounded native allocator diagnostic **run37295333393**, pushed head
`17c0d66b21082c81a627cd4708d9272d22a4e365`, job111715103955, is confirmed
compiling from10:15:30UTC with diagnostic1. Same native kernel/options/fixed
heap, one full original-size diagnostic attempt after compile; follow this
same handle, no redispatch. The old52-event encoder evidence does not explain
the newly observed decoder caller. Pinned upstream`get_buffer.c`9530bytes
SHA38efe5e7fc627437306290919c8de3e2de5817d611b29d1f98e7ee6c12a8fb19
caches freed per-plane buffers; encoder-only uncached allocation with exact
upstream alignment/padding/zeroing is a possible next candidate, **not yet
implemented or proven sufficient**. No quality/reference/pixel/timing change.

**Latest strict small gate:** follow-up uninstrumented LOW_DELAY build
`37291658159` at `d7549ac` succeeded (353-second job/308-second compile,
not conversion speed). All source/artifact hashes and actual shared fixed
512/512-page Wasm verified, native diagnostic off. Real Chrome suite **one
failed/two passed in 19.3 seconds**: 48 genuine MPEG-2 frames, exact PNG
250×140 compressed artwork, two exact AAC hashes, full decode, ≤1 ms frame
PTS error and ordinal SSIM 0.992146 passed before the stricter container
field assertion found source `encoder=Lavf` missing. Creation time and
other Unicode fields matched. Cancellation after 232,261 genuine output
bytes and injected direct-write rejection passed, zero queued/pending bytes
and no partial output. No original-size run started on this known failure.
Small elapsed 497.57 ms is **not** a controlled speed A/B or memory certificate.

**Targeted metadata fix, compiled/browser validation pending:** source-pinned
FFmpeg 8.1.2 `mux.c` (48,534 bytes, SHA
`57b64d7a1d6d81d7ac05d79085e5f9b282bf1bba773b4200a64aeede6599b55a`)
removes container `encoder`/`encoder-*` during initialization under BITEXACT.
Initialize once explicitly, restore only those preflighted source fields,
then write the header without repeating initialization. No full dictionary
copy, disabled BITEXACT, altered encoder identity, skipped field check,
extra codec, heap growth, resolution/quality change or public promotion.
Exact kernel instrumentation audit updated only for these source lines;
executed old hashes remain frozen. Source/pinned patch checks pass, **394/394
units**, 15 focused guards, scoped lint/TypeScript pass. Next changed native
build then the same strict small gate; only after it passes may the full
unchanged protected memory/fidelity test proceed. Added compact-failure guard;
final pre-compile regression **395/395 units** passes.
The metadata fix is pushed as `afa47d45dba6f054a68c7dee71e19d5c0c028381`.
Changed non-Docker **run `37293968193`**, job `111710730694`, is confirmed
in progress in native compilation from 10:03:11 UTC, diagnostic zero.
Follow that same handle; do not dispatch a duplicate because observation ends.

Both build artifacts deleted/API zero, source archive never downloaded.
Owned runtime/fixtures/converted copies absent, both Chrome roots and test
workers absent, six generated asset hashes restored/private adapter absent.
Reusable 7.32 MB static LOW_DELAY tool retained for changed-build comparison;
not a converted file. Protected fixture unused/unmodified this cycle. Frozen
raw report/native manifest/executed-browser hashes and measurements:
`evidence/mpeg2-low-delay-metadata-gate-2026-10-05.json`.

**Measured native allocation follow-up:** non-Docker diagnostic build
`37243145719` at `db2e731` succeeded (319-second job/275-second compile,
not conversion speed), artifact/source/actual shared fixed 32 MiB verified.
Full original protected fixture produced **52 native snapshots, zero evicted**.
Three successful encoder padded frame-buffer sets (1952×836) each total
2,529,861 bytes. Fourth encoder request failed: dynamic heap 30,077,208,
free dynamic 20,180, unclaimed 446,152 bytes. Decoder buffer sets are
2,396,229 bytes at coded 1920×808 and coexist with encoder buffers. No output;
native stack now includes the real delegating buffer wrapper. Same original
source/settings, no allocator mutation or growth. All cleanup flags true,
independent PIDs/runtime absence/six asset restoration verified; protected
hash unchanged, both hosted artifacts deleted/API zero/no source download.
Raw SHA `7bcf485ca4266be3b17b183c6994296a65ced57c082748ad4c1ff4fa12201c37`.
Compact frozen build/manifest/52 events/source hashes:
`evidence/mpeg2-native-allocation-measured-2026-10-05.json`.

**Changed candidate, still unproved:** pinned FFmpeg MPEG-2 source permits
LOW_DELAY under normal compliance with no B frames; it sets input delay to
zero rather than one. Add only `AV_CODEC_FLAG_LOW_DELAY` to the existing
zero-B-frame encoder. No resolution, bitrate, frame-rate, quantizer, GOP,
thread, reference-decoding, frame-count or heap change. This targets one
retained input frame; it is not yet evidence that the full job fits or quality
passes. Diagnostic kernel SHA audit updated explicitly for these four source
lines; earlier executed hashes remain frozen. Next **uninstrumented** native
compile, then real small artwork/timing/decode/quality/cancellation gate,
then full unchanged protected process-tree gate. No public or speed claim.
Changed-candidate regression: **392/392 units**, scoped lint and TypeScript
pass. This does not prove native fit, fidelity or throughput.
Uninstrumented build **`37291658159` at `d7549ac`** is confirmed live in the
native compile step, diagnostic flag zero. Follow this same run, no restart.
Retained earlier small probes also reveal source container `encoder` missing
from output; the full protected gate already requires all compatible tags.
Strengthened the small gate to require every normalized source container tag
after independent fidelity/timing validation, and added deterministic creation
time to its synthetic metadata. Do not start an expensive full acceptance run
until this exact field gate passes; native low-delay fit alone is insufficient.

Follow-up **changed stack-instrumentation diagnostic** on the full original
fixture identifies `prepare_picture → ff_mpv_encode_picture` as the native
caller of the failing pooled frame allocation during `avcodec_send_frame`.
It is the MPEG-2 encoder frame path, not an observed HEVC decoder failure or
destination buffering. Same native artifact/settings/resolution/fixed heap;
48-frame stack maximum, 8192-character stack split into fixed 1600-character
chunks, no arbitrary history. Diagnostic mode cannot certify acceptance and
stops after one attempt. Failed run again 353,857 input/zero output; full-tree
diagnostic increment 204.4140625 MiB is not an accepted conversion measurement.
Raw/source hashes frozen in `evidence/mpeg2-encoder-allocation-diagnosis-2026-10-05.json`.
All cleanup flags and owned PIDs/runtime absence/six exact-restored assets
verified. No smaller source, file changes, heap increase or hidden retry.

Next diagnostic implementation is opt-in and leaves the exact failed kernel
byte-identical except inserted measurement calls. Linker wrapper delegates
the real `avcodec_default_get_buffer2` unchanged, recording at most 96 native
heap/frame snapshots with 32 fixed free-block buckets each. Encoder/decoder
role, actual request dimensions and buffer bytes expose the allocation budget;
no media data, allocator mutation, trimming or codec-option change. Generator
requires exact kernel SHA and refuses unknown modes/existing outputs. Native
non-Docker build and real original-size diagnostic execution still pending;
12 focused source/instrumentation guards pass. No new conversion acceptance.
Full regression initially passed 389/391: the two failures were stale
current-workflow maintenance hashes in older SAD/VAA arithmetic records.
Updated only their `currentSources` workflow entries, leaving all executed
source hashes, reports and measurements frozen. Scoped lint/TypeScript/Bash
syntax pass; a native compile is still required to prove instrumentation.
After that maintenance-only correction, **391/391 unit tests pass**.

Non-Docker build `37241593281` at `30d23be` succeeded (275-second job,
227-second compile, neither conversion speed). All native-source/artifact
hashes verified; actual Wasm remains shared fixed 512/512 pages (32 MiB).
Changed real Chrome artwork/safety suite **3/3 passed in 12.4 seconds**:
48 genuine MPEG-2 frames at original synthetic 320×240/24 fps, full decode,
ordinal SSIM 0.992146 with independent ≤1 ms timeline gate, two exact AAC
packet hashes, exact compressed PNG 250×140, Unicode arbitrary metadata,
no unknown/empty video track. Direct write rejection cleaned up. Added genuine
cancel-after-written-output coverage: 232,357 bytes observed before Cancel,
471,536 bytes at cancelled termination, zero queued/pending work, no partial
file left. Synthetic fixtures are safety/correctness evidence, not scaling.

Then ran the **full unchanged protected test.mkv**, 2,958,573,265 bytes,
1920×804/24 fps HEVC, through production browser selected-handle I/O.
The repaired artwork header exposed a **new actual fixed-heap OOM**:
`av_buffer_pool_get → av_buffer_allocz → av_malloc/emmalloc` requested heap
end 34,794,192 bytes against 33,554,432 bytes. 353,857 input bytes, zero
output, no completed encode. No downscale, altered settings, growth or heap
increase, no unchanged retry. Exact live decoder/encoder allocation caller
is still unproved; do not claim a universal impossibility from this candidate.

Mandatory independent 100 ms whole-Chrome observer: EARLY clean stable blank
262,422,528 bytes; loaded idle 304,979,968 (not substituted); native active
peak 458,326,016, increment 186.828125 MiB, 13 valid/0 unavailable samples.
An incomplete failed job is **not** large-output or primary-memory acceptance.
All five cleanup flags true and independently checked: owned Chrome/server/
observer PIDs absent, runtime absent, all six dist engine assets exact-restored;
protected source pre/post SHA unchanged. Generated media/profiles removed.
Both hosted artifact IDs deleted/API zero; source bundle never downloaded.
Earlier policy-blocked obsolete static tools/cache are untouched, no bypass.
Exact resolved-path cleanup of the now-superseded six-file static tool slot
`work/mpeg2-artwork-metadata-37240916978` (7,317,403 bytes) was also blocked
before execution; left untouched, no retry/alternate mechanism. It contains
no converted media. Current tool retained for the next allocation diagnosis.

Frozen compile/browser/failed protected source hashes and raw diagnostics:
`evidence/mpeg2-artwork-passed-protected-oom-2026-10-05.json`. Next: bounded
allocation diagnosis at original resolution, then a changed candidate gate.
No public promotion, speed A/B, repeat/scaling/release or full-goal completion.
Verification after the changed safety test and frozen evidence: **388/388 unit
tests**, TypeScript and scoped lint pass. These are regression checks, not a
substitute for the failed original-size browser acceptance.

## 2026-10-05 — MPEG-2 controls gate, adapter failure diagnosed

Changed build `37239956075` at `0398ad1` compiled successfully (282-second
job, 232-second compile; neither is conversion speed), exact manifest hashes
verified. Actual unchanged fixed 32 MiB shared heap and sole MPEG-2 encoder.
The new attachment browser suite **failed 1/2**: header dimensions now work
and encoding finishes (321,436 output bytes), but independent FFprobe found
the compatible cover missing. Injected bounded write failure passed; generated
fixtures/output/profile/scratch removed and assets restored. Raw first failure
`2026-10-04T22-30-45.041Z-mpeg2-candidate-output-artwork.json` SHA
`00d87b755cb78f7f0a788c11c45e36a5f7fb8001c7679e10166088a14498fea3`;
separate fault pass SHA `9a9cf423074606935ccdba2439ca696355ccf59da6cab8d63d9cc8663f042aa0`.
No accepted artwork output, protected retry, primary memory or speed claim.

Pinned FFmpeg 8.1.2 `movenc.c` confirms `use_metadata_tags` selects mdta and
bypasses the iTunes `covr` writer. Do not merely turn it off and lose arbitrary
fields. A separate hash-pinned private mux patch writes original UTF-8 keys
and values in iTunes free-form `----`/mean/name/data items alongside the normal
cover writer, using the existing seekable bounded header buffer. No duplicate
meta boxes or new image decoder. All copied text (container/streams/chapters)
is preflighted at 4096 entries / 2 MiB aggregate, with explicit safe refusal.
The changed small test also requires arbitrary WEBSiTE and Unicode-key text,
and now records independent probes before assertions to preserve diagnostics.
This further changed candidate must compile and pass, with no unchanged large
rerun while artwork is unproved. Public modules remain unchanged.

Build `37240697891` at `3514906` failed after 46 seconds, before compilation:
the second patch hunk could not apply. Web-rendered line offsets differed from
the actual pinned source. Corrected exact raw-source line numbers and expanded
function context; **both git and GNU zero-fuzz dry runs pass** against the
SHA-verified actual upstream file. New diagnostic helper deletes its owned
downloaded source/scratch in finally. This is a changed patch, not a repeated
unchanged build; no codec settings/heap/quality change.

Both hosted artifacts from the completed header-only build were deleted and
API total zero verified; corresponding-source bundle never downloaded.
Deletion of obsolete local `work/mpeg2-attachment-baseline-37237343519` and
`work/mpeg2-candidate-output` was policy-blocked **before execution**. About
14.6 MB static tools remain, no alternate delete/move/overwrite attempted.
New downloaded artifacts use a fresh explicit repository-local
`mpeg2-artwork-metadata-<run-id>` tool slot; private staging/test paths reject
arbitrary names/drive paths. No converted media remain from either small run.

Corrected non-Docker build `37240916978` at `32aa5bd` succeeded (291-second
compile; not conversion speed), verified native/source hashes. Changed browser
suite still **1 failed / 1 passed**: PNG 250x140 attached art and arbitrary
WEBSITE/Unicode-key text are now present, but fragmented MP4 also contains an
empty unknown video track at index 3. The validator's ordinal v:1 therefore
hashed that empty track, not actual attached PNG index 5. Output 322,184 bytes,
SHA360d82d6..., 48 genuine MPEG-2 frames; no full acceptance claimed.
Raw failed report SHA6d043a3f... and separate write-fault pass SHA7287fa18...
remain frozen in compact investigation evidence, with full executed manifest.
Fixtures/outputs/profiles/scratch removed, dist restored; no protected retry.

New source-pinned patch excludes metadata-only covers from fragmented trak/trex,
retaining covr bytes and arbitrary text. Validator now selects the independently
probed attached-picture index and rejects all unknown/empty tracks or extra
real video/cover streams. Both patches verified in exact build order using
Git checks and real GNU zero-fuzz application against SHA-verified original
source, in finally-cleaned owned scratch. Nine focused guards, lint, TS/Bash
pass; complete latest pre-fix suite387/387. No memory/quality/metadata threshold
relaxation, no Docker/public profile promotion, full goal still incomplete.

Continuation after pushed `1eb7479` is progress, not an unchanged retry.
The private generator now includes the exact JPEG/PNG header reader from the
hash-pinned audited core. It fills attached-picture dimensions from compressed
attachment headers before mux creation, without image decoding, new file reads,
larger probing/heap or media exclusion. Invalid/unbounded dimensions refuse
explicitly. Freshly encoded video now has its own encoder tag, preserving the
original tag separately rather than mislabeling MPEG-2 as source MPEG-4.
New dedicated browser artwork suite compares compressed PNG hashes/dimensions,
real MPEG-2 codec, audio, timestamps, quality, metadata and cleanup. Native
rebuild/browser execution pending in non-Docker run `37239956075` at pushed
`0398ad1`. The protected validator additionally requires compressed-artwork
hashes, compatible track counts/audio layouts and language, container/video
metadata, primary video dispositions, aspect/color/rate fields and full decode
including attached art. These strengthen acceptance, not thresholds relaxation.
Four focused protected guards pass; complete units 385/385 before the added
guard, now pending next regression. Old static candidate moved, not duplicated,
to `work/mpeg2-attachment-baseline-37237343519` while the changed build runs.
Source gates 4/4 after one diagnosed
generator-boundary failure (forward declaration mistaken for definition).
Old executed evidence remains frozen; only its current unit-source maintenance
hash updated. Public modules unchanged, full objective still incomplete.

Status: **Partially implemented under M-04/M-05**. Previous turn was progress:
native compile and genuine small MPEG-2 browser outputs were retained/pushed at
`9d46dff`. Both objectives reread, clean worktree and protected fixture rechecked.
No unchanged old codec/remux retry, no native rebuild or public promotion.

Separate control adapter/test preserves the executed small-gate sources and
uses the production scalar controls for requested 320-pixel width, 2 Mbit/s,
15 fps and higher quality on a genuine 640x360/24fps source. First run failed
before any input/output or Wasm progress, code -28: the test adapter incorrectly
assumed production MPEG4 codec code **1**, but `videoCodecCode` defines **3**
(1 is VP8). The private kernel correctly rejects a nonzero encoder-selector
sentinel; this is an adapter error, not codec/memory acceptance. The separate
write-failure case passed. Both per-worker raw reports and failure artifacts
are retained, generated media removed and dist/scratch restored/absent.

Changed adapter now aliases only exact code 3, without changing requested
scalar options, quality, output codec, native heap or limits. Focused source
regression binds the mapping to the production codec function. Identical
requested-control retest passed **2/2 in 10.3 seconds**, including injected
write failure. Genuine MPEG-2 output is 320x180, 30 frames at 15 fps,
209,838 bytes; ordinal SSIM **0.996871**, independent full decode and both
exact AAC packet hashes passed. This is small correctness, not a speed A/B
or primary process-memory certification. No failed record is overwritten. Protected
`test.mkv` remains exactly 2,958,573,265 bytes/SHA31f36695... and is 1920x804,
24fps HEVC with 5.1 HE-AAC/SubRip/PNG art, 12,340.096 seconds. Its full original
resolution/timeline will be used for the new large gate, not a cropped source
or implicit resize. Goal remains active.

The full original protected fixture was subsequently exercised through the
production browser input/direct selected-handle pipeline, with a fixed
32 MiB candidate and native 100-ms whole-Chromium-tree sampling. It **failed**
after 353,857 input bytes and **zero output bytes**: bounded probing could not
determine PNG attached-art dimensions, and MP4 header creation returned
"dimensions not set" / Invalid argument. This is not an observed heap OOM.
SubRip exclusion was disclosed. Early stable blank was 233.668 MiB, loaded
idle 295.039 MiB, and the incomplete conversion peak increment was 187.473
MiB; none constitutes accepted large-file conversion or memory certification.
Three repeats, clean sessions, full output validation and scaling remain pending.
Do not rerun the unchanged failing candidate. Next diagnosis is bounded
attached-picture parameter preservation, followed by a genuinely changed test.

All five cleanup flags passed. Independently checked own Chrome/server/observer
PIDs absent, unique runtime directory absent, six generated dist assets exactly
restored, protected fixture size/hash unchanged. Compact record:
`evidence/mpeg2-controls-and-protected-failure-2026-10-05.json`.
Current unit suite **385/385**, changed-source ESLint and TypeScript pass.
No Docker, no public route promotion, no full-goal completion claim.

## 2026-10-05 — Fresh MPEG-2 encoder candidate, source gates

Status: **Partially implemented under M-04; private native compile and browser
acceptance pending**. The previous push-only turn verified remote state, not
implementation progress. Reread both authoritative files and revalidated the
clean worktree. No unchanged H264, blank-control or protected-remux retry.

Added a separate `mpeg2-candidate.c` and source-hash-checked generator using
the unchanged audited bounded AVIO prefix. Genuine video decoder/encoder
send/receive, compatible secondary packet copying, chapters, metadata,
side-data, aggregate attachment limit and explicit exclusions are retained.
Single codec thread, zero pthread pool and fixed **32 MiB** Wasm; no input/output
MEMFS, external codec, native conversion, network or automatic resize.
User-requested width, bitrate, quality and frame-rate cap are carried through;
display aspect ratio is adjusted for requested even-height rounding.

MPEG-2 is not OpenH264 with a renamed output: the encoder is FFmpeg's native
`mpeg2video`, MPEG-2 quantizer ranges are used, and its time base is the inverse
sequence frame rate. Primary-source inspection of pinned FFmpeg 8.1.2
`mpeg12enc.c` confirmed the normal-compliance rate check; experimental rate
acceptance is not enabled. Source start offset is restored after packet
rescaling to avoid losing sub-frame start precision. A rational accumulator
implements requested rate caps rather than greedy spacing that underproduces
24-to-15 fps. The candidate currently refuses variable-rate source timing and
full-range video with clear errors; other bit-depth/chroma conversion is
disclosed. These are private feasibility restrictions, not measured reasons
to remove the broader requested capabilities from the goal.

Separate pinned FFmpeg 8.1.2/Emscripten 6.0.4 recipe and manifest enable exactly
the MPEG-2 encoder, disabled network/filesystem and a small video-decoder
inventory. Source/patch/artifact hashes and actual enabled components are
recorded. New non-Docker workflow choice retains only the candidate and a
separate corresponding-source archive for one day, with always-run cleanup;
no media fixtures or user data go to CI. Local tests create/remove only their
fresh `work/mpeg2-source-unit-*` directories; no converted media generated.

Focused source/generator checks **5/5** (three MPEG-2, two unchanged H264),
changed-JS lint, Bash syntax and whitespace checks pass. These prove source
generation and guards, **not native compilation, genuine browser conversion,
fidelity, speed, process-tree memory, repeats/scaling or legal clearance**.
The manifest lists those unpassed gates, and no public route/UI/engine was
changed. Next: compile this new candidate once, inspect its actual artifacts,
then execute production-browser validation and unchanged memory/fidelity gates.
The full goal remains active.

Changed candidate compiled successfully in non-Docker hosted run
[`37237343519`](https://github.com/tanishqbaweja/fileconverter/actions/runs/37237343519)
at pushed `4a92f2b`: 228-second job / 187-second compile step, **not conversion
speed**. Actual binary imports fixed shared 512/512 pages (32 MiB), with exactly
the MPEG-2 encoder and nine native video decoders including dependency selections.
Artifact/source hashes verified. Small production Chrome correctness suite
**3/3 in 14.4 seconds**: MPEG-4 sources produced genuine MPEG-2 in MP4 and MKV,
plus direct write rejection. Each output has 48 frames at original 320x240,
two packet-identical AAC tracks/languages, Unicode title/chapter, complete
native decode, <=1ms timestamp differences and corresponding-frame SSIM
**0.992146**. MP4 output 320,957 bytes / 0.516s; MKV 317,933 bytes / 0.494s.
These small-job times are not an A/B optimization or large-file speed claim.
Reads <=256 KiB, writes/queue <=82,317 bytes, one pending operation and terminal
zero; no forbidden requests. Small non-stable-blank CIM diagnostics do not
certify the primary 250 MiB contract. Controls/repeats/scaling/protected fixture/
native-memory/cancellation/reproducibility/legal/public integration still gate
publication. No public route was added or engine overwritten.

Finally hooks removed generated small sources/validation copies and empty OPFS;
four dist files are restored to exact public hashes, private adapter absent.
The first wrapper falsely printed full runtime cleanup: parallel restoration
and removal allowed its Node compile-cache child to recreate **7,972 bytes**
at `work/mpeg2-runtime-gIYkGj`. Exact checked PowerShell removal was policy-blocked;
no alternate deletion/move attempted. Wrapper now awaits restoration/cache
flush before removal and checks terminal absence. A **restoration-only** smoke
verified fresh `work/mpeg2-runtime-6QQRpp` absent and exact dist restoration;
no unchanged browser conversion rerun. Old blocked targets remain untouched.
Hosted artifacts 11315762948/11315568584 were deleted after hash/provenance
recording, API count **zero**, source archive never downloaded. Only the new
7,314,979-byte static candidate is retained for the next real large gate.

`evidence/mpeg2-encoder-small-browser-2026-10-04.json` retains source/artifact/
raw-report hashes, compile steps, actual small-job fidelity, failed cleanup,
fixed ordering smoke and explicit unpassed gates. Its wrapper hash is recorded
**after** the repair, not passed off as the original wrapper bytes. The 77,783-byte
raw report remains local. Regression initially failed two stale older arithmetic
workflow current-source indexes; only those indexes were refreshed, executed
proofs/raw artifacts frozen. Then **378/378** units and the 405-profile/no-PDF
manifest passed; final source/evidence guard regression follows. Protected
fixture remains 2,958,573,265 bytes/SHA31f36695... . Next is changed MPEG-2 control,
full-tree-memory and actual large-file testing, not a repeat of old H264/remux.

Final focused regression: **381/381** unit/evidence checks, full lint,
TypeScript and whitespace gates pass; public manifest remains 405/no PDF.
The real build/browser/helper handles are terminal, not waiting or retried.
M-04 and the full objective remain partial/active.

## 2026-10-05 — Future profiler runtime scratch ownership verified

Status: **Partially implemented under A-09; general-profiler helper ownership
implemented and focused helper lifecycle verified**. Previous goal turn was
progress: pushed `b4c8db6` retained three genuine protected-fixture remuxes and
stronger memory readings. Revalidated the clean branch and reread the complete
objective/specification; no unchanged large conversion or native codec build.

`scripts/lib/owned-runtime-scratch.mjs` creates only a fresh unpredictable
repository `work/profile-runtime-*` child, validates the approved canonical
work path and checks original directory device/inode/real path before deletion.
It never sweeps/reuses old paths. General profiler server/Chrome/independent
validators now inherit its TEMP/TMP/TMPDIR, scoped Node compile-cache and
Wrangler log paths. Existing profile creation moved inside the guarded try;
only a successfully created profile is owned/removable, so an existing profile
cannot be deleted after a failed mkdir. Independent finally cleanup attempts
profile, observer scratch and runtime directory even if one fails; aggregated
errors stay failures. New report/recorder fields distinguish pre-cleanup
reporting from independently verified terminal scratch absence.

A separate `loaded-navigation` phase is now marked before converter navigation,
instead of labeling that loading interval as native blank-baseline history.
The actual EARLY CIM blank baseline, stability requirement, primary formula,
full tree, limits and measurements are unchanged. The older raw native phase
labels/peaks remain frozen, not retroactively renamed or inflated into a baseline.

Four focused unit cases exercise a real failing child, concurrent independent
scratch ownership, idempotent close, invalid target prefixes and attempting
all cleanup actions despite failures. A changed real production Wrangler
4.92.0 helper smoke passes **two** scenarios: HTTP startup and an injected
caller failure. Same production COOP/COEP/CSP headers and converter HTML;
each created and finally removed a 9,029-byte local log and 47-byte local
update-check file, **18,152 bytes total**, plus runtime directories. No new
shared `work` entries, no file selection/conversion. Node compile-cache path
was confined but zero cache files were observed; no creation is fabricated.
First helper smoke wrongly required such a file after force stop and failed;
its report retained. Changed assertion requires confinement and actual
generated-scratch cleanup, not optional cache creation. Both server trees were
owned/force-stopped, not claimed graceful exit. No Docker/browser conversion/
memory/speed acceptance is inferred from this helper test.

Compact evidence `evidence/owned-runtime-scratch-2026-10-04.json` binds actual
helper/primitive hashes, dependency, exact generated files, cleanup and failed
assertion; raw reports `2026-10-04T21-18-18-982Z-owned-runtime-scratch.json`
and `2026-10-04T21-19-28-128Z-owned-runtime-scratch.json` remain under
`outputs/reports`. Older blocked two empty miniflare directories, 47-byte
update-check file and 95-file/294,108-byte cache untouched; no deletion/move
bypass. Protected `test.mkv` size/hash rechecked; no media fixtures/copies made.

Only prior remux evidence's current-source maintenance index was refreshed;
executed d14d4b0f harness hash, raw artifact hashes, early baseline, native/CIM
peaks, output/fidelity/recovery and cleanup inventory are frozen. `git show`
at `b4c8db6f92be0f13f7eaeb25b65edba649aa13b6` independently reproduces that
exact executed hash. New validator-environment wiring was added after the
helper smoke; its current index is distinct from recorded source hashes and
source-checked, not represented as a new remux execution. Ten focused checks
and changed-source lint pass; final proportionate regression/ledger update follow.
A-09 remains partial for other harnesses, perturbation and full release gates;
all original codec/control/legal/scaling/manual/browser requirements remain.

Final checkpoint: **375/375** unit/evidence tests, full lint, TypeScript,
405-public-profile/no-PDF manifest and whitespace checks pass. Both accepted
helper server PIDs/trees are stopped and new owned scratch is absent; protected
fixture remains exactly 2,958,573,265 bytes/SHA31f36695... . The two real helper
checks deleted only their own generated logs/update-check data (18,152 bytes),
not user media or blocked historical directories. No additional conversion,
production engine rebuild or public capability change. The full goal remains
active; next work is remaining codec/control requirements and other harness
adoption, not another unchanged protected remux/H264 or blank-control rerun.

## 2026-10-05 — General production profiler native peaks and protected-fixture gate

Status: **Partially implemented under A-09; general Windows production stress
profiler integration and one three-repeat selected-handle session verified**.
The last push-only checkpoint verified remote synchronization, not completion
of the remaining specification. Revalidated the clean branch and read both
authoritative files before this changed implementation/test cycle. No Docker,
private H264 retry, native codec build, smaller substitute or public promotion.

`scripts/memory-profile.mjs` now requires parallel 100-ms native whole-tree
observation before the EARLY blank baseline, alongside existing CIM/realm,
buffer/queue/Wasm/SAB/storage/throughput diagnostics. An independent serial
pump drains through browser/validator waits. Primary uses the larger actual
native/CIM simultaneous conversion peak; no lifetime-process-maxima sum or
CIM-only acceptance fallback. Missing reads stay null; overflow, gaps or
observer/coverage failure fail explicitly. Shared CIM validation rejects a
missing root instead of accepting an empty zero tree. Blank/loaded/recovery
must actually be stable; the previous unstable last-reading fallback is
rejected. Baseline remains EARLY, with the same five-reading 2% stability test
and at least eight seconds of observation, not enlarged/prewarmed/delayed to
the three-minute utility event.

New bounded native phase summaries retain actual private and RSS peak process
rows, counts, last snapshots and unavailable examples. A 4,096-bucket one-second
graph ring may evict old graph detail, explicitly counted, but never evicts a
phase peak. 512 identities/128 phases/256 transitions and the native queue/
process/response caps are explicit. A synthetic 60,000-reading/100-minute unit
case retains an early peak after 1,905 graph evictions; this is collector
testing, not a substitute video conversion. The first concurrent pump test
used a fragile 60-ms wall-time assertion and left its mock alive after failure;
the focused runner was stopped, then the test was changed to bounded progress
waiting and finally cleanup. No correctness, memory or quality threshold changed.

Actual changed gate: production Chrome 154.0.8037.93 on the preserved
**2,958,573,265-byte `test.mkv`**, SHA-256
`31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34`,
three real MKV-to-MP4 selected-handle jobs in **33.054/35.101/43.604 seconds**.
Each produced **2,962,151,522 bytes**, identical SHA-256
`aff831693c020c02a0163e25d0f08a7529d0fb0e4022f0cb984c60d90348334a`.
Independent structural inspection and full compressed HEVC/AAC packet hashes
match the source. This is genuine **stream-copy remuxing, not re-encoding**;
there is no new codec optimization/speed A/B. Source subtitle/artwork exclusions
remain the existing disclosed route rules, not preservation of every source field.
Headless adapter supplies a real OPFS directory handle to the production
selected-handle/staged-copy path; not native OS picker/manual physical-drive proof.

EARLY stable blank **248.367 MiB** by browser age 15.801 seconds, loaded idle
**313.680 MiB**. Complete-tree primary increments **236.500/233.242/200.441 MiB**
pass unchanged 250 MiB. First run's native peak 508,420,096 bytes exceeds
CIM 494,600,192 by **13.180 MiB** in the same session. A total **2,708** contiguous
native readings/26 identities, zero unavailable conversion reads, one null
validation read; native CPU 28.359 seconds across roughly 296 seconds, not
zero observer impact. Fixed production Wasm actual 52,887,552 bytes, reads
256 KiB, writes/queue 1 MiB, one pending operation. Recovery deltas
23.500/13.094/24.352 MiB; cancellation after 27,787,264 output bytes returns
empty OPFS and zero queues/operations.

The native record also retains **341.566 MiB** incremental memory in
**cleanup-2**, including 276,844,544 bytes for a native unknown descendant.
Separate CIM same PID/creation time identifies OnDeviceModelService, observed
there at 178,905,088 bytes. This is explicitly a post-conversion cleanup peak,
not included in the specified during-conversion primary formula and not hidden
or subtracted. It prevents treating this passing remux session as evidence
that long H264's active-conversion failure is solved or every session is safe.

Owned Chrome/server/observer stopped; profile and converted/staged payloads,
observer compiler scratch removed in finally, protected fixture size/hash
reverified. H: preflight free 1,704,886,947,840 bytes. Two new empty runtime
folders `work/miniflare-522457d12795e6076fb8ba285a913b77` and
`work/miniflare-5630a3b8d3858994efc15880b3e9cd7d`, plus the **47-byte**
`work/update-check/wrangler-latest.json`, remain after exact-target deletion
was policy blocked. No alternative delete/move attempted. Earlier policy-blocked
294,108-byte/95-file cache and eight reusable tools/67,119,065 bytes unchanged.
Zero converted media copies remain. Future general-profiler runtime TEMP/TMP
ownership should be nested into a unique finally-managed directory; do not
retry deletion of these blocked exact targets.

Frozen source-bound JSON/ordinary CSV/native-peak CSV/dual-curve HTML report:
`outputs/reports/2026-10-04T21-02-55-574Z-mkv-to-mp4-direct-handle-stress-native-100ms.json`.
Compact independently reconstructed evidence:
`evidence/production-native-memory-2026-10-04.json` (117,089 bytes before
the explicit runtime-scratch inventory appendix). Recorder never deletes files
or performs conversion. Historical evidence/engine bytes unchanged. Focused
11 checks and 366/366 full units, changed-source lint, TypeScript and unchanged
405-profile/no-PDF manifest pass. Final evidence checks and ledger update follow.
A-09 still partial for other browser harnesses/measurement perturbation and
full release revalidation; all other original codec/control/legal/scaling/
manual/browser/reproducibility requirements remain accounted for, not waived.

Final checkpoint: **369/369** unit/evidence tests, full lint, TypeScript,
whitespace check and 405-profile/no-PDF manifest pass. Generated `TESTED.md`
retains the new session note without recertifying older routes. No production
engine/UI source changed, so no unchanged expensive engine build or additional
browser session was repeated. This is concrete A-09 progress, not completion
of the broad original goal. Next safe stage is future runtime-scratch ownership
and remaining codec/control requirements, retaining the measured failed H264
configuration and all blocked exact targets without a deletion bypass.

## 2026-10-05 — Parallel native sampling integrated into private long gate

Status: **Partially implemented under A-09/M-04; private long gate measured
and failed**. Previous checkpoint `12e4b99` validated the OS observer, not a
conversion. The long harness now has an explicit `WITHIN_H264_NATIVE_MEMORY=1`
mode for the same uninstrumented 600-second candidate. Native instrumentation
starts before the EARLY blank baseline; the existing CIM baseline and diagnostics
remain unchanged. A separate serial pump drains while CDP and independent native
validators are awaited, preventing silent loss during long validation waits.

Every native reading is retained losslessly in a compact bounded timeline with
shared process identities: 32,000 snapshots/512 identities, null unavailable
samples, exact acquisition-time phases, no process-type exclusions. Primary
private peak and diagnostic RSS use the greater observed native/CIM conversion
peak. Per-process lifetime maxima are never summed into a fictitious tree peak.
No native coverage/error fallback can quietly accept CIM alone. The sampler is
finally stopped before owned profile/compiler scratch removal. JSON, ordinary
and native CSV, and HTML with both sampler curves remain unique and source-bound.

Eight focused checks and changed-source lint pass. Full regression/preflight
and one changed real browser session follow; no codec/native build, input size,
quality, dimensions, threads, queue or heap changed. The earlier 265.629-MiB
direct failure and 481.398-MiB blank control remain frozen. Only maintenance
current-source indexes/dependent hash were refreshed. Fast-report artifact
allowance is bounded to 64 MiB versus 16 MiB for prior reports; this is not a
conversion memory limit, output copy or weakened correctness threshold.
No unchanged expensive rerun, Docker or public promotion. A-09 remains partial
for the other conversion harnesses; the full original goal remains incomplete.

Actual changed gate (UTC 2026-10-04 20:25:15 report): same genuine
1,050,296,904-byte/600-second source completed in 227.422 seconds, producing
the same real 194,031,981-byte H264 output `08b2da23...`, 1280x720/18,000 frames,
zero maximum PTS error, both exact AAC packet hashes/languages, Unicode title
and chapter, full decode, SSIM 0.987764. These are validation results, not a
speed A/B: unchanged binary/settings and differing observer/session behavior
cannot establish a new conversion optimization.

EARLY blank baseline 251.422 MiB was fixed by browser age 14.025 seconds;
loaded idle 316.098 MiB. **Primary increase 434.551 MiB failed**: native tree
peak 719,294,464 bytes versus CIM 701,640,704 bytes (417.715 MiB increase).
The same-session native peak adds 16.836 MiB that slower CIM missed. At age
182.187 seconds, the native peak counts 279,400,448 bytes (266.457 MiB) for
PID 28668. Its native subtype remains unknown; matching PID and creation time
with separate CIM evidence identifies OnDeviceModelService (CIM observed
249.625 MiB). This process is counted in full, not subtracted or disabled.
Every native/CIM aggregate is independently recomputed from actual process
rows. There were 2,719 contiguous native snapshots/21 identities: three null
unavailable reads overall, two within pre/active conversion; 2,104 valid native
conversion readings. Pump ran across all validation waits with no error or
overflow. Native observer CPU 29.219 seconds over 296.990 seconds (~9.84% of
one core, ~0.49% of this host's 20 logical processors), not proof of zero impact.
Reads <=256 KiB, writes/queue <=166,439 bytes, one pending operation, fixed
32 MiB Wasm; terminal queues zero and no forbidden requests.

Only one job was independently validated; three-repeat/recovery gates were
not reached after the primary failure. Finally source/output/profile/compiler
scratch removed, owned Chrome/server/observer stopped, four dist assets exactly
restored; zero converted media/hosted artifacts. Eight reusable static tools
67,119,065 bytes and previously policy-blocked 95-file/294,108-byte cache remain
explicitly inventoried, with no new deletion attempt. Frozen raw JSON/ordinary
and native CSV/dual-curve HTML/failure trace and source/build/fidelity evidence
are retained in `evidence/h264-uninstrumented-direct-handle-native-100ms-2026-10-04.json`.

**Intentionally unsupported exact configuration:** this existing fixed-32-MiB
single-thread OpenH264 CPU candidate, original 720p30/settings/quality and
production direct-handle writer, on tested Chrome 154/Windows, cannot be exposed
after a measured 434.551-MiB strict gate failure. H264 stream-copy support is
separate and unchanged. Do not retry this unchanged candidate, omit the utility,
delay/prewarm/raise the baseline, downscale the input, or launch a blind native
build. This is not proof that every H264 encoder/device is impossible; materially
different bounded engines/configurations still need their own correctness,
legal and memory evidence. The next sampling task is broader production-profiler
integration; continue remaining original codec/control work without promoting
this failed candidate or treating M-04 as complete.

Regression checkpoint: 360/360 units, full lint (before the changed browser
session), final changed-source lint, TypeScript, whitespace checks and unchanged
405-public-profile/no-PDF manifest pass. New evidence tests reconstruct every
native process sum/phase and retain the greater sampler peak plus output fidelity.
No second conversion, native rebuild, public engine change or Docker run.

## 2026-10-04 — Sub-second Windows sampling and blank Chrome control

Status: **Partially implemented under A-09/M-04; fast observer validated,
integration with conversion gates pending**. Previous goal turn made progress:
the genuine direct H264 output, failed 265.629-MiB primary gate and finally
cleanup were committed/pushed as `422bc46`. No unchanged conversion/native
build was repeated in this turn.

The earlier utility appeared in only one slow CIM observation, so the next
changed experiment addresses peak capture rather than guessing at codec costs.
New persistent Windows instrumentation enumerates the complete owned process
tree with documented Toolhelp32 APIs and reads PrivateUsage/WorkingSetSize using
GetProcessMemoryInfo. Creation times guard PID reuse; already-observed live
descendants remain counted after their parent exits. No process-type allowlist,
content read, native conversion, or experimental browser flag. Unknown subtype
stays unknown and counts in full. One native thread polls at 100 ms; queue 256,
process count 128, response 8 MiB; overflow/sequence gaps fail explicitly. Failed
full-tree reads are null, never zero or a partial accepted total. PowerShell and
compiler scratch remain repository-local and are finally removed.

Initial 23-sample smoke proved ownership and null-on-exit only; a changed smoke
then additionally launched a real 40-MiB touched allocation held for 450 ms by
an owned Node child. Five allocated-child snapshots arrived 109–110 ms apart,
while an unrelated sibling and the observer remained outside the owned tree.
This is OS instrumentation validation, not a substitute video fixture.

One changed 240-second **blank Chrome 154** control produced 2,192 snapshots:
2,191 complete and one unavailable transient process read, retained as null.
The fixed EARLY diagnostic baseline was 248.215 MiB, established by browser age
12.847 seconds, never replaced by the three-minute peak. Whole-tree peak was
481.398 MiB at age 181.252 seconds, including a newly spawned unknown-subtype
Chrome descendant at 264.441 MiB observed ten times. This is not a website
conversion or memory pass and does not identify that process's subtype. The
233.184-MiB blank-page increase cannot be substituted into conversion acceptance.
Five separate slow CIM references each had 4–5 exactly matching native snapshots
for every process's private bytes. Median native query duration 11.670 ms versus
540 ms median CIM reference is monitor-query latency, **not conversion speed**.
Native max query 53.897 ms, max valid gap 219 ms. Observer CPU 28.406 seconds over
240.399 seconds is 11.8% of one core (~0.59% of this 20-logical-processor host);
conversion perturbation still needs measurement, not an assumed zero cost.

Compact source-bound timeline/peak/reference/smoke evidence is retained in
`evidence/persistent-chromium-memory-2026-10-04.json` (375,309 bytes), with raw
reports under `outputs/reports`. Owned Chrome/observer stopped and new profile,
compiler scratch and targets removed; zero input selections or conversions,
no private/public engine staging, no Docker. Existing conversion harnesses
still use the slower sampler: A-09 is now explicitly partial. Next concrete
work is incorporating native interval peaks into the identical long candidate
gate, without changing early baseline, tree membership, quality or the 250-MiB
formula. No unchanged blank control, blind native rebuild or public promotion.
The broad original project goal remains active and incomplete.

Regression checkpoint: 355/355 units, full lint, TypeScript and the
unchanged 405-profile/no-PDF manifest pass. These checks preserve historical
evidence and validate instrumentation; none recertifies conversion peaks with
the new observer. No fixture/conversion/native rebuild was repeated.

## 2026-10-04 — Uninstrumented build and selected-handle gate prepared

Status: **Partially implemented under M-04; uninstrumented direct-handle memory gate failed**.
Previous goal turn made verified progress: the index-capped diagnostic completed
three genuine long browser jobs and retained source-bound validation/memory.
Do not repeat that unchanged diagnostic. Next build removes only native allocator
instrumentation; bounded kernel/SAD/settings/fidelity/fixed 32 MiB stay unchanged.
One explicit `work/h264-uninstrumented-candidate-output` slot separates this
tool from the diagnostic module, with preflight refusing diagnostic/profiler or
short-fixture substitution.

The existing private long harness now also supports the production selected
FileSystemFileHandle writer, preserving three jobs, identical 600-second source,
early baseline, whole tree, 250 MiB cap, independent full output validation and
finally cleanup. The headless picker adapter selects a real OPFS directory handle
under the repository-local Chrome profile; it exercises the real async direct
writer, **not native OS picker/manual drive selection**. That manual gate remains
separate. OPFS fallback/default behavior is unchanged. Dist/public registry and
native kernel are unchanged. Two focused source tests plus existing harness
checks (10/10), focused lint and TypeScript pass; native/browser outcome pending.

Small H264 correctness tests now select the explicit tool rather than a hardcoded
old binary. Each execution gets a new source-bound report instead of appending
historical rows beneath a changed manifest. No expensive conversion was rerun
for this preparation; no new capability, speed or full-goal acceptance.
The policy-blocked Node build cache remains recorded; do not retry its deletion
through another mechanism. All remaining original requirements stay open.

Build checkpoint: all 348 units pass; pushed `71abba2` produced successful
non-Docker run 37219282953. Native step 305 seconds, SDK/build cleanup passed.
Static uninstrumented tool 8,303,306 bytes: JS `a961142e...`, Wasm
`63cd22f29b7a00b80c354a45c0944592c74ed648861a0c9c838683032d5794f8`.
Verified current kernel/header/injector/recipe hashes and generated uninstrumented
wrapper `591cf1a9...`; no allocator callback in JS; actual fixed 512 shared pages.
Both hosted artifacts deleted (zero), source bundle never downloaded. One
direct-handle 600-second browser session completed with early blank baseline
250.06 MiB. No diagnostic rerun, native-quality/heap change,
public promotion or OS-picker claim. Eight bounded reusable static tools are
now retained, not converted media. `record-h264-uninstrumented.mjs` retains
success/failure, recomputes full-tree peaks and verifies cleanup without hiding
the previously policy-blocked compiler cache.

Actual result: the genuine 1,050,296,904-byte source produced a valid
194,031,981-byte H264 output in 255.187 seconds: 1280x720, 18,000 frames,
exact timestamps and both AAC packet hashes, full decode, SSIM 0.987764.
The complete Chromium-tree increase was **265.629 MiB**, above 250 MiB,
so the gate failed after the first validated job; no three-run or recovery
acceptance. The primary peak includes OnDeviceModelService at 101.555 MiB,
observed once near browser age 180.255 seconds. This is a counted allocation,
not proof that the direct writer caused it, nor permission to omit it.
Reads stayed <=256 KiB, writes/queue <=166,439 bytes, one pending operation,
fixed 32 MiB Wasm, terminal queues zero. Failure evidence is retained in
`evidence/h264-uninstrumented-direct-handle-2026-10-04.json` with raw executed
source/build hashes. Finally cleanup removed generated source/output/profile
and scratch, stopped owned Chrome/server, and restored all four dist assets.
Zero converted media or hosted artifacts remain; eight reusable static tools
total 67,119,065 bytes. No unchanged expensive retry: the next investigation
must distinguish transient utility allocation and sampling from pipeline costs
without gaming the early baseline or the complete process-tree formula.
H264 remains private; all broader original-project gates remain open.

Push checkpoint: all 350 units, focused changed-source lint, TypeScript and
the unchanged 405-public-profile/no-PDF evidence manifest pass. Two new
evidence tests retain the validated output and whole-tree memory failure
without accepting the route. Only current-source indexes and their dependent
aggregate reference were refreshed; historical executed reports remain frozen.
No conversion rerun, native rebuild, Docker command or public engine change.

## 2026-10-04 — Index-capped long H264 diagnostic passed all three jobs

Status: **Partially implemented under M-04; native retention fix validated in
instrumented long browser runs, not public/release acceptance**.
Non-Docker build 37216461757 at pushed `aee6478` compiled the changed native
kernel in 184 seconds. Hashes, fixed 512 shared initial/max Wasm pages and
unchanged quality/frame/timestamp/thread/AVIO settings were independently
verified. Both hosted artifacts deleted; source bundle never downloaded.

The same genuine 600-second, 1,050,296,904-byte source completed all three
production-Chrome 154 browser jobs in 245.073 / 233.482 / 240.187 seconds.
Every output was genuine 1280x720 H264, 194,031,981 bytes, identical SHA-256
`08b2da23c7c0deba576511af5c5fa77f36aac441607e00a1d03be10817478f7f`.
Independent validation passed all 18,000 frames, zero frame-time error, both
exact AAC packet hashes/language tags, Unicode metadata/chapter, full decode
and ordinal SSIM 0.987764. The former uncapped diagnostic aborted after
71.817 seconds and 316,932,096 input bytes; this is completion versus failure,
not an uninstrumented conversion-speed A/B claim.

Early stable blank baseline 248.504 MiB; loaded idle 293.480 MiB. Exact primary
whole-Chromium increments were **219.742 / 198.164 / 199.180 MiB**, across
175 / 169 / 172 pre/active samples. All 576 total tree samples were available.
Actual running browser ages spanned 38.083–881.022 seconds, so startup overlap
was observed without delaying/enlarging baseline. OnDeviceModelService did
start at 180.236 seconds and remained in the total; this session observed
only 13.797 MiB transient private memory, unlike the earlier large-service
control. No guarantee of a smaller service on other sessions/devices.

All 288 native snapshots arrived in order (98/94/96 per job). Seek-index counts
cycled as entries were reduced, maximum 4,005 entries / 96,120 logical bytes
across three streams, below the aggregate 98,304-byte generic hint. These are
not backing-allocation bytes or a mandatory-index-demuxer guarantee. Used
native bytes including overhead increased only 183,872 / 154,248 / 157,164
after each job's startup; maximum observed used bytes 26,107,324. Earlier
uncapped growth was 468,712 bytes before abort at only ~313 MB read. This
supports the measured retention fix, not a per-allocation trace or universal
leak diagnosis. Sampler cost <=50 microseconds, fixed heap unchanged.

Reads <=256 KiB, writes/queues <=166,439 bytes, one pending operation,
terminal queues zero, no forbidden requests. OPFS empty after each validation;
idle recovery within 26.855 / 37.914 / 33.840 MiB of loaded baseline. Finally
removed source/outputs/profile/scratch and success trace, stopped owned
Chrome/server and restored four dist assets exactly. Seven reusable static
tools remain (58,815,759 bytes), zero converted media. A website-build Node
compiler cache remains: 95 files / 294,108 bytes at `work/node-compile-cache`;
exact-path deletion was policy-blocked and no alternative was attempted.
It is recorded explicitly, not hidden as complete build-cache cleanup.

Evidence: `evidence/h264-demux-index-diagnostic-2026-10-04.json` freezes the
actual report/build/source hashes and independent cleanup, with whole-tree,
allocator and separate logical-index CSV/HTML graphs in `outputs/reports`.
Recorder initially rejected the 4,294,409-byte long report under its old
4 MiB artifact limit, before evidence was written; only bounded index-report
allowance became 16 MiB, with 4,096 tree/768 native/three-job caps. Conversion
memory and all correctness thresholds stayed unchanged. Another pre-write
cleanup check found the compiler cache; it is now explicitly inventoried.
The generic console success label was clarified for diagnostic/startup modes;
the frozen report already had correct diagnostic-only status/scope.

Next: a fresh uninstrumented build of the same bounded kernel, clean/startup
repeats, direct-output/cancellation/write-failure/recovery, progressively larger
real sources including protected `test.mkv`, controls/complex fidelity,
exact reproducibility/legal review and registry/UI gates. H264 remains private;
all other original requirements stay open. Do not repeat this unchanged
diagnostic or claim the whole goal achieved.

Cycle checks: 346/346 units, full lint, TypeScript, production build and
unchanged 405-profile/no-PDF manifest pass. Only latest-source indexes and
dependent aggregate references were refreshed; all historical execution
reports/manifests remain frozen. No second diagnostic job or native build was
started. Protected `test.mkv` remains unused/unmodified in this deterministic
test; its 2,958,573,265-byte size and original SHA-256 were rechecked.

Historical push checkpoint (2026-10-04): the private H264 startup/scaling harness now
supports a genuine 600-second fixture with unchanged resolution, frame rate,
codec settings, early blank-page baseline, complete Chromium process tree and
250 MiB limit. It requires actual running-conversion observations before
120 seconds and beyond 190 seconds of browser age; CPU-profiler/single-run
shortcuts are rejected. This longer browser gate has **not run yet** and is
not public acceptance. All 327 unit tests and focused lint pass. Historical
execution records are preserved; only current-source indexes were refreshed.

## 2026-10-04 — Complete allocator events; bounded demux-index candidate

Status: **Partially implemented under M-04; changed native build and long retest pending**.
The diagnostic module was rerun only after replacing sparse worker polling with
bounded numeric console events. All 29 emitted snapshots arrived in order,
with no capture error. The identical genuine 1,050,296,904-byte source still
failed: 71.817 seconds observed, 316,932,096 input bytes and 58,188,932 partial
output bytes; zero completed or independently validated outputs. Observed
whole-Chromium increment 225.758 MiB is not acceptance. Running browser ages
25.682–95.373 seconds did not reach the utility-service window.

After initial codec allocations, snapshots 2–29 show used native memory
including allocator overhead rising by 468,712 bytes. The full first-to-last
delta of 13,340,620 bytes includes startup allocations, not steady-state leak
measurement. Last claimed/free/unclaimed bytes were
28,032,776 / 1,640,352 / 1,016,296; largest free payload remained in the
1,048,576–2,097,152-byte bucket. These bounds do not prove the suspend stack
fits, pure fragmentation, the failed instant, or individual allocations.
Sampler cost was at most 40 microseconds.

Pinned FFmpeg [Matroska source](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavformat/matroskadec.c)
adds keyframe seek-index entries and calls `ff_reduce_index`.
The [index reducer](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavformat/seek.c)
uses `max_index_size` per stream. The candidate now sets a 32 KiB generic
seek-index hint before opening input, without changing packet/frame reads,
quality, timestamps, threads, fixed heap, AVIO seeking or output. Diagnostics
also count actual entries/logical bytes and report the configured hint.
This is a distinct lower-retention candidate, **not proof of the entire OOM
cause or a passed conversion**. Backing allocation may have growth slack,
mandatory full-index demuxers may ignore the hint, and reduced index density
may affect seeking; those profiles require separate tests.

`evidence/h264-allocator-events-2026-10-04.json` retains the frozen actual report,
historical build/manifest/source hashes and independently checked cleanup.
Source/partial output/profile/temp removed, owned Chrome/server stopped,
four dist assets exactly restored. Six static tools remain (50,510,765 bytes),
zero converted media; hosted artifacts zero. Historical execution records
stay frozen when current-source indexes are refreshed. The cap is not yet
compiled/browser-proven; public engines/registry remain unchanged. Next:
one changed non-Docker native build and identical 600-second three-job gate;
no raised heap, smaller input, or public/full-goal acceptance.

Preparation checks: 344/344 unit tests, full lint, TypeScript and unchanged
405-public-profile/no-PDF manifest pass. First unit run was 342/344 because two
historical dimension-proof tests compared their old executed kernel to the
changed current candidate. They now verify exact pinned historical Git bytes
and still check the current dimension guard; a separate test pins the new
kernel. No historical browser evidence or quality threshold was rewritten.

Changed-build checkpoint: pushed `aee6478` produced successful non-Docker run
[37216461757](https://github.com/tanishqbaweja/fileconverter/actions/runs/37216461757).
Native step 184 seconds, hosted SDK/build cleanup passed. Static candidate
8,304,994 bytes; actual Wasm fixed 512 initial/max shared pages. Kernel,
diagnostic header/injector, generated wrapper, recipe and artifact hashes all
verified before staging. Both hosted artifacts deleted (zero remaining),
corresponding source bundle never downloaded. Production website build passes.
The identical 600-second browser gate is live with an early clean whole-tree
baseline of 248.50 MiB; outcome remains pending. Do not restart on observation
timeout or use build speed as conversion throughput.

## 2026-10-04 — Longer genuine H264 gate failed on fixed-heap allocation

Status: **Partially implemented under M-04; longer scaling/startup gate failed**.
The prepared startup/scaling test ran once with the existing isolated SAD tool,
unchanged 720p/30fps/quality/one-thread settings and fixed 32 MiB Wasm heap.
No native rebuild, browser-flag change, profiler, smaller substitute or baseline
delay was used. A genuine 600-second MPEG4/two-AAC/chapter source measured
1,050,296,904 bytes, SHA-256
`031f4cdf9a40bbeacd84c2c1c4640565d37d96e600cdcb31fece6becf2b5ac12`.
Independent source inspection counted all 18,000 video frames.

The first conversion ended in **error**, after 72.157 seconds observed,
316,932,096 input bytes and 58,188,932 partial output bytes. The fixed heap
aborted trying to reserve 33,586,120 bytes: the actual stack identifies
`Asyncify.allocateData`, which allocates its configured 1 MiB suspend stack
plus a 12-byte header. Generated runtime inspection also confirms that it
frees this stack after rewind. The underlying live allocation or fragmentation
source is **not proven**; do not label this a diagnosed encoder leak.
The pinned FFmpeg [MP4 muxer source](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavformat/movenc.c)
shows that the current `skip_trailer`/no-global-sidx/no-ISM-lookahead combination
bypasses global fragment-index accumulation in `mov_write_moof_tag`; that
hypothesis is not sufficient to explain the failure.

The stable early blank-page baseline was 248.922 MiB; loaded idle was
292.582 MiB. The complete-Chromium observed increment reached 217.602 MiB
over 53 available pre/active samples, with no unavailable samples. This is
**not memory acceptance**: zero conversions completed, output validation and
three repeats were not reached. Actual running browser ages spanned
37.797–108.114 seconds, so the three-minute utility window was **not reached**
and startup-overlap remains unproven. Do not infer a utility-caused failure.
Read/write/queue buffers remained bounded by 256 KiB, peak pending writes one,
and terminal queues zero; no forbidden conversion request was observed.

Finally cleanup removed the generated source, partial output, browser profile
and temporary data, stopped owned Chrome/server trees and restored all four
generated media assets to exact public hashes. Work still contains only five
static tools (42,206,230 bytes), zero converted media. The 15,795-byte failure
trace and compact JSON/CSV/HTML reports remain in `outputs/reports`.
Committed evidence: `evidence/h264-startup-scaling-failure-2026-10-04.json`
retains the exact raw report, source/manifest hashes, trace hash, process
samples, failed status and actual cleanup checks. Historical short SAD speed
evidence remains unchanged; it does not certify longer files.

Next measure native live/free/largest-free allocation usage over time before
changing allocation behavior. Do not repeat the unchanged long conversion or
raise/grow the heap to claim compliance. A diagnostic or bounded-allocation
change must justify another identical 600-second test. Public registry,
production engines and original quality/memory requirements remain unchanged;
all remaining original requirements stay open.

Cycle checks: focused startup/failure tests 6/6, complete unit suite 330/330,
full lint, TypeScript and unchanged 405-public-profile/no-PDF evidence manifest
passed. An initial manifest-check invocation used a nonexistent script name
and did not run that gate; the actual `audit:public-evidence:manifest` command
was then executed successfully. No second browser conversion was started.

## 2026-10-04 — Native allocator diagnostic prepared

Status: **Partially implemented under M-04; instrumented build/browser diagnosis pending**.
An off-by-default build option instruments only two packet-boundary calls
around the SHA-pinned, unchanged H264 codec kernel. The generated private
wrapper samples emmalloc's claimed/free/unclaimed bytes and 32 free-block
size buckets at most every 2.5 seconds, at most 256 times per module. It does
not allocate or trim native blocks, change quality/codec/thread/AVIO settings,
grow memory or log file content. Browser sampling retains at most 768 native
records; worker state holds only the latest snapshot. Instrumented runs are
diagnostics, never uninstrumented speed or public-memory acceptance.

The private manifest/source bundle retain diagnostic/header/injection hashes.
One explicit repository-local diagnostic tool slot leaves the five existing
static tools untouched. Historical SAD recipe verification reads exact pinned
Git bytes after the current diagnostic recipe changes. Latest-source indexes
and their aggregate references are refreshed without rewriting any historical
execution, native manifest, profile or performance measurement. An initial
source-index patch omitted the trailing comma and failed before editing; the
correct full block was then applied. A unit failure identified a dependent
VAA speed-trial aggregate hash that also needed refreshing; the underlying
rejected speed result remains unchanged. No diagnostic conversion has run yet.
Fixed 32 MiB/SAD-on/VAA-off/LTO-off no-Docker compilation and the identical
600-second production-browser fixture are the next actual gates.

## 2026-10-04 — Compiled allocator diagnosis and capture repair

Status: **Partially implemented under M-04; native diagnostic ran, no allocation fix accepted**.
No-Docker run `37196170055` at pushed `af4ee8f` compiled in 323 seconds
and passed SDK/build cleanup. Verified module hashes, unchanged codec kernel,
SAD on/VAA and LTO off, and actual fixed 512 initial/max shared pages. Static
diagnostic tool is 8,304,535 bytes; both hosted artifacts deleted, source bundle
never downloaded. Six static tools total 50,510,765 bytes remain, zero media.

The identical genuine 1,050,296,904-byte/600-second source ran through the
production Chrome pipeline. First job failed after 85.421 seconds observed:
380,370,944 input bytes, 69,771,092 partial output bytes subsequently deleted,
zero completed/validated outputs. Whole-tree observed increment 213.258 MiB
does not constitute acceptance. Actual running browser ages 39.085–122.977s
still do not reach the three-minute utility window. Finally cleanup removed
all generated media/profile/temp, stopped owned browser/server and restored
the exact four public/dist media assets.

Only five native snapshots were captured by latest-value worker polling,
at native sequences 6/25/27/29/31. Native claimed bytes stayed 28,031,984;
free claimed bytes decreased from 2,021,616 to 1,612,636, with 1,017,088
unclaimed bytes. Used bytes including allocator overhead increased 408,980
across those captured points. Largest free payload remained in the
1,048,576–2,097,152-byte bucket, so these observations **do not prove**
that every free block was too small or identify the allocation at failure.
Snapshot scans took 10–20 microseconds. They are neither a per-allocation trace
nor an exact failed-instant measurement. Evidence, raw report and heap CSV/HTML
graph: `evidence/h264-allocator-diagnostic-2026-10-04.json` and timestamped
`outputs/reports/2026-10-04T10-50-27-162Z-...`.

The sparse capture is an actual diagnostic transport defect: asynchronous
worker evaluation often cannot run while the native loop is busy, and worker
termination loses latest state. Capture now uses fixed-size numeric console
events from the existing native callback, at the same >=2.5s native interval
and 256/module cap; harness cap stays 768. Strict parsing rejects unknown
fields, non-numeric values, invalid buckets and messages >2 KiB. There is no
filename/content logging. Native binary/header/settings are unchanged, so
another SDK/native rebuild is unnecessary. Diagnostic-only error stacks are
bounded to 4 KiB to retain the missing caller. Thirteen focused checks and
focused lint pass. A fresh identical long run is justified by this capture
change, not an unchanged conversion retry; no speed or public acceptance.

## Status definitions

- **Verified complete** — current source plus an appropriate test or retained
  report directly proves the requirement.
- **Partially implemented** — useful implementation exists, but a named part of
  the requirement or its evidence is absent.
- **Missing** — no conforming implementation or adequate evidence was found.
- **Intentionally unsupported** — the exact surface is hidden from the public
  selector and has a recorded technical, legal, quality, or memory reason.

## 2026-10-04 — H.264 isolated SAD SIMD integration

Status: **Partially implemented under M-04; native build and narrow browser SAD speed gate passed**.
`WITHIN_H264_SAD_SIMD=1` now delegates only the four SHA-pinned SAD bodies to
the helper proven by 529,564 compiled cases. It defaults to 0 and refuses
simultaneous rejected VAA SIMD. The applier requires a completed successful
proof, exact case coverage, raw report hash and actual helper hash. Original
codec settings, wrapper, I/O, threads and fixed memory limits are unchanged.
Manifest and corresponding source retain helper/proof/source/applier hashes.
Pinned-source patch check confirms four delegates, retained license and
unchanged four-neighbor routines; patched source hash is
`b646fab437006e5773074cc410ad94a5748d44a4fb74bd253d87a6890f3f9d46`.
Nine focused checks, focused lint and Bash syntax pass. Latest-source indexes
and one dependent compact-evidence reference hash are refreshed; historical
executed reports, proofs and as-built manifests are not relabeled.
The strict selector now permits one additional explicitly named, bounded
static SAD tool slot (`work/h264-sad-candidate-output`) to preserve the default
scalar and previously retained tools without overwriting them. Generated
media/profile/temp still remain repository-local and finally-cleaned.
Build used fixed 32 MiB, one thread, LTO off, VAA off, SAD on. Genuine
identical-input/default-settings production-browser A/B passed its narrow
private gate as recorded below. No public route or release claim is added.
Build run `37193374298` at `5084bd6` finished successfully, with a 320-second
native build and successful SDK/build cleanup. While that separate hosted build ran,
the fresh scalar browser baseline completed three real conversions in
**25.586/24.852/26.096 seconds**, at **210.363/170.547/178.207 MiB** whole-tree
increment. All produce the same verified 19,137,689-byte output/1,800 PTS/both
AAC hashes/metadata/chapter/SSIM 0.987575. Media/profile/temp were removed,
production assets restored and privacy/buffer/queue gates passed.
Report: `outputs/reports/2026-10-04T09-49-53-123Z-private-h264-720p-memory.json`.
This fresh baseline uses the exact harness/settings planned for the SAD trial;
not another unchanged optimization retry. A separate guarded SAD comparison
preserves full output, exact settings, proven helper and real sampled primary
memory checks; three negative/positive comparator tests pass. Full lint,
TypeScript and unchanged 405-profile/no-PDF manifest also pass at this stage.
The fully awaited download was verified before staging: static tool 8,302,846
bytes, actual 512 initial/max shared pages, unchanged JS module, new Wasm SHA
`ce022f84f65a4dbf1e379a500d70581ba1878502cf7a30fb6935104b8fda1cc1`.
Manifest confirms SAD on, VAA/LTO off, exact proof/helper/patched-source hashes,
and unchanged wrapper/kernel. The SAD three-run browser session completed; no
benchmark setting or executed harness source changed after the scalar baseline.
Hosted candidate/source artifacts (IDs 11300425007/11300390456) were deleted,
with zero left. The source bundle was never downloaded; the bounded static
tool remains locally for the remaining gates. No live job was restarted on
a polling timeout. SAD jobs took **23.834/27.090/24.265 seconds**, with
complete-Chromium increments **234.105/204.598/207.891 MiB**. Every one of the
six scalar/SAD outputs is byte-identical (SHA a77bd1fb..., 19,137,689 bytes),
with all 1,800 source PTS/both AAC hashes/metadata/chapter/full decode and
SSIM 0.987575 intact. Fixed 32 MiB Wasm, 256 KiB read/write/queued bounds,
one pending operation, terminal zero queues, privacy and automatic cleanup pass.
Median conversion time fell **25.586 -> 24.265 seconds (5.161% lower)**, meeting
the existing >=5% private candidate threshold. One candidate job was slower;
this is not a cross-machine/statistically isolated speed guarantee. The default
tool/public registry remains unchanged pending full release gates. Preserve
the proven SAD tool for cold/clean-session/startup-overlap, direct-output,
failure/cancellation/recovery and progressively larger genuine conversion
tests; do not repeat unchanged native builds or the rejected VAA/LTO trial.
`evidence/h264-sad-simd-comparison-2026-10-04.json` retains both complete reports,
recomputed positive-sample primary memory peaks, exact native/proof/Git/log
provenance, guarded comparison and five bounded static-tool cleanup inventory.
All generated media/profile/temp were deleted and all four production assets
restored exactly. Hosted artifacts remain zero. No public H.264 route or
original-goal completion is claimed from these six 105 MB conversions.
Final SAD cycle gates pass: **324/324** unit tests, full lint, TypeScript,
unchanged 405-profile/no-PDF evidence manifest, diff checks and 4/4 exact
public/dist media asset matches. Both browser sessions and the hosted run
are terminal; no owned Chrome process remains and hosted artifacts are zero.
`work` contains only five bounded static tools, 42,206,230 bytes total and
zero converted media/profile/temp/build/download files. The new SAD tool is
explicitly retained for the remaining acceptance tests, not a converted copy.

## 2026-10-04 — H.264 SIMD CPU attribution and next primitive proof

Status: **Partially implemented under M-04; diagnostic and compiled SAD proof completed**.
One instrumented conversion using the actually rejected SIMD module captured
9,432 samples over 15,029 ms. Aggregating all call-site nodes by function name,
VAA self share was 7.462% in the historical scalar window versus 1.667% in the
SIMD window. These windows are not matched processed-frame work or a controlled
end-to-end speed comparison. The earlier 9.196% slowdown remains authoritative
for rejecting this unchanged candidate; SIMD remains off, not promoted.
The instrumented whole-Chromium increment was 235.570 MiB, with the identical
19,137,689-byte output, all 1,800 PTS, both AAC hashes, full decode and SSIM
0.987575 preserved. Media/profile/temp were removed and production assets restored.
Evidence: `evidence/h264-vaa-cpu-comparison-2026-10-04.json`.

Whole-profile function aggregation reveals scalar SAD16x16/SAD8x8 shares of
4.990%/4.539% and SATD4x4 5.295%; corresponding SIMD-window shares are
5.310%/4.089%/6.458%. Attribution identifies targets, not per-call speed.
The actual pinned SAD bodies are in `codec/common/src/sad_common.cpp`, not the
call sites in `sample.cpp`. A separate exact-result SIMD primitive and pinned
scalar oracle now cover 8x8/16x8/8x16/16x16. The production recipe is unchanged.
The proof uses exact row loads, independent strides, bounded 16-bit pair sums,
fixed 32 MiB Wasm and production compiler optimization/SIMD/thread flags.
Its no-Docker workflow tests exhaustive byte pairs in two patterns, spikes,
random independent strides/alignments, overlap/zero strides and both Wasm-end
inputs, plus seven alternating warm primitive-cost pairs before any expensive
full FFmpeg build. Run `37192648002` at `5950ef5` passed all **529,564**
actual-Wasm cases: 262,144 uniform and 262,144 mixed-sign byte-pair cases,
1,152 spikes, 4,096 random-stride/alignment cases, 20 overlapping/zero-stride
cases and eight exact-end-of-Wasm input cases. Seven alternating warm pairs
gave scalar/SIMD median ratios **1.477x/2.713x/1.539x/2.923x** for
8x8/16x8/8x16/16x16. The timed loop uses 64 varying blocks with checked output
checksums and bounded iterations, not a per-call JS crossing or invariant input.
This is hosted Node/V8 primitive cost, not Chrome file-conversion speed.
The build/test step took 23 seconds; its SDK/build/scratch cleanup passed.
Exact executed Git sources and report/log hashes were independently checked,
then the compact downloaded report and hosted artifact were removed (zero left).
No local compiler, arithmetic binary, fixture or converted media was generated.
Evidence: `evidence/openh264-sad-arithmetic-2026-10-04.json`.
These results justify the next private opt-in SAD conversion build and a new
identical-input/settings real-browser A/B; do not combine the rejected VAA
candidate by default or promote based on this microbenchmark alone.
Primitive cost is not file-conversion throughput or public-route acceptance.
The first focused source audit falsely matched the word "quality" in a comment;
it now checks executable text after stripping line comments. This was an audit
false positive, not compiled arithmetic failure or a changed acceptance gate.
All existing cold/startup-overlap, direct/failure/recovery, larger-file,
controls/fidelity, licensing and release gates remain open.
Final proof-cycle checks: **317/317** unit tests, full lint, TypeScript,
unchanged 405-profile/no-PDF manifest and diff checks pass. All four generated
public/dist media assets match exactly. Hosted run is terminal, artifacts zero,
and downloaded report/build directories are absent. No owned Chrome process
remains. Only the same four bounded static tools (33,903,384 bytes) remain in
`work`, with zero converted media or profiles. The protected fixture was not
used or modified by this arithmetic cycle; its size is still 2,958,573,265 bytes.

## 2026-10-04 — H.264 opt-in native VAA SIMD integration

Status: **Partially implemented under M-04; native build passed, SIMD speed trial rejected**.
`WITHIN_H264_VAA_SIMD=1` now applies the proven helper to the exact pinned
OpenH264 `VAACalcSadBgd_c` body only. Default is 0. The applier verifies the
complete upstream source and successful 132,101-case proof, checks the helper
hash against the actually tested bytes, and refuses drift. Every other codec
algorithm, encoder setting, thread count, fixed memory limit and AVIO bound
is unchanged. The manifest records the flag, original/patched/helper hashes,
proof and applier provenance. Corresponding source includes the helper,
applier, verifier logic and compact arithmetic evidence.

Historical executed reports/manifests are preserved; only latest-source hash
indexes are refreshed. The hosted build used fixed 32 MiB memory,
whole-library LTO off, and this SIMD option on. It finished before the
candidate was staged. Identical-input/default-setting browser tests performed
three jobs per binary with independent content/timing/audio validation, strict
whole-Chromium <=250 MiB measurements, bounded queues and final cleanup.
No speed gain, new public route or original-goal completion is claimed.

Hosted run `37189794149` at `3a8395e` built the SIMD candidate in 313 seconds
and passed cleanup. Actual Wasm is fixed at 512 initial/max shared pages;
JavaScript matches the scalar module while the new Wasm hash is
`b80c9ea2d6457502c4a511b7781bd502ab0b34c35c8b71b40e63bd473a9d34c6`.
The fresh scalar benchmark passed three genuine 105,000,218-byte conversions
in 26.500/23.916/23.079 seconds at 189.469/157.605/160.324 MiB incremental
whole-Chromium private memory, with exact historical output/SSIM/audio/timing.
All scalar fixtures, outputs and browser/temp files were cleaned up.

A combined local move/download/cleanup command was policy-blocked before
execution; it was not retried through another mechanism. The original scalar
tool remains in `work/h264-candidate-output`. The SIMD tool occupies the
already allowed second A/B slot `work/h264-speed-baseline-37157670815`; that
historical directory name is **not** an assertion that its current contents
are the scalar baseline. Actual SHA, manifest SIMD flag and selected directory
are preserved in the report. No selector/stager/harness code changed between
the two benchmarks. An initial manifest check/harness invocation happened
while the one download handle was still running and failed before generation
or staging. Awaiting that same handle completed successfully; hashes and
limits were verified before starting the actual SIMD conversion session.
No hosted or conversion job was restarted because of a polling timeout.

The SIMD browser jobs took **26.116/26.961/25.981 seconds**, with whole-tree
increments **221.563/180.973/186.664 MiB**. All six scalar/SIMD outputs are the
same real 19,137,689-byte H.264 output with 1,800 independently decoded frames,
exact source PTS/both AAC packet hashes/metadata/chapter and SSIM 0.987575.
Median elapsed time worsened from **23.916 to 26.116 seconds (9.196% slower)**
in this trial. The private speed candidate is therefore rejected, not promoted
because its arithmetic or narrow memory gates passed. Default SIMD remains
off; the default static tool remains the original scalar binary. No intrinsic
cross-machine slowdown or statistically isolated cause is claimed from these
two sessions. Do not repeat this unchanged three-run trial as an optimization.

`evidence/h264-vaa-simd-comparison-2026-10-04.json` retains both complete reports,
source/build/proof/module hashes and guarded comparison. The comparator
recomputes all whole-tree peaks from available samples, checks all 1,800 frame
times and byte-identical output, and refuses altered settings/profiling,
missing evidence, drifted proof and false reported memory. Both hosted artifacts
were deleted (zero remaining); the 72 MB source bundle was never downloaded.
Every generated fixture/output/browser profile/temp file was removed, and all
four generated production assets were restored exactly. Retain only compact
reports and four bounded static tools, including the rejected SIMD binary for
a targeted CPU diagnosis of whether the patched loop sped up while other
stacks or sampling/I/O dominated. This diagnostic is the next useful action,
not another native rebuild or a claimed speed improvement. All original
release, larger-file, control/fidelity and cold/startup-overlap gates stay open.
Final cycle checks pass: **308/308** unit tests, lint, TypeScript, unchanged
405-profile/no-PDF evidence manifest, diff checks and 4/4 exact public/dist
asset hashes. No owned benchmark Chrome process remains, and the hosted build
is terminal with zero artifacts. The recorded cleanup snapshot contains only
four bounded static tools and zero converted-media bytes; no default/public
binary was replaced. A rejected SIMD candidate is not completion of M-04 or
the full original goal.

## 2026-10-04 — H.264 exact-result SIMD arithmetic candidate

Status: **Partially implemented under M-04; compiled arithmetic proof passed**.
The measured `VAACalcSadBgd_c` hotspot now has a separate private SIMD helper.
It retains all four 8x8 SAD, signed-difference and maximum-difference results,
macroblock traversal (including the pinned non-aligned-width behavior), and
exact eight-byte row loads. It allocates no frame buffer and changes no codec
setting. At this proof-only stage it was not enabled in a conversion build;
the later opt-in integration and rejection are recorded above. No public profile exists.

The no-Docker arithmetic workflow uses pinned Emscripten 6.0.4. Its oracle
extracts the exact original scalar function after verifying the complete
19,566-byte upstream source SHA-256; it retains the upstream license rather
than using a handwritten scalar approximation. Actual-Wasm checks
cover all 65,536 byte pairs in uniform and mixed-sign patterns, individual
quadrant/lane spikes, random strides/alignments/dimensions, maximum-size frame
sum overflow, output canaries, input immutability, and a source ending exactly
at the Wasm memory boundary. This is exhaustive byte-pair coverage, not every
possible frame. Signed-overflow comparison applies to the actual pinned
compiled scalar, not a claim of portable C++ overflow semantics.

Three focused source/guard tests and JavaScript/Bash syntax checks pass.
First hosted arithmetic run `37189089815` at `43d5b44` compiled successfully
but its harness stopped before testing any case because Emscripten 6.0.4
requires explicit `HEAPU8` runtime export. The actual error and zero-case
report are retained; cleanup passed. The arithmetic-only recipe now exports
that heap view. This is a harness/API correction, not a SIMD mismatch or a
changed production heap policy. Retry requires this concrete change.
Corrected run `37189265531` at `be2c875` passed all **132,101** cases and
**1,090,864** quadrant comparisons. The first and corrected builds have the
same arithmetic Wasm hash and generated-reference hash; only the JavaScript
heap export changed. These tests prove the tested arithmetic equality, not
file-conversion speed, production fidelity, converter memory acceptance, or
public H.264 support. That cycle's unchanged video build still used the scalar loop.

Both hosted runs passed SDK/build cleanup. Their compact reports were checked
against exact executed Git bytes, embedded with source/module/log/build hashes
in `evidence/openh264-vaa-arithmetic-2026-10-04.json`, then the two downloaded
reports and two hosted artifacts were removed (zero remaining). No compiler,
source download, arithmetic binary, browser profile, fixture or converted
output was retained locally from this cycle. Existing bounded static A/B
tools were unchanged. The next opt-in build and identical-settings browser
A/B were subsequently completed as recorded above. The
full original goal and all previously recorded release gates remain open.
Final gates: 301/301 unit tests, lint, TypeScript, unchanged 405-profile/no-PDF
manifest and diff checks pass. Four public/dist media assets match exactly.
The initial read-only MPEG-4 asset check used a nonexistent `engines/mpeg4`
path; file discovery corrected it to `engines/remux`, and the complete check
passed without a rebuild or mutation. No test or hosted job remains running.

## 2026-10-04 — H.264 bounded worker CPU diagnosis

Status: **Partially implemented under M-04; measured hotspot, not optimization**.
After rejecting unchanged low-complexity and whole-library LTO, one genuine
105,000,218-byte 60s/720p production-browser conversion ran with a bounded CPU
sample window. The actual conversion worker is targeted by its own-origin
URL; no worker pause, precise coverage/deoptimization, retained worker lifetime,
codec setting, browser flag, native binary or production conversion path changed.
Because the UI immediately terminates its worker on completion, profiling stops
after a nominal 15 seconds, rather than delaying normal cleanup. Diagnostic
transport has an 8-pending-request/16-MiB-response cap, one sample window, and
explicit shutdown. Default stress mode still requires three jobs; CPU mode is
one diagnostic job and cannot report repeatability/speed/public acceptance.

The observed window is 15,037 ms with 9,460 samples and 847 nodes. Mutually
exclusive sampled-stack attribution is 78.998% OpenH264 encoder, 16.656% FFmpeg
decoder, 0.783% I/O/AVIO, 0.384% muxing, 2.321% idle and 0.858% unclassified.
These are **sampled wall-time estimates**, not OS CPU utilization or a claim
about the complete conversion. Inclusive Asyncify/wrapper stacks overlap;
their high inclusive totals are not evidence that Asyncify itself is costly.
The top self-sampled function is `WelsVP::VAACalcSadBgd_c` at 7.462% of the
window. SATD4x4, SAD8x8/16x16 and MPEG-4 block decode are other concrete hotspots.
Pinned source inspection identifies the scalar background/SAD loop and the
architecture-specific SAD/SATD initialization; URLs, byte counts and hashes
are retained with the diagnostic.

The full browser conversion—not merely the profile window—produces the exact
19,137,689-byte historical output hash, 1,800 frames, exact timing/both AAC
hashes/metadata/chapter and SSIM 0.987575. Whole-Chromium incremental private
memory is 221.770 MiB in this instrumented run; this is not release certification.
All generated media/profile/temp files were deleted and dist assets restored;
the raw CPU profile is only 304,006 bytes. Compact full report/profile and exact
source/binary provenance are retained in
`evidence/h264-cpu-diagnostic-2026-10-04.json`. An initially generic terminal
success label was corrected for diagnostic mode; raw status/scope already
explicitly denied repeatability and speed acceptance and were not rewritten.

Next investigate an exact-arithmetic Wasm SIMD path for the measured scalar
background/SAD loop, with exhaustive scalar equivalence before any browser
A/B. Preserve every result and codec setting; do not disable a quality heuristic
or pursue more unchanged I/O/LTO trials based on inclusive-stack guesses.
All other original requirements and H.264 release gates remain open.
Final cycle gates passed: 296/296 unit tests, lint, TypeScript, unchanged
405-profile/no-PDF manifest, diff checks and 4/4 restored dist hashes. No owned
conversion Chrome process remains. No speed improvement or public route is claimed.
The final ledger regeneration initially hit a transient Windows `UNKNOWN`
error opening `TESTED.md`. Read-only inspection confirmed a normal intact file;
one subsequent regeneration succeeded. No conversion was restarted or evidence
discarded for this bookkeeping failure.

## 2026-10-04 — H.264 speed-source review and opt-in library LTO

Status: **Partially implemented under M-04; no speed gain claimed**.
Pinned source inspection rejected an explicit low-complexity setting as a no-op:
FFmpeg obtains OpenH264 defaults, and the pinned defaults already select
`LOW_COMPLEXITY`. No unchanged build or conversion was repeated. Exact source
URLs, byte counts, hashes and call-chain findings are retained in
`evidence/h264-speed-source-review-2026-10-04.json`.

A distinct private experiment now adds `WITHIN_H264_LIBRARY_LTO=1` to compile
both OpenH264 and FFmpeg objects with `-flto`; previously only the final link
and native wrapper used LTO. The default remains 0. The non-Docker workflow
accepts the explicit choice, and the manifest records its actual scope. Codec
settings, timing/dimension guards, fixed memory, threads, I/O, public binaries
and registry are unchanged. Eight focused source/provenance tests pass.
Non-Docker run `37159386013` at pushed `8256056` compiled the LTO variant in
408 seconds and passed hosted cleanup. Its Wasm hash is
`ea8bed87c9b59e81d99ce15e22275c261eb0180c069692f304e003d13a75aa59`;
binary parsing confirms 512 initial/max shared pages (32 MiB). The static tool
is 9,019,724 bytes. Only its 2.4 MB hosted artifact was downloaded; the 72 MB
source bundle was not. Both hosted artifacts were deleted and zero remaining
artifacts verified. The dimension-fixed baseline was recoverably moved to
`work/h264-speed-baseline-37157670815` for controlled comparison.

The same harness measured that baseline on the genuine 105,000,218-byte fixture:
three validated outputs have exact historical hashes/AAC/timing/metadata and
SSIM 0.987575. Job times are 27.011/24.663/27.442 seconds, whole-tree increments
222.461/184.793/182.789 MiB; all three satisfy this narrow private gate. These
new successful runs do not erase prior cold-session/model-startup failures or
prove large-file scaling. Source recipe provenance is checked against exact
pinned Git bytes when the historical recipe differs from current source.
Baseline media/profile/temp were deleted and dist assets exactly restored;
JSON/CSV/HTML retained in `outputs/reports/2026-10-03T22-44-50-485Z-private-h264-720p-memory.*`.
The LTO comparison completed three genuine jobs in 28.555/26.524/28.403 seconds
at 228.723/182.086/178.586 MiB incremental whole-tree private memory. All six
baseline/candidate outputs are byte-identical (19,137,689 bytes), with the same
1,800 frames, exact AAC/timing/metadata/chapter and SSIM 0.987575. Median job
time increased from 27.011 to 28.403 seconds (5.15% slower in this paired trial);
**LTO is not accepted as a speed optimization**, despite both narrow private
gates passing. It remains opt-in/off by default, with no public engine change.
`evidence/h264-library-lto-comparison-2026-10-04.json` retains both full raw
reports and exact source/binary/build-log provenance; comparison tests prevent
faster-but-failed-memory, missing-evidence or incomplete-repeat adoption.

Both owned browser/profile/media/temp trees were deleted and four dist assets
restored to published hashes. The baseline tool was restored to its original
path. Exact-target shell deletion of the rejected 9,019,724-byte static LTO
tool was blocked; it was recoverably moved to
`work/h264-rejected-lto-37159386013`, with no alternative deletion mechanism.
Together with the previously policy-blocked static baseline, the three tool
directories contain 25,608,823 bytes and **zero converted-media bytes**. This
cleanup limitation is explicit; deletion is not falsely claimed. Long-session
startup overlap, direct success, multi-gigabyte scaling, fidelity/controls and
other full release requirements remain open. Do not repeat unchanged LTO or
low-complexity trials without a concrete new hypothesis.
Final cycle regression passed 291/291 unit tests, lint, TypeScript, the unchanged
405-profile/no-PDF manifest and exact restored-dist hashes. No owned conversion
Chrome process remains. Next speed investigation should identify actual worker
CPU hotspots and decoder/encoder/I/O costs before choosing another native build;
do not infer an optimization from compiler flags or build duration alone.
No media, source download files or browser profiles were generated during source review.
Historical as-built manifests remain unchanged; only current-source indexes
were refreshed for the opt-in recipe and manifest changes.

## 2026-10-04 — H.264 dynamic-dimension regression and immutable guard

Status: **Partially implemented under M-04; private guard fix browser-validated**.
A focused production-Chrome test independently decoded a genuine 414,540-byte,
48-frame H.264 MPEG-TS source that changes from 320×240 to 640×360. The old
fixed-32-MiB candidate reported success and produced a valid 235,950-byte,
48-frame output entirely at 320×240 with **no warning**. The intended guard
compared frame dimensions to mutable decoder context dimensions; both changed
together, permitting undisclosed scaling. This is a confirmed fidelity bug,
not a memory-related unsupported decision. The initial test selection used an
incorrect route ID and timed out before conversion; that attempt is recorded
and the corrected `mpeg-ts-to-mp4` run establishes the actual native failure.

The private kernel now captures immutable source dimensions after decoder open,
checks every decoded frame before scaling/encoding, and emits an explicit
dimension-change error. No codec settings, output quality, frame rate, I/O
bounds, memory cap, browser flags or published engines changed. Historical
as-built reports remain unchanged; only their explicitly current-source hash
indexes were refreshed. `evidence/h264-dimension-regression-2026-10-04.json`
retains both attempts, all frame dimensions/timestamps, process samples, native
validation and cleanup. Six focused source/provenance tests passed.
Final regression passed 280/280 unit tests, lint, TypeScript, the unchanged
405-profile evidence manifest and diff checks. Every
generated fixture, converted copy, owned profile/temp tree and staging adapter
was deleted or restored; only the reusable static candidate remains.

Non-Docker run `37157670815` at `a1648dd` built the fix in 319 seconds and
passed hosted cleanup. The actual Wasm has one shared memory of 512 initial/max
pages (32 MiB) and hash `5c07ced47bd6587f9e9810a25b74719ba6c03710e098e0cd6754072cb6dc347a`.
The original 48-frame source now fails explicitly before any output writes.
A second genuine 679,056-byte, 96-frame source postpones the dimension change
until after **247,808 real output bytes**; the error leaves no OPFS files and
zero pending/queued operations **before manual test cleanup**. Thus early failure
is not being substituted for after-written-byte cleanup proof.

The ordinary production-browser regression passed 3/3 in 14.1 seconds: both
MP4/Matroska have 48 frames, two exact AAC tracks, metadata/chapters, SSIM
0.997901 and <=1 ms frame timing; direct write-failure cleanup also passes.
`evidence/h264-dimension-fix-validation-2026-10-04.json` preserves exact reports
and binary/source provenance. Diagnostic memory has no stabilized blank baseline
and is **not** a memory acceptance result. All generated media/profiles/temp and
staging were removed; both remote artifacts were deleted, and the 72 MB source
bundle was not downloaded. The fixed static tool (8,294,612 bytes) and old exact
32 MiB static module (8,294,487 bytes) remain explicitly reusable for identical-
settings speed/allocation A/B. Recursive shell deletion of the old module was
blocked; it was recoverably moved to `work/h264-dimension-baseline-37155139021`,
not deleted through another shell. Neither directory contains converted media.

Memory acceptance, direct success, scaling, controls, speed A/B and the other
original release gates remain open. No new public route is claimed.
Final follow-up gates passed: 282/282 unit tests, lint, TypeScript, unchanged
405-profile manifest and exact restored-dist hashes. Disposable Playwright
JSON duplicates were removed after their full evidence was retained.

## 2026-10-04 — Chromium startup utility-service isolation

Status: **Partially implemented under M-04; diagnosis, not acceptance**.
The next action after the unlabelled 249.855 MiB utility peak was two targeted
browser-only observations, not another encoder rebuild or unchanged conversion.
Chrome 154.0.8037.93, the same launch flags and fresh repository-local profiles
were used. No input was selected, no conversion ran, and no private engine was
staged. The first run observed 120 seconds blank and 120 seconds production-site
idle; the second stayed blank for 240 seconds and never started the site server.

Both spawned `on_device_model.mojom.OnDeviceModelService` approximately three
minutes after browser creation (180.259 and 180.159 seconds), at **236.926 and
244.773 MiB** private memory respectively. Full-tree observations were available
for all 238 samples in each run. Complete-tree peaks were 509.516 MiB on the idle
site and 459.203 MiB on the blank-only run. These are **absolute diagnostic
values, not acceptance increments or a substitute blank baseline**.
`evidence/h264-utility-diagnosis-2026-10-04.json` retains full peak trees, service
subtypes, timestamps, raw report hashes, as-executed source hashes and cleanup.

The blank-only result proves this service can start without the converter.
Upstream Chromium source schedules a browser-global device-performance query
with a default three-minute delay, matching the observed timing; this is a
source-backed explanation, not a trace of the installed private backend call.
The earlier utility PID lacked a subtype, so its retrospective identity is
still unproven. The new result does not explain every prior 64 MiB failure.

No utility was excluded from memory, browser feature flag changed, higher
baseline adopted, codec setting altered, or failed result reclassified. Both
owned profiles/temp trees and servers were removed; no media was generated.
The static 32 MiB candidate remains explicitly reusable. Four focused diagnostic
tests pass; the pre-evidence regression passed 276 unit tests, lint, TypeScript
and the unchanged 405-profile manifest gate. H.264 stays private and rejected.
After evidence was recorded, the final 278/278 unit regression, lint,
TypeScript and unchanged public-manifest gate also passed. Generated dist
engine hashes still match published assets; no diagnostic browser remains.
Next work must address actual converter allocation headroom and the cold-browser
startup overlap separately; disabling this browser service, extending a baseline
through its transient peak, or testing only jobs before it starts cannot certify
the original complete-Chromium requirement. Direct saves, controls/complex
fidelity, scaling, speed A/B, reproduction and legal review remain open.

## 2026-10-04 — 32 MiB private H.264 candidate preparation

Status: **Partially implemented under M-04; experiment, not acceptance**.
The non-Docker recipe now accepts only fixed 32 or 64 MiB, with initial and
maximum memory identical and growth disabled. The existing 64 MiB default
remains reproducible; the hosted workflow can explicitly request 32 MiB. No
encoder setting, codec, dimensions, frame rate, quality, native kernel or I/O
bound was changed. This directly tests the known fixed Wasm commitment instead
of raising the 250 MiB complete-Chromium limit. The browser profiler asserts
the actual engine memory against its as-built fixed-memory manifest.

Current-source hash indexes were refreshed for these recipe/manifest edits;
historical as-built manifests and their recorded 64 MiB failures remain intact.
At dispatch, the 32 MiB build, encode and memory/repetition gates were unproven;
the actual results below supersede that preparation checkpoint.
Hosted non-Docker run `37155139021` at `08a9d8f` was dispatched explicitly with
32 MiB and confirmed live. The profiler now has a bounded CDP isolate-heap
sampler for accessible page and worker targets, attached before blank baseline.
It reports JS allocated/used heap, embedder heap and backing storage separately
from primary OS private memory. Timed-out queries stay single-flight until their
actual reply; no unavailable field is converted to zero. Two unit tests and
the complete 272-test unit suite passed before the run; browser diagnostic
availability was subsequently proven by the retained results below.

Run `37155139021` built successfully in 307 seconds; cleanup passed and both
hosted artifacts were deleted (zero remain). Actual binary memory metadata
proves one fixed shared memory of 512 initial/max pages (32 MiB), with no
growth. The superseded 64 MiB local engine was deleted; the new static tool is
8,294,487 bytes. Browser repeats now have actual available CDP worker heaps.

The same 105 MB fixture converted three times with the **identical validated
output hash** as the 64 MiB trials: 1,800 frames, exact timestamps/two AAC
hashes, metadata/chapter, SSIM 0.987575. However, primary increments were
**239.0, 192.5234375 and 423.9453125 MiB**, so this candidate is rejected too.
`evidence/h264-private-memory-32-2026-10-04.json` preserves all evidence. The
third peak was dominated by a newly appearing utility process at 249.855 MiB;
the converter renderer was 161.363 MiB (less than the first-run 203.859 MiB),
and its worker JS heap was 1.65 MB. Do not attribute this spike to the encoder
or remove that process from the primary total. Its utility subtype was not
retained by the initial sampler, so that precise service is not yet identified.
OS samples now retain utility/service-sandbox subtype labels for the next
targeted diagnostic. No rebuild or unchanged blind retry is needed.

All generated media, temporary browser/profile/download copies and staged
assets were cleaned; only compact failure reports/traces and the static private
tool remain. Actual browser-job times were 28.204, 33.816 and 32.370 seconds.
Cleanup returned to 10.5, 24.137 and 21.094 MiB above loaded idle. No public
H.264 acceptance, memory scaling or fastest-speed claim is made.

## 2026-10-04 — H.264 formal 720p memory rejection and input-reader trial

Status: **Partially implemented under M-04; not accepted**. The private engine
now has an executable whole-Chromium memory gate with five consecutive valid
samples within 2% after at least eight seconds of blank-page stabilization.
No unstable fallback or missing-as-zero samples are allowed. Native FFmpeg
generated a real 105,000,218-byte, 60-second 1280x720/30fps MPEG-4 fixture;
conversion still occurred exclusively inside the production browser pipeline.

The first attempt stopped at Playwright's >50 MiB CDP transfer ceiling, before
conversion. It was corrected to `DOM.setFileInputFiles`, retaining the same
complete fixture rather than reducing its size. The next genuine conversion
produced a 19,137,689-byte H.264 MP4 in 27.392 seconds. All 1,800 frames fully
decoded, frame timestamps matched exactly, two AAC packet hashes/languages and
Unicode title/chapter survived, and corresponding-frame SSIM was 0.987575.
Nevertheless, complete-tree private memory increased by **268.4296875 MiB**
over the stable blank baseline, so the first run failed and further repeats
were not credited. Cleanup recovered to 13.637 MiB above loaded idle.

Timestamped JSON/CSV/HTML and the compact failure trace are retained under
`outputs/reports/*-private-h264-720p-memory*`; source, output, browser profile
and temporary files were deleted, and staged engines restored to published
hashes. Most growth was in the converter renderer. The existing synchronous
slice reader is a hypothesis, not yet a proven cause: the next private trial
selects the already-implemented reusable async BYOB bridge, keeping identical
input, native engine, encoder settings, quality and primary memory thresholds.
No public code, engine or registry profile changed.

BYOB follow-up: the identical source SHA-256 and identical output SHA-256,
frame timing, SSIM, audio and metadata checks passed in both trials. One run
measured 245.574 MiB but failed the initial over-broad request guard. A fresh
repeat measured **269.171875 MiB**, so BYOB alone is not accepted and the
three-run gate remains unpassed. Runtime records prove the flagged exact TTS
script was a body-free local read initiated by its own Chrome extension service
worker, not the converter. The private guard now records only that exact local
resource separately; converter-initiated extension reads, arbitrary extensions,
external HTTP requests and any request body still fail. All Chrome processes
remain included in memory measurement. No larger baseline was substituted.

`evidence/h264-private-memory-2026-10-04.json` retains all four attempts' build/
execution hashes, stabilized baselines, full process/realm/queue samples,
independent decoded-frame diagnostics, failures and cleanup. Browser-job
browser-job times were 27.392 s for slices, 28.529 s and 30.796 s for BYOB;
these single rejected trials are not an accepted speed optimization. Accessible
worker heap values are null, explicitly unavailable rather than zero. Next:
instrument worker allocations and test a lower fixed native-memory candidate
without changing the fixture, quality, timestamps or the whole-tree threshold.

## 2026-10-04 — H.264 small-fixture timing and fidelity pass

Status: **Partially implemented under M-04; small correctness gate passed**.
Non-Docker run `37151713630` at `bf36505` built the timing candidate and passed
runner cleanup. Production Chrome 154 passed all three private browser tests
in 18.3 seconds: genuine H.264 MP4, genuine H.264 Matroska, and direct selected-
destination write-failure cleanup. This is not a stress benchmark or public
profile acceptance. The two two-second inputs were 486,383 and 488,296 bytes;
outputs were 355,227 and 352,442 bytes. No extension-only conversion was used.

Both outputs independently decoded all 48 frames at 320x240, retained exact
AAC payloads for two audio tracks/languages, Unicode title and chapters, and
passed SSIM >=0.98 (0.997901). MP4 frame timestamps now match exactly; Matroska
rounding is at most 0.337 ms. Native duration checks passed: MP4 2.026 s versus
source 2.021 s, and Matroska 2.021 s versus source 2.021333 s. The source MP4
chapter-associated binary-data stream is explicitly excluded from Matroska
with a warning, while the real chapter remains preserved. Fixed 64 MiB Wasm,
256 KiB read/write/queue bounds, one pending operation and empty terminal queues
passed. No frame skipping, cast emulator or relaxed primary memory threshold
was introduced. Source and output validation copies are deleted in finally.

`evidence/h264-timing-validation-2026-10-04.json` retains source/build/module
hashes, all frame times, independent probes/full-decode diagnostics, output/
audio hashes, bounded metrics and complete-process/realm diagnostic samples.
The process samples use an explicitly non-stabilized diagnostic baseline;
primary incremental private memory is null, not a 250 MiB pass. Diagnostic
history now has a 1,024-row hard limit and read failures are not silently reset.

Disposable browser reports, converted outputs and temporary directories are
gone; private staging was removed and generated engine assets match published
hashes. The hosted run has zero remaining artifacts. Only the 8,294,487-byte
static private candidate is retained under `work/h264-candidate-output` for
the next formal memory/stress gate, avoiding an unchanged rebuild. It contains
no converted media and will be deleted when superseded or no longer useful.

Remaining before any public H.264 route: formal stable-baseline complete-tree
memory, repeatability/scaling on real larger inputs, speed A/B, resolution/
frame-rate/bitrate/quality controls and rate-control disclosure, complex/VFR/
rotation/color/multiple-video fidelity, successful direct output, cancellation
and recovery, exact reproduction and legal deployment review. The full goal
is not complete, and the public engines/registry remain unchanged.

## 2026-10-04 — genuine H.264 frames; mux timing/duration still fail

Status: **Partially implemented under M-04**. The typed fix built in non-Docker
run `37131418144` at `3dce604`, with runner cleanup passed. Production Chrome
converted MPEG-4 into genuine H.264 in both MP4 and Matroska: 48 decoded frames,
320x240 dimensions, two exact AAC packet streams/languages, Unicode title and
chapter retention passed their assertions. The direct selected-destination
write-failure test passed and left no nonzero partial output. Neither output
is accepted for publication, speed or complete-process memory certification.

First browser cycle: two validation failures and one write-failure pass. A
focused independent diagnosis reran only the two conversions and retained all
48 frame times, native probes/full decode, exact audio hashes, output hashes,
bounded I/O metrics and whole-process/realm diagnostic samples in
`evidence/h264-browser-followup-2026-10-04.json`. Corresponding frames have SSIM
0.997901 in both containers. MP4 instead moves frames after the first by
21 ms (timestamp-aligned SSIM 0.908997); this is real timing corruption, not
acceptable visual quality. Matroska rounds frame times within 0.337 ms but
`live=1` suppresses duration, so FFprobe cannot report the required duration.
The native log also states OpenH264 cannot guarantee rate control without frame
skipping; bitrate/profile behavior remains a separate unpassed gate.

The next private candidate disables automatic timestamp shifting and delays
only the bounded MP4 initial fragment header for accurate edit lists. Matroska
uses normal seekable finalization with a hash-pinned, opt-in `bounded_no_cues`
patch, disabling only duration-sized cue collection while retaining actual
packet-derived duration and tag/segment finalization. No input-duration guess
or false duration tag is substituted. Zero-fuzz patch dry-run passed after an
initial context mismatch was corrected before hosted dispatch. Defaults in the
upstream muxer remain unchanged unless the private option is selected.

The browser validator now separately checks every presentation timestamp to
within 1 ms and SSIM >=0.98 on corresponding decoded frames. This avoids the
framesync prior-frame comparison caused by differing container time bases
without allowing ordinal quality to hide timing errors. Original SSIM values
remain diagnostic evidence. No public engine, selector or route has changed;
full-process memory, stress/scaling, reproducibility, fidelity/options and legal
review still gate publication. Do not repeat the first typed candidate: its
two outputs have already been diagnosed.

Cleanup verified after compact evidence: generated fixtures and converted files
were deleted by the suite's finally hooks; candidate binary, browser temp data,
mux-source inspection, traces and both remote artifacts were deleted. Generated
production assets are restored to exact published hashes and `work` contains
only `.gitkeep`. No protected `test.mkv` data was used or altered.

## 2026-10-03 — H.264 native call diagnosed; typed fix pending validation

Status: **Partially implemented under M-04**. Symbolized non-Docker run
`37130206064` at `b232557` passed build and runner cleanup. One focused
production Chrome 154 test reproduced the same trap, now named
`svc_encode_frame` at Wasm offset `0x33a22d`, after 2,385 partial output bytes.
The actual `call_indirect` requests `i32 (i32, i32)` while its OpenH264
`ForceIntraFrame(bool, int)` target is `i32 (i32, i32, i32)`. The pinned
OpenH264 C vtable omits the layer parameter present in its C++ virtual method.
This is an identified typed-call bug, not a measured impossibility of H.264.

`media/ffmpeg/openh264-force-intra.cpp` and a source-hash-guarded FFmpeg patch
bridge only that call through C++ with the documented all-layers argument -1.
Source I-frame forcing is retained; no global cast emulator, memory-limit
increase, frame skipping, or fidelity relaxation was introduced. The exact
upstream file hash and zero-fuzz patch dry-run passed. An initial dry-run with
insufficient patch context failed and was corrected before hosted dispatch.
Corresponding-source bundles now include both bridge and patch, and candidate
manifests hash them. The encoder kernel and public engines remain unchanged.

`evidence/h264-typed-call-diagnosis-2026-10-03.json` preserves the named failure,
module/symbol/source hashes, Wasm signatures, exact proposed fix, and cleanup.
The symbolized candidate, native inspection download, fixtures/outputs, browser
temp directory, traces and both hosted artifacts were deleted after compact
diagnosis; generated assets were restored to exact public hashes. `work` again
contains only `.gitkeep`. The Windows paging-file error on the first inspection
was transient; commands were retried through a lighter shell without killing
unrelated applications or changing system settings. No large/stress test ran.

Next gate: build the typed fix and validate genuine MP4/Matroska outputs and
direct-write cleanup through the production browser. Fidelity, speed A/B,
full-process memory, repeated stress/scaling, recovery, reproducibility and
legal review still gate publication. No new H.264 profile is public.

## 2026-10-03 — isolated H.264 encoder implementation (acceptance pending)

Status: **Partially implemented under M-04**. A separate OpenH264 2.6.0 /
FFmpeg 8.1.2 candidate now has a source-pinned non-Docker build recipe and a
real native decode/encode kernel using the unchanged audited production AVIO
bridge. It preserves source frame timestamps rather than normalizing them,
copies compatible secondary streams, chapters, Unicode tags and display
matrices, bounds tracks/attachments and muxer fragments, propagates write
errors, and requests one codec thread with a fixed 64 MiB Wasm memory.
The recipe writes only `work/h264-candidate-*`, keeps compiler caches there,
preflights 8 GiB free, and cleans build data on exit. Existing published engines
and the public registry are untouched. Two focused source/recipe tests passed.
These are source tests, NOT conversion, quality, speed or memory certification.
The first hosted build `37127085458` at `be295ea` failed after OpenH264 compiled:
FFmpeg configure could not discover its installed Wasm pkg-config entry.
Inspection of pinned Emscripten 6.0.4 `tools/building.py` proved `emconfigure`
overwrites `PKG_CONFIG_LIBDIR/PATH` and reads `EM_PKG_CONFIG_PATH` instead.
The recipe now sets that exact bridge variable and prints configure diagnostics
before final cleanup. The failed runner's cleanup step passed; no binary was
produced or advertised. Do not repeat the original environment configuration.
Corrected run `37127410903` at `807038b` **passed** real Wasm compile/link in
299 seconds (build time, not conversion speed). The 7,761,671-byte Wasm has SHA-256
`32b33cb61326fad3f01f300f7db713ef14f4454fde3ab11739ded628656219df`.
Browser validation uses an explicit test-only module substitution with the
existing production worker/I/O bridge.
The ABI's existing route numbers are adapter sentinels, not public H.264 claims.

OpenH264's BSD source license avoids silently introducing x264/GPL linkage.
A self-compiled Wasm module does **not** inherit Cisco's distributed-binary
patent coverage; deployment legal review remains required. No jurisdictional
patent clearance or unsupported classification is asserted. Remaining gates:
actual Wasm build and reproducibility, genuine browser conversions, metadata/
track/timestamp/content fidelity, quality and identical-input speed candidates,
complete-process memory, repeated stress/scaling, failure/cancel/cleanup,
legal deployment review and consistent production registry/UI integration.

Chrome 154.0.8037.93 exposed a real runtime **function signature mismatch**
after 2,385 partial destination bytes. No H.264 output passed validation.
The MP4 and Matroska candidate conversions failed; direct-write recovery also
remains unproved. The first context-routing adapter did not cover the planner's
MPEG-4 specialist selection: its 32 MiB result was detected and discarded, and
its existing-engine write-failure pass is not credited to H.264. The corrected
adapter is staged only in disposable `dist` assets, handles the existing short
video ABI explicitly, and leaves the public engine directory unchanged.
`scripts/stage-h264-candidate.mjs restore` verifies and restores exact published
asset hashes. Whole-Chromium diagnostic process/realm samples were retained,
but the failed short conversion and non-stabilized blank measurement are not
250 MiB certification. Bounded diagnostic deadlines prevent a trapped worker
from hanging heap sampling; unavailable samples remain null.

`evidence/h264-encoder-feasibility-2026-10-03.json` retains exact build/source/
module hashes, both hosted attempts, rejected adapter details, the typed-call
stack (first Wasm function 2213), partial-output I/O metrics and whole-process
diagnostics. The next build adds function names/symbol mapping to locate that
call site, not global function-pointer emulation or a raised memory limit.
Local source/unit/manifest gates passed 258/258 and 405/405 respectively; build,
lint and TypeScript passed. Existing binaries/routes remain unchanged.
The failed candidate/source bundle, generated fixtures/outputs, browser temp
data, traces and remote artifact were deleted after compact evidence; `work`
contains only `.gitkeep` and generated production assets are restored. GitHub
CLI's transient default-temp artifact ZIP was observed and verified removed;
future downloads must set repository-local `TEMP/TMP` explicitly. No protected
`test.mkv` data was used or altered. Do not repeat the unsymbolized candidate.

## 2026-10-03 — Unicode audio source metadata and CI

Status: **Verified complete for this nine-route source-field matrix; M-08 stays
Partially implemented overall**. Production Chrome 154 passed WAV/WMA/AIFF/
ALAC-in-M4A/MP3-to-FLAC, FLAC-to-WAV/ALAC/WMA, and WAV-to-ALAC in 20.9 seconds.
All 60 expected Unicode fields survived: seven common fields in eight cases and
AIFF NAME/AUTH/ANNO/copyright in its four-field case. Independent FFprobe and
complete native decode validated all outputs; all eight lossless-output cases
matched exact decoded PCM hashes. The independent MP3 reference explicitly uses
the fixed-point decoder, and WMA uses scalar decoding, matching the Wasm
algorithms. Default float/SIMD references differed by one S16 unit; those
diagnostic failures are recorded rather than relaxed into a fidelity tolerance.

The executable suite asserts empty OPFS after every conversion and removes
native validation copies and generated fixtures in `finally`/`afterAll`.
It is now part of hosted browser CI with repository-local temporary profiles.
`evidence/audio-source-metadata-matrix-2026-10-03.json` retains exact source,
output, PCM, and module hashes, per-route I/O bounds, decoder diagnostics, and
scope limits. This changed no engines/routes and is not new stress, complete-
process memory, artwork, speedup, or lossy-output quality certification.
Production build, lint, TypeScript, 251/251 unit tests, the 12-engine manifest,
and the 405/405 public-evidence gate passed. All generated inputs, outputs,
profiles, compiler caches, and disposable failure artifacts were deleted after
compact evidence was retained; `work` contains only `.gitkeep`.
Hosted run `37124116727` also passed the nine metadata cases in 27.0 seconds
and 18 privacy/offline cases. Its aggregate result was **failed**, not green:
the new repository-local temporary directory names produced 125–135-byte
Chromium singleton socket paths and prevented the three existing persistent-
browser suites from launching on Linux. The CI path is now shortened to
`work/t.XXXXXX` (104 bytes including the observed socket suffix), with an
explicit regression test and unchanged conversion/validation thresholds.
Corrected run `37124433469` at pushed `55813ed` passed aggregate verification:
252 hosted unit cases (251 passed, one platform-specific skip), 18 privacy/
offline, 9 metadata, 238 streaming, 153 image, and 554 media cases. Local unit
coverage passed 252/252. All three failed-run trace archives were deleted
after diagnosis; both runs now retain zero artifacts. Engine reproduction
was deliberately not repeated because no engine bytes changed. Keep the
original launch failure distinct from a conversion-engine or metadata failure.
Remaining M-08 work includes other representable fields, Ogg/Opus destination-
scope mappings beyond MP3/FLAC, AIFF-output aliases, and additional destination-
specific artwork representations where practical. Do not repeat this small
matrix without a source, engine, validator, or contract change.

## 2026-10-03 — explicit media output-encoder gap inventory

Status: **Partially implemented under M-04**. The current native video encoder
selection and published controls expose VP8, VP9, MPEG-4 Part 2, and Theora.
Fresh H.264/AV1/MPEG-2/HEVC output encoders are absent. AV1/VP8/VP9 software
media decoders are also absent from the published FFmpeg decoder inventory.
Successful decode of other codecs, lossless packet copy, elementary wrapping,
audio extraction, or separate image codecs do not prove these missing media
encode/decode paths. `evidence/media-output-encoder-inventory-2026-10-03.json`
binds this distinction to exact current manifest/wrapper hashes and source
selection; two unit gates prevent that evidence from silently drifting.
No codec was newly rejected, benchmarked, or advertised by this read-only audit.
The resulting local gate passed 254/254 unit tests, lint and the unchanged
405/405 public-evidence manifest. No application code or engine bytes changed
after the corrected five-job browser/verification CI run.
Investigate a source-pinned bounded specialist H.264 encoder first, then the
remaining practical decoder/encoder families, with genuine build/browser,
quality, speed, memory, privacy and cleanup gates. Do not replace these missing
implementations with an unsupported label lacking measured/legal evidence.

## 2026-10-03 — headed category audit and warning reset

Status: **Verified complete for representative T-12 categories and required
interaction flows**. Seven additional production-headed successes cover
XLSX-to-CSV, eight-frame APNG-to-GIF, 7Z-to-TAR, WMA-to-FLAC, 3GP-to-MKV,
TXT-to-DOCX and GZIP. The last two use the normal page and destination-selection
button with a test-only picker adapter; independent .NET ZIP/XML and GZIP
validators verify exact Unicode content. Chrome 154 also passed direct-write
rejection and cancellation of the protected 2,958,573,265-byte `test.mkv` after
1,405,091,840 destination bytes, removing staging and partial output. Combined
with the September headed audits, this covers the required representative
media, audio, static/animated image, archive, compression, data, office/document,
ebook, subtitle, batch, cancellation, failure, quota, permission, reload and
cleanup flows. It does not assert exhaustive manual review of all 405 routes,
native OS picker dialogs, or new complete-process memory certification.

The audit found completed DOCX warnings lingering after switching the output
format to GZIP. Format changes now clear old warnings and reset phase to Ready.
The focused production-browser regression passed 1/1 in 8.3 seconds; build,
lint, TypeScript, 248 unit tests and 18/18 privacy/offline cases passed.
Exact UI scope, output/screenshot hashes, browser-version limitations and cleanup
are recorded in `evidence/headed-category-expansion-2026-10-03.json`.
The broader P-04/M-04, M-08, speed, and current-browser memory/scaling work remains.

## 2026-09-25 — MPEG-2 elementary to OGV publication

Status: **Verified complete for the 136,166,136-byte public route gate** under
P-04/M-04/P-08; P-07 multi-gigabyte scaling for this new route remains
partially evidenced. The
single-thread `within-theora` Wasm genuinely decodes raw MPEG-2 and encodes
Ogg/Theora. The 136,166,136-byte source produced the identical independently
validated 86,555,131-byte OGV in three accepted Chrome runs per destination
mode, with all 11,904 frames fully decoded and midpoint SSIM 0.826148. The
accepted staged direct-save runs peaked at 246.250 MiB in an independent cold
session and 245.324/225.078/221.141 MiB in one repeated session; elapsed
time was about 194–195 seconds. The corrected three-run OPFS gate passed at
247.789/227.902/230.453 MiB, with 32 MiB Wasm, 256 KiB input and bounded
output/queue, one pending write, cancellation, and cleanup recovery. A
highest-quality cold direct run passed at 239.625 MiB and produced a fully
decoded 118,761,511-byte OGV in 196.183 seconds, with final-copy cancellation
and stage cleanup. Focused width/frame-rate/quality controls, injected write
failure, and headed UI checks passed. The public registry records 136,166,136
tested bytes and discloses browser-private staging; the narrowest observed
headroom is only 2.211 MiB, not a cross-device guarantee. The original direct
writer failed at 250.125 MiB, and an earlier OPFS harness timed out after three
validated conversions; both rejected outcomes remain in
`evidence/m2v-to-ogv-candidate-2026-09-25.json` and
`evidence/m2v-to-ogv-staged-save-2026-09-25.json`. A fixture-only 25-versus-24
fps validation error was corrected without changing the large source bytes.
Other OGV/legacy combinations under P-04/M-04 remain partial or unsupported.
Disposable copies, the large fixture, and raw reports are removed after
compacting this cycle.

## 2026-09-25 — MP4-to-OGV staged-save rejection

Status: **Intentionally unsupported, still hidden** under M-04/P-08. The exact
147,242,147-byte deterministic H.264 MP4 from the earlier failed gate was
regenerated byte-for-byte. Reusing the M2V route's bounded staging produced the
same independently validated 8,840,421-byte Ogg/Theora output, but it did not
meet the unchanged complete-Chrome memory gate repeatably: two clean sessions
measured 240.520 and **264.445 MiB**. Both process-tree peaks were near 507
MiB; the second stable blank baseline was about 23 MiB lower, which the exact
acceptance formula must honor. Conversion also slowed to about 34 seconds from
the earlier roughly 22-second candidate. The first harness attempted to cancel
an 8.8 MB final copy after it had already finished; the corrected early-encode
cancellation and cleanup passed, but the memory failure remained. MP4-specific
staging code was reverted, not advertised. The selective generator option is
retained because it creates only the needed MP4 instead of an unrelated MOV.
The new exact hashes and rejected results are in
`evidence/mp4-to-ogv-staged-save-rejection-2026-09-25.json`. A substantially
lower absolute peak, without weaker fidelity, source size, or process coverage,
is still required before publication.

## Latest hosted verification

Pushed commit `a4ada51` passed [no-Docker verify-only run 36155614222](https://github.com/tanishqbaweja/fileconverter/actions/runs/36155614222): production build, public-evidence audit, lint, TypeScript, 248 unit tests, privacy/offline, and all three browser conversion partitions with independent validators. The media partition includes the corrected raw-MPEG-2 timing assertions and the public M2V-to-OGV route. The scoped [no-Docker FFmpeg reproduction run 36105796022](https://github.com/tanishqbaweja/fileconverter/actions/runs/36105796022) had already rebuilt and verified the unchanged published FFmpeg artifacts byte-for-byte, removed its build data, and retained no mismatch artifact.

The verify-only no-Docker run [35877953801](https://github.com/tanishqbaweja/fileconverter/actions/runs/35877953801)
passed the build, 243 unit tests, and privacy/offline gate, but the full browser
matrix is **not green**: 149/153 image tests and 546/553 media tests passed.
The four image failures were BMP routes blocked by Linux Chromium's missing
`image/bmp` ImageDecoder. A bounded BMP row decoder now passes the four
focused local browser tests, and BMP-to-PNG at the 24,883,254-byte published
maximum passed three-run OPFS and direct-save memory gates at 155.309 and
184.758 MiB worst complete-Chromium incremental private memory. Exact proof
is in `evidence/bmp-row-decoder-current-chrome-2026-09-23.json`. On 2026-09-24
all three other BMP routes also passed three-run maximum-size OPFS and direct
memory gates with independent decode, visual fidelity, repeatable hashes,
bounded I/O, and cleanup: worst JPEG 139.816 MiB, WebP 183.609 MiB, and ICO
158.352 MiB. The same evidence file records all eight mode/profile report
hashes. Hosted image verification passed 153/153 on run 35999027801.
At that checkpoint, seven media failures (two raw-HEVC duration tolerances,
one WebM chapter offset, and four FLV warning expectations) still needed
diagnosis; do not equate the earlier 404-route ledger with a currently green
hosted browser run.
On 2026-09-24, the four FLV warning assertions were corrected to match the
published engine's more accurate AAC-or-MP3 disclosure and passed 4/4 focused
production-browser tests. A proposed source-MOV-relative HEVC duration check
was rejected after the protected-source test differed by 0.202 seconds:
container composition timing is not the raw elementary stream's timestamp
contract. The replacement test probes the exact raw HEVC source, requires
the same decoded frame count and 25 fps rate, checks the normalized final
timestamp within 0.01 seconds, and derives the documented 640-pixel width
cap without assuming the CI fallback is the same size as `test.mkv`.
Both HEVC-to-WebM routes passed 2/2 with the protected source and 2/2 with
the synthetic CI fallback. Hosted run
[35997586416](https://github.com/tanishqbaweja/fileconverter/actions/runs/35997586416)
passed 153/153 image browser tests, the privacy/build/unit verify job, and
the streaming browser partition on the pushed BMP fix; its media tests predate
the FLV assertion correction. The WebM chapter test now checks two exactly
2-second source chapters and requires exact source-to-output chapter timestamps
instead of assuming a platform-independent zero start; 1/1 focused browser
test passed locally and the next hosted media run passed this case.
The next hosted run [35999027801](https://github.com/tanishqbaweja/fileconverter/actions/runs/35999027801)
passed the verify, image, and streaming jobs, but 551/553 media tests passed.
Its two failures were (1) the cheap synthetic raw-HEVC cancellation clip could
finish before the UI button was clicked and (2) Linux FFprobe exposed FLV's
single enhanced AAC header as an unidentified second audio stream. The
synthetic-only cancellation source now loops 400 times while the protected
source keeps the same 40-loop test, and the FLV assertion counts recognized
AAC media streams while `inspectFlvAacSignals` and `runMediaRoute` still
validate the exact enhanced header and reject other unknown streams. Both
focused production-browser tests passed with the CI synthetic fixture, and
the cancellation test passed three repeat runs. A project-local free-space
preflight bounds fixture generation. The next hosted run revealed the separate
worker-message starvation flaw described below.
The no-Docker [36001599742](https://github.com/tanishqbaweja/fileconverter/actions/runs/36001599742)
verify-only run passed build, lint, TypeScript, unit, privacy/offline, all image
tests, and all streaming tests, but media finished 552/553. Waiting for the
first real output byte exposed a genuine cancellation flaw: synchronous FFmpeg
Wasm could keep the conversion worker's message loop occupied, so its cancel
`postMessage` remained unread while encoding. The production UI now gives each
FFmpeg job a four-byte shared atomic cancel signal; the existing native
per-packet cancellation checks read it without switching to a slower I/O path.
The synthetic hosted-style focused test passed three runs after first writing
real output and then cancelling, with partial-output cleanup, bounded I/O, and
zero pending operations. A genuine successful HEVC-to-VP8 WebM conversion also
passed the focused browser validator. Production build, 243 unit tests, lint,
and TypeScript passed. The stronger fix still needed hosted confirmation and
current-Chrome memory remeasurement at that checkpoint; do not count the failed CI as green.
The corrective no-Docker [36004924350](https://github.com/tanishqbaweja/fileconverter/actions/runs/36004924350)
run at `fc3a4bb` passed all four verification jobs: build/lint/TypeScript,
243 unit tests, 15 privacy/offline cases, 153 image browser conversions,
238 streaming browser conversions, and 553/553 media browser conversions,
including genuine in-flight HEVC cancellation. It retained zero Actions
artifacts. This resolves the hosted cancellation regression. The subsequent
three-run Chrome 153.0.8010.53 HEVC-to-WebM large-file remeasurement passed at
241.711 MiB worst incremental complete-Chromium private memory against the
unchanged 250 MiB limit; all three 134,752,786-byte genuine HEVC re-encodes
produced the identical fully decoded 52,300,521-byte VP8 WebM. Compact
hash-bound evidence is in `evidence/hevc-to-webm-current-chrome-2026-09-24.json`.
This does not close the broader original-specification gaps below.
To avoid repeating these expensive browser partitions when checking engine
reproducibility, CI now offers a separate `reproduce-only` dispatch that rebuilds
all 11 published Wasm engines without Docker. The local engine-manifest audit
and parsed workflow check passed. Hosted run
[36002113153](https://github.com/tanishqbaweja/fileconverter/actions/runs/36002113153)
passed exact no-Docker rebuilds of all 11 engine directories, including
FFmpeg, with every artifact-diff check green, all applicable scoped cleanup
steps green, and zero retained GitHub Actions artifacts.
The newer no-Docker [verify-only run 36052482467](https://github.com/tanishqbaweja/fileconverter/actions/runs/36052482467)
on pushed commit `8284475` completed successfully: production build, lint,
TypeScript, 244 unit tests, 15 privacy/offline browser tests, 153 image
conversions, 238 streaming conversions, and 553 media conversions with
independent validators. All four verification jobs passed and the run retained
zero artifacts. This includes the corrected non-media inspection disclosure.

## Product and acceptance contract

| ID   | Requirement                                                                                    | Status                                                                            | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Remaining work                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P-01 | Real conversions execute entirely in the browser; the server serves only application assets    | Verified complete                                                                 | Worker implementations under `workers/`; custom engines under `public/engines/`; production-browser tests under `tests/browser/`; privacy description in `README.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Keep network tests mandatory as routes are added.                                                                                                                                                            |
| P-02 | Never transmit files, filenames, decoded data, extracted text, temporary data, or outputs      | Verified complete                                                                 | `tests/browser/privacy-offline.spec.ts` rejects non-GET, cross-origin, filename, and fixture-content requests; `.github/workflows/ci.yml` runs it as an explicit hosted gate; `README.md` documents the same boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Keep the explicit privacy gate mandatory as routes are added.                                                                                                                                                |
| P-03 | No PDF input, output, or tooling                                                               | Verified complete                                                                 | Registry/unit gate and `TESTED.md` report zero PDF profiles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Preserve this prohibition.                                                                                                                                                                                   |
| P-04 | Broadest technically practical mainstream format coverage                                      | Partially implemented                                                             | 405 public passed profiles across all named categories in `TESTED.md`; exact gaps are listed at its end; HEIF/HEIC, camera RAW, and SVG now have explicit evidence-backed boundaries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Implement or defensibly reject the remaining media combinations below.                                                                                                                                       |
| P-05 | Public selector exposes only genuine, tested routes from the central registry                  | Verified complete                                                                 | `lib/capability-registry.ts`, `publicProfilesFor`, registry unit tests, and the generated `TESTED.md` table                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Re-run the registry/report consistency audit after every promotion.                                                                                                                                          |
| P-06 | Every public profile remains at or below 250 MiB complete-Chromium incremental private memory | Partially implemented | The compact audit has strict three-run evidence for 405/405 public profiles. Chrome 153 exposed regressions in historically narrow routes: M4A-to-AIFF now uses a route-scoped 16 MiB specialist and passed at 246.648 MiB worst direct; MP4-to-AVI now uses quota-preflighted synchronous private staging plus one bounded destination copy and passed at 246.566 MiB worst direct. AVI-to-3GP is restored through bounded private staging; nine direct runs peaked at 244.000 MiB and three OPFS runs at 233.363 MiB on Chrome 153. Exact outcomes and caveats are in `evidence/aiff-specialist-browser-acceptance-2026-09-20.json`, `evidence/mp4-to-avi-current-chrome-optimization-2026-09-21.json`, and `evidence/avi-to-3gp-staged-current-chrome-2026-09-23.json`. | Continue current-browser regression and other public-route memory audits; accepted routes and the historical ledger do not guarantee every profile on every Chrome version/machine. |
| P-07 | Memory remains approximately independent of total file size                                    | Verified complete for representative stream-copy and genuine re-encode topologies | `evidence/size-independent-memory-audit-2026-09-07.json` locks the raw report hashes and keeps two series distinct. HEVC-to-VP8 browser re-encoding grew input 78.98x (37,460,711 to 2,958,573,265 bytes) and output 129.67x while complete-Chromium incremental private memory grew only 1.34x (155.6 to 208.8 MiB); the full point passed three repeatable 44.7-minute runs and wrote a genuine 921,524,214-byte VP8 WebM. Separate 6.443/10.738 GB HEVC/AAC stream-copy remuxes grew memory only 1.08x (194.8 to 210.3 MiB) with near-identical throughput                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Apply the same scaling audit when a new engine changes the bounded I/O or allocation topology. Do not generalize representative scaling to every route or describe the 92-second 10 GB remux as re-encoding. |
| P-08 | Optimize conversion speed without weakening correctness, privacy, fidelity, cleanup, or memory | Partially implemented                                                             | `TESTED.md` contains measured accepted and rejected optimizations. `evidence/remux-performance-audit-2026-08-28.json` records an identical three-run 2.958 GB A/B: the retained 1 MiB direct specialist's 36.064 s median is 16.4% faster than the 256 KiB candidate, with identical output SHA-256 and both under 250 MiB. `evidence/compatible-webm-copy-2026-09-07.json` accepts standards-compatible AV1/VP8/VP9 packet copy: a 170,427,228-byte VP9/Opus source passed 3/3 in 1.42–1.79 seconds at 206.7 MiB worst complete-Chromium incremental private memory. `evidence/compatible-ogv-copy-2026-09-07.json` accepts Theora/Vorbis packet copy: a 136,906,650-byte source passed 3/3 in 1.13–1.16 seconds at 211.3 MiB worst memory. `evidence/compatible-avi-copy-2026-09-08.json` records the historically fastest standards-correct Matroska-to-AVI path, now hidden after current-Chrome memory failure. `evidence/compatible-avi-source-expansion-2026-09-08.json` extends that packet-copy path to MP4, MOV, 3GP, and MPEG-TS: five 177,146,977–199,649,420-byte sources passed 3/3 in 1.440–2.878 seconds at 249.1 MiB worst memory with exact packets, full decode, repeatability, cancellation/write-failure cleanup, and genuine OpenDML structure. `evidence/compatible-avi-mpeg2-2026-09-08.json` adds MPEG-2 packet copy: a 215,339,432-byte MPEG-2/MP3 Matroska source passed 3/3 in 2.512–3.133 seconds at 232.348 MiB with exact packets, full decode, repeatable output, cancellation cleanup, and 27 genuine OpenDML segments. `evidence/avi-to-mpegts-browser-2026-09-12.json` adds the minimum-work AVI-to-MPEG-TS packet-copy path: 159,500,442 bytes passed six accepted runs in 1.097–6.583 seconds at 245.297 MiB worst memory with exact video/audio packets, full decoded-video equality, repeatability, and cleanup. `evidence/avi-to-flv-browser-2026-09-12.json` records the one-worker direct-save optimization: the rejected two-worker path peaked at 256.957 MiB, while the accepted path passed six 145,328,774-byte runs in 1.302–6.318 seconds at 222.395 MiB worst memory with exact packets, decoded-video equality, cancellation, and cleanup. `evidence/avi-to-ogv-browser-2026-09-13.json` records the Theora speed-level and input-reader A/B: speed level 2 was 29.2% faster than level 0, the 287.438 MiB synchronous reader was rejected, and the asynchronous reader passed six genuine re-encodes in 17.25–18.09 seconds at 231.684 MiB worst memory. `evidence/mp4-to-avi-current-chrome-optimization-2026-09-21.json` replaces a Chrome 153 direct path that took 46.2–46.4 seconds and peaked at 300.184 MiB with quota-preflighted synchronous private staging plus one bounded final copy: three runs completed in 3.976–4.268 seconds at 246.566 MiB worst memory with identical output SHA-256, an 11.10x median speedup, exact packets, full decode, repeatability, and final-copy cancellation/failure cleanup. | Continue benchmark-before/after work per remaining route; record rejected candidates here and in `TESTED.md`. Do not invent a speedup where the prior route was blocked rather than slower.                  |

## Bounded architecture and storage

| ID   | Requirement                                                                                                                                                                                                                                  | Status                                            | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Remaining work                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A-01 | No complete large-file ArrayBuffer, MEMFS copy, full-output Blob, base64 copy, or unbounded output-chunk collection                                                                                                                          | Verified complete for current public routes       | Bounded workers and custom I/O; source search finds only bounded slice/sample uses in `webp-animation.ts` and `sevenzip-conversion.ts`; browser metrics enforce read/write/queue limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Keep a static forbidden-pattern audit and review any future Blob/ArrayBuffer use for a hard size bound.                     |
| A-02 | Bounded read-only seekable browser source with documented maximum reads                                                                                                                                                                      | Verified complete                                 | Shared source adapter and custom media AVIO; reports expose `maxReadChunkBytes`, generally capped at 256 KiB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Preserve the report gate for new engines.                                                                                   |
| A-03 | Real random-access direct destination with seek, truncate, flush, close, error propagation, cancellation, and backpressure                                                                                                                   | Verified complete                                 | `workers/random-access-destination.ts`, direct-destination worker/bridge, direct-handle browser tests, headed success/cancellation/failure audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Add equivalent headed sampling for more engine families.                                                                    |
| A-04 | At most a small fixed number of pending writes and a hard queued-byte limit                                                                                                                                                                  | Verified complete                                 | Route reports and browser assertions require at most one pending operation and bounded queued bytes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Keep profile-specific queue ceilings explicit.                                                                              |
| A-05 | OPFS is fallback/scratch only, with quota checks, warnings, persistence handling, fixed-buffer copy, automatic cleanup, and manual management                                                                                                | Verified complete                                 | Storage estimate, startup/manual cleanup UI, abandonment/reload/quota/failure tests, fixed-buffer destinations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Continue route-specific scratch cleanup tests.                                                                              |
| A-06 | Generated fixtures and converted copies remain project-local and disposable data is removed                                                                                                                                                  | Verified complete                                 | `scripts/cleanup-generated.mjs` exact hash-verified MKV-to-AVI cleanup option, category `finally` cleanup, cleanup ledger, and `work/.gitkeep`; all current generated MKV-to-AVI fixtures and raw reports are now absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Preflight free space before every new large run and inspect cleanup after every failure.                                    |
| A-07 | Expensive work runs in dedicated workers; engines are lazy-loaded and terminated/released                                                                                                                                                    | Verified complete for current engines             | `workers/conversion.worker.ts`, route-specific workers, worker lifecycle tests and metrics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Verify the invariant for every new engine.                                                                                  |
| A-08 | Fixed-size logs/samples/messages; references released; Wasm initial/max memory explicit and fail-safe                                                                                                                                        | Verified complete for current workers             | `tests/worker-lifecycle.test.mjs` inventories all 31 worker modules and both message loops, rejects unreviewed module-scoped mutable state and mutation of module containers, proves terminal worker cleanup, forbids binary response payloads, and locks fixed diagnostic/message/batch bounds. Batches stop at 256 files before inspection/output; progress is throttled to at most 8 non-forced messages/s; phases are 256 characters, warning/errors 2,048 characters, the UI retains 8 warnings, direct writes use one 256 KiB payload plus a 4 KiB error channel, and native diagnostic rings retain 8 or 32 entries of 512 characters. Production Chrome passed 10/10 sequential-batch, ceiling, write/quota/permission, crash/restart, reload, OPFS cancel, and direct-cancel cases in 20.2 seconds. Fixed Wasm manifests and profile memory evidence remain separately enforced. `evidence/worker-lifecycle-bounds-2026-09-01.json` records the audit. | Re-run and explicitly extend the inventory/allowlist whenever a worker or retained-state path changes.                      |
| A-09 | Full diagnostic telemetry: stable blank/loaded baselines, process-tree RSS/private memory, per-process data, every accessible JS realm, Wasm, SAB, queues, workers, output, storage, throughput, and peaks; missing samples are null/retried | Partially implemented: private and general Windows stress gates integrated; remaining harness/release coverage pending | Native 100-ms readings combine actual native/CIM peaks without replacing early baseline. Private H264 failed at 434.551 MiB (evidence/h264-uninstrumented-direct-handle-native-100ms-2026-10-04.json). General production selected-handle MKV-to-MP4 passed three protected-fixture runs at 236.500/233.242/200.441 MiB with independently reconstructed peak/process/count/output/cleanup evidence (evidence/production-native-memory-2026-10-04.json); native graph ring retains exact phase peaks beyond long-history eviction. Post-conversion cleanup utility spike remains explicitly recorded. Future general-profile child scratch/log/cache confinement and real helper success/failure cleanup verified separately (evidence/owned-runtime-scratch-2026-10-04.json), not a new conversion gate. | Integrate remaining browser harnesses and adopt owned child-runtime scratch there; preserve blocked scratch inventory without bypass; retain every metric/baseline/formula and measure conversion perturbation; broader release revalidation remains. |

## Media engines and format coverage

| ID   | Requirement                                                                                                                                                    | Status                                                                         | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Remaining work                                                                                                                                                                                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-01 | Custom reproducible FFmpeg Wasm libraries, native wrappers, custom AVIO, genuine mux/demux/decode/encode                                                       | Verified complete                                                              | `media/ffmpeg/Dockerfile`, `within_remux.c`, pinned manifests, published remux engines, browser/native validation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Extend only through reproducible specialist builds.                                                                                                                                                                                                                             |
| M-02 | Automatically inspect codecs/streams and select standards-compliant stream copy when possible, otherwise bounded re-encode                                     | Verified complete for the current certified registry                           | `lib/media-source-inspection.ts` presents bounded details for every named standalone audio family plus multi-stream MP4/MOV/3GP, Matroska/WebM, FLV, MPEG-TS, AVI, and Ogg/Theora inputs. `selectAutomaticMediaProfile` now retains compatible copy, automatically selects a same-destination certified encode fallback, and refuses an uncertified decoder. Production Chrome kept H.264/AAC MKV-to-MP4 copy and automatically changed MPEG-2 MKV from blocked copy to genuine MPEG-4 Part 2 output; the full media-options gate passed 12/12. `evidence/automatic-media-routing-2026-09-07.json` inventories all three current copy-plus-encode input/destination pairings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Add each new copy/encode sibling to the exhaustive inventory. Missing codec combinations without a certified fallback remain visibly blocked and are tracked under M-04. Heterogeneous-codec batches retain per-item native preflight rather than guessing from the first file. |
| M-03 | Preserve all compatible streams, timestamps, chapters, subtitles, attachments, language, rotation, aspect, color, and metadata; explicitly disclose exclusions | Verified complete for the current public profiles                              | Complex Matroska, MOV, 3GP, MPEG-TS, FLV, AVI, genuine WebM, and genuine Ogg origins have direct production-browser field/payload evidence across every compatible public destination, including `evidence/complex-legacy-web-source-field-retention-browser-2026-09-06.json`. `evidence/matroska-attached-picture-browser-2026-09-06.json` closes the remaining attached-picture gap: exact bounded PNG payload, H.264 pictures, AAC access units, representation metadata, I/O, queueing, fixed Wasm, cleanup, and no-Docker exact reproduction all pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Apply the same field matrix, explicit-exclusion policy, and browser/native gate to every future public media profile.                                                                                                                                                           |
| M-04 | Mainstream containers and practical codecs named by the specification                                                                                          | Partially implemented                                                          | Extensive MKV/MP4/MOV/3GP/MPEG-TS/FLV/AVI/WebM/OGV and H.264/HEVC/VP8/VP9/AV1/MPEG-2/MPEG-4 routes are public. The accepted compatible-WebM path losslessly packet-copies Matroska or MP4 AV1, VP8, or VP9 plus Opus/Vorbis. The public `mkv-to-ogv` path losslessly packet-copies Theora plus optional Vorbis through isolated native profile 36. Public `avi-to-ogv` profile 39 genuinely decodes MPEG-4 Part 2 and re-encodes bounded Theora with explicit codec/width/frame-rate/quality controls; six deterministic 143,180,538-byte browser runs passed at 231.684 MiB worst memory. Native profile 37 publicly packet-copies compatible MPEG-4 Part 2 or MPEG-2 from MP4, MOV, or MPEG-TS—and MPEG-4 Part 2 from 3GP—into bounded 8 MiB OpenDML segments, retaining MP3 where valid and explicitly making 3GP video-only. Six historical large AVI Chrome gates passed at 206.9–249.1 MiB with exact packets, full decode, repeatable output, cancellation/write-failure cleanup, and genuine OpenDML indexes; see `evidence/avi-output-feasibility-2026-09-08.json`, `evidence/compatible-avi-copy-2026-09-08.json`, `evidence/compatible-avi-source-expansion-2026-09-08.json`, `evidence/compatible-avi-mpeg2-2026-09-08.json`, and `evidence/avi-to-ogv-browser-2026-09-13.json`. The former Matroska-to-AVI variant is hidden after `evidence/mkv-to-avi-current-chrome-regression-2026-09-23.json`. | Investigate source-pinned fresh H.264 encoding first, then practical AV1/MPEG-2 outputs and legally acceptable HEVC output; `evidence/media-output-encoder-inventory-2026-10-03.json` proves those encoders/routes are absent, not measured-impossible. Continue the remaining 3GP/audio/elementary combinations in `TESTED.md`. H.264-in-AVI remains explicitly unsupported on retained interoperability evidence. |
| M-05 | User-selectable video resolution, bitrate, frame rate, codec, and quality where re-encoding/compatibility requires them                                        | Verified complete for all 22 public video re-encode profiles                   | A single independently validated option object spans UI, plan, request, worker, nine-integer JS/Wasm ABI, and native allowlist. Genuine browser output proves codec, dimensions, frame count/rate, bitrate, visual-quality ordering, cancellation/write-failure cleanup, and backward compatibility. The no-Docker higher-quality specialist passed the 181,825,549-byte maximum-settings three-run gate at 232.9 MiB with byte-repeatable fully decoded output; automatic keeps the prior fastest core unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Re-run the same gates for any new codec, setting, or worker topology.                                                                                                                                                                                                           |
| M-06 | Mainstream audio conversion and extraction                                                                                                                     | Verified complete for the currently advertised fixed profiles                  | Broad standalone/container audio matrix, independent decode/quality tests, and stress reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Extend variants only after the controls/metadata model is defined.                                                                                                                                                                                                              |
| M-07 | User-selectable audio bitrate, sample rate, channel layout, codec/quality, lossless/lossy choice                                                               | Verified complete for the published practical audio surface                    | Validated codec, compression, bitrate, rate, channel, and quality controls span UI, route normalization, request/worker, codec-aware JS/Wasm ABI, and native allowlists. Production Chrome passed 10/10 including genuine AAC, Opus, Vorbis, WMA2, FLAC, ALAC, AIFF/PCM, AMR-NB, MP3, video-regression, quality-ordering, cancellation, and write-failure paths. Maximum AAC 320 kb/s/48 kHz/stereo passed 3/3 on 153,600,106 bytes in 13.35–13.84 seconds at 192.6 MiB worst complete-Chrome incremental private memory with 256 KiB reads, 938-byte writes/queueing, one pending operation, and fixed 32 MiB Wasm. Hosted run `33432010221` reproduced the published FFmpeg artifacts exactly without Docker in 568 seconds, ran cleanup, skipped mismatch upload, and retained zero artifacts. `evidence/audio-output-controls-2026-09-01.json` records the exact gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Re-run the same gates for any new codec, setting, or worker topology. Tags and embedded artwork remain separately tracked under M-08.                                                                                                                                           |
| M-08 | Audio tags, embedded artwork, and metadata preservation                                                                                                        | Partially implemented; bounded common-tag and MP3/FLAC artwork subset verified | `evidence/audio-artwork-retention-2026-09-01.json` records the complete bounded subset. MP3 and FLAC outputs copy seven common text tags where representable and packet-copy the first attached JPEG/PNG without decode when it is at most 4 MiB, 4,096 pixels per side, and 16 megapixels; unsupported, additional, oversized, malformed, or unrepresentable art is explicitly excluded. Deterministic AAC/M4A, MP3/MP4, Ogg Vorbis, and Ogg Opus fixtures retain the exact 178-byte PNG packet. Production Chrome passed genuine M4A-to-MP3, M4A-to-FLAC, MP4-MP3 stream-copy, standalone MP3-to-FLAC, standalone FLAC-to-MP3, Vorbis-to-MP3/FLAC, Opus-to-MP3/FLAC, and raw-AAC exclusion cases with exact tags/artwork and full native decode; the complete 11/11 media-options regression passed in 50.8 seconds. The Ogg mapping promotes only the seven allowlisted stream comments and does not duplicate `METADATA_BLOCK_PICTURE`. The 134,402,091-byte random-access fixture passed FLAC 3/3 in 0.376–0.733 seconds at 95.9 MiB worst complete-Chromium incremental private memory and MP3 3/3 in 0.234–0.551 seconds at 88.4 MiB; exact output, artwork, tags, packet/decode, bounded I/O, one pending operation, fixed 32 MiB Wasm, and cleanup all passed. Two H.264-bearing designs were rejected at 270.8 and 253.7 MiB because unrelated excluded-video renderer overhead crossed the unchanged limit. No-Docker publication run `33480650192` rebuilt every FFmpeg artifact exactly at commit `b087c58` in 8m56s, skipped mismatch upload, completed repository-local cleanup, and retained zero artifacts. The candidate archive and four older branch mismatch archives were deleted, leaving zero Actions artifacts on the branch. `evidence/audio-source-metadata-matrix-2026-10-03.json` additionally validates 60 Unicode fields across nine WAV/WMA/AIFF/ALAC/MP3/FLAC source/destination cases with eight exact decoded-PCM matches, bounded I/O, per-job OPFS cleanup, and hosted-CI wiring; no new stress or memory certification is claimed. Prior representative title retention remains in `evidence/audio-metadata-retention-browser-2026-08-28.json`. | Implement and validate remaining Ogg/Opus destination-scope mappings, AIFF-output aliases, other representable fields, and practical destination-specific artwork; the verified common-field matrix does not prove all metadata in every route.                                                        |
| M-09 | WebCodecs optional acceleration with capability detection and controlled-memory CPU/Wasm fallback                                                              | Intentionally unsupported for current media routes; evaluated and guarded      | `evidence/webcodecs-acceleration-audit-2026-09-07.json` records a production Chrome 152 capability matrix and bounded three-run VP8, hardware-preferred VP9, and Opus primitive benchmarks. Ten seconds encode in 0.369-0.798 seconds for video and 0.050-0.092 seconds for audio with at most three queued inputs and 9,879-byte output chunks, but these figures exclude demux, decode, frame transfer, mux, metadata, direct disk I/O, validation, and process-tree profiling. WebCodecs exposes codec chunks rather than a complete container converter; no candidate proves an end-to-end gain while retaining the certified timestamps, chapters/subtitles/attachments, metadata, bounded writer, fallback, cleanup, and 250 MiB contract. Runtime detection remains, and no public route requires or silently selects WebCodecs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Revisit only with one complete VP9/Opus WebM worker prototype, identical-source/settings A/B evidence, exact timestamp/metadata/fallback tests, and the unchanged large-file process-tree memory gate. Do not mistake the codec microbenchmark for file-conversion throughput.  |

## Images, archives, subtitles, data, ebooks, and documents

| ID   | Requirement                                                                                                       | Status                                                                                                       | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Remaining work                                                                                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| N-01 | Purpose-built bounded image paths with dimension, pixel, decompression, and memory protections                    | Verified complete for current public formats                                                                 | Image workers, fixed Wasm engines, pixel/surface caps, rejection tests, and image stress reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Apply the same protections to any new decoder.                                                                                                                                                                                                                           |
| N-02 | Practical PNG/JPEG/WebP/AVIF/GIF/TIFF/BMP/ICO/JPEG XL and animated conversion coverage                            | Verified complete for the advertised matrix                                                                  | Public registry, full image browser suites, independent native/pixel/timing validation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Continue fixing only documented fidelity gaps; do not imply every theoretical pair.                                                                                                                                                                                      |
| N-03 | HEIF/HEIC conversion where legally and technically practical                                                      | Intentionally unsupported                                                                                    | `evidence/heif-heic-feasibility-2026-09-05.json` pins libheif 1.23.3, its WebCodecs/reader/build sources, Chrome 152 capability results, current security posture, copyright license, and patent-pool sources. Production Chrome has no HEIF/HEIC `ImageDecoder`; its HEVC `VideoDecoder` makes a custom parser path plausible, but the upstream backend is experimental, the stock Wasm heap grows, current security churn is high, and this project has no documented HEVC still-image patent clearance. The registry remains at zero HEIF/HEIC profiles.                                 | Revisit only after qualified legal clearance and a narrow fixed-memory, no-plugin, WebCodecs-backed reader/direct-writer build passes adversarial, fidelity, cleanup, cross-browser, and three-run complete-Chromium memory gates.                                       |
| N-04 | Common camera-raw conversion where a secure decoder is available                                                  | Intentionally unsupported                                                                                    | `evidence/camera-raw-feasibility-2026-09-05.json` pins LibRaw 0.22.2, LibRaw-Wasm 1.6.0, RawSpeed source, and Chrome 152 capability results. Chrome has no native DNG/CR2/NEF/ARW `ImageDecoder`. LibRaw exposes a usable seekable reader, but its built-in dcraw-derived renderer is explicitly not production-quality and retains a complete processed surface; the audited Wasm wrapper adds full input/output copies and a growing 256 MiB heap. RawSpeed is a memory-input, first-stage decoder without a complete rendered image pipeline. The registry remains at zero RAW profiles. | Revisit with a current stable decoder, bounded reader, fixed Wasm heap, conservative camera/pixel allowlist, production-quality color/demosaic pipeline, streamed direct output, independent per-camera fidelity corpus, adversarial testing, and full acceptance gates. |
| N-05 | Broad SVG rasterization including text/CSS/animation/linked resources/filter/mask behavior where safe             | Verified complete for the advertised bounded safe subset; excluded surfaces are explicitly unsupported below | `evidence/svg-safety-fidelity-matrix-2026-09-05.json` accounts for every named surface and is mechanically bound to the registry, worker, pinned resvg manifest, fixtures, browser tests, and final 6-megapixel three-run report. One mask plus a seven-primitive supported filter chain passed at 0.990103 SSIM and 182.762 MiB worst complete-Chromium incremental private memory. The focused production-browser gate passed 10/10 in 23.9 seconds, including direct output, failure cleanup, all bounds, eight policy exclusions, and zero external requests.                           | Revisit excluded text/fonts, CSS, animation, links/resources, and use expansion only under the explicit conditions in the unsupported table and matrix; keep the fail-closed browser gate current.                                                                       |
| N-06 | Incremental archive/compression conversion with traversal, duplicate, expansion-ratio, size, and bomb protections | Verified complete for advertised ZIP/TAR/GZIP/BZIP2/XZ/7Z routes                                             | Archive workers, validators, malicious-input tests, category reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Re-audit limits when adding formats.                                                                                                                                                                                                                                     |
| N-07 | SRT/WebVTT/ASS/SSA/TTML conversion preserving representable timing, styling, positioning, speakers, and metadata  | Verified complete for all advertised routes                                                                  | `evidence/subtitle-field-matrix-2026-09-05.json` maps timing, multiline text, styling, positioning/regions, speakers, cue identifiers, and document metadata for all ten public routes. `tests/subtitle-field-matrix.test.mjs` ties every field contract to exact registry disclosures, direct browser anchors, ASS/SSA extension and MIME aliases, and ten three-run Chrome reports (worst 204.473 MiB incremental private memory). The focused production-browser suite passed 16/16, including real `.ssa` alias execution and cleanup.                                                  | Keep the matrix, disclosures, alias tests, and stress evidence synchronized whenever a subtitle parser or public route changes.                                                                                                                                          |
| N-08 | Genuine bounded EPUB/TXT/HTML/Markdown/data/office conversions with independent structural validation             | Verified complete for advertised extraction/generation profiles                                              | Dedicated workers, independent ZIP/XML/data validators, stress reports, and explicit fidelity limitations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Broaden office fidelity only where a reliable bounded engine exists; keep extraction-only limitations visible.                                                                                                                                                           |

## Interface, browser capability, privacy, and offline behavior

| ID   | Requirement                                                                                                                                                                                                           | Status                                                        | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Remaining work                                                                                                                                                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U-01 | Responsive polished UI with drag/drop, picker, detection, output selection, destination, storage mode, real progress, throughput, elapsed/remaining time, engine, memory, warnings, cancellation, errors, and cleanup | Verified complete                                             | `app/converter/ConverterApp.tsx` implements the states, metrics and genuine audio/video controls; `tests/browser/media-options.spec.ts` proves option propagation and output effects; `evidence/headed-usability-audit-2026-09-05.json` records desktop/mobile success, failure, batch, reload-cleanup and keyboard review. Screenshot review found and closed terminal ETA and select-focus defects.                                                                                                                                                                                                                                                                                                                                                                                                       | Keep headed review and option-propagation tests current when controls change.                                                                                                                                                 |
| U-02 | Prominent on-device privacy indicator                                                                                                                                                                                 | Verified complete                                             | Privacy chip and explanatory UI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Preserve prominence through redesigns.                                                                                                                                                                                        |
| U-03 | Pause only where truly supportable                                                                                                                                                                                    | Verified complete by omission                                 | No misleading pause control is advertised                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Add pause only if an engine can safely suspend all producer/consumer work.                                                                                                                                                    |
| U-04 | Runtime detection for Wasm/features, workers, File System Access, OPFS, SAB/isolation, storage, WebCodecs, and engine requirements                                                                                    | Verified complete for current engines                         | `lib/browser-capabilities.ts` performs bounded functional validation of core and SIMD Wasm, GZIP/zlib-DEFLATE/raw-DEFLATE round trips, OPFS open, storage estimate, SHA-256, MIME-specific ImageDecoder support, OffscreenCanvas, SAB/Atomics, and WebCodecs encoder configurations. All 14 exact registry requirement strings map fail-closed; the selected profile is disabled with precise missing reasons. Production Chrome passed both the real capability gate and an injected Wasm-failure blocker. `evidence/functional-browser-capabilities-2026-09-02.json` records the audit. File/directory picker availability is necessarily checked before the user gesture; actual handle permissions and writes remain covered by the destination tests.                                                  | Extend the exact mapping and functional probe whenever a new engine feature or registry requirement is introduced.                                                                                                            |
| U-05 | Current stable Chrome, Edge, Brave, and Opera targets with clear unsupported state | Verified complete for installed/practically testable browsers | The 2026-09-19 production matrix passed 4/4 in installed Chrome 153.0.8010.48, Edge 153.0.4234.32, Brave 1.95.104, and Opera GX 135.0.5973.153. Each independently validated CSV/TSV, TXT/DOCX, TAR/ZIP, PNG/WebP, and H.264/AAC MKV/MP4, plus selected-destination output via a test-only picker adapter, unsafe-TAR rejection/cleanup, capability probes, and same-origin GET-only privacy. Chrome, Edge, and Brave ran headed; GX ran isolated headless. Brave still lacks a folder picker. Standard Opera 136 was not installed and is not claimed. Exact evidence is `evidence/browser-compatibility-matrix-2026-09-19.json`; the 2026-09-07 baseline remains retained. | Re-run against future stable builds. Keep standard Opera, Brave folder selection, Opera GX headed automation, exhaustive-route coverage, and Chrome-only process-memory scope stated exactly until new evidence changes them. |
| U-06 | Installable PWA and offline conversion after assets/engine are cached; service worker never handles user data                                                                                                         | Verified complete for tested engines                          | Service worker and `privacy-offline.spec.ts` exercise app shell and multiple cached engines offline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Add focused offline coverage for every new engine family.                                                                                                                                                                     |
| U-07 | CSP, COOP/COEP/CORP, no analytics/ads/telemetry, no user-data service-worker path                                                                                                                                     | Verified complete                                             | Production headers, network tests, and README security section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Keep explicit CI privacy coverage.                                                                                                                                                                                            |

| U-08 | Format-specific pre-conversion source inspection beyond media headers | Verified complete for current public input families | The UI shows locally detected format, MIME, size, destination limitations, and bounded format-specific facts. Media headers expose streams/codecs/metadata. A fixed 256 KiB UTF-8 prefix inspector covers CSV, TSV, NDJSON, JSON, XML, TXT, Markdown, HTML, SRT, WebVTT, ASS/SSA, TTML, and SVG. A fixed 1 MiB binary-header inspector covers PNG/APNG, JPEG, GIF, WebP, AVIF, BMP, ICO, and classic TIFF without pixel decode. A separate pinned libjxl 0.12.0 worker uses fixed 16 MiB Wasm, 64 KiB reads, a 128 KiB input window, an 8 MiB decoder-allocation ceiling, a 4 MiB scan ceiling, and a 1,000-frame cap; it skips pixel output while reporting basic information plus exact or lower-bound displayed-frame count, aggregate ticks, timebase, loop, timecode, and named-frame signals. ZIP-based packages use a bounded tail/directory scan; TAR skips payloads with at most 256 isolated headers; GZIP/BZIP2/XZ and 7Z use bounded wrapper/header reads. Production Chromium passed the expanded image gate 1/1 and complete privacy/offline suite 18/18. Exact scope is in `evidence/structured-source-inspection-2026-09-26.json`, `evidence/image-source-inspection-2026-09-27.json`, and `evidence/package-source-inspection-2026-09-27.json`; the headed DOCX review remains in `evidence/headed-docx-inspection-2026-09-25.json`. | Preserve the bounded facts/limitations contract and add equivalent inspection whenever a new public input family is introduced. |

## Fixtures, validation, reports, builds, and CI

| ID   | Requirement                                                                                                                                                                                 | Status                                                                                               | Current evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Remaining work                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-01 | Preserve and inspect the exact root `test.mkv`; use it for real browser remux, extraction, audio, and genuine video re-encode routes                                                        | Verified complete                                                                                    | Protected size/hash checks, FFprobe manifest, retained MKV route reports, and browser tests                                                                                                                                                                                                                                                                                                                                                                                | Re-check size/hash before and after future relevant large-media work.                                                                                                |
| T-02 | At least one large browser output comparable to `test.mkv` and independent validation                                                                                                       | Verified complete                                                                                    | 2.958 GiB-class remux/re-encode evidence and 10 GiB remux output evidence                                                                                                                                                                                                                                                                                                                                                                                                  | Keep terminology explicit: remux is genuine container conversion, not codec re-encode.                                                                               |
| T-03 | Valid progressively larger media up to approximately 10 GB through production Chromium                                                                                                      | Verified complete for the MKV-to-MP4 remux topology, with separate multi-gigabyte re-encode evidence | Valid 6 GiB and 10 GiB Matroska reports with full hashes, packet counts, traversal, and cleanup; `evidence/size-independent-memory-audit-2026-09-07.json` separately proves 37 MB-to-2.958 GB genuine HEVC-to-VP8 scaling                                                                                                                                                                                                                                                  | Repeat only after an engine changes the bounded I/O/allocation topology or a new representative family warrants the expense.                                         |
| T-04 | Deterministic fixtures for every supported category and correct independent validators                                                                                                      | Verified complete for current public categories                                                      | Fixture generators and route-specific validators under `scripts/` and `tests/browser/`                                                                                                                                                                                                                                                                                                                                                                                     | Add fixtures/validators with each new capability.                                                                                                                    |
| T-05 | Success, unsupported/corrupt input, cancellation, repeated conversion, write failure, quota, permissions, Unicode, >4 GB, complex streams, batch, worker failure, reload, and cleanup tests | Verified complete                                                                                    | `evidence/requirement-test-index-2026-09-05.json` maps all 21 named scenarios to direct browser tests or retained production-browser reports. `tests/requirement-test-index.test.mjs` fails if a scenario, source anchor, committed exact-hash compact three-run report extract, 10 GiB validation, or complex-field proof disappears or contradicts the index.                                                                                                                                        | Extend the index and its executable integrity check whenever the acceptance scenarios change.                                                                        |
| T-06 | Headed manual review of real UI success, progress, destination, cancellation, understandable errors, and responsiveness                                                                     | Verified complete                                                                                    | Earlier MKV success/direct/cancel/write-failure audit; `evidence/headed-usability-audit-2026-09-05.json` records eight representative success flows, batch, quota and permission failures, reload cleanup that preserves unrelated storage, mobile encoding controls, and the complete keyboard order.                                                                                                                                                                     | Repeat when interaction behavior or layout changes. These UI runs do not replace independent output validation or process-tree memory certification.                 |
| T-07 | Three-run same-session repeatability, cleanup recovery, clean-session repeats, and failure artifact retention for major profiles                                                            | Verified complete for current route promotion evidence                                               | Retained reports and profiler checks; historical failures remain in `outputs/reports`                                                                                                                                                                                                                                                                                                                                                                                      | Define which routes are “major” in the audit and add clean-session repeats where evidence is only same-session.                                                      |
| T-08 | Timestamped JSON, CSV, and readable HTML memory reports with graphs                                                                                                                         | Verified complete                                                                                    | `scripts/memory-profile.mjs` and compact retained reports                                                                                                                                                                                                                                                                                                                                                                                                                  | Preserve compact reports while deleting payloads.                                                                                                                    |
| T-09 | Every published binary is pinned, reproducible, and auditable from source                                                                                                                   | Verified complete                                                                                    | `scripts/engine-reproducibility-manifest.mjs` audits all 11 published engine directories and supplies an executable exact no-Docker recipe for each. Hosted run `33297796443`, TIFF rerun `33298467168`, and clean AVIF-encoder publication run `33311548748` prove every directory against pinned Emscripten 6.0.4; `evidence/non-docker-all-engine-repro-2026-08-30.json` records job IDs, sources, hashes, AVIF cache diagnosis, browser re-certification, and cleanup. | Keep each fail-independent exact comparison mandatory whenever its source or published bytes change.                                                                 |
| T-10 | CI runs unit, production build, small browser, network privacy, validators, and reproducibility checks | Verified complete for current published code | Current-branch [verify-only run 36052482467](https://github.com/tanishqbaweja/fileconverter/actions/runs/36052482467) at `8284475` passed build, lint, TypeScript, 244 unit tests, 15 privacy/offline browser cases, 153 image, 238 streaming, and 553 media conversions with independent validators. Separate [reproduce-only run 36002113153](https://github.com/tanishqbaweja/fileconverter/actions/runs/36002113153) passed exact no-Docker rebuild/diff and cleanup for all 11 published engine directories. Both retained zero artifacts. No FFmpeg/other engine source or published-engine bytes changed between the reproducibility run and `8284475`; the later browser cancellation bridge and DOCX disclosure changes passed the current verification run. | Keep both CI partitions mandatory after code/engine changes; verify-only does not prove engine reproducibility, and reproduce-only does not prove browser behavior. |
| T-11 | Detailed README covers architecture, copies, limits, storage, privacy, compatibility, fidelity, licensing, builds, tests, and measured results                                              | Verified complete for current implementation                                                         | `README.md` documents all named areas and links the generated route ledger                                                                                                                                                                                                                                                                                                                                                                                                 | Update it whenever remaining work changes behavior or evidence.                                                                                                      |

| T-12 | Broader headed-browser review across every major category and important failure flow | Verified complete for representative required categories/flows | The September headed audits plus `evidence/headed-category-expansion-2026-10-03.json` cover media, audio, static/animated image, archive, compression, data, office/document, ebook and subtitles; batch, direct destination, cancellation, write failure, quota, permission, reload, cleanup and keyboard review. Seven added success flows include normal-page DOCX/GZIP destination selection and independent Unicode output validation. Chrome 154 passed protected 2.96 GB source cancellation with staging/partial-output deletion. The audit found and fixed stale previous-job warnings; the focused regression and all 18 privacy/offline cases passed. | Maintain representative headed review as UI/engine families change. Native OS picker dialogs and exhaustive per-profile manual review are not claimed; independent validators and process-tree memory gates remain separate. |

## Intentionally unsupported surfaces with current reasons

| Surface                                                                           | Status                    | Recorded reason                                                                                                                                                                                                                                                                                                                                                                                                            | Revisit condition                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All PDF inputs, outputs, and tools                                                | Intentionally unsupported | Explicit project boundary; handled by a separate product                                                                                                                                                                                                                                                                                                                                                                   | Never add under this goal.                                                                                                                                                                                                                                                          |
| OGV/Vorbis to AMR-NB                                                              | Intentionally unsupported | Retained quality result -3.58873 dB failed the unchanged -3 dB floor                                                                                                                                                                                                                                                                                                                                                       | A materially better bounded encoder/configuration passes the same floor.                                                                                                                                                                                                            |
| MP4/H.264 to OGV/Theora                                                           | Intentionally unsupported | The genuine 147,242,147-byte source passed correctness, full decode, SSIM 0.938791, cancellation, bounded I/O, and cleanup, but the required direct-save repeat session reached 255.141 MiB complete-Chromium incremental private memory. The hidden route is marked `failed`, not pending. See `evidence/mp4-to-ogv-candidate-2026-09-15.json`.                                                                     | A materially lower-memory implementation passes repeated cold and warm direct/OPFS sessions below 250 MiB without reducing the certified width, quality, fidelity, or process coverage.                                                                                               |
| Matroska to AVI packet copy | Intentionally unsupported on current Chrome | Genuine MPEG-4/MP3 and MPEG-2/MP3 OpenDML AVI outputs retained exact packets and full decode, but direct saves peaked at 296.449 MiB and staged candidates with 256/128/64 KiB final-copy buffers or a 16 MiB handle-reopen window each exceeded 250 MiB in a cold session; one-worker asynchronous direct writing reached 328.008 MiB. The route is hidden and marked `failed`. See `evidence/mkv-to-avi-current-chrome-regression-2026-09-23.json`. | A smaller fixed-memory AVI specialist or genuinely lower-memory selected-destination writer passes three-run cold and warm direct/OPFS sessions at both evidenced codecs and the published maximum without lowering correctness or the 250 MiB formula. |
| H.264 packet copy into AVI                                                        | Intentionally unsupported | Matroska H.264 needs source-dependent conversion between length-prefixed and Annex-B forms, while native MP4/MOV-to-AVI trials emitted `bits_per_coded_sample` interoperability warnings. A merely decodable local output is insufficient for a mainstream public route. See `evidence/compatible-avi-mpeg2-2026-09-08.json`.                                                                                              | A deterministic source-independent packet mapping produces broadly interoperable AVI across independent players/decoders while retaining exact pictures, timestamps, bounded indexes, and the full browser acceptance gates.                                                        |
| Raw HEVC input wrapping with B-frames                                             | Intentionally unsupported | Presentation timing cannot be reconstructed losslessly without container timestamps                                                                                                                                                                                                                                                                                                                                        | A bounded standards-correct timestamp source/parser is demonstrated.                                                                                                                                                                                                                |
| AMR-WB output encoding                                                            | Intentionally unsupported | Withheld pending explicit patent/licensing clearance                                                                                                                                                                                                                                                                                                                                                                       | Documented legal clearance plus a reproducible bounded encoder.                                                                                                                                                                                                                     |
| HEIF/HEIC import and conversion                                                   | Intentionally unsupported | Chrome 152 exposes no native HEIF/HEIC `ImageDecoder`. Pinned libheif 1.23.3 has a technically plausible WebCodecs HEVC backend, but it is experimental, the stock Emscripten build grows memory, the upstream parser has active security churn/no LTS, and the project has no documented HEVC still-image patent clearance. See `evidence/heif-heic-feasibility-2026-09-05.json`.                                         | Qualified legal clearance plus a narrow fixed-memory HEVC-only browser-codec build passing adversarial, fidelity, cleanup, compatibility, and 250 MiB process-tree gates.                                                                                                           |
| Camera RAW import and conversion                                                  | Intentionally unsupported | Chrome 152 has no native RAW `ImageDecoder`. LibRaw 0.22.2 has a viable seekable input API but a complete processed surface and a basic renderer that upstream excludes from production-quality scope. LibRaw-Wasm 1.6.0 uses complete-file input/output copies and a growing 256 MiB heap; RawSpeed does not produce a color-corrected, demosaiced viewable image. See `evidence/camera-raw-feasibility-2026-09-05.json`. | A maintained source-reproducible fixed-memory decoder/render pipeline with bounded random access, incremental output, a conservative camera/pixel allowlist, independent per-camera fidelity, adversarial coverage, cross-browser tests, and passing 250 MiB process-tree evidence. |
| SVG text and system fonts                                                         | Intentionally unsupported | System-font loading is disabled and no pinned reproducible font set is shipped, so rendering would otherwise vary by device and could expose local font state                                                                                                                                                                                                                                                              | A compact pinned font subset plus glyph/font memory limits passes cross-browser fidelity and the 250 MiB process-tree gate.                                                                                                                                                         |
| SVG CSS and `use` expansion                                                       | Intentionally unsupported | The current lexical preflight cannot safely bound the complete CSS cascade/resource graph or recursively expanded instance-tree element count                                                                                                                                                                                                                                                                              | A standards-aware sanitizer computes strict post-cascade/post-expansion bounds with no external fetches and passes adversarial tests.                                                                                                                                               |
| SVG animation                                                                     | Intentionally unsupported | The pinned static resvg interface exposes no bounded deterministic timeline, frame-count, or frame-duration API                                                                                                                                                                                                                                                                                                            | A reproducible engine exposes deterministic bounded frame enumeration and incremental animation output under the unchanged limits.                                                                                                                                                  |
| SVG links, external resources, scripts, event handlers, and active XML constructs | Intentionally unsupported | They are unnecessary for static raster fidelity and introduce network, execution, entity-expansion, or privacy risk; production-browser tests prove rejection before rasterization and zero external requests                                                                                                                                                                                                              | No revisit for executable/networked behavior; only a self-contained non-executable construct with strict lexical and allocation bounds may be reconsidered.                                                                                                                         |

## Ordered implementation backlog

1. Perform bounded feasibility work for the other missing media combinations. Revisit
   the evidenced HEIF/HEIC and camera-RAW exclusions only when their documented
   legal, security, quality, and fixed-memory conditions change. Promote only
   fully evidenced routes.
2. Extend representative multi-gigabyte scaling for newly added media routes;
   maintain the completed category/flow headed audit as the UI changes.
3. Run final build, lint, TypeScript, unit, browser, privacy/offline, validator,
   reproducibility, registry/report-consistency, cleanup, and protected-fixture
   gates before removing all partial/missing statuses.

## Rejected or deferred approaches

- Do not replace a re-encode scaling requirement with the fast 10 GiB remux;
  the latter proves bounded I/O and muxing, not codec-transcode performance.
- Do not expose fixed encoder settings as if they were user-selectable controls.
- Do not claim Chrome evidence proves Edge, Brave, or Opera behavior.
- Do not add a format solely because an extension can be emitted; structural and
  independent content validation remains mandatory.
- Do not replace the direct MKV-to-MP4 specialist with the ordinary 256 KiB
  core. Under an identical three-run Chrome 152/direct-destination comparison,
  that candidate produced the same output but raised median elapsed time from
  36.064 to 43.141 seconds (16.4% slower). It was reverted; compact evidence is
  retained in `evidence/remux-performance-audit-2026-08-28.json`.
- Do not compile the compatible-WebM branch into every shared-wrapper specialist.
  No-Docker run `34056960277` compiled successfully, but its exact comparison
  showed that the unguarded source change altered all six Wasm modules even
  though only `within-remux` exposes profile 17. That candidate was rejected
  before browser testing; the replacement enables the new branch only when
  building `within-remux`, preserving the five unrelated specialist binaries.
- Do not adopt LibRaw-Wasm 1.6.0 as the camera-RAW engine. Its source-built
  worker is useful prior art, but the current wrapper copies a complete input
  into Wasm, starts at 256 MiB with growth enabled, materializes a complete
  LibRaw output, and copies that output to JavaScript. The pinned rejection and
  safer custom-reader revisit path are recorded in
  `evidence/camera-raw-feasibility-2026-09-05.json`.
- The 2026-08-28 UI-only MP3-controls draft remains a useful rejected approach:
  without a rebuildable native ABI it could not prove that the encoder honored
  its settings. The 2026-08-30 implementation replaces it with a validated
  request/worker/JS/Wasm/native contract and a no-Docker rebuilt engine; the old
  audit remains in `evidence/media-option-abi-audit-2026-08-28.json` as the
  before-state rather than a description of the current implementation.

## Implementation and verification log

### 2026-09-25 — headed DOCX source-inspection and disclosure audit

- A headed production-browser DOCX-to-text run used the real 1,201-byte fixture,
  document worker, and isolated browser output. The 187-byte result matched the
  deterministic Unicode/paragraph/tab/line-break expectation; the output SHA-256
  was `524daebf1033a21c9a82aa75884e702cf12dd22a1617c05235d7109b8961ae10`.
  One pending write, bounded input/output, zero console warnings/errors, ten
  static GET requests, visual disclosure review, and exact OPFS cleanup passed.
- The source panel did not structurally inspect DOCX before conversion. Its
  generic fallback incorrectly promised media container-stream/codec checks.
  The fallback now states the actual local worker validation and destination
  limitation boundary. Two focused browser tests passed after this copy fix.
  This is a real U-08/T-12 remaining-work finding, not a claim that non-media
  preflight inspection or broad headed coverage is complete. Compact evidence
  is `evidence/headed-docx-inspection-2026-09-25.json`; the disposable output,
  browser, server, screenshots, and snapshots were removed after validation.

### 2026-09-23 — hosted clean-checkout CI evidence repair

- No-Docker branch run `35876595561` exposed seven verification failures that
  local tests had masked with ignored raw reports, a pre-existing `work`
  directory, and full local Git history. Build, lint, TypeScript, and the public
  evidence audit passed before the unit step failed; privacy therefore did not
  run in that attempt. The other CI jobs must be inspected separately.
- The AIFF source test now creates its project-local `work` parent before its
  temporary directory. The verify checkout fetches the historical commit trees
  used by two exact Wasm-publication tests. T-05, N-07, and N-05 tests now
  validate committed compact extracts of 13 exact-hash-identified production-
  Chrome reports instead of requiring ignored `outputs/reports` files on a
  fresh runner. The original raw reports remain local and are not committed.
- Focused local tests for all seven affected assertions pass. This repair is
  pending a fresh hosted run; it does not erase the failed run or substitute
  local results for hosted verification.

### 2026-09-13 — AVI to OGV optimization and publication

- Official libtheora 1.2.0 is pinned by SHA-256 in an isolated single-thread,
  zero-pool `within-theora` module. Native speed-level A/B/C retained level 2 at
  14.278 seconds, 29.2% faster than level 0 and 21.8% faster than level 1.
- A synchronous Blob-input candidate was rejected at 287.438 MiB. The bounded
  asynchronous BYOB reader removed that memory failure without a material speed
  regression. A fixed cellular-automaton seed also replaced an initially valid
  but cross-session-variable stress source.
- The final deterministic 143,180,538-byte MPEG-4/MP3 AVI passed three OPFS and
  three direct-save Chrome runs. All six outputs were the same genuine
  17,389,453-byte Ogg/Theora file, fully decoded 480 frames, and passed midpoint
  SSIM at or above 0.813648. Elapsed times were 17.25–18.09 seconds; worst
  complete-Chromium incremental private memory was 220.922 MiB OPFS and
  231.684 MiB direct.
- Reads remained at most 262,144 bytes; writes and queueing at most 65,307 bytes;
  only one operation was pending; actual Wasm stayed at 32 MiB. Cancellation,
  injected write failure, partial-output removal, cleanup recovery, explicit
  Theora/width/frame-rate/quality controls, and bitrate rejection passed.
- The source-only no-Docker preflight now reconstructs and verifies the exact
  historical pre-Theora general wrapper (`304c04c...`), historical direct base
  (`b8125f1...`), and wrapper actually used for the published direct core
  (`b0b2071...`). Aggregate diagnostic `34739711341` exposed six historical
  wrapper mismatches; `34763807800` proved the corrected general/Theora ordering
  by matching six cores and leaving only direct; scoped `34764718715` rejected
  the general-archive hypothesis. Both retained mismatch archives were deleted.
- Hosted run `34740500424` reproduced the pushed `within-theora` JavaScript,
  Wasm, license, and manifest byte-for-byte in 8m52s. After the exact direct
  wrapper reconstruction was pushed in commit `8492369`, scoped run
  `34765522872` reproduced both direct files byte-for-byte in 8m13s and final
  aggregate run `34765971788` reproduced all seven FFmpeg engines plus shared
  manifests and licenses byte-for-byte in 16m41s. Both final runs passed cleanup,
  skipped mismatch upload, and retained zero artifacts.
- Compact route and reproduction evidence is retained in
  `evidence/avi-to-ogv-browser-2026-09-13.json`; generated stress media and every
  converted copy, raw report, local candidate, and remote mismatch archive were
  deleted after validation.

### 2026-09-12 — AVI to FLV feasibility, optimization, and publication

- Native fixture generation created a genuine 992,694-byte H.264/MP3 AVI under
  `work/avi-to-flv-feasibility`; packet-copy remuxing produced a genuine
  981,702-byte FLV. The source/output SHA-256 values were respectively
  `dc6fcd7ae7a3567dce0d062a73e2a1301976a1db02063a317e2d4a9ae51cba43`
  and `8c6b116adb881632d88edfe46e43810760afa92cd58c87216a2f5eee222f338a`.
- FFprobe identified AVI and FLV container families, H.264 640x360 video, mono
  48 kHz MP3, and 4.041667/4.042-second durations. Normalized compressed H.264
  packets matched at SHA-256
  `743fbd932db866d7716c162a8d4b1c800c6badeac54520ad87f90ddf5aa86774`;
  MP3 packets matched at
  `cacd113dcb0398bf5cb8e9f54da51ca8a176abd85b25550edef35a82e90be857`;
  fully decoded video matched at
  `cd6d728d69789b3aa3892125c8582495013de0e7e2e31404498379f30bdb2dbc`.
  This proves a real minimum-work container conversion rather than extension
  renaming or re-encoding.
- The rebuilt browser core passed genuine small-file conversion and forced-write
  cleanup. A 145,328,774-byte stress AVI then passed three OPFS and three direct
  Chrome runs, producing genuine 143,904,205-byte FLV outputs with exact
  compressed H.264/MP3 packets and full decoded-video equality. OPFS peaked at
  189.520 MiB; direct save peaked at 222.395 MiB under the unchanged 250 MiB
  complete-process-tree limit.
- The generic two-worker direct writer was rejected at 256.957 MiB. The accepted
  route-scoped asynchronous random-access destination removes the relay worker,
  retains one pending operation and FLV trailer seeks, and did not regress the
  measured 5.783-6.158-second rejected baseline: accepted runs completed in
  5.694-6.318 seconds. Selective generation now creates only the required source
  in about 2.1 seconds instead of six roughly 128 MiB-class containers.
- Compact accepted and rejected results are retained in
  `evidence/avi-to-flv-browser-2026-09-12.json`; raw reports, generated stress
  media, converted copies, and browser profiles are removed by the explicit
  cleanup allowlist after evidence generation.
- Hosted no-Docker run `34684202707` rebuilt all six FFmpeg modules byte-for-byte
  from pushed commit `3230248` in 12m24s, skipped mismatch upload, and passed
  repository-local cleanup. Obsolete mismatch artifacts `10293423594` and
  `10295085164` were deleted and all three AVI-to-FLV build runs now retain zero
  artifacts.
- Both disposable conversion files were deleted through the repository cleanup
  command immediately after validation; `work` again contains only `.gitkeep`.

### 2026-09-12 — AVI to MPEG-TS publication

- Native FFmpeg was used only for compatibility feasibility and independent
  validation. It packet-copied the tracked 1,306,330-byte MPEG-4 Part 2/MP3 AVI
  into a genuine 1,345,516-byte MPEG-TS. All 96 video packets and 168 audio
  packets matched their source SHA-256 values exactly; this is a genuine
  container conversion, not an extension rename or re-encode.
- The disposable output and `work/avi-to-mpegts-feasibility` directory were
  deleted immediately. Compact results are retained in
  `evidence/avi-to-mpegts-feasibility-2026-09-12.json`.
- Public `avi-to-mpeg-ts` extends native profile 24 and the browser planner to
  accept H.264 or MPEG-4 Part 2 AVI video plus AAC or MP3 audio. Focused browser
  success/write-failure gates and six accepted 159,500,442-byte runs prove
  genuine MPEG-TS, exact compressed video/audio packets, full decoded-video
  equality, repeatable output, bounded I/O, and cleanup. OPFS peaked at 189.480
  MiB; direct-save peaked at 245.297 MiB.
- The first source patch applied no changes because it incorrectly expected the
  postprocessed AVI routes inside the manifest generator's base heredoc. The
  actual Node postprocess insertion point was inspected and patched instead;
  subsequent focused planner, type, and lint checks passed.
- The first two direct-destination cancellation attempts completed all three
  conversions within the memory limit but then raced to `complete` instead of
  `cancelled`. Diagnosis found that synchronous direct writes plus immediately
  resolving file-read promises could starve the worker's cancel-message task.
  Direct media reads now yield one macrotask per 8 MiB, a bounded cancellation
  fix passed cancellation after 8.52 MiB and stayed within the prior measured
  5.997–6.829-second direct conversion range. The public evidence audit passes
  402/402; compact results are retained in
  `evidence/avi-to-mpegts-browser-2026-09-12.json`.
- Hosted no-Docker run `34669858579` rebuilt exact pushed commit `8c74fa5`
  byte-for-byte in 7m24s, passed repository-local cleanup, skipped mismatch
  upload, and retained zero artifacts. Candidate artifact `10290275785` was
  deleted after publication and the run now reports zero artifacts.

### 2026-09-11 — AVI to MOV feasibility and unpublished candidate

- A repository-local native feasibility check packet-copied the 96 MPEG-4 Part
  2 video packets from the 1,306,330-byte AVI fixture into a genuine fragmented
  QuickTime MOV. Source and output compressed-video SHA-256 matched exactly;
  FFprobe reported 640×360, 4.041667 seconds, and a 1,194,852-byte MOV.
- The disposable output and `work/avi-to-mov-feasibility` directory were
  deleted immediately. Compact facts are retained in
  `evidence/avi-to-mov-feasibility-2026-09-11.json`.
- An unpublished test-mode candidate now reuses the bounded MOV writer, accepts
  H.264 or MPEG-4 Part 2 AVI video, retains AAC where present, and explicitly
  excludes incompatible AVI audio such as MP3. Browser conversion, candidate
  Wasm reproduction, stress memory, cancellation, write-failure, and cleanup
  gates remain required before promotion.
- The first stress orchestration attempt stopped before Chrome because the
  existing MOV category generated only its five H.264/AAC fixtures, not the AVI
  manifest. Its `finally` cleanup passed. The AVI route now has a dedicated
  category using the existing deterministic AVI generator so this harness
  mistake is not retried.
- The corrected production-browser gate passed three OPFS runs at 0.854-1.105
  seconds and 192.156 MiB worst incremental private memory, then three
  direct-save runs at 1.797-2.134 seconds and 211.836 MiB. Every run produced
  the same 157,854,929-byte genuine QuickTime MOV with exact fully decoded
  video, 256 KiB I/O/queue ceilings, one pending operation, fixed 32 MiB Wasm,
  cancellation cleanup, cleanup recovery, and explicit incompatible-MP3
  exclusion. The route is now promoted. Hosted no-Docker run `34633039664`
  rebuilt pushed commit `2a3cae6` byte-for-byte in 7m44s, skipped mismatch
  upload, passed hosted cleanup, and retained zero artifacts. This checkpoint
  is complete; the broader items elsewhere in this file remain open.
- Cleanup invocation note: the package script is `npm run clean:generated`;
  `cleanup:generated` does not exist and performs no cleanup.
- Verification invocation note: this package has no `typecheck` npm alias; use
  `npx tsc --noEmit`. The missing alias exits before running TypeScript and
  changes no files.

### 2026-09-11 — AVI to 3GP production-browser publication

- Native feasibility and independent validation proved that the existing
  1,306,330-byte AVI fixture can be genuinely remuxed to 3GP by packet-copying
  its 96 MPEG-4 Part 2 video packets. The source and output packet SHA-256 are
  identical, all 96 output frames decode, and the result probes as 3GP rather
  than a renamed AVI. The incompatible MP3 audio is deliberately excluded.
- The production browser then converted the 159,500,442-byte MPEG-4/MP3 AVI to
  the same 157,854,896-byte genuine `3gp4` output in all six measured runs. OPFS
  completed in 0.769-1.106 seconds at 204.6 MiB worst incremental memory;
  direct-save completed in 1.644-1.827 seconds at 249.9 MiB. Full decode/hash,
  deterministic output, bounded 256 KiB I/O and queueing, one pending operation,
  fixed 32 MiB Wasm, partial OPFS cancellation, earliest-state direct
  cancellation, injected-write cleanup, and generated-file cleanup passed.
- Hosted no-Docker run `34571134087` rebuilt the published Wasm byte-identically
  to candidate run `34569115338` and generated the route-bearing manifest. The
  public Wasm SHA-256 is
  `244ed58c4f62cec877db8ea16ba7b9caedf02317c1dea7973d23cdc22ea93e02`.
  Compact historical results are in `evidence/avi-to-3gp-browser-2026-09-11.json`.
- Chrome 153 re-audit on 2026-09-21 invalidated the narrow direct-save margin:
  the unchanged path reached 253.871 MiB against the unchanged 250 MiB limit.
  A route-scoped one-worker destination reached 258.027 MiB and bounded
  synchronous input reached 280.125 MiB, so both were rejected and reverted.
  All conversions remained genuine, repeatable, fully decoded packet copies in
  1.618-2.663 seconds, but the route was marked failed and hidden at that
  checkpoint. See
  `evidence/avi-to-3gp-current-chrome-2026-09-21.json`.

### 2026-09-23 — AVI-to-3GP restored under the unchanged memory limit

- Direct saves now use quota-preflighted browser-private staging, one bounded
  256 KiB final-copy buffer, and deletion on success, cancellation, and failure.
  This retains packet copy and the identical genuine `3gp4` output while
  avoiding the rejected direct-writer memory peaks.
- A 159,500,442-byte AVI passed nine direct-save conversions across three cold
  Chrome 153 sessions in 2.032-2.882 seconds, worst 244.000 MiB complete-browser
  incremental private memory. Three OPFS conversions passed in 0.910-1.230
  seconds at 233.363 MiB worst. All outputs were byte-identical and fully
  decoded; final-copy cancellation, injected final-copy failure, worker-crash
  cleanup/restart, and early OPFS cancellation passed. The direct headroom is
  6.000 MiB, so this is not a cross-machine guarantee.
- Compact evidence is in
  `evidence/avi-to-3gp-staged-current-chrome-2026-09-23.json`; the earlier
  failed direct candidates remain in the 2026-09-21 audit.

### 2026-09-23 — AVI-to-MPEG-TS current-Chrome speed and memory recovery

- The unchanged two-worker direct path failed the strict Chrome 153 limit at
  275.352 MiB; a faster one-worker direct writer still failed at 250.273 MiB.
  Both candidates produced the same genuine MPEG-TS but are rejected.
- Quota-preflighted browser-private staging followed by one backpressured
  256 KiB final copy is the fastest tested valid direct path. The same
  159,500,442-byte source produced the identical 163,700,248-byte output in
  nine direct runs across three cold sessions in 2.463-3.445 seconds, worst
  247.625 MiB complete-Chromium incremental private memory. Three OPFS runs
  passed in 1.244-1.613 seconds at 214.152 MiB worst. Exact packet and full
  decoded-video checks remain valid because the output SHA-256 is unchanged.
- Final-copy cancellation, early OPFS cancellation, injected final-copy write
  failure, worker-crash restart, bounded I/O, and cleanup passed. The 2.375 MiB
  direct margin is narrow and not a cross-machine guarantee. The temporary
  stage consumes output-sized browser-private disk space until deleted.
  Compact measured candidates are in
  `evidence/avi-to-mpegts-current-chrome-optimization-2026-09-23.json`.

### 2026-09-23 — MPEG-TS-to-AVI current-Chrome recovery

- The unchanged two-worker direct random-access writer produced the genuine
  198,421,306-byte AVI but failed all three complete-Chromium memory runs,
  peaking at 294.039 MiB and taking 48.128-48.876 seconds per conversion.
- The same 199,649,420-byte MPEG-4/MP3 MPEG-TS source passed nine staged
  direct saves across three cold sessions in 4.336-4.907 seconds, worst
  248.328 MiB. The byte-identical OpenDML AVI retained exact compressed video
  and audio packets, 24 valid segments, full decode and midpoint seek. The
  nine-run median is 10.86x faster than the rejected baseline median. Six OPFS
  runs passed; a strengthened cancellation probe stopped after 8.14 MB of
  actual output. Direct final-copy cancellation stopped after 19.1-20.2 MB.
- The first OPFS cancellation probe waited for a staging phase that OPFS mode
  never enters; its report was rejected and the corrected probe passed. The
  first injected worker-crash browser test exposed a real OPFS-lock release
  race that left a stage. Bounded cleanup retries fixed it; the corrected
  MPEG-TS-to-AVI and existing MP4-to-AVI crash tests passed, as did injected
  final-copy write failure and the genuine small conversion test.
- The worst direct margin is only 1.672 MiB on this machine/Chrome build, not
  a cross-machine guarantee. Staging requires temporary output-sized private
  storage. The accepted and rejected measurements are in
  `evidence/mpeg-ts-to-avi-current-chrome-optimization-2026-09-23.json`.

### 2026-09-23 — MOV-to-AVI current-Chrome recovery

- The unchanged direct random-access writer made a genuine 198,392,670-byte
  OpenDML AVI from the published 191,718,419-byte MPEG-4/MP3 MOV source, but
  failed all three complete-Chromium 250 MiB memory runs (293.609–311 MiB)
  and took 46.797–48.737 seconds per run.
- A quota-preflighted browser-private stage and bounded 256 KiB final copy
  passed nine direct saves across three cold sessions in 4.052–4.723 seconds,
  worst 244.191 MiB. The nine-run median was 10.82x faster than the rejected
  baseline. Three OPFS-mode runs also passed. Each output was byte-identical to
  the baseline, with exact compressed video and audio packets, 24 indexed
  segments, full native decode, and midpoint seek.
- Direct final-copy and early OPFS cancellation, injected final-copy write
  failure, and worker-crash restart removed both stage and partial destination.
  The observed 5.809 MiB direct-save memory margin is narrow, not a
  cross-machine guarantee. The temporary stage uses one output-sized amount
  of private disk before cleanup. Compact accepted and rejected measurements
  are in `evidence/mov-to-avi-current-chrome-optimization-2026-09-23.json`.

### 2026-09-23 — 3GP-to-AVI current-Chrome recovery

- The unchanged 3GP-to-AVI direct writer made a genuine 183,376,276-byte
  video-only OpenDML AVI from the published 177,146,977-byte source, but its
  first complete-Chromium run reached 276.406 MiB, failing the unchanged
  250 MiB limit. Three runs took 19.841–20.435 seconds each.
- Quota-preflighted private staging and one bounded 256 KiB final copy passed
  nine direct saves across three cold sessions in 2.991–3.644 seconds, worst
  244.980 MiB. The nine-run median was 6.26x faster. Three OPFS-mode runs
  also passed. All outputs were byte-identical to the rejected baseline, with
  exact MPEG-4 packets, 22 valid indexed segments, zero audio indexes, full
  native decode, and midpoint seek.
- Final-copy and OPFS cancellation, injected final-copy write failure, and
  worker-crash restart removed stage and partial destination. The observed
  5.020 MiB direct-save margin is narrow and not a cross-machine guarantee;
  the stage temporarily consumes output-sized browser-private disk. Exact
  accepted and rejected reports are compacted in
  `evidence/3gp-to-avi-current-chrome-optimization-2026-09-23.json`.

### 2026-09-23 — Matroska-to-AVI withheld after current-Chrome regression

- The unchanged direct random-access writer produced the genuine 202,384,110-byte
  AVI from the 191,735,971-byte MPEG-4/MP3 source, but all three Chrome 153
  complete-process-tree runs exceeded 250 MiB (263.043–296.449 MiB) and took
  49.591–52.333 seconds.
- The 215,339,432-byte published-maximum MPEG-2/MP3 source produced the exact
  historical 227,904,768-byte AVI with 27 indexed segments, exact video/audio
  packets, full native decode, and midpoint seek. Staged 256 KiB copying reached
  252.797 MiB in a cold repeat; 128 KiB reached 250.500 MiB; 64 KiB passed
  nine maximum-size direct saves but failed the smaller MPEG-4 source at
  257.313 MiB. A 16 MiB sync-handle reopen window still reached 267.230 MiB
  in its third cold maximum-size session. One-worker asynchronous direct
  writing reached 328.008 MiB in its diagnostic run. The OPFS-only route passed
  but does not establish selected-destination compliance.
- The focused small MPEG-4 and MPEG-2 browser conversions, injected final-copy
  write failure, and worker-crash cleanup passed. Every completed output matched
  the established genuine AVI hash; memory alone blocks publication. The exact
  candidate sequence, report hashes, and cleanup are recorded in
  `evidence/mkv-to-avi-current-chrome-regression-2026-09-23.json`. The registry
  marks this exact route `failed` and hides it. Do not retry copy-buffer tuning
  without a new allocation hypothesis; investigate a smaller fixed-memory AVI
  specialist or a lower-memory selected-destination random-access writer.
- The 51 raw JSON/CSV/HTML reports and two fixture manifests were removed after
  their hashes were captured in compact evidence. The two generated binary
  fixtures (407,075,403 bytes total) were then removed by the narrowly scoped
  hash-verified `scripts/cleanup-generated.mjs --mkv-avi-current-fixtures-only`
  option. No converted output remains; the protected `test.mkv` retained its
  recorded SHA-256 before and after cleanup. No Docker command was used.

### 2026-09-10 — IVF input candidate diagnosis (not yet promoted)

- Native feasibility proved genuine AV1, VP8, and VP9 IVF packet-copy into
  WebM and Matroska. The first production-Chrome candidate then passed all four
  VP8/VP9 routes and injected direct-write cleanup, but both AV1 routes failed
  on the first muxed packet with `Invalid data found when processing input`.
  The routes therefore remain unpublished pending a corrected Wasm build and
  the complete promotion gate.
- FFmpeg 8.1.2 source and a native debug remux identified the first allocation:
  IVF does not carry AV1 container extradata, while the Matroska/WebM muxer
  requires either codec extradata or `AV_PKT_DATA_NEW_EXTRADATA` on the first
  packet. Hosted no-Docker run `34418209028` rebuilt the corrected general core
  at commit `160ffdc`; its browser rerun proved corrupt-packet rejection, but
  both AV1 routes still failed at the first muxed packet. A native
  `extract_extradata` plus `live=1` control succeeded, so live mode itself is
  not the cause; the candidate wrapper's packet-filter handoff did not provide
  usable AV1 configuration at mux time. The next source revision therefore
  runs the already-enabled
  `extract_extradata` filter on one cloned first packet before header write,
  copies only its bounded sequence-header side data into the output codec
  parameters, and then processes the original prefetched packet normally. It
  still uses no decoder and no whole-file probe.
- The prior adverse fixture merely removed eight bytes from the tail, which the
  IVF demuxer correctly treated as end-of-file after the preceding complete
  packets. A deterministic oversized second-packet header made native FFmpeg
  flag the packet as corrupt, but the first browser rerun then exposed that the
  custom wrapper copied `AV_PKT_FLAG_CORRUPT` packets and completed. The source
  now rejects any corrupt selected packet before it reaches a bitstream filter
  or mux write; the corrected candidate still needs its browser rerun.
- Run `34418209028` also exposed a no-Docker all-core reconstruction defect:
  the general core was retained successfully, then a historical specialist
  reverse patch conflicted with unguarded new general-core code. The new IVF
  prefetch/filter/corruption blocks are general-core guarded, and the rebuild
  now captures the current wrapper hash before its historical source rewrites.
- Follow-up no-Docker run `34472199117` rebuilt the general core but then found
  a second historical reverse-patch conflict. Its retained general core proved
  that corrupt IVF is rejected. AV1-to-WebM completed and matched the source's
  full decoded-frame hash, but midpoint validation failed; AV1-to-Matroska
  still rejected its first packet. Independent inspection then isolated two
  distinct wrapper omissions rather than a codec or live-mode limitation:
  generic Matroska profile 23 had no `video_stream_index`, so it skipped the
  bounded AV1 pre-header extradata read, and the no-probe IVF path left
  `avg_frame_rate` unset, so WebM omitted its `DefaultDuration` track element.
  Remuxing the browser WebM without re-encoding made both full decode and seek
  pass, and the corresponding native live WebM and Matroska controls passed.
  The source now locates the mapped AV1 stream independently for both profiles,
  enables FFmpeg's AV1 parser only for the general remux core and uses its
  stream-info path under the already-fixed 2 MiB probe and two-second analysis
  ceilings so the genuine codec parser supplies AV1
  configuration, average cadence, and packet keyframe flags. The fallback
  sequence-header inspection runs only if parser extradata remains absent and
  resets its BSF before the retained first packet enters normal muxing. A
  rejected interim
  attempt used `av_guess_frame_rate()`, but exact header inspection showed that
  IVF stores a 1 kHz time base for this 24 fps fixture and the demuxer does not
  populate average frame rate until deeper analysis; hosted run `34482182242`
  was cancelled before completing that known-wrong build. Candidate run
  `34483304496` proved both AV1 containers now mux and expose correct 24 fps,
  41 ms packet durations, extradata, and `DefaultDuration`, but byte inspection
  found every SimpleBlock still marked non-key and only one Cluster; FFmpeg's
  later decoder/parser inferred keyframes for full sequential decode, while
  midpoint seek correctly failed. The bounded stream-info parser replaces that
  incomplete timing-only candidate. The historical specialist configuration
  remains parser-free so certified specialist binaries stay reproducible. A
  repository-local rewrite preflight now applies all three
  historical reverse patches before any expensive build; it passes locally.
  No-Docker run `34485464982` compiled that replacement core and cleaned its
  hosted build tree; all eight focused AV1/VP8/VP9, corruption, direct-write,
  full-decode, and midpoint-seek browser cases then passed in 16.9 seconds.
  The large-file profiler now recognizes both IVF input routes, enforces their
  96 MiB Wasm ceiling, and exercises their cancellation cleanup instead of
  aborting at route dispatch. Its independent media validator also skips audio
  channel assertions for declared video-only copies, including both IVF input
  containers, and accepts a duration that `ffprobe` infers after its full packet
  traversal even though the live WebM/Matroska header itself omits a growing
  duration/index structure. Metadata validation failures now retain compact
  actual-versus-expected diagnostics so a failing predicate is identifiable
  without preserving converted copies or repeating blind runs. Those diagnostics
  exposed IVF's misleading 1.44-second raw-container estimate for the 1,440-frame
  VP9 fixture; input-route validation now prefers its independently decoded
  60-second duration.
- The corrected source still requires the remaining three-run input stress and
  process-tree memory evidence, independent large-output validation,
  publication consistency, exact reproduction, and cleanup before
  `ivf-to-webm` or `ivf-to-mkv` can become public. The already-certified
  extraction routes re-passed at 139.6 MiB and 136.1 MiB before the profiler
  exposed and cleaned up the missing input-route dispatch mapping.
- The first complete 169,519,329-byte VP9 IVF-to-WebM stress cycle passed three
  repeatable output hashes, full decoded-frame validation, bounded 256 KiB I/O,
  one pending write, fixed 32 MiB Wasm, cancellation, write cleanup, and output
  cleanup. Conversion itself took only 1.458–2.110 seconds, but run 1 reached
  266.348 MiB incremental complete-Chromium private memory (runs 2/3 were
  177.785/249.254 MiB), so the profile remains unpublished. Peak OPFS usage was
  essentially the complete 169.5 MB output and the variable renderer process
  accounted for the excess; this rejects the existing 128 MiB live sync-handle
  cache window as insufficiently bounded for this route. The next controlled
  candidate reopens the same OPFS sync handle every 64 MiB—one additional
  reopen for this output—and must beat the unchanged three-run memory gate
  without losing byte identity, validation, cleanup, or stream-copy speed.
- That 64 MiB reopen candidate was rejected after its controlled three-run
  rerun increased the worst peak to 276.922 MiB (runs 2/3 were 244.434 and
  252.219 MiB) while producing the same 169,514,222-byte output in
  1.482–1.792 seconds and passing every non-memory check. The peak renderer
  still held 263.49 MiB with exact output-sized OPFS usage, so access-handle
  rotation did not release the retained allocation. Code inspection then found
  that `ivf-to-webm` reuses native profile 17 and therefore accidentally took
  the synchronous `FileReaderSync`/Blob-slice path; established large remux
  profiles use one reusable asynchronous BYOB reader specifically because the
  synchronous slices cause renderer retention. The next candidate forces both
  IVF input route IDs onto that existing 256 KiB BYOB path. This also restores
  event-loop yield points needed for prompt direct-destination cancellation;
  the unchanged three-run correctness, speed, memory, and cleanup gates remain.
- The reusable 256 KiB BYOB input path is the accepted IVF-input design. On the
  169,519,329-byte VP9 fixture, three-run IVF-to-WebM conversion peaked at
  225.957 MiB in OPFS mode and 233.215 MiB in direct-save mode; IVF-to-MKV
  peaked at 124.703 MiB and 230.344 MiB respectively. The optimized direct path
  coalesces bounded 1 MiB writes and completed each run in 1.209 seconds or
  less. OPFS warm runs completed in 0.756 seconds or less for WebM and 0.910
  seconds or less for MKV. Exact packet/output hashes, complete 1,440-frame
  decoding, one pending write, fixed 32 MiB Wasm memory, cancellation, and
  cleanup all passed. The 144,520,682-byte AV1 fixture also passed both OPFS
  routes across three runs with complete 8,640-frame decoding and worst peaks
  of 122.129 MiB (WebM) and 136.988 MiB (MKV). Direct cancellation now removes
  the incomplete file instead of leaving a zero-byte placeholder and reports
  zero terminal queued bytes/operations. These two routes are no longer part
  of the unimplemented backlog. Hosted no-Docker run 34566920335 rebuilt all
  six FFmpeg modules byte-for-byte from pushed commit `9af549d` in 13m46s,
  skipped mismatch upload, passed hosted cleanup, and retained no artifact.
  Both superseded mismatch artifacts, all generated fixtures, converted copies,
  raw reports, and the local diagnostic were deleted after compact evidence was
  retained in `evidence/ivf-input-browser-2026-09-11.json`; `test.mkv` remains
  byte-exact.

### 2026-09-09 — bounded raw HEVC to VP8 WebM acceptance

- Public `hevc-to-webm` is a genuine decode/scale/re-encode route, not an
  extension rename or lossless wrapper. It decodes all 17,282 frames from a
  134,752,786-byte Annex B HEVC source, reconstructs raw timing at the explicit
  25 fps demuxer default, scales 1,920×804 to 640×268, and writes 600 kbit/s VP8.
- The accepted four-worker/two-codec-thread topology passed 3/3 production-
  Chrome runs in 230.95–234.74 seconds at 240.945 MiB worst complete-Chromium
  incremental private memory. Output was byte-repeatable, fully decoded, and
  retained all frames; 256 KiB I/O, one pending operation, cancellation, forced
  write failure, and cleanup passed.
- After the shared cancellation fix, the same public route passed a fresh 3/3
  Chrome 153 browser-private-output stress run in 236.95–246.10 seconds at
  241.711 MiB worst memory. The 17,282-packet VP8 WebM output remained
  byte-identical and fully decoded. The report was compacted and removed; see
  `evidence/hevc-to-webm-current-chrome-2026-09-24.json`.
- Speed was optimized under the unchanged constraints. The faster eight-worker
  candidate completed in 155.79–156.92 seconds but reached 253.871–274.039 MiB
  and was rejected. Four-worker VP9 reached 264.082 MiB. Single-thread VP9 took
  561.44 seconds and left only 0.246 MiB headroom in one run, so VP9 remains
  failed and non-public rather than being promoted on fragile evidence.
- No Docker command was used. Generated stress media, converted outputs, raw
  reports, the browser profile, and the local candidate stayed inside the
  repository and were deleted after compact evidence was recorded. Hosted run
  [34390070004](https://github.com/tanishqbaweja/fileconverter/actions/runs/34390070004)
  rebuilt all six FFmpeg modules byte-for-byte from pushed commit `082b050` in
  13m15s, skipped mismatch upload, passed cleanup, and retained no artifact. The
  obsolete mismatch artifact was deleted and verified absent. See
  `evidence/raw-hevc-webm-feasibility-2026-09-09.json`.

### 2026-09-09 — bounded MKV/WebM AV1, VP8, and VP9 extraction to IVF

- Native FFmpeg proved that Matroska/WebM AV1, VP8, and VP9 can be extracted to
  structurally valid `DKIF`/`AV01`, `DKIF`/`VP80`, and `DKIF`/`VP90` IVF files
  without decoding or re-encoding. VP8 and VP9 packets are byte-exact; AV1
  requires FFmpeg's two-byte temporal-delimiter OBU adaptation per packet but
  retains the exact decoded frames.
- A naive copy that inherited the 1/1000 Matroska time base was rejected because
  it reported 96 frames as 0.096 seconds. The candidate native profile instead
  requires a valid average frame rate and writes its inverse into IVF, producing
  the correct 4.0-second AV1 and 2.0-second VP8/VP9 durations. All three trials
  fully decoded and passed midpoint seeks.
- Guarded native profile 38, bounded browser routing, the IVF muxer build
  surface, and deterministic AV1/VP8/VP9 fixtures are complete. The focused
  production-Chrome gate passed 6/6 genuine conversions, incompatible-first-
  video rejection, and MKV/WebM direct-write failure cleanup cases. The final
  shared-media regression passed 530/530 and the privacy/offline gate passed
  15/15 after the new profiles were installed.
- Genuine 170,427,228-byte MKV and 170,426,767-byte WebM VP9/Opus sources each
  passed three browser runs. Conversion took 0.861-0.924 seconds
  (175.9-188.9 MiB/s); every run produced the identical 169,519,329-byte IVF
  SHA-256 `90725e96b406393658be05ec396b5f67b50be905c6d692b9e95b4ec082260158`.
  The output retained all 1,440 exact compressed VP9 packets and decoded frames,
  had a valid `DKIF`/`VP90` header, and passed a midpoint seek and full
  native decode.
- Worst complete-Chromium incremental private memory was 218.535 MiB. Reads
  stayed at 256 KiB, writes/queueing at 157,034 bytes, one operation was
  pending, and Wasm stayed fixed at 32 MiB. Cancellation after 135,266,304 input
  bytes removed partial browser-owned output and reset queue/pending state.
- Native FFmpeg only generated deterministic sources and independently
  validated browser outputs. No Docker command ran. Category cleanup deleted
  both 128 MiB-class sources, converted copies, and browser profile; `work/`
  contains only `.gitkeep`, and `test.mkv` remains byte-exact. Hosted no-Docker
  run [34342108068](https://github.com/tanishqbaweja/fileconverter/actions/runs/34342108068)
  rebuilt all six FFmpeg modules byte-for-byte from pushed commit `8f38ffe` in
  13m34s, skipped mismatch upload, passed hosted cleanup, and retained zero
  artifacts. The superseded candidate artifact was deleted and verified absent.
  Compact evidence is `evidence/ivf-native-feasibility-2026-09-08.json`,
  `evidence/ivf-browser-smoke-2026-09-09.json`, and
  `evidence/ivf-extraction-browser-2026-09-09.json`.

### 2026-09-08 — compatible MPEG-2 video to AVI packet copy

- Native profile 37 and the browser planner accept MPEG-2 video alongside the
  existing MPEG-4 Part 2 subset for Matroska, MP4, MOV, and MPEG-TS sources.
  Compatible MP3 is retained; every other stream remains explicitly excluded.
- Four focused production-Chrome MPEG-2 conversions passed, followed by the
  complete 9/9 AVI success regression. The 215,339,432-byte MPEG-2/MP3 stress
  source passed 3/3 in 2.512-3.133 seconds at 232.348 MiB worst incremental
  complete-Chromium private memory. Output was byte-repeatable and retained the
  exact compressed video/audio packets, full decode, midpoint seek, 27 OpenDML
  segments, fixed 32 MiB Wasm, 256 KiB I/O, one pending operation, and clean
  cancellation.
- H.264 AVI remains deferred: the Matroska trial requires source-dependent
  Annex-B filtering, while native MP4/MOV trials emitted AVI interoperability
  warnings. Those results are recorded rather than promoted from extension-only
  or merely playable output.
- No Docker command ran. Compact evidence is
  `evidence/compatible-avi-mpeg2-2026-09-08.json`. Hosted run
  [34243934210](https://github.com/tanishqbaweja/fileconverter/actions/runs/34243934210)
  rebuilt all six FFmpeg modules byte-for-byte from pushed commit `27633bc` in
  13m31s, passed hosted cleanup, skipped mismatch upload, and retained zero
  artifacts. All generated local files and the obsolete candidate artifact were
  deleted and verified absent.

### 2026-09-08 — bounded Matroska MPEG-4 Part 2/MP3 to AVI packet-copy acceptance

- Published `mkv-to-avi` as a genuine compressed-packet stream-copy route after
  the no-Docker candidate build and complete production-browser certification.
  The 159,417,989-byte source passed 3/3 in 1.075-1.142 seconds at 204.473 MiB
  worst complete-Chromium incremental private memory, producing the same
  161,046,620-byte AVI and SHA-256 each time.
- Independent checks preserved exact MPEG-4 Part 2 and MP3 packet hashes, fully
  decoded the output, sought at midpoint, and found 20 OpenDML RIFF segments
  with a maximum observed size of 8,560,640 bytes plus matching video/audio
  standard indexes and a master index. Cancellation and injected write failure
  deleted partial browser-owned output; the field test records every retained
  or explicitly excluded class.
- Compact evidence is retained in
  `evidence/compatible-avi-copy-2026-09-08.json`; generated stress media, raw
  reports, downloaded build artifacts, and browser output are disposable and
  are removed after the tracked public-evidence manifest is refreshed.
- Hosted no-Docker run
  [34177452654](https://github.com/tanishqbaweja/fileconverter/actions/runs/34177452654)
  reproduced the AVI-capable general core and all five unchanged specialist
  FFmpeg modules byte-for-byte in 12m11s. The final recipe restores both stock
  AVI source and the historical AVI-output-disabled configure surface before
  specialist linking. Cleanup passed; all three bounded mismatch artifacts
  from the diagnosed attempts were deleted, and the successful run retained
  none.

### 2026-09-07 — Matroska Theora/Vorbis to OGV packet-copy acceptance

- Native FFmpeg was used only to establish format feasibility: the tracked
  713,872-byte OGV was packet-copied to a 712,803-byte Matroska fixture and back
  to a genuine 713,946-byte Ogg/Theora/Vorbis file. The accepted rerun completed
  the Matroska-to-OGV copy in 46.375 ms, preserved exact Theora SHA-256
  `ea101c5ae3e799be1c72db4518c6a77d98ecd77f57eb734de81bd85ff9340829`
  and Vorbis SHA-256
  `fd60d39c748a531af3b4db14467c4f4804617529aed8875118e85c903d31cf4c`
  compressed-packet hashes, and fully decoded both streams. The first harness
  run exposed a Windows empty-directory cleanup bug after conversion; the fixed
  `scripts/test-ogv-copy-feasibility.mjs` rerun passed and restored `work/` to
  `.gitkeep` only.
- Remux profile 36 is compiled only into `within-remux` behind
  `WITHIN_OGV_COPY`, uses the existing bounded custom AVIO/Ogg muxer, requires a
  Theora primary video stream, copies all compatible Theora/Vorbis streams, and
  explicitly excludes incompatible codecs, subtitles, attachments, attached
  pictures, chapters, and unrepresentable rotation.
- Hosted no-Docker run `34134662736` proved only `within-remux.wasm` changed.
  After fixing specialist source reconstruction, run `34136791033` reproduced
  every published FFmpeg artifact byte-for-byte. Final pushed-state run
  `34139252534` repeated that proof at public promotion commit `65b2488` in
  7m32s and retained zero artifacts. The published general Wasm is 9,635,289
  bytes with SHA-256
  `8d17f291c1b2f9d34df4e038be60e7960398261bfd26edc135666a7a2ed4af84`.
- Production Chrome passed exact small-file packet/decode and bounded injected
  write-failure cleanup. A 136,906,650-byte Theora/Vorbis Matroska source then
  passed three genuine browser copies in 1.127–1.164 seconds, producing the same
  137,218,724-byte OGV hash every time. Exact 18,720 Theora and 36,564 Vorbis
  packets, 18,720 decoded frames, full native decode, 256 KiB reads, 64,258-byte
  writes/queueing, one pending operation, fixed 32 MiB Wasm, and post-run cleanup
  all passed. Worst complete-Chromium incremental private memory was 211.3 MiB.
  Cancellation after 134,217,728 input bytes deleted the 134,224,872-byte partial
  output and restored empty browser-owned storage. The public registry ceiling is
  now 136,906,650 bytes; compact evidence is retained in
  `evidence/compatible-ogv-copy-2026-09-07.json`.

### 2026-09-07 — compatible WebM packet-copy acceptance

- The existing legacy `mkv-to-webm-av1` profile now accepts every
  standards-compatible AV1, VP8, or VP9 video stream plus Opus or Vorbis audio.
  Generic WebM selection prefers this lossless packet-copy path before any
  re-encode; explicit VP9 re-encode remains selected only when requested and is
  correctly blocked for VP9 input because that specialist has no VP9 decoder.
- Production Chrome passed exact VP8 and VP9 small-fixture conversion plus three
  repeat 1,663,545-byte VP9/Opus copies. The last repeatability median was 130.6
  ms, but no before/after speedup is claimed because the prior certified path was
  blocked. Both compressed stream hashes matched source and full decode passed.
- A genuine 170,427,228-byte 1,920x1,080 VP9/Opus Matroska source then passed
  3/3 production-Chrome runs in 1.42–1.79 seconds. Every output was the identical
  170,426,113-byte SHA-256
  `10fa329a27605c5cc663750c16b36e0f0381f3d03da5a635636993b7e666ea5f`;
  all 1,440 decoded frames and decoded audio matched source. Reads, writes, and
  queueing stayed at 256 KiB, one operation was pending, Wasm stayed at 32 MiB,
  and worst complete-Chromium incremental private memory was 206.7 MiB.
- Hosted no-Docker run `34056960277` was rejected because an unguarded change
  altered all six cores. Isolated run `34105896026` changed only
  `within-remux.wasm`; publication run `34107308417` reproduced every artifact
  byte-exact in 10m34s and retained zero artifacts. Category cleanup removed the
  generated stress source, manifest, outputs, and browser profiles; `work`
  contains only `.gitkeep`, and `test.mkv` remains byte-exact. Compact evidence
  is in `evidence/compatible-webm-copy-2026-09-07.json`.

### 2026-09-07 — representative installed-browser compatibility matrix

- Added a repeatable production-build Playwright matrix for installed Google
  Chrome 152.0.7977.77, Microsoft Edge 152.0.4191.66, Brave 1.94.121, and
  Opera GX 134.0.5954.67. Each browser genuinely converted CSV to TSV, TXT to
  DOCX, TAR to ZIP, PNG to WebP, and H.264/AAC MKV to MP4 inside the production
  browser workers. The same run also exercised the normal-page direct file
  destination, functional capability probes, unsafe-TAR rejection, cleanup,
  and conversion-wide same-origin GET-only privacy.
- Independent validation required exact TSV semantics; a valid DOCX ZIP/XML
  package with Unicode paragraphs; all TAR entry names, sizes, and hashes in
  the ZIP; a complete WebP decode with 1024x768 dimensions and at least 0.90
  SSIM; and exact source/output H.264 and AAC packet hashes plus a complete MP4
  decode. Chrome, Edge, and Opera GX produced a 0.988655-SSIM WebP; Brave
  produced different valid bytes at 0.988719 SSIM. The other four route outputs
  were byte-identical in all browsers. Reads, writes, and queueing never
  exceeded 256 KiB, and at most one destination operation was pending.
- The final matrix passed 4/4 in 48.5 seconds. Chrome, Edge, and Brave ran
  headed and their completed media UI screenshots were reviewed without layout
  or diagnostic defects. Opera GX passed in an isolated headless process; two
  headed attempts were rejected after its singleton GX Corner startup captured
  navigation, and the user's existing Opera session was not stopped. Standard
  Opera was not installed, so no standard-Opera result is claimed. Brave
  exposed `showSaveFilePicker` and completed direct output but did not expose
  `showDirectoryPicker`, so folder/batch destinations remain visibly
  unsupported in that installed build.
- All four observed only localhost GET requests, no request body, filename, or
  fixture-content token, zero console/page/request failures, zero partial
  traversal outputs, and zero retained converted output or profile. Complete
  process-tree memory and multi-gigabyte stress claims remain Chrome-only. Raw
  JSON, screenshots, traces, and failure artifacts were deleted after compact
  evidence was retained in
  `evidence/browser-compatibility-matrix-2026-09-07.json`. No Docker command
  ran, and `test.mkv` remained byte-identical.

### 2026-09-06 — Matroska attached-picture work in progress

- A native feasibility test proved that naively stream-copying an MP4 attached
  picture into Matroska is not semantically correct: FFmpeg wrote a one-frame
  video track and cleared the `attached_pic` disposition. Its disposable output
  was deleted immediately.
- A second native feasibility test extracted the 178-byte PNG and stored it as a
  native Matroska attachment. FFprobe then exposed it as a PNG attached picture
  with `cover.png` and `image/png`, and its SHA-256 matched the source exactly.
  Every generated feasibility file was project-local and deleted immediately.
- The remux wrapper now implements that representation directly without image
  decode/re-encode: at most eight JPEG/PNG pictures, 4 MiB and 4,096 pixels per
  side and 16 megapixels each, with an 8 MiB aggregate ceiling. Unsupported,
  oversized, or excess pictures remain explicit exclusions. Source, manifest,
  registry disclosure, and production-browser regression passed. The focused
  Chrome gate passed 1/1 in 15.1 seconds and the affected Matroska gate passed
  14/14 in 35.6 seconds with exact cover, video, and audio payloads.
- No-Docker run `34029206301` built the new general remux core, then exposed a
  stale specialist reconstruction assumption: the historical direct-core patch
  could not reverse across the newly added source hunks. Its partial artifact
  was not published. A dedicated reversible artwork patch now removes only this
  feature before rebuilding the unchanged video/direct specialists.
- Candidate run `34029718417` then rebuilt all 19 artifacts, changed only
  `within-remux.wasm`, and supplied the published 9,633,875-byte SHA-256
  `44b302dd43f69aaf8045666b24e60d3b90f56a51263a42fe3764e2ac000749d0`.
  Publication run `34030378326` reproduced every artifact byte-for-byte without
  Docker in 10m34s. Both remote candidate archives and every local download,
  source fixture, and converted output were deleted. Compact evidence is in
  `evidence/matroska-attached-picture-browser-2026-09-06.json`. Together with
  the preceding field matrix, M-03 is verified for every current public profile.

### 2026-09-06 — complex MPEG-TS/FLV source-retention checkpoint

- Native FFmpeg, used only as a deterministic fixture generator, produced a
  byte-repeatable 818,364-byte MPEG-TS source (SHA-256
  `ce8da311a71a3919ad46d1933cac4554027547639b234ec6bcee01d0849ce73c`)
  with H.264 plus two AAC tracks and `eng`/`spa` descriptors, and a byte-
  repeatable 732,932-byte FLV source (SHA-256
  `1e70ed53d9c5e5d8f79dcf97e5a166169ae43a10981e0f336f2b9bf935725262`)
  with H.264, AAC, title, and comment.
- The initial browser gate passed 4/8. Packet-level diagnosis found no product
  loss: the allegedly empty ISO-BMFF AAC stream actually had 189 packets. The
  validator had incorrectly applied an ADTS-removal filter to already-normalized
  AAC, allowing older non-ADTS comparisons to collapse to empty hashes. It now
  strips ADTS only for `.aac` and MPEG-TS inputs. The other two mismatches were
  accurate 3GP `und` language and case-normalized MOV comment mappings.
- The corrected production Chrome 152 gate passed 8/8 in 27.0 seconds with
  exact normalized H.264, decoded video, every retained AAC access-unit stream,
  representable fields, required warnings, 256 KiB I/O ceilings, one pending
  operation, and fixed 128 MiB Wasm. The strengthened extraction/remux
  regression then passed 46/46 in 1.4 minutes. All sources, outputs, diagnostic
  copies, and browser artifact files were deleted. No Docker command ran. Evidence is
  in `evidence/complex-transport-source-field-retention-browser-2026-09-06.json`.
  M-03 remains partial for complex AVI, WebM, and Ogg origins plus attached-
  picture dispositions.

### 2026-09-05 — complex MOV/3GP source-retention checkpoint

- Generated deterministic small MOV and 3GP inputs from the tracked complex
  Matroska fixture using native FFmpeg solely as a fixture generator. Their
  exact identities are 782,828-byte SHA-256
  `6b261f3aabecaf42fbf351fe0f81e39c03032025868749fc172f1f9a25285a37`
  and 782,251-byte SHA-256
  `203417b19f7c1507008064fdf5c2dc2e7bb2d2983c1b7f81e4bc15a00efe1816`.
- Production Chrome 152 converted both sources through every compatible
  Matroska, MPEG-TS, MOV/3GP, and FLV destination. The focused eight-route gate
  passed 8/8 in 24.8 seconds with exact H.264 packets, decoded-picture equality,
  exact retained AAC access units, representable field assertions, container-
  specific warnings, 256 KiB read/write ceilings, one pending operation, and a
  fixed 128 MiB Wasm ceiling. Native tools only generated and independently
  validated; all conversions ran in the production browser pipeline.
- Both generated inputs, all converted outputs, and browser artifacts were
  deleted. `work` again contains only `.gitkeep`; `test.mkv` remains byte-exact.
  Compact evidence is in
  `evidence/complex-iso-source-field-retention-browser-2026-09-05.json`. M-03
  remains partial for complex MPEG-TS, FLV, AVI, WebM, and Ogg origins and
  attached-picture dispositions.

### 2026-09-02 — functional runtime-capability checkpoint

- Replaced the former browser-API presence snapshot with bounded functional
  probes for core WebAssembly and SIMD validation, GZIP, zlib-DEFLATE, and raw-DEFLATE
  compression/decompression round trips, OPFS opening, available-storage
  estimation, Web Crypto SHA-256, input-MIME-specific ImageDecoder support,
  OffscreenCanvas 2D context creation, SharedArrayBuffer/Atomics, and supported
  VP8, VP9, H.264, and Opus WebCodecs configurations.
- Audited every public profile and mapped all 14 exact browser-requirement
  strings. Unknown future requirements fail closed. Readiness now evaluates the
  selected profile rather than a generic browser checklist, requires SIMD for
  the published FFmpeg media cores, and shows each exact missing capability in
  a visible blocker while disabling conversion.
- Production Chrome passed 2/2 focused cases in 14.4 seconds: the real runtime
  reported functional Wasm/SIMD, GZIP/zlib/raw DEFLATE, OPFS, storage estimate,
  SharedArrayBuffer/isolation, SHA-256, canvas, and PNG decode; an injected
  failed Wasm validator blocked a genuine Wasm media profile with both core and
  SIMD reasons. The complete privacy/offline suite then passed 15/15 in 48.7
  seconds, including nine cached engine/direct-writer conversion families. The
  three new source/mapping audits pass within 95/95 unit tests; production
  build, TypeScript, and ESLint pass. No Wasm binary changed and no Docker
  command ran.

### 2026-09-01 — bounded worker-lifecycle checkpoint

- Audited every one of the 30 production TypeScript modules under `workers/`.
  Only `conversion.worker.ts` and `direct-file-writer.worker.ts` own message
  loops. The other 28 modules have no mutable module-scoped state, and the
  audit rejects mutation of initialized module-level arrays, maps, sets, or
  typed arrays.
- The conversion worker retains only five reviewed scalar/initialization values
  between commands and resets job/cancellation state in `finally`; the app
  terminates it after success, cancellation, error, crash, or unmount. The
  direct writer's nine reviewed values are exactly the writer, three fixed
  shared-buffer views, one fixed owned payload, position/busy/fault state; its
  owner terminates it after init failure, timeout, close, or abort.
- Added shared hard limits: 256 files per batch, eight retained UI warnings,
  2,048 characters per warning/error response, 256 characters per progress
  phase, and a 125 ms minimum interval between non-forced progress messages.
  The existing one-command 256 KiB direct payload, 4 KiB error channel, fixed
  Wasm manifests, and 8/32-entry 512-character native diagnostic rings remain
  enforced.
- The first source audit found the previously unbounded batch selection; the UI
  now rejects file 257 before format inspection, output naming, or destination
  creation. Mixed-format and oversized rejection also releases prior inspection,
  option, metric, warning, memory, destination, and result state. Central worker
  response truncation prevents an engine or browser
  exception from creating an oversized structured-clone message or retained UI
  string.
- Five lifecycle unit audits pass, bringing the complete unit suite to 92/92.
  Production Chrome passed 10/10 focused cases in 20.2 seconds: two sequential
  Unicode batch jobs, mixed and over-limit rejection, write/quota/permission
  cleanup, crash/restart, reload cleanup, OPFS cancellation, and direct-save
  cancellation with lock release. Production build, TypeScript, and ESLint
  pass. A post-review 3/3 batch rerun in 11.7 seconds verified the additional
  rejected-selection state release. No Wasm binary changed and no Docker
  command ran.

### 2026-09-01 — cross-source media-field mapping checkpoint

- Added destination-aware source/output probes to 28 compatible stream-copy
  routes spanning Matroska, MP4, MOV, 3GP, MPEG-TS, FLV, AVI, WebM, and Ogg
  origins and Matroska, MPEG-TS, 3GP, MOV, and FLV destinations. Assertions are
  conditional on fields actually declared by each source and pair field checks
  with decoded-picture, exact AAC access-unit/packet, or compressed-packet
  equality.
- The first 20-route destination run passed 12 and failed eight. A repo-local
  native `trace_headers` audit proved four were validator false positives: the
  simple H.264 source does not explicitly declare color information, and
  FFprobe's `tv` value is the codec's implicit limited-range interpretation.
  The other four exposed a real disclosure gap: native FFmpeg necessarily marks
  the first video/audio stream default in MOV and 3GP when a source media type
  has no default, even after its dispositions are explicitly cleared.
- The validator now distinguishes explicit from implicit H.264 color fields.
  The native wrapper and all public MOV/3GP copy routes disclose the unavoidable
  default mapping; MPEG-TS and FLV disclosures state the compatible fields they
  retain and those they exclude. Unit tests lock these policies for every route.
- The rebuilt production core passed the 20-route gate 20/20 in 42.5 seconds,
  the eight Matroska routes plus two complex MOV/3GP checks 10/10 in 24.3
  seconds, and media-options 11/11 in 43.4 seconds. Build, TypeScript, ESLint,
  87/87 unit tests, the 11-engine manifest, 388/388 public evidence records,
  and reverse-patch reconstruction also passed. No Docker command ran.
- Candidate run `33539788980` changed only `within-remux.wasm`; all 18 peer
  artifacts were byte-exact. After publication at `b9e41b5`, run `33541452435`
  rebuilt every FFmpeg artifact byte-exact in 10m33s, skipped mismatch upload,
  passed hosted cleanup, and retained zero artifacts. The local candidate and
  its remote mismatch archive were deleted immediately after this proof.
- This remains a partial M-03 checkpoint. The compact evidence does not promote
  representative simple fields into claims about equally complex non-Matroska
  origins or attached-picture dispositions.

### 2026-09-01 — Ogg Vorbis/Opus tag and artwork mapping checkpoint

- Added deterministic Vorbis and Opus fixtures using standard
  `METADATA_BLOCK_PICTURE` comments. Both regenerate byte-for-byte, expose the
  same exact 178-byte PNG as a bounded attached picture, and carry the seven
  certified text fields as stream-scoped Ogg comments.
- The native audio wrapper now promotes only `title`, `artist`, `album`,
  `genre`, `date`, `track`, and `comment` from container scope or, when needed,
  the selected audio stream into MP3/FLAC destination metadata. It does not copy
  the base64 picture comment into destination tags; artwork remains one bounded
  packet-copy stream under the existing 4 MiB/4,096-side/16-megapixel limits.
- The first production-browser run preserved artwork but correctly failed when
  Ogg text tags were absent at destination scope. The published fix passed
  Vorbis-to-MP3, Vorbis-to-FLAC, Opus-to-MP3, and Opus-to-FLAC with exact tags,
  exact artwork, bounded I/O, and full native audio decode. The focused gate
  passed 1/1 in 21.0 seconds and the complete media-options file passed 11/11 in
  50.8 seconds.
- Candidate run `33479466650` produced the expected two-file diff while all 18
  peer artifacts remained exact. Publication run `33480650192` then rebuilt
  every committed FFmpeg artifact exactly without Docker in 8m56s, skipped
  mismatch upload, and completed repository-local cleanup. The local download,
  browser outputs, Playwright state, and remote candidate archive were deleted;
  the branch retains zero Actions artifacts.
- M-08 remains partial: these verified source mappings do not imply every field
  or every public source/destination topology is covered.

### 2026-08-30 — video-control source and native ABI checkpoint

- Added one bounded video option contract for all 22 public re-encode profiles:
  automatic/VP8/VP9/MPEG-4 codec selection, automatic/320/480/640 px no-upscale
  width, automatic/300–4,000 kb/s bitrate, automatic/15/24/25/30 fps
  no-upconvert frame-rate cap, and automatic/smaller/balanced/higher quality.
- The production UI, preflight stream plan, request, worker validator, JS/Wasm
  bridge, and C wrapper all carry the same values. Switching VP8/VP9 also moves
  the selector to the matching public profile so the displayed destination is
  not misleading. Unsupported profiles, cross-container codecs, and arbitrary
  values are rejected independently in TypeScript and native code.
- Native width caps preserve aspect ratio and never upscale. Lower frame-rate
  caps uniformly discard decoded frames before scaling; caps at or above the
  source retain source-average timing rather than inventing frames. Automatic
  mode leaves the earlier width, bitrate, frame-rate, quality, thread, and
  zero-lookahead branches unchanged.
- Updated the no-Docker build order so the current MPEG-4/VP8/VP9 specialists
  can change while the high-throughput direct-remux core remains byte-certified
  at `79e4db4`. The generated reverse patch reconstructs the exact historical
  C blob (`307fd688fb11f322ae7e3552f0dd0e5012615901`); the disposable verification
  copy was deleted immediately.
- Current source gates pass: TypeScript, ESLint, production build, 84/84 unit
  tests, 4/4 production-browser media-option tests, and the 11-engine recipe
  declaration audit. The browser cases also prove the nine-value JS bridge is
  backward-compatible with the currently published four-value MP3 core.
- This is explicitly partial. No custom-video claim is public until new Wasm
  bytes pass independent codec/dimension/bitrate/frame-rate/quality validation,
  cleanup faults, speed comparison, and the complete-Chromium three-run memory
  ceiling.
- Hosted no-Docker run `33327587571` then compiled the nine-value ABI in 9m52s.
  It proved the direct-remux loader/binary and all loaders/licenses remained
  byte-identical while only the expected manifest and four Wasm binaries
  changed. The candidate passed genuine direct VP9 and MPEG-4 output checks,
  isolated bitrate/quality effects, cancellation, and injected-write cleanup.
- The maximum VP9 settings passed 3/3 on the 936,003-byte source at 234.7 MiB,
  but the required 181,825,549-byte three-run stress gate peaked at 264.1 MiB
  despite fixed 80 MiB Wasm and bounded I/O. That candidate is therefore not a
  completed/public result. Its 349.3/351.9/348.6-second runs were repeatable and
  correct, but renderer retention on runs two and three exceeded the hard limit.
- The next measured candidate keeps automatic/smaller/balanced on the fastest
  eight-worker core and routes only `higher` WebM quality to a separate lazy
  four-worker/two-codec-thread specialist. This targets the measured allocation
  source without weakening quality, memory accounting, or automatic speed.
- Hosted no-Docker run `33329599236` built that specialist in 10m24s. Its expected
  pre-publication comparison differed only by the manifest and new quality
  loader/Wasm (`cc5a54a...` / `1919cbb6...`); every existing loader, binary, and
  license stayed byte-identical.
- The tuned maximum settings (VP9, 640 px, 4 Mbit/s, 30 fps cap, higher quality)
  passed 3/3 on the 181,825,549-byte stress source at 232.9 MiB, fixed 72 MiB
  Wasm, five active workers, one pending 256 KiB write, and complete cleanup.
  Runs took 399.7/397.7/398.1 seconds and produced the same independently decoded
  50,010,269-byte VP9 WebM hash each time. The small maximum-settings gate also
  passed at 202.3 MiB in 1.544/1.237/1.146 seconds. The retained evidence records
  both the rejected faster topology and this accepted bounded one.
- After publication, hosted no-Docker run `33363432256` rebuilt and compared all
  19 FFmpeg files exactly at pushed commit `94923a3`. The mismatch-upload step
  was skipped, hosted cleanup passed, and the completed run retains zero
  artifacts. This closes M-05 for the 22 currently public video re-encode
  profiles without changing automatic-mode speed or the 250 MiB limit.

### 2026-08-30 — exact clean no-Docker reproduction for all engines

- Added pinned Linux no-Docker recipes and fail-independent matrix entries for
  BZIP2, full and decoder-only XZ, 7Z, TIFF, JPEG XL decode/encode, and AVIF
  decode/encode, joining the established SVG and five-module FFmpeg entries.
  Hosted run `33297796443` proved nine entries exactly in parallel; TIFF's only
  failure was a pre-build transient zlib download checksum and its unchanged
  recipe passed targeted run `33298467168` in 167 seconds.
- The clean AVIF encoder consistently produced 4,509,195-byte static/animation
  Wasm files with SHA-256 `4c28a20a06cb480344d2488307fe41c3842255f1df5607e7058bc974a9ec0a03`
  and `4f1d2902897f39f32bc22078bdce2d1ffb67ca70978a4bac0783f1430955085f`.
  The former 4,508,341-byte files came from a persistent BuildKit cache mount,
  so source-only clean builds could not reproduce them. Three SDK-path
  diagnostics repeated the clean hashes; code was the only differing Wasm
  section, with 22 of 2,824 function bodies changed and an 854-byte increase.
- Before publishing the clean bytes, all seven static/animated profiles passed
  3/3 at 207.3–224.3 MiB and static WebP passed an additional 10/10 gate.
  Chromium's prior I420/BGRX alternation was normalized through managed sRGB
  conversion before the existing bounded RGBA copy. The focused genuine
  browser/native decoder gate passed 5/5 and the standalone fixed-heap,
  positioned-write, truncate, flush, and box-order probe passed every case. The
  complete clean-binary image regression then passed 152/152 in 4.4 minutes.
- Temporary engine exports, converted outputs, validation copies, probe files,
  and Chrome profiles remained repository-local and were deleted after compact
  evidence was recorded. `work/` returned to only `.gitkeep`; protected
  `test.mkv` remained 2,958,573,265 bytes with SHA-256
  `31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34`.
  Full details are in `evidence/non-docker-all-engine-repro-2026-08-30.json`.
- Final integrated run `33312105530` passed all 16 jobs at `5e46a66`: 13/13
  privacy/offline tests, 152/152 image, 484/484 media, and 235/235 streaming
  browser cases, plus all 11 exact engine rebuilds. Every failure-upload step
  was skipped and the run retains zero artifacts, closing T-10 for this branch.

### 2026-08-30 — bounded MP3 bitrate, sample-rate, and channel controls

- Added one bounded option contract for every MP3-output route: automatic or
  64/96/128/192/256/320 kb/s, automatic or 32/44.1/48 kHz, and automatic/mono/
  stereo. Unsupported values and non-MP3 use are rejected independently in the
  browser contract, conversion worker, and native wrapper. Automatic retains
  the previously certified source-aware policy and fastest LAME
  `compression_level=9`; the controls add no extra worker, queue, or Wasm heap.
- Focused production Chrome passed 3/3: UI/request/plan propagation; genuine
  WAV-to-MP3 at exactly 256 kb/s, 44.1 kHz mono with full native decode and ASDR
  above 20 dB; and injected direct-write failure with no retained partial file.
  Reads/writes stayed at or below 256 KiB, one operation was pending, and every
  OPFS/validation copy was deleted in `finally`.
- The maximum selectable topology converted a genuine 153,600,106-byte,
  800-second WAV three times in 9.61–12.73 seconds (62.8–83.3× realtime).
  Every output was the same genuine 32,002,657-byte 320 kb/s, 48 kHz stereo MP3
  with SHA-256 `e9384cd1947d9de6aee88349d39bfe707ee50e7ab4603f7f03a40dc2cbc84bd5`.
  Worst complete-Chrome incremental private memory was 191.7 MiB, Wasm stayed
  at 32 MiB, reads at 262,144 bytes, writes/queueing at 1,057 bytes, pending
  operations at one, and cleanup recovery within 27.3 MiB of loaded idle.
- The first stress attempt produced the valid 32,002,657-byte output but the
  profiler still applied the automatic 192 kb/s size ceiling. It was correctly
  left unclaimed, the ceiling was derived from the selected bitrate, and the
  same unchanged encoder then passed all three runs. The compact failed report
  remains so this harness mistake is not diagnosed again as an engine failure.
- The hosted no-Docker candidate comparison changed only the expected general
  Wasm and manifest; all four specialist modules, JavaScript glue files, and
  six licenses remained byte-identical. Its bounded artifact, the 153.6 MB
  source, every converted/validation copy, and the Chrome profile were deleted;
  `work/` returned to only `.gitkeep`, and `test.mkv` remained byte-identical.
- After publication, GitHub Actions run `33268736116` rebuilt and compared all
  17 FFmpeg files byte-for-byte in 539 seconds at commit `f21bc98`. Cleanup
  passed, the mismatch-upload step was skipped, and zero artifacts remain.
  `evidence/mp3-output-controls-2026-08-30.json` retains the exact hashes and
  focused/stress/reproducibility facts.
- M-07 remains partial: selectable codec/quality, explicit lossless/lossy choice,
  and equivalent controls for other practical audio destinations are not yet
  implemented or claimed.

### 2026-08-29 — exact FFmpeg reproduction without Docker

- Added a Linux-hosted, pinned Emscripten 6.0.4 reproduction path that verifies
  every upstream source archive, builds all five FFmpeg modules, recursively
  compares JavaScript/Wasm/manifests/licenses against the published directory,
  and keeps all scratch data under repository-local `work/`. GitHub Actions run
  `33242017745` completed the exact comparison in 557 seconds without Docker;
  its always-run cleanup passed and zero hosted artifacts remain.
- Diagnosed the failed attempts instead of treating differing binaries as a
  success. The original isolated `/src` build sat outside the repository's ESM
  package scope, so a scratch CommonJS boundary is required for Autoconf's
  extensionless Emscripten probes. Current-source rebuilds then matched the
  general core exactly but correctly exposed older source provenance for the
  four video specialists.
- Git history and a mechanical source-hash check identified specialist commit
  `79e4db4`. A SHA-256-pinned reverse patch reconstructs it from the current
  wrapper after the general core builds. This reproduces the certified binaries
  byte-for-byte instead of replacing them and invalidating their retained
  three-run speed and complete-Chromium memory evidence.
- The rejected current-wrapper specialist candidates still passed 4/4 genuine
  production-browser direct-save, MPEG-4, VP8, and VP9 conversions in 18.7
  seconds. Their diagnostic artifact, converted copies, and scratch tree were
  deleted; the protected `test.mkv` remained byte-identical. Full details are in
  `evidence/non-docker-ffmpeg-repro-audit-2026-08-29.json`.
- The ordinary CI engine matrix now installs the exact pinned SDK for each
  binary-engine entry and runs every comparison independently alongside SVG.
  The all-engine implementation and final AVIF clean-byte publication are
  recorded in the 2026-08-30 section above.
- Main run `33252270830` then passed all seven integrated jobs at `098a7a7`:
  871/871 browser conversions, 75/75 unit tests, 13/13 privacy/offline cases,
  exact SVG, and exact FFmpeg. The FFmpeg build/comparison took 470 seconds,
  its cleanup passed, and the complete run retained zero uploaded artifacts.

### 2026-08-28 — fixed-ABI audit and source-aware conversion plan

- Persisted the request/worker/native ABI and non-Docker toolchain probe in
  `evidence/media-option-abi-audit-2026-08-28.json`, including exact absent
  option fields, the single-number Wasm call, installed-tool findings, and disk
  preflight. This prevents another loop that attempts to attach controls to a
  binary that cannot receive them.
- Benchmarked the direct MKV-to-MP4 production path against the ordinary 256 KiB
  core using the same protected 2.958 GB source, direct selected destination,
  Chrome 152 build, validator, and three-run gate. Both candidates wrote the
  identical 2,962,151,538-byte output hash and remained below 250 MiB, but the
  retained 1 MiB specialist improved median throughput by 19.6% (82.14 versus
  68.66 MB/s). The temporary selector change was reverted, converted copies and
  rejected raw reports were deleted, and no Docker environment was used.
- Added `lib/media-conversion-plan.ts`. It applies the actual fixed FFmpeg
  profile policy to every bounded-inspection stream and reports **Copy**,
  **Re-encode**, **Exclude**, or **Reject** before conversion. Codec-incompatible
  stream-copy inputs are shown as rejections; they are never described as an
  implicit transcode or extension rename.
- Corrected initial route selection: it now prefers an exact same-category
  profile and, for video, a standards-compliant non-elementary stream copy. A
  selected Matroska file therefore opens on `mkv-to-mp4`, not generic GZIP;
  MP4 opens on `mp4-to-mkv`, OGV on `ogv-to-mkv`, and raw/unknown binary still
  falls back to GZIP. This removes a manual step and starts from the fastest
  preservation-valid media topology.
- The production UI now displays those outcomes, details first-stream and
  destination policies, connects detected metadata signals to the exact
  destination limitations, and disables Start when bounded inspection proves a
  required codec/stream is absent or incompatible. Eight policy tests cover
  MP4/Matroska copy, incompatible rejection, first-stream extraction, all-stream
  M4A AAC copy, missing-codec blocking, OGV audio preservation, audio
  re-encoding, and AV1 WebM copy/exclusion.
- Production build, ESLint, TypeScript, and all 75 unit tests pass. Headed Chrome
  152 against the then-current 780,953-byte pre-rotation complex Matroska
  fixture revision showed the
  correct four-stream plan for both `mkv-to-mp4` and `mkv-to-webm-vp9`; it also
  blocked `mkv-to-mp3` before start because the fixture has no MP3 stream. The
  UI rendered without clipping and emitted zero console errors. Evidence is in
  `evidence/media-conversion-plan-browser-2026-08-28.json`; the headed check made
  no converted output and its disposable CLI screenshots/state were deleted.
- The complex Matroska retention gate now uses a byte-deterministic 780,989-byte
  fixture with explicit limited-range BT.709 primaries/transfer/matrix and a
  90° display matrix. It asserts output stream order/codecs, geometry,
  sample/display aspect, every named color field, rotation, chroma location,
  field order, video/audio titles, languages, default disposition, subtitle
  language, attachment identity/type, chapter titles, container tags, and exact
  decoded video/audio equality. Genuine production-browser copies to Matroska
  and MP4 passed 2/2 in 14.7 seconds without an engine rebuild, with exact VFR
  decoded-frame and both AAC access-unit hashes; MP4 also proved explicit
  subtitle/attachment/chapter exclusions. Both outputs were deleted.
  Evidence is in
  `evidence/complex-matroska-field-retention-browser-2026-09-01.json`.
- The remaining compatible Matroska-source stream-copy destinations now have
  field-level production-browser evidence. MOV/3GP retain the exact display
  matrix, every explicit BT.709 field, both AAC tracks/languages/dispositions,
  and exact VFR video/AAC payloads. MPEG-TS/FLV retain every explicit color
  field and exact unrotated compressed pictures while explicitly warning that
  their containers cannot represent the source Display Matrix; MPEG-TS retains
  both AAC tracks/languages, while FLV retains its first AAC track and title and
  discloses the additional audio exclusion. The focused gate passed 4/4 in
  14.1 seconds, the legacy MP4/Matroska gate passed 2/2 in 10.9 seconds, the
  media-options suite passed 11/11 in 40.9 seconds, and the complete shared-core
  remux suite passed 488/488 in 8.7 minutes. Candidate no-Docker run
  `33511638898` changed only `within-remux.wasm`; all companion artifacts were
  byte-exact. Publication run `33514702550` was the final exact-rebuild gate.
  It passed every artifact byte-exact in 10m11s, skipped mismatch upload, and
  completed hosted cleanup. The candidate download and remote artifact, all
  outputs, and browser artifacts were deleted; retained evidence is in
  `evidence/complex-container-field-retention-browser-2026-09-01.json`.
- A registry-wide disclosure gate now evaluates all 259 public FFmpeg profiles.
  It requires explicit metadata/container semantics, copy-versus-re-encode
  wording, first-stream and video exclusion disclosures for all 65 container-
  video-to-audio re-encode profiles, and first/additional-stream policy for all
  17 container video re-encode profiles. It found and corrected the two real
  gaps (`aiff-to-wav` and `wav-to-flac`); compact counts and corrections are in
  `evidence/media-disclosure-audit-2026-08-28.json`. This closes disclosure
  consistency, not the still-open field-retention implementation audit.
- The audio field-retention gate now covers all eight tag-capable destination
  families with representative production-browser routes: WAV, FLAC, AIFF,
  ALAC/M4A, WMA/ASF, MP3/ID3, Opus/Ogg, and Vorbis/Ogg. Native FFprobe found the
  exact source title in every genuine output; lossless routes also matched exact
  decoded PCM, and lossy routes retained their codec/rate/quality checks. The
  matrix passed 8/8 in 17.5 seconds; converted copies and Playwright artifacts
  were deleted afterward. Raw AAC/ADTS and AMR are correctly excluded because
  they cannot carry these tags. Evidence is in
  `evidence/audio-metadata-retention-browser-2026-08-28.json`.

### 2026-08-27 — bounded Ogg/Theora multi-stream source inspection

- Added bounded multiplexed Ogg page scanning for Theora and Vorbis BOS
  identification packets plus final per-serial granules. The tail scanner safely
  starts mid-page, rejects incomplete candidates, and caps valid page count.
- The genuine Theora/Vorbis fixture matches FFprobe on two logical streams,
  640×360, 24 fps, 4.0 seconds, mono 48 kHz Vorbis at 96 kb/s, and a 1,427,744
  b/s whole-file average from one 64 KiB head and one 66 KiB tail read.
- Focused malformed/bounds/parser and production Chrome panel coverage pass
  without decoding, conversion, Docker, or output copies. This closes the named
  standalone-audio and mainstream-container source-panel backlog; automatic
  planning and user-selectable conversion controls remain separate open work.

### 2026-08-27 — directed AVI multi-stream source inspection

- Added defensive RIFF/AVI and nested LIST traversal with a 256 KiB cumulative
  ceiling and explicit chunk/nesting limits. The walker reads `avih`, each
  stream's `strh`/`strf`, and INFO headers while seeking over `movi` media data.
- The genuine MPEG-4 Part 2/MP3 fixture matches its FFprobe manifest on two
  streams, 640×360, 24 fps, 4.041667-second video, 4.032-second mono 48 kHz MP3,
  192 kb/s audio, and INFO metadata after only 394 directed bytes. The largest
  individual read is 56 bytes.
- Focused malformed/bounds/parser and production Chrome panel coverage pass
  without decoding, conversion, Docker, or output copies.

### 2026-08-27 — bounded MPEG-TS multi-stream source inspection

- Added bounded 188/192/204-byte transport synchronization, PAT/PMT program
  discovery, stream-type/PID mapping, PES timestamp sampling, H.264 Annex-B SPS
  dimension parsing, and AAC ADTS rate/channel parsing. Defensive limits cover
  head/tail reads, elementary-header collection, program sections, and streams.
- The genuine retained H.264/AAC fixture matches its independent FFprobe
  manifest: two streams, 640×360, 24 fps, 3.999667-second video, and 3.967833-
  second mono 48 kHz AAC. One 64 KiB head read and one 64 KiB tail read provide
  the result; no middle payload is read or decoded.
- Focused malformed/bounds/parser coverage and production Chrome source-panel
  coverage pass without conversion, engine loading, Docker, or output copies.

### 2026-08-27 — bounded FLV multi-stream source inspection

- Added a 64 KiB-bounded FLV header/tag walker with signature, version, data-
  offset, tag-size, and 512-tag limits. It identifies video/audio codec tags and
  parses only bounded AMF `onMetaData` values for duration, dimensions, frame
  rate, sample rate, channel count, and declared data rates.
- AAC sequence headers override FLV's legacy one-bit stereo flag, so the genuine
  H.264/AAC fixture correctly reports mono 48 kHz instead of false stereo.
- The retained 938,798-byte FLV fixture reports H.264, 640×360, 24 fps, AAC,
  mono 48 kHz, 4.031 seconds, and script metadata from one 65,536-byte read.
  Focused parser and production Chrome panel coverage pass without conversion,
  engine loading, Docker, or retained disposable output.

### 2026-08-27 — bounded Matroska/WebM multi-stream source inspection

- Added a defensive EBML variable-integer walker with 64 KiB cumulative/input
  ceiling, seven-level nesting limit, 1,024-element limit, signature/document-
  type checks, and an explicit stop at the first Cluster. It reports Matroska or
  WebM, duration/timecode scale, video dimensions/default frame duration,
  effective audio output sample rate, channels, lossless bit depth, subtitles,
  and title/chapter/attachment/tag signals present in the bounded header prefix.
- Whole-file bitrate is explicitly labeled as a container average because EBML
  track headers do not declare per-track encoded byte totals. HE-AAC uses its
  declared output sampling frequency (48 kHz for the protected source), not its
  24 kHz coded core frequency.
- The genuine complex Matroska fixture exposes H.264, two AAC tracks, SubRip,
  title, chapters, attachment presence, and tags. A new deterministic 95,150-byte
  VP9/Opus WebM fixture is retained with a native-FFmpeg generator, ffprobe
  manifest, and SHA-256; Docker is not involved.
- Direct inspection of the protected 2,958,573,265-byte `test.mkv` performs one
  65,536-byte read and reports HEVC, 1920×804, approximately 24 fps, AAC 48 kHz
  six-channel audio, SubRip, and 12,340.096-second duration without loading,
  hashing, converting, or copying the whole file.
- Nineteen focused parser tests and the combined production Chrome source-panel
  test pass. Browser teardown deletes its repository-local profile and creates
  no converted output.

### 2026-08-27 — bounded MP4/MOV/3GP multi-stream source inspection

- Generalized the existing 64 KiB-budget ISO-BMFF walker to retain all complete
  audio and video tracks and report the primary video codec, resolution,
  duration, average frame rate, encoded-sample bitrate, and each companion audio
  stream's codec, duration, bitrate, sample rate, and channel layout.
- Classic QuickTime's later non-media `url ` handler no longer overwrites the
  track's earlier `vide`/`soun` handler. Track display duration and media-table
  duration remain distinct so edit-list-adjusted duration and encoded bitrate
  both match independent FFprobe manifests.
- Genuine retained H.264/AAC MOV and 3GP fixtures match 640×360, approximately
  24.01 fps, 3.999-second video at 1,740,889 b/s, and 4.011-second mono 48 kHz
  AAC at 125,008 b/s. The directed parser reads only 1,768 MOV bytes and 1,728
  3GP bytes; its largest individual read is 756 bytes.
- Sixteen focused parser tests pass, including MP4 routing, malformed ISO
  rejection, exact cumulative bounds, and preservation of prior standalone
  audio results. The production Chrome source-panel test passes both video
  containers and all standalone audio families without creating a converted
  copy. No Docker command or engine rebuild was used.

### 2026-08-27 — complete standalone-audio source inspection surface

- Added bounded Ogg page/identification/tail-granule parsing for Vorbis and Opus,
  raw AMR-NB signature/frame-window parsing, and a 64 KiB-read-budget ISO-BMFF
  box walker for M4A AAC, fragmented M4A ALAC, and AMR-WB inside real 3GP.
- The ISO walker follows `moov`/track/sample tables and bounded fragment runs,
  derives fragmented duration and encoded sample bytes, overrides misleading
  generic sample-entry fields with mandatory AMR mono/rate semantics, and uses
  AMR frame sizes to identify the exact 23.85 kb/s codec mode.
- Added directed ASF header-object and `WAVEFORMATEX` inspection. The genuine WMA2
  fixture reports its 320 kb/s stream rate rather than its 603 kb/s whole-file
  container rate, plus both content-metadata object signals.
- Fifteen focused parser tests pass across genuine fixtures, fragmented timing,
  exact codec/container distinctions, format signatures, structural rejection,
  and fixed read budgets. One production Chrome session passes the entire named
  standalone-audio family set while switching files repeatedly; it creates no
  converted copy and teardown removes its project-local browser profile.

### 2026-08-27 — FLAC, AIFF/AIFC, and AAC/ADTS source inspection

- Extended the directed-read inspector to native FLAC STREAMINFO/metadata-block
  headers, AIFF/AIFC `COMM` and metadata chunk headers (including the 80-bit
  sample-rate field), and consistent raw AAC/ADTS frame headers.
- The retained genuine fixtures require 50 bytes for FLAC, 54 bytes for AIFF,
  and 234 bytes for AAC. FLAC/AIFF facts are exact from standardized headers;
  AAC duration and bitrate are visibly labeled estimates from at most 32 frame
  headers. Renamed payloads are rejected by format signatures/sequences.
- Ten focused parser tests pass across all five implemented format families,
  exact bounds, large skipped ID3v2 tags, inconsistent MP3 sync, and renamed
  inputs. The production Chrome UI test passes all five retained genuine audio
  fixtures through one real app session without producing converted copies.

### 2026-08-27 — bounded WAV and MP3 pre-conversion inspection

- Added a browser-only source inspector for RIFF/RF64 WAVE and MPEG Layer III.
  It reports container, codec, duration, bitrate, sample rate, channels/layout,
  declared bit depth, and bounded metadata signals before conversion.
- Normal WAV files use directed RIFF chunk reads: the retained fixture requires
  only 52 bytes, including `fmt`, `LIST`, and `data` chunk headers. MP3 reads are
  capped at 4,234 bytes across the ID3 header, first-frame window, and ID3v1
  tail; large ID3v2 bodies are skipped by bounded random access rather than read.
- Unsupported formats continue to receive an explicit honest message instead
  of fabricated stream facts. Inspection errors do not become conversion
  claims, and the UI states that no payload was uploaded or decoded.
- Focused verification passed: six Node parser/bounds tests; TypeScript; ESLint;
  production Chrome WAV+MP3 UI inspection; and the existing same-origin GET-only
  CSV conversion/privacy test. Both browser tests removed their project-local
  profile/OPFS state in teardown and created no converted validation copy.
- Native audio controls remain missing. The unbuilt draft was removed after the
  Docker failure described above, so the current public UI and Wasm stay in
  agreement.

### 2026-08-27 — engine declaration audit and non-Docker reproducibility scope

- Added one checked manifest for every directory under `public/engines` and a
  local `npm run audit:engine-reproducibility` command. It currently covers all
  11 published engine directories and fails if a directory or package build
  command is omitted.
- The manifest now separates declaration coverage from executable non-Docker
  rebuild coverage. On the current hosted/local toolchains, SVG is the only
  executable clean rebuild; the ten binary-engine entries retain Docker-based
  recipes and are not falsely counted as non-Docker artifact comparisons.
- Split network privacy/offline tests into an explicit CI step; the remaining
  production-browser suites retain their independent validators.
- Local verification passed: manifest declaration audit 11/11, ESLint,
  TypeScript, workflow parse, and unit tests 42/42. The exact non-Docker SVG
  rebuild also passes hosted; equivalent non-Docker rebuild paths for the other
  ten engines remain pending.

### 2026-08-27 — cross-browser production conversion smoke

- Google Chrome 151.0.7922.174, Microsoft Edge 151.0.4129.107, Brave
  151.1.93.138, and Opera GX 134.0.5954.67 each passed the identical production
  build CSV-to-TSV worker conversion and strict same-origin GET-only privacy
  assertion.
- Each test deleted its isolated OPFS output and persistent test profile in
  teardown. The standard Opera distribution was not installed, so the Opera
  result is correctly labeled Opera GX rather than generalized to all Opera.
- This closes the missing basic compatibility evidence, but not broader route,
  headed-interaction, offline-engine, or process-memory coverage in each browser.

### 2026-08-27 — mechanical public evidence audit

- Added `npm run audit:public-evidence` and made it an explicit CI gate.
- The audit imports the actual registry, rejects PDF leakage, pending profiles,
  and public non-passing profiles, and validates the retained report contract:
  exact 250 MiB ceiling, required process/queue/read/write/Wasm/cleanup checks,
  positive source/output/validation byte counts, output hashes, no more than one
  pending operation, and per-run process-memory compliance.
- Current compact result: 396 public passed profiles, 396 with three-run evidence, 396
  tested at their published maximum size, zero pending, zero public non-passing,
  and zero PDF formats or routes.
- Raw JSON reports remain local/ignored to avoid committing hundreds of bulky
  diagnostic files. `evidence/public-profile-evidence.json` is the tracked
  396-entry index of selected report names, SHA-256 hashes, run counts, source
  sizes, and incremental-memory peaks. Local audits require it to match the raw
  reports; fresh CI checkouts validate it against the live registry.

### 2026-08-27 — honest basic source inspection

- Added an expandable source panel with locally detected format/category,
  browser MIME, exact aggregate bytes, file count, and modification time.
- The UI explicitly distinguishes these bounded browser facts from the deeper
  engine-side media stream/codec check and promises warnings for exclusions; it
  does not claim that MIME or extension detection is a complete container probe.
- Focused production Chrome CSV-to-TSV/privacy coverage passed with assertions
  for the new panel; ESLint, TypeScript, unit 42/42, both evidence audits, and
  artifact cleanup passed. Detailed pre-conversion media stream presentation and
  user-selectable conversion controls remain open.

### 2026-09-14 — AV1/Opus MP4-to-WebM candidate

- Native feasibility proved genuine AV1/Opus MP4-to-WebM packet copy in
  0.048661-0.064152 seconds with exact compressed video/audio packets and exact
  decoded output for an encoder-origin MP4. This is fixture/validator evidence,
  not production-browser conversion evidence.
- A harder MP4 inherited a 336-sample Opus skip from millisecond-quantized
  Matroska timing. Stock FFmpeg/WebM reduced it to 312 samples and decoded 24
  extra samples, so that uncorrected path was rejected rather than published.
  `media/ffmpeg/within_remux.c` now reuses the fixed 2 MiB/4,096-packet bounded
  priming prefetch for Opus and records the packet skip before writing WebM.
- `mp4-to-webm-av1` is public at its tested 170,433,726-byte maximum after the
  exact no-Docker rebuild, focused packet/decode and adverse-cleanup gate, three
  stress runs per destination mode, and unchanged complete-Chromium 250 MiB
  memory gate all passed. Classic MOV AV1 remains excluded because the pinned
  FFmpeg muxer rejects AV1 outside MP4/AVIF.
- Hosted no-Docker attempt 34823154123 stopped before compilation when the
  source-rewrite preflight detected that the new general-core delta was not yet
  reversible for historical specialist cores. It retained zero artifacts and
  cleanup passed. The exact delta is now isolated in
  `mp4-webm-opus-priming-source.patch` and reversed in every legacy rebuild
  branch before a retry; this failure must not be mistaken for a codec result.
- Compact measurements are retained in
  `evidence/av1-mp4-webm-native-feasibility-2026-09-14.json`; every disposable
  MP4, WebM, and failed zero-byte MOV trial was deleted afterward.

### 2026-09-15 — AV1/Opus MP4-to-WebM browser acceptance

- Corrected no-Docker run 34823637056 compiled the source-patched candidate in
  6m10s. Only `build-manifest.json` and `within-remux.wasm` differed from the
  prior published engine; JavaScript glue and all licenses remained byte-exact.
- The focused production-Chrome gate passed 3/3: exact compressed AV1 and Opus
  packets, exact decoded video and PCM for the 336-sample priming case, genuine
  WebM structure, metadata checks, Matroska-route regression, and injected-write
  cleanup.
- The 170,433,726-byte MP4 stress source passed three OPFS conversions at
  206.191 MiB worst incremental complete-Chromium private memory. The first
  direct path exposed renderer retention at 316.6 MiB. A 1 MiB write-coalescing
  experiment worsened the peak to 358.332 MiB and was reverted. Route-scoped
  reusable asynchronous BYOB input then passed all three direct saves at
  219.063 MiB with cleanup within 12.536 MiB of loaded idle.
- Both accepted modes produced the same 170,426,241-byte output, exact decoded
  video/audio hashes, 256 KiB reads/writes/queueing, one pending operation, and
  fixed 32 MiB Wasm. Category cleanup deleted both large source containers,
  their manifests, all converted outputs, and browser profiles; `work/` contains
  only `.gitkeep`, and `test.mkv` remains byte-identical.
- Hosted no-Docker run 34899740113 reproduced the pushed source, manifest, glue,
  Wasm, and licenses byte-for-byte at commit `0c8bc78` in 5m10s. It skipped the
  mismatch upload, passed repository-local cleanup, and retained zero artifacts.
  The obsolete candidate mismatch artifact was then deleted. The route is now
  public; compact evidence is in
  `evidence/av1-mp4-webm-browser-acceptance-2026-09-15.json`.

### 2026-09-15 — MP4-to-OGV candidate and direct-save memory optimization

- Added a hidden `mp4-to-ogv` profile that reuses the pinned single-thread
  `within-theora` module. The production browser worker genuinely decodes H.264
  and encodes Theora; it does not packet-copy or rename the input. A focused
  two-case Chrome gate passed genuine output/full decode, exact 1,560-frame
  traversal, bounded metrics, and injected-write cleanup.
- A 147,136,621-byte, 65-second MP4 passed three OPFS runs in
  32.662-33.117 seconds, producing repeatable 8,805,137-byte Ogg/Theora at
  midpoint SSIM 0.936942. Worst complete-Chromium incremental private memory was
  235.375 MiB; 256 KiB reads, at most 64,940-byte writes/queueing, one pending
  operation, 32 MiB Wasm, cancellation, and cleanup recovery passed.
- The synchronous direct-writer session was rejected because its cold first run
  peaked at 250.441 MiB even though later runs were 206.691 and 202.715 MiB and
  every non-memory gate passed. A route-scoped asynchronous writer experiment
  was also rejected: it slowed the conversion to 34.459 seconds and worsened the
  cold peak to 257.754 MiB. Neither failure was hidden by rounding or a smaller
  source, and all generated inputs/outputs/browser profiles were deleted.
- Hosted no-Docker run `34903564007` produced the 24 MiB-initial candidate and
  its seven-case small-browser regression passed, but the runtime immediately
  grew in one 8 MiB step back to 32 MiB. A favorable clean-session discriminator
  measured 240.535 MiB, while the required three-run direct-save session measured
  231.230, 258.320, and 235.246 MiB. The candidate was rejected without weakening
  the 250 MiB ceiling; all non-memory, cancellation, and cleanup checks passed.
- Hosted no-Docker run `34932654495` built the 20 MiB-initial, 1 MiB-growth,
  512 KiB-stack, 64 KiB-output-buffer candidate exactly; only the intended
  Theora glue and Wasm differed. Seven focused browser cases passed. Actual Wasm
  stayed at 25 MiB, and a single clean direct-save stress session passed at
  236.668 MiB. The required three-run direct-save session then measured 255.141,
  201.617, and 199.391 MiB, with byte-identical genuine 1,560-frame Ogg/Theora
  outputs and complete cleanup. The cold first run exceeded the unchanged
  250 MiB process-tree limit by 5.141 MiB, so this candidate was rejected and
  the published AVI-to-OGV engine restored to its last reproducible bytes.
  `mp4-to-ogv` remains hidden. A future approach must reduce the complete
  browser/worker peak under repeated cold and warm runs without reducing video
  width, quality, validation, or Chromium process coverage.
- The multithreaded MP4 stress generator initially produced valid sources that
  differed by one to three bytes across sessions. Pinning fixture-only x264 to
  one thread fixed it: two independent generations were byte-identical at
  147,242,147-byte MP4 (`e1142ff...`) and 147,242,171-byte MOV (`9e80f6c...`).
  Both large files were deleted after the proof; only their compact manifests
  remain. Measurements and rejected approaches are recorded in
  `evidence/mp4-to-ogv-candidate-2026-09-15.json`.
- After restoring the published Theora core, hosted no-Docker
  [run 35436591401](https://github.com/tanishqbaweja/fileconverter/actions/runs/35436591401)
  rebuilt and compared all seven published FFmpeg modules and shared files
  byte-for-byte from pushed code commit `27c48e2` in 17m34s. Hosted cleanup
  passed, the mismatch upload was skipped, and no artifact was retained. This
  proves restoration reproducibility, not MP4-to-OGV acceptance; that route
  remains hidden because its repeat cold run exceeded 250 MiB.

### 2026-09-19 — installed-browser compatibility refresh

- Re-ran the same production-build five-route matrix against installed Chrome
  153.0.8010.48, Edge 153.0.4234.32, Brave 1.95.104, and Opera GX
  135.0.5973.153. All 4/4 passed in 42.1 seconds. Each result includes exact
  TSV semantics, DOCX package/XML, ZIP entry hashes, full WebP decode and SSIM,
  exact H.264/AAC packet hashes and full MP4 decode, a selected-destination
  write through the production writer, unsafe-TAR rejection, no partial output,
  and same-origin GET-only privacy. Reads, writes, and queued bytes stayed at
  or below 256 KiB, with at most one pending operation.
- Chrome, Edge, and Brave ran headed and their completion screenshots were
  reviewed; Opera GX passed only in an isolated headless process. Brave's
  folder picker is still unavailable, although direct-file output works.
  Standard Opera 136 is not installed and is not claimed. The cross-browser
  matrix is representative functional coverage, not 405-route or process-tree
  memory certification outside Chrome. The test-only picker adapter exercised
  the real writer but did not automate the OS-native picker dialog.
- Vendor release records confirm these tested Chrome, Edge, Brave, and GX
  versions; their links, hashes, timing, privacy, limitations, and cleanup are
  in `evidence/browser-compatibility-matrix-2026-09-19.json`. The scoped
  `npm run cleanup:browser-compatibility` command removed disposable raw
  reports and screenshots after compaction, as well as every
  converted validation copy and browser profile. `test.mkv` remained exact.

### 2026-09-20 — M-08 destination metadata mapping diagnostic

- The published production-browser engine retained all seven tested common M4A
  tags in WAV, Ogg Vorbis, Ogg Opus, and WMA2, but AIFF retained only title and
  comment. FFprobe independently identified every genuine output codec and
  native FFmpeg fully decoded all five results. Artwork was explicitly excluded
  by the current public AIFF route. The focused Chrome test passed 1/1 in 13.8
  seconds; exact source/output hashes and limitations are in
  `evidence/audio-metadata-mapping-2026-09-20.json`.
- The no-Docker AIFF ID3v2/artwork candidate did compile. A small production-
  browser conversion passed seven tags, artist-to-AUTH, exact PNG artwork, and
  full native decode. On the 140,941,469-byte ALAC/M4A stress source, however,
  its three-run BYOB-input OPFS session measured 250.570, 203.484, and 203.152
  MiB: the cold run exceeded the unchanged 250 MiB limit. The candidate was
  **rejected and not published**; its native source delta was removed from the
  current build. The published core also exceeded the limit on current Chrome
  153 with its older synchronous input (280.672 MiB cold). A persistent bounded
  BYOB reader improved the published core's matched OPFS session to 241.957,
  201.543, and 219.383 MiB and reduced conversion time from 4.915–5.467 to
  4.671–4.979 seconds, but direct-save cold memory still reached 257.605 MiB.
  An asynchronous direct writer was rejected at 263.449 MiB and 11.397 seconds.
  Exact hashes, the invalid stale-bundle comparison, and cleanup gates are in
  `evidence/aiff-id3-memory-candidate-2026-09-20.json`. M-08 and current-Chrome
  direct-save memory recovery remain **partially implemented**.
- The public-evidence manifest gate rejects pending **public** profiles. After
  the retained 255.141 MiB rejection was reconciled with the registry,
  `mp4-to-ogv` is explicitly hidden/failed rather than stale-pending. The audit
  then reported 405 public passed/405 compact entries, zero pending profiles,
  zero public non-passing profiles, and zero PDF routes. This does not certify
  the hidden OGV route or close the remaining product audit. The current count
  returned to 405/405 after the bounded raw MPEG-2-to-OGV route was published
  on 2026-09-25; MKV-to-AVI remains withheld.

### 2026-09-20 — current-Chrome AIFF process and size diagnostic

- Rebuilt the unchanged production bundle and confirmed its published general
  Wasm is byte-exact. On Chrome 153.0.8010.48, the same deterministic
  140,941,469-byte ALAC/M4A produced identical genuine 153,600,102-byte AIFF
  outputs in one direct-save and one OPFS browser run. Independent full decode,
  bounded reads/writes/queues, one pending operation, fixed 32 MiB Wasm, and
  cleanup recovery passed; the strict complete-tree private-memory gate did
  **not**: direct 260.172 MiB and OPFS 251.094 MiB over clean blank Chrome.
- The largest growth was in the principal renderer, not the dedicated direct
  writer. The direct tree peak included 13.00 MiB of Chrome `updater.exe`
  descendants, yet an updater-free sample later in that same run remained
  254.88 MiB incremental. OPFS peaked without updater descendants. No process
  was excluded from the acceptance calculation.
- Added an opt-in, deterministic 400-second ALAC scaling diagnostic while
  leaving the generator's default 800-second stress fixtures unchanged. Its
  70,471,394-byte source produced a genuine 76,800,102-byte AIFF in one OPFS
  browser run at 233.027 MiB. Halving the output reduced the main renderer peak
  only from 225.99 to 218.70 MiB, suggesting predominantly fixed working
  memory rather than a complete output copy. This is diagnostic evidence, not
  three-run acceptance or a precise allocation attribution.
- Compact source/output hashes, timings, per-process values, raw-report hashes,
  and cleanup details are in
  `evidence/aiff-current-chrome-process-breakdown-2026-09-20.json`. The next
  optimization target is the main conversion renderer/engine working set; then
  repeat three-run cold/warm tests for both destinations without altering the
  limit, input, fidelity, or process-tree formula. P-06 is now marked partial
  because the historical passing ledger does not prove current-Chrome
  compliance for this public route.

### 2026-09-20 — AIFF specialist source preflight and browser acceptance

- Prepared a separate, route-scoped no-Docker `within-aiff` specialist. The generator
  requires the exact published general-wrapper SHA-256, removes the general
  entrypoint from the reachable exported call graph, and exposes only the
  existing profile-28 audio-transcode function. The candidate build starts
  Wasm at 16 MiB with a fixed 32 MiB maximum; previously published modules
  and their flags remain unchanged. Source generation is SHA-pinned.
- Hosted no-Docker run `35497157670` built the candidate; the JavaScript/Wasm
  SHA-256 values are recorded in the compact acceptance evidence. Focused
  production-browser tests passed M4A tag/fidelity, complete decoded ALAC-to-
  PCM equality, and direct injected-write-failure cleanup. The 140,941,469-byte
  source passed three direct and three OPFS Chrome 153 conversions, all to the
  same genuine 153,600,102-byte AIFF hash as the general core. The additional
  cold runs stayed below 250 MiB; worst direct was 246.648 MiB, leaving only
  3.352 MiB headroom. Cancellation after 6.55/15.70 MB of actual output in
  direct/OPFS left no partial file or queued/pending operation. No isolated
  direct-save speed improvement is claimed. The compact evidence is
  `evidence/aiff-specialist-browser-acceptance-2026-09-20.json`.
- Pushed commit `51e6074` passed scoped no-Docker exact reproduction in run
  `35563828254` (7m50s) and aggregate exact reproduction of all eight FFmpeg
  modules in run `35564331436` (18m44s). Both skipped mismatch upload, passed
  repository-local cleanup, and retain zero Actions artifacts. The generated
  input, converted copies, raw reports, downloaded candidate, Playwright helper,
  browser profiles, and obsolete candidate artifact were deleted; `work/`
  contains only `.gitkeep`. The build-provenance gate for this publication is
  closed.

### 2026-09-21 — MP4-to-AVI current-Chrome optimization

- Re-ran the maximum advertised 191,718,445-byte MP4 on Chrome 153. The
  unchanged generic direct writer produced the exact historical AVI but took
  46.205–46.405 seconds and failed at 300.184 MiB. A one-worker asynchronous
  direct candidate still took 46.741 seconds and failed at 293.184 MiB.
- Accepted route-scoped synchronous private staging plus one reusable 256 KiB
  final-copy buffer. Three final direct runs completed in 3.976–4.268 seconds
  at 246.566 MiB worst complete-Chromium incremental private memory. This is an
  11.10x median speedup and a 53.617 MiB reduction from the unchanged direct
  baseline, with the same 198,392,670-byte SHA-256 output.
- Exact MPEG-4 and MP3 packets, full native decode, 24 indexed OpenDML
  segments, midpoint seek, repeatability, one pending operation, fixed 32 MiB
  Wasm, cleanup recovery, injected final-copy failure, and cancellation after
  22,544,384 copied bytes passed. A forced worker crash also removed staging
  and the partial directory output before restart. The intermediate browser File.stream copy
  was rejected after one strict rerun reached 250.211 MiB.
- Selective generation produced only the MP4 fixture in 3.49 seconds. Compact
  evidence and every failed approach are in
  `evidence/mp4-to-avi-current-chrome-optimization-2026-09-21.json`; generated
  fixtures, converted outputs, browser profiles, task temp, and raw reports
  were deleted after compaction. No Docker command was used.

### 2026-09-22 — MKV-to-MP4 current-Chrome optimization accepted

- Chrome 153 invalidated the historical narrow direct-save margin. The unchanged
  two-worker route produced the exact 2,962,151,538-byte MP4 in 26.148 seconds
  but reached 281.086 MiB complete-Chromium incremental private memory.
- Five bounded alternatives were measured on the protected 2,958,573,265-byte
  `test.mkv`. General-core synchronous OPFS reached 255.715 MiB; 128 MiB-rotation
  staging reached 255.309 MiB in 63.175 seconds; 32 MiB and 16 MiB staging
  rotations reached 250.023 and 265.340 MiB and were rejected as non-repeatable.
  One-worker asynchronous direct save was fastest at 20.776 seconds and retained
  the exact output SHA-256, but the existing broad specialist still reached
  271.063 MiB.
- The first non-Docker route specialist was only 1,278,724 bytes and passed the
  small browser fixtures, but the protected HEVC/AAC source rejected it after
  353,857 input bytes: removing all decoders prevented Matroska inspection from
  deriving reordered HEVC timestamps and AAC frame size. The 3,916-byte partial
  output was not accepted. The next build keeps the faster direct architecture
  and exact Matroska/MP4/parser/bitstream-filter surface while adding only the
  AAC, H.264, and HEVC inspection decoders. That corrected correctness and
  cancellation but reached 266.730 MiB because decoder probing grew Wasm to
  42.25 MiB, so it was also rejected.
- The accepted 1,197,888-byte core remains decoder-free, skips decoder-oriented
  stream analysis, reconstructs monotonic H.264/HEVC DTS from Matroska timing,
  supplies AAC frame size for MP4, and starts its Wasm heap at 24 MiB. Direct
  asynchronous output was still rejected at 266.344 MiB, so the route now muxes
  into quota-preflighted browser-private storage and copies to the selected
  destination through one reusable 512 KiB buffer with one pending write.
- The protected source passed three repeatable runs in 39.302–48.801 seconds at
  207.094 MiB worst complete-Chromium incremental private memory. A separate
  strict run completed in 25.579 seconds at 238.023 MiB and proved exact source
  and output compressed packet hashes for all 296,160 HEVC and 289,221 AAC
  packets. The valid output is 2,962,151,522 bytes with SHA-256
  `aff831693c020c02a0163e25d0f08a7529d0fb0e4022f0cb984c60d90348334a`.
  Final-copy cancellation, forced-write cleanup, repeatability, one pending
  operation, and staging deletion passed.
- A 1 MiB final-copy buffer was faster in one screen but rejected at 257.121 MiB.
  A 768 KiB buffer passed memory but was slower than 512 KiB. The original 256
  KiB copy passed memory but took 69.501 seconds. Compact measurements and every
  rejected approach are in
  `evidence/mkv-to-mp4-current-chrome-optimization-2026-09-21.json`; raw reports,
  browser profiles, downloaded candidates, and converted outputs are deleted
  after compaction. No Docker command was used.
- Pushed commit `c3a525a` passed the exact no-Docker `within-direct` rebuild in
  [run 35809382089](https://github.com/tanishqbaweja/fileconverter/actions/runs/35809382089)
  in 9m40s. It skipped mismatch upload, completed hosted build cleanup, and
  retained zero artifacts.
