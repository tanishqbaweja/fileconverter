# Dependency and hosting review — October 21, 2026

Release blocker B08 remains open. This review does not certify native Wasm
dependencies, current-browser memory, or all deployed dependency reachability.

Latest corrected hosted run39522350948 at ec9fb51 SUCCESS: fresh npm-ci, full
lint/TS/build,1367unit passes/0fail/1existing original-fixture skip and all19
privacy/offline/actual production-host checks38.2s. Short owned Linux TMPDIR
works; all current privacy assertions execute. Windows local browser coverage
remains unverified after the interrupted attempt. Exact source pins, earlier
failures, cleanup and boundaries:
`evidence/2026-10-21-framework-security-hosted-cycle.json`. The five separate
conversion suites/native rebuilds were not selected or implied passed.

## Verified changes

The pinned npm graph originally reported32 vulnerable package groups:
1critical,24high,6moderate,1low. Targeted exact updates, not `npm audit fix`:

| Package | Before | After | Reason |
| --- | --- | --- | --- |
| next | 16.2.12 | 16.4.2 | Outside reported affected ranges, including critical server/image findings. |
| react | 19.2.6 | 19.2.8 | Match patched RSC peer requirements. |
| react-dom | 19.2.6 | 19.2.8 | Match patched RSC peer requirements. |
| react-server-dom-webpack | 19.2.6 | 19.2.8 | Patched server-function denial of service. |

Maintainer advisories inspected:
[Windows-hosted Next servers](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36),
[Next ImageResponse](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j),
[React server functions](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g).
Registry metadata and matching React/Vinext peer ranges were checked before the
change. The main framework/bundler was not replaced. The lock also advances
Next's SWC/env/helpers and compatible PostCSS/nanoid dependencies, introduces
Next's patched optional Sharp subtree, and removes its old nested PostCSS.
Existing vulnerable build-tool Sharp remains separately reported; do not equate
one patched nested copy with a clean graph.

Fresh audit reports28 package groups:0critical,21high,6moderate,1low. The four
groups no longer reported are Next, RSC, PostCSS and nanoid. This is package-
advisory removal evidence, not proof that an exploit was reachable before, that
the deployed application was compromised, or that the remaining findings are safe.

## Hosting surface

The worker previously exposed an unused `/_vinext/image` transformation using a
server image binding. That branch/import/binding is removed. The hosting worker
now rejects non-GET/HEAD requests405 without consuming request bodies and rejects
both framework image optimizer endpoints404, including encoded aliases/trailing
slashes. Refusals retain security/isolation headers; ordinary app/asset/HEAD
reads still dispatch. This is application hosting only, never a server fallback
for conversion. The UI uses browser workers/engines, not these endpoints.

Five focused policy/source tests and three unchanged historical receipt tests
pass. Live production-worker refusals and the full privacy/offline suite are
required in fresh hosted CI; mocked-handler units alone do not establish them.

## Remaining advisory triage

All28 exact remaining package groups, versions/paths, advisory IDs, affected
ranges and npm suggestions are retained in the post-update JSON below. Do not
apply npm's suggested major **downgrades** of Drizzle/ESLint as an automatic fix.

| Investigation group | Still-reported packages | Required follow-up |
| --- | --- | --- |
| Hosting/build/RSC tooling | @cloudflare/vite-plugin, miniflare, wrangler, undici, ws, sharp | Audit actual server/development imports and bundled exposure; choose compatible patched tooling and run production/headless privacy tests. Dev dependency labels are not proof of non-exposure. |
| Framework build/image imports | vinext, image-size, vite-plugin-commonjs, vite-plugin-dynamic-import, fflate | Source scan finds no direct first-party conversion imports of image-size/Sharp/fflate; this is NOT a bundled reachability proof. Trace the framework import graph, patch or remove unnecessary paths safely. |
| Vite/Babel/CSS compatibility tooling | vite, @babel/core, baseline-browser-mapping, browserslist, source-map-js | Fix compatible pinned versions; distinguish local development endpoints/source maps from converted file handling. Never expose development servers publicly. |
| Lint/path/glob parsing | eslint-config-next, @next/eslint-plugin-next, fast-glob, micromatch, braces, brace-expansion, fast-uri, js-yaml | Verify actual consumers, fixed releases and compatibility. Do not declare them harmless solely because lint runs during build. |
| Database CLI scaffold | drizzle-kit, @esbuild-kit/esm-loader, @esbuild-kit/core-utils, esbuild | Determine whether database scaffold is needed before removal or compatible migration; do not blindly downgrade to npm's proposed old major. |

## Execution failures and evidence limits

The lock-only update succeeded. Applying installed dependencies later failed on
Windows with npm `UNKNOWN/-4094` opening package-lock.json during its save phase.
The four actual installed framework versions were independently checked and
`npm ls --all --json` exits0 with no missing/invalid root dependency; four old
optional emnapi/wasm-util entries are labelled extraneous. A fresh clean Linux
`npm ci` in CI is required before accepting installation reproducibility. No
permission changes, lock deletion, automatic audit fix or forced peer override.

The first local browser command incorrectly continued after its external2GiB
preflight failed (~1.02GiB free physical RAM). The exact owned launcher birth
was checked before stopping its tree. That interrupted run is NOT accepted
coverage, even though individual tests had progressed. Disposable profile,
runtime and npm cache were identity/path/birth checked and removed; no unrelated
application was closed. Windows host safety now executes inside privacy-suite
setup, before profile/Chromium creation; fresh owned scratch replaces sweeping
a fixed old profile. Hosted validation does not require freeing laptop RAM.

The broad local unit run was1366pass/1fail/0skip. Its failure was an Oct6 historical
receipt comparing its old privacy-suite hash to today's intentionally refactored
suite. The exact old58962-byte source/hash is now archived for that explicitly
historical test only; its receipt pins/assertions remain unchanged. Focused8pass
after this correction. Live acceptance always runs today's suite, never archived
source. Final full-suite/current hosted results remain separately required.

Hosted39521876873 at4c23e4e passes clean npm-ci, lint/TS/build and all1368unit
cases (1367pass/0fail/1original-fixture skip). Its actual production-host endpoint
check passes. Privacy setup FAILS before browsing: Chromium's Unix singleton
socket exceeds Linux's108-byte limit under the long owned TMPDIR;17other privacy
tests do not run. The owned prefix is shortened to `po-` and an explicit Linux
socket-path check added. No outside-repository fallback, assertion removal or
browser flag change. A new hosted run is required for this specific correction.

Evidence:

- `evidence/2026-10-21-dependency-audit-baseline.json`
- `evidence/2026-10-21-dependency-audit-after-framework.json`
- `outputs/reports/2026-10-21-framework-security-units.json` (failed pre-correction run)
- `fixtures/source/pre-safety-privacy-suite-2026-10-21.json` (historical source only)

Prior code df2be32 passed hosted CI39520477124: clean install/lint/TS/build,
1362pass/0fail/1original-fixture skip and18privacy/offline tests34.5s. It does
NOT validate these later dependency/worker changes. No changed conversion engine,
codec settings, public route, memory threshold or full-project acceptance here.
