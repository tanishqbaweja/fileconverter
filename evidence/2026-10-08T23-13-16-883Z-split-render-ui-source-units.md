# Follow-up: source size is not allocated memory

The executed builder's frozen `baselineLargestBuiltFunctions` and
`candidateLargestBuiltFunctions` records label AST-offset differences `bytes`.
Those differences are UTF-16 source units, not UTF-8 bytes. Preserve original
receipts/executed-source hashes rather than rewriting historical evidence.

Independent recalculation from the exact normal production client and retained
candidate client gzip gives:

| Quantity | Original | Private candidate |
| --- | ---: | ---: |
| Largest compiled function, UTF-16 source units | 39,778 | 15,917 |
| Same function, UTF-8 source bytes | 39,792 | 15,920 |
| Entire client bundle, actual UTF-8 bytes | 315,630 | 318,956 |

`tests/split-render-ui-build-evidence.test.mjs` checks both measures from actual
hash-bound assets. Source recipe function-length fields also use UTF-16 units.
Neither source-length measure proves compiled-code allocation, live heap, OS
private memory, native allocation cause, conversion speed or public acceptance.
The slightly larger total bundle is not a download-size improvement.
