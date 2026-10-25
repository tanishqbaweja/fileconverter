/* Real installed libavutil API probe, never a native media converter. */
#include <assert.h>
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <libavformat/avformat.h>
#include <libavutil/error.h>
#include "../../media/ffmpeg/audio-text-metadata.h"
#include "../../media/ffmpeg/audio-ogg-artwork.h"

static void verify(const AVDictionary *dictionary, const uint8_t *image, int size,
                   unsigned int type, const char *description, int width, int height) {
  const AVDictionaryEntry *entry = av_dict_get(dictionary, "METADATA_BLOCK_PICTURE", NULL, 0);
  assert(entry); const size_t capacity = strlen(entry->value);
  uint8_t *decoded = malloc(capacity); assert(decoded);
  int bytes = av_base64_decode(decoded, entry->value, (int)capacity); assert(bytes > size);
  const uint8_t *at = decoded; assert(AV_RB32(at) == type); at += 4;
  const unsigned int mime_bytes = AV_RB32(at); at += 4;
  assert((mime_bytes == 9 && !memcmp(at, "image/png", 9)) ||
         (mime_bytes == 10 && !memcmp(at, "image/jpeg", 10))); at += mime_bytes;
  assert(AV_RB32(at) == strlen(description)); at += 4;
  assert(!memcmp(at, description, strlen(description))); at += strlen(description);
  assert(AV_RB32(at) == (unsigned)width); at += 4;
  assert(AV_RB32(at) == (unsigned)height); at += 4;
  assert(AV_RB32(at) == 0); at += 4; assert(AV_RB32(at) == 0); at += 4;
  assert(AV_RB32(at) == (unsigned)size); at += 4;
  assert(at + size == decoded + bytes); assert(!memcmp(at, image, size)); free(decoded);
}

