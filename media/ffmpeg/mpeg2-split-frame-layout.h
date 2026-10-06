#ifndef WITHIN_MPEG2_SPLIT_FRAME_LAYOUT_H
#define WITHIN_MPEG2_SPLIT_FRAME_LAYOUT_H

// Private pixel-layout ABI only, not frame-property or conversion acceptance.
// The owner must retain this AVFrame until the awaited handoff finishes, keep
// HEVC DPB/live refs intact, and independently carry all properties/side data.
#include <errno.h>
#include <stdint.h>
#include <libavutil/error.h>
#include <libavutil/frame.h>
#include <libavutil/pixfmt.h>

typedef struct WithinSplitPlaneLayout {
    uint32_t offset;
    int32_t stride;
    uint32_t allocation_offset;
    uint32_t allocation_bytes;
} WithinSplitPlaneLayout;

typedef struct WithinSplitFrameLayout {
    uint32_t abi_version, width, height, pixel_kind;
    WithinSplitPlaneLayout planes[3];
} WithinSplitFrameLayout;

_Static_assert(sizeof(WithinSplitPlaneLayout) == 16, "Exact scalar plane ABI");
_Static_assert(sizeof(WithinSplitFrameLayout) == 64, "Exact scalar frame ABI");
_Static_assert(sizeof(uintptr_t) == 4, "This private bridge uses wasm32 offsets");

static inline int within_split_describe_frame(const AVFrame *frame,
                                             WithinSplitFrameLayout *output,
                                             size_t heap_bytes)
{
    if (!frame || !output || (heap_bytes != 33554432 && heap_bytes != 16777216) ||
        (uint64_t)(uintptr_t)output + sizeof(*output) > heap_bytes)
        return AVERROR(EINVAL);
    if (frame->width < 2 || frame->width > 4096 || (frame->width & 1) ||
        frame->height < 2 || frame->height > 2160 || (frame->height & 1) ||
        frame->nb_samples || !frame->extended_data)
        return AVERROR(EINVAL);
    if (frame->hw_frames_ctx || frame->crop_top || frame->crop_bottom ||
        frame->crop_left || frame->crop_right ||
        (frame->format != AV_PIX_FMT_YUV420P && frame->format != AV_PIX_FMT_YUV422P))
        return AVERROR(ENOSYS);
    WithinSplitFrameLayout next = { .abi_version = 1,
        .width = frame->width, .height = frame->height,
        .pixel_kind = frame->format == AV_PIX_FMT_YUV420P ? 0 : 1 };
    int64_t starts[3], ends[3];
    for (unsigned i = 0; i < 3; i++) {
        // Pinned FFmpeg getter returns the existing AVBufferRef; it does not
        // allocate, add/drop a reference, rewrite the frame or touch pixels.
        const AVBufferRef *buffer = av_frame_get_plane_buffer(frame, i);
        const int64_t row_bytes = i ? frame->width / 2 : frame->width;
        const int64_t rows = !i || next.pixel_kind ? frame->height : frame->height / 2;
        const int64_t offset = (uintptr_t)frame->data[i];
        const int64_t stride = frame->linesize[i];
        if (!buffer || !buffer->data || !buffer->size ||
            frame->data[i] != frame->extended_data[i] ||
            (uint64_t)(uintptr_t)buffer->data + buffer->size > heap_bytes ||
            stride < -(int64_t)heap_bytes || stride > (int64_t)heap_bytes ||
            (stride < 0 ? -stride : stride) < row_bytes)
            return AVERROR(EINVAL);
        const int64_t last = offset + (rows - 1) * stride;
        const int64_t first = offset < last ? offset : last;
        const int64_t end = (offset > last ? offset : last) + row_bytes;
        if (first < (int64_t)(uintptr_t)buffer->data ||
            end > (int64_t)(uintptr_t)buffer->data + buffer->size)
            return AVERROR(EINVAL);
        for (unsigned j = 0; j < i; j++)
            if (first < ends[j] && starts[j] < end)
                return AVERROR(EINVAL);
        starts[i] = first; ends[i] = end;
        next.planes[i] = (WithinSplitPlaneLayout){ .offset = offset, .stride = stride,
            .allocation_offset = (uintptr_t)buffer->data, .allocation_bytes = buffer->size };
    }
    // Do not partially overwrite the descriptor on any validation failure.
    // Output is an owner-provided 64-byte slot, never an AVFrame or pixel slot.
    *output = next;
    return 0;
}
#endif
