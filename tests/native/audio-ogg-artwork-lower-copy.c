/* Matched serializer-only probe. No native media conversion or encoded audio. */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <windows.h>
#include <libavformat/avformat.h>
#include <libavutil/error.h>
#include <libavutil/mem.h>
#include "../../media/ffmpeg/audio-text-metadata.h"

static size_t requested_bytes, allocation_calls;
static void *observed_malloc(size_t size) {
  requested_bytes += size; allocation_calls++;
  return av_malloc(size);
}
#define av_malloc observed_malloc
#define add_bounded_ogg_audio_artwork baseline_artwork
#include "../../media/ffmpeg/audio-ogg-artwork.h"
#undef add_bounded_ogg_audio_artwork
#undef WITHIN_AUDIO_OGG_ARTWORK_H
#define add_bounded_ogg_audio_artwork lower_copy_artwork
#include WITHIN_LOWER_COPY_HEADER
#undef add_bounded_ogg_audio_artwork
#undef av_malloc

typedef int (*Serializer)(AVDictionary **, const AVStream *, int, int);
static volatile size_t consumed_bytes;
static void seed(AVDictionary **metadata) {
  assert(av_dict_set(metadata, "CUSTOM_REPEAT", "Premier 音楽", AV_DICT_MULTIKEY) == 0);
  assert(av_dict_set(metadata, "CUSTOM_REPEAT", "Deuxième café", AV_DICT_MULTIKEY) == 0);
}
static void compare(const AVStream *cover, int width, int height) {
  AVDictionary *a = NULL, *b = NULL; seed(&a); seed(&b);
  assert(baseline_artwork(&a, cover, width, height) == 0);
  assert(lower_copy_artwork(&b, cover, width, height) == 0);
  const AVDictionaryEntry *x = NULL, *y = NULL;
  while ((x = av_dict_get(a, "", x, AV_DICT_IGNORE_SUFFIX))) {
    y = av_dict_get(b, "", y, AV_DICT_IGNORE_SUFFIX);
    assert(y && !strcmp(x->key, y->key) && !strcmp(x->value, y->value));
  }
  assert(!av_dict_get(b, "", y, AV_DICT_IGNORE_SUFFIX));
  const AVDictionaryEntry *picture = av_dict_get(b, "METADATA_BLOCK_PICTURE", NULL, 0);
  const int capacity = (int)strlen(picture->value);
  uint8_t *decoded = malloc((size_t)capacity); assert(decoded);
  const int bytes = av_base64_decode(decoded, picture->value, capacity);
  const unsigned int mime = AV_RB32(decoded + 4);
  const unsigned int description = AV_RB32(decoded + 8 + mime);
  const size_t header = 32 + mime + description;
  assert(bytes == (int)(header + cover->attached_pic.size));
  assert(AV_RB32(decoded + header - 4) == (unsigned)cover->attached_pic.size);
  assert(!memcmp(decoded + header, cover->attached_pic.data, (size_t)cover->attached_pic.size));
  free(decoded); av_dict_free(&a); av_dict_free(&b);
}
static double milliseconds(Serializer serializer, const AVStream *cover, unsigned int iterations) {
  LARGE_INTEGER start, finish, frequency; assert(QueryPerformanceFrequency(&frequency));
  assert(QueryPerformanceCounter(&start));
  for (unsigned int index = 0; index < iterations; index++) {
    AVDictionary *metadata = NULL; seed(&metadata);
    assert(serializer(&metadata, cover, 1023, 1023) == 0);
    const AVDictionaryEntry *entry = av_dict_get(metadata, "METADATA_BLOCK_PICTURE", NULL, 0);
    assert(entry); consumed_bytes += (unsigned char)entry->value[16];
    av_dict_free(&metadata);
  }
  assert(QueryPerformanceCounter(&finish));
  return (double)(finish.QuadPart - start.QuadPart) * 1000.0 / (double)frequency.QuadPart;
}
int main(void) {
  const size_t maximum = 4 * 1024 * 1024;
  uint8_t *image = malloc(maximum); assert(image);
  uint32_t random = 0x6d2b79f5;
  for (size_t index = 0; index < maximum; index++) {
    random ^= random << 13; random ^= random >> 17; random ^= random << 5;
    image[index] = (uint8_t)random;
  }
  AVCodecParameters codec = {0}; codec.codec_id = AV_CODEC_ID_PNG;
  AVStream cover = {0}; cover.codecpar = &codec; cover.attached_pic.data = image;
  unsigned int compared = 0;
  for (unsigned int format = 0; format < 2; format++) {
    codec.codec_id = format ? AV_CODEC_ID_MJPEG : AV_CODEC_ID_PNG;
    for (unsigned int length = 0; length <= 8; length++) {
      char description[10]; memset(description, 'a', length); description[length] = 0;
      assert(av_dict_set(&cover.metadata, "title", description, 0) == 0);
      for (int size = 1; size <= 12; size++) { cover.attached_pic.size = size; compare(&cover, 64, 64); compared++; }
    }
  }
  codec.codec_id = AV_CODEC_ID_PNG; cover.attached_pic.size = (int)maximum;
  assert(av_dict_set(&cover.metadata, "title", "Couverture maximale café — 音楽", 0) == 0);
  for (unsigned int role = 0; role < 2; role++) {
    assert(av_dict_set(&cover.metadata, "comment", role ? "Cover (back)" : "Cover (front)", 0) == 0);
    compare(&cover, 1023, 1023); compared++;
  }
  char longest[4096]; memset(longest, 'z', 4095); longest[4095] = 0;
  assert(av_dict_set(&cover.metadata, "title", longest, 0) == 0);
  compare(&cover, 4096, 4096); compared++;
  codec.codec_id = AV_CODEC_ID_MJPEG;
  compare(&cover, 4096, 4096); compared++; /* Full 4137-byte header. */
  codec.codec_id = AV_CODEC_ID_PNG;
  for (unsigned int candidate = 0; candidate < 2; candidate++) {
    Serializer serializer = candidate ? lower_copy_artwork : baseline_artwork;
    AVDictionary *metadata = NULL; seed(&metadata); AVDictionary *original = metadata;
    const size_t limits[] = {1, 128, 8192};
    for (unsigned int index = 0; index < sizeof(limits) / sizeof(limits[0]); index++) {
      av_max_alloc(limits[index]); assert(serializer(&metadata, &cover, 1023, 1023) == AVERROR(ENOMEM));
      av_max_alloc(SIZE_MAX); assert(metadata == original); assert(av_dict_count(metadata) == 2);
    }
    av_dict_free(&metadata);
  }
  assert(av_dict_set(&cover.metadata, "title", "Couverture maximale café — 音楽", 0) == 0);
  size_t allocation_bytes[2], allocations[2];
  for (unsigned int candidate = 0; candidate < 2; candidate++) {
    requested_bytes = allocation_calls = 0;
    AVDictionary *metadata = NULL; seed(&metadata);
    assert((candidate ? lower_copy_artwork : baseline_artwork)(&metadata, &cover, 1023, 1023) == 0);
    allocation_bytes[candidate] = requested_bytes; allocations[candidate] = allocation_calls;
    av_dict_free(&metadata);
  }
  const size_t header = 32 + 9 + strlen("Couverture maximale café — 音楽");
  assert(allocations[0] == 2 && allocations[1] == 1);
  assert(allocation_bytes[0] - allocation_bytes[1] == maximum + header);
  printf("{\"status\":\"passed-matched-native-serializer-only\",\"exactDifferentialCases\":%u,\"atomicOomBoth\":true,\"baselineExplicitAllocationBytes\":%zu,\"candidateExplicitAllocationBytes\":%zu,\"baselineAllocationCalls\":%zu,\"candidateAllocationCalls\":%zu,\"measurements\":[", compared, allocation_bytes[0], allocation_bytes[1], allocations[0], allocations[1]);
  const int sizes[] = {128, 65536, 4194304}; const unsigned int iterations[] = {2048, 64, 8};
  for (unsigned int size_index = 0; size_index < 3; size_index++) {
    cover.attached_pic.size = sizes[size_index];
    (void)milliseconds(baseline_artwork, &cover, 4); (void)milliseconds(lower_copy_artwork, &cover, 4);
    for (unsigned int round = 0; round < 8; round++) {
      double baseline, candidate;
      if (round % 2) { candidate = milliseconds(lower_copy_artwork, &cover, iterations[size_index]); baseline = milliseconds(baseline_artwork, &cover, iterations[size_index]); }
      else { baseline = milliseconds(baseline_artwork, &cover, iterations[size_index]); candidate = milliseconds(lower_copy_artwork, &cover, iterations[size_index]); }
      printf("%s{\"imageBytes\":%d,\"iterations\":%u,\"round\":%u,\"order\":\"%s\",\"baselineMs\":%.6f,\"candidateMs\":%.6f}", size_index || round ? "," : "", sizes[size_index], iterations[size_index], round, round % 2 ? "BA" : "AB", baseline, candidate);
    }
  }
  printf("],\"browserConversionVerified\":false,\"consumed\":%zu}\n", consumed_bytes);
  av_dict_free(&cover.metadata); free(image); return 0;
}
