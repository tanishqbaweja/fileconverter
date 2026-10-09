;; PRIVATE transport candidate, not a codec or conversion acceptance.
;; Import the TWO EXISTING fixed codec heaps. No memory, data, table, growth,
;; allocator, queue, frame storage, or third pixel buffer is defined here.
;; Caller validates ALL three native allocation spans before the first write.
;; Multi-memory memory.copy is destination/source indexed:
;; https://github.com/WebAssembly/multi-memory/blob/main/proposals/multi-memory/Overview.md
(module
  (import "heaps" "decoder" (memory $decoder 512 512 shared))
  (import "heaps" "encoder" (memory $encoder 256 256 shared))
  (func (export "copy_rows")
    (param $target i32) (param $source i32) (param $row_bytes i32)
    (param $rows i32) (param $target_stride i32) (param $source_stride i32)
    (result i32)
    (local $row i32)
    (block $done
      (loop $next
        (br_if $done (i32.ge_u (local.get $row) (local.get $rows)))
        (memory.copy $encoder $decoder
          (local.get $target) (local.get $source) (local.get $row_bytes))
        (local.set $target (i32.add (local.get $target) (local.get $target_stride)))
        (local.set $source (i32.add (local.get $source) (local.get $source_stride)))
        (local.set $row (i32.add (local.get $row) (i32.const 1)))
        (br $next)))
    (i32.mul (local.get $row_bytes) (local.get $rows))))