int main(void) {
  uint8_t image[128]; memset(image, 0xa5, sizeof(image));
  AVCodecParameters codec = {0}; codec.codec_id = AV_CODEC_ID_PNG;
  AVStream cover = {0}; cover.codecpar = &codec;
  cover.attached_pic.data = image; cover.attached_pic.size = sizeof(image);
  assert(av_dict_set(&cover.metadata, "comment", "Cover (back)", 0) == 0);
  assert(av_dict_set(&cover.metadata, "title", "Arrière café — 音楽", 0) == 0);
  AVDictionary *metadata = NULL;
  assert(av_dict_set(&metadata, "CUSTOM_REPEAT", "first", AV_DICT_MULTIKEY) == 0);
  assert(av_dict_set(&metadata, "CUSTOM_REPEAT", "second", AV_DICT_MULTIKEY) == 0);
  AVDictionary *original = metadata;
  av_max_alloc(1); assert(add_bounded_ogg_audio_artwork(&metadata, &cover, 64, 64) == AVERROR(ENOMEM));
  av_max_alloc(SIZE_MAX); assert(metadata == original);
  /* Clone succeeds but binary block / base64 buffer fail independently. */
  const size_t allocation_limits[] = {140, 32 + 9 + strlen("Arrière café — 音楽") + sizeof(image) + 1};
  for (unsigned int index = 0; index < 2; index++) {
    av_max_alloc(allocation_limits[index]); assert(add_bounded_ogg_audio_artwork(&metadata, &cover, 64, 64) == AVERROR(ENOMEM));
    av_max_alloc(SIZE_MAX); assert(metadata == original);
  }
  assert(add_bounded_ogg_audio_artwork(&metadata, &cover, 64, 64) == 0);
  verify(metadata, image, sizeof(image), 4, "Arrière café — 音楽", 64, 64);
  const AVDictionaryEntry *first = av_dict_get(metadata, "CUSTOM_REPEAT", NULL, 0);
  const AVDictionaryEntry *second = av_dict_get(metadata, "CUSTOM_REPEAT", first, 0);
  assert(first && second && !strcmp(first->value, "first") && !strcmp(second->value, "second"));
  original = metadata;
  assert(add_bounded_ogg_audio_artwork(&metadata, &cover, 64, 64) == AVERROR_INVALIDDATA);
  assert(metadata == original); av_dict_free(&metadata);
  codec.codec_id = AV_CODEC_ID_MJPEG;
  assert(av_dict_set(&cover.metadata, "comment", "Cover (front)", 0) == 0);
  assert(add_bounded_ogg_audio_artwork(&metadata, &cover, 64, 64) == 0);
  verify(metadata, image, sizeof(image), 3, "Arrière café — 音楽", 64, 64); av_dict_free(&metadata);
  for (int dimension = 0; dimension < 2; dimension++)
    assert(add_bounded_ogg_audio_artwork(&metadata, &cover, dimension ? 64 : 4097, dimension ? 0 : 64) == AVERROR(EINVAL));
  codec.codec_id = AV_CODEC_ID_GIF; assert(add_bounded_ogg_audio_artwork(&metadata, &cover, 64, 64) == AVERROR(EINVAL));
  codec.codec_id = AV_CODEC_ID_PNG;
  cover.attached_pic.size = 4 * 1024 * 1024 + 1;
  assert(add_bounded_ogg_audio_artwork(&metadata, &cover, 64, 64) == AVERROR(EINVAL));
  cover.attached_pic.size = sizeof(image);
  assert(av_dict_set(&cover.metadata, "comment", "unknown custom role", 0) == 0);
  assert(add_bounded_ogg_audio_artwork(&metadata, &cover, 64, 64) == AVERROR_INVALIDDATA);
  assert(av_dict_set(&cover.metadata, "comment", "Cover (front)", 0) == 0);
  assert(av_dict_set(&cover.metadata, "comment", "32x32 pixels 'file icon'", 0) == 0);
  assert(add_bounded_ogg_audio_artwork(&metadata, &cover, 64, 64) == AVERROR_INVALIDDATA);
  assert(av_dict_set(&cover.metadata, "comment", "Cover (front)", 0) == 0);
  char oversized[4097]; memset(oversized, 'x', 4096); oversized[4096] = 0;
  assert(av_dict_set(&cover.metadata, "title", oversized, 0) == 0);
  assert(add_bounded_ogg_audio_artwork(&metadata, &cover, 64, 64) == AVERROR(ENOSPC));
  assert(av_dict_set(&cover.metadata, "title", NULL, 0) == 0);
  for (int n = 0; n < 4096; n++) assert(av_dict_set(&metadata, "same", "x", AV_DICT_MULTIKEY) == 0);
  original = metadata; assert(add_bounded_ogg_audio_artwork(&metadata, &cover, 64, 64) == AVERROR(ENOSPC)); assert(metadata == original);
  av_dict_free(&metadata);
  /* Exact image/dimension limits succeed with real allocations, not a sparse or
   * converted media file. Oversized image bytes are refused before any read. */
  uint8_t *maximum_image = malloc(4 * 1024 * 1024); assert(maximum_image);
  memset(maximum_image, 0x5a, 4 * 1024 * 1024);
  cover.attached_pic.data = maximum_image; cover.attached_pic.size = 4 * 1024 * 1024;
  assert(add_bounded_ogg_audio_artwork(&metadata, &cover, 4096, 4096) == 0);
  verify(metadata, maximum_image, 4 * 1024 * 1024, 3, "", 4096, 4096);
  av_dict_free(&metadata); av_dict_free(&cover.metadata); free(maximum_image);
  printf("{\"status\":\"passed-native-Ogg-picture-serialization\",\"exactImageBytes\":true,\"roleAndUnicodeDescription\":true,\"orderedTextDuplicates\":true,\"atomicAllocatorFailures\":true,\"imageAndDimensionAndEntryBounds\":true,\"exactMaximumImageBytes\":4194304,\"browserConversionVerified\":false}\n");
  return 0;
}
