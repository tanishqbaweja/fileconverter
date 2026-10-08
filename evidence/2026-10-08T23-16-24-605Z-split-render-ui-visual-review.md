# Private split-render UI: actual headless screenshot review

Reviewed 2026-10-09 IST. All six actual 1280x900 screenshots referenced by
`2026-10-08T23-16-24-605Z-split-render-ui-goldens.json` were opened and reviewed.
Their byte sizes and SHA-256 hashes were independently checked against the receipt.
The receipt and independent validation retain `visualReviewPending: true` as their
historical state before this review; this follow-up does not rewrite executed proof.

1. Saved MPEG-4-source conversion: readable progress, selected storage and retry control.
2. Saved HEVC-source OPFS conversion: readable progress and source-stream disclosure.
3. Saved HEVC-source direct-adapter conversion: bounded staging disclosure and retry visible.
4. Actual output-write failure: readable write rejection and restart control; no overlap.
5. Actual running encode: real progress and accessible cancellation control, no overlap.
6. Actual cancellation: stopped state, inapplicable ETA and restart control, no overlap.

Measured geometry is identical to the prior same-mode baseline in all six states
(maximum delta 0 CSS pixels); no horizontal overflow. The viewport screenshots
are scrolled observations, not complete-page screenshots or new headed/manual tests.

IMPORTANT: inherited private-adapter labels still describe the public MPEG-4/remux
route and old 2.8/10 GiB certification, although this private test substitutes the
MPEG-2 specialist. Those labels are NOT suitable for public promotion and do not
certify this candidate, the full original, large-file scaling, speed or memory.
This experiment deliberately leaves public source/registry and codec/defaults
unchanged. Native-memory cause, the 250 MiB full-original failure, late decoder OOM,
repeat stress and scaling remain unresolved.
