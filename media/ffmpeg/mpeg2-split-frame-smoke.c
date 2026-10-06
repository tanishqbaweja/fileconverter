// Synthetic AVFrame ownership/transport fixture, NEVER a media converter.
#include <emscripten.h>
#include <emscripten/heap.h>
#include "mpeg2-split-frame-layout.h"

static AVFrame *synthetic_frame;
static WithinSplitFrameLayout synthetic_layout;

EMSCRIPTEN_KEEPALIVE
int within_split_smoke_create(int width, int height, int pixel_kind, int negative, int seed)
{
    if (synthetic_frame || width < 2 || width > 4096 || (width & 1) ||
        height < 2 || height > 2160 || (height & 1) ||
        pixel_kind < 0 || pixel_kind > 1 || negative < 0 || negative > 1 || seed < 0 || seed > 255)
        return AVERROR(EINVAL);
    synthetic_frame = av_frame_alloc();
    if (!synthetic_frame) return AVERROR(ENOMEM);
    synthetic_frame->width = width; synthetic_frame->height = height;
    synthetic_frame->format = pixel_kind ? AV_PIX_FMT_YUV422P : AV_PIX_FMT_YUV420P;
    int result = av_frame_get_buffer(synthetic_frame, 32);
    if (result < 0) { av_frame_free(&synthetic_frame); return result; }
    for (unsigned i = 0; i < 3; i++) {
        const int rows = !i || pixel_kind ? height : height / 2;
        if (negative) {
            synthetic_frame->data[i] += (rows - 1) * synthetic_frame->linesize[i];
            synthetic_frame->linesize[i] = -synthetic_frame->linesize[i];
        }
        for (int row = 0; row < rows; row++)
            for (int x = 0; x < (i ? width / 2 : width); x++)
                synthetic_frame->data[i][row * synthetic_frame->linesize[i] + x] = (row * 13 + x * 7 + i * 31 + seed) & 255;
    }
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int within_split_smoke_describe(void)
{
    int result = within_split_describe_frame(synthetic_frame, &synthetic_layout, emscripten_get_heap_size());
    return result < 0 ? result : (int)(uintptr_t)&synthetic_layout;
}

EMSCRIPTEN_KEEPALIVE
int within_split_smoke_references(void)
{
    return synthetic_frame && synthetic_frame->buf[0] ? av_buffer_get_ref_count(synthetic_frame->buf[0]) : 0;
}

EMSCRIPTEN_KEEPALIVE
int within_split_smoke_destroy(void)
{
    av_frame_free(&synthetic_frame);
    return synthetic_frame == NULL;
}
