/* Compiled selector unit, not a decoder, encoder or media conversion.
 * Same-allocator libavutil lifecycle proof is a separate mandatory gate. */
#include <assert.h>
#include <stdio.h>
#include "mpeg2-hevc-auxiliary-policy.h"

int main(void)
{
    const enum AVCodecID codecs[] = { AV_CODEC_ID_NONE, AV_CODEC_ID_HEVC,
        AV_CODEC_ID_H264, AV_CODEC_ID_MPEG4, AV_CODEC_ID_MPEG2VIDEO, AV_CODEC_ID_VP9 };
    const int threads[] = { -1, 0, 1, 2, 16 };
    unsigned checked = 0;
    for (unsigned i = 0; i < sizeof(codecs) / sizeof(codecs[0]); i++)
        for (unsigned j = 0; j < sizeof(threads) / sizeof(threads[0]); j++)
            for (int encoder = 0; encoder <= 1; encoder++) {
                unsigned expected = codecs[i] == AV_CODEC_ID_HEVC && threads[j] == 1 && !encoder
                    ? (1u << 30) : 0;
                assert(within_hevc_auxiliary_pool_flags(codecs[i], threads[j], encoder) == expected);
                checked++;
            }
    assert(checked == 60);
    puts("{\"status\":\"passed\",\"scope\":\"synthetic-hevc-selector-unit-not-conversion\","
         "\"checkedConfigurations\":60,\"privateBit\":1073741824,"
         "\"singleThreadDecoderOnly\":true,\"otherCodecAndThreadDefaultsPreserved\":true}");
    return 0;
}
