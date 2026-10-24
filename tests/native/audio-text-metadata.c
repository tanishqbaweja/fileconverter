/* Native libavutil behavior test, NOT a media converter or browser proof. */
#include <assert.h>
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <libavutil/avutil.h>
#include <libavutil/dict.h>
#include <libavutil/error.h>
#include <libavutil/mem.h>
#include "../../media/ffmpeg/audio-text-metadata.h"
#include "../../media/ffmpeg/audio-muxer-metadata-order.h"

static void set(AVDictionary **dictionary, const char *key, const char *value) {
  assert(av_dict_set(dictionary, key, value, AV_DICT_MULTIKEY) == 0);
}
static const char *value(const AVDictionary *dictionary, const char *key) {
  const AVDictionaryEntry *entry = av_dict_get(dictionary, key, NULL, 0);
  return entry ? entry->value : NULL;
}
int main(void) {
  /* Reproduce the actual wrapper's plain-copy loss independently of media or
   * codecs. Bounded stream-first merge preserves the existing Ogg precedence. */
  AVDictionary *repeated = NULL, *plain = NULL, *bounded = NULL;
  set(&repeated, "CUSTOM_REPEAT", "Premier 音楽");
  set(&repeated, "CUSTOM_REPEAT", "Deuxième café");
  assert(av_dict_copy(&plain, repeated, 0) == 0);
  assert(av_dict_count(plain) == 1);
  assert(strcmp(value(plain, "CUSTOM_REPEAT"), "Deuxième café") == 0);
  assert(merge_bounded_audio_text_metadata(&bounded, NULL, repeated) == 0);
  /* Real Ogg muxer merges format defaults after the wrapper's stream copy. */
  assert(av_dict_copy(&bounded, plain, AV_DICT_DONT_OVERWRITE) == 0);
  assert(av_dict_count(bounded) == 2);
  const AVDictionaryEntry *repeat_first = av_dict_get(bounded, "CUSTOM_REPEAT", NULL, 0);
  const AVDictionaryEntry *repeat_second = av_dict_get(bounded, "CUSTOM_REPEAT", repeat_first, 0);
  assert(repeat_first && repeat_second);
  assert(strcmp(repeat_first->value, "Premier 音楽") == 0);
  assert(strcmp(repeat_second->value, "Deuxième café") == 0);
  av_dict_free(&repeated); av_dict_free(&plain); av_dict_free(&bounded);
  /* Match the independently observed FLAC header swap exactly. */
  AVDictionary *header_metadata = NULL;
  set(&header_metadata, "encoder", "old-tool");
  set(&header_metadata, "CUSTOM_REPEAT", "Premier 音楽");
  set(&header_metadata, "CUSTOM_REPEAT", "Deuxième café");
  assert(av_dict_set(&header_metadata, "encoder", "new-muxer", 0) == 0);
  assert(strcmp(value(header_metadata, "CUSTOM_REPEAT"), "Deuxième café") == 0);
  av_dict_free(&header_metadata);
  set(&header_metadata, "EnCoDeR", "old-tool");
  set(&header_metadata, "encoded_by", "preserved author");
  set(&header_metadata, "EnCoDeR-legacy", "reserved");
  set(&header_metadata, "CUSTOM_REPEAT", "Premier 音楽");
  set(&header_metadata, "CUSTOM_REPEAT", "Deuxième café");
  AVDictionary *header_before = header_metadata;
  av_max_alloc(1);
  assert(partition_bounded_audio_muxer_metadata(&header_metadata) == AVERROR(ENOMEM));
  av_max_alloc(SIZE_MAX);
  assert(header_metadata == header_before);
  assert(partition_bounded_audio_muxer_metadata(&header_metadata) == 0);
  assert(av_dict_set(&header_metadata, "encoder", "new-muxer", 0) == 0);
  const AVDictionaryEntry *reserved_entry;
  while ((reserved_entry = av_dict_get(header_metadata, "encoder-", NULL, AV_DICT_IGNORE_SUFFIX)))
    assert(av_dict_set(&header_metadata, reserved_entry->key, NULL, 0) == 0);
  repeat_first = av_dict_get(header_metadata, "CUSTOM_REPEAT", NULL, 0);
  repeat_second = av_dict_get(header_metadata, "CUSTOM_REPEAT", repeat_first, 0);
  assert(repeat_first && repeat_second);
  assert(strcmp(repeat_first->value, "Premier 音楽") == 0);
  assert(strcmp(repeat_second->value, "Deuxième café") == 0);
  assert(strcmp(value(header_metadata, "encoded_by"), "preserved author") == 0);
  header_before = header_metadata;
  assert(partition_bounded_audio_muxer_metadata(&header_metadata) == 0);
  assert(header_metadata == header_before); /* Already ordered: no allocation. */
  av_dict_free(&header_metadata);
  assert(partition_bounded_audio_muxer_metadata(NULL) == AVERROR(EINVAL));
  AVDictionary *container = NULL, *stream = NULL, *output = NULL;
  const char *keys[] = {"title", "artist", "album", "genre", "date", "track", "comment",
    "composer", "album_artist", "performer", "disc", "copyright", "publisher", "language", "isrc",
    "encoded_by", "lyrics", "license", "contact", "location", "organization", "custom_field",
    "replaygain_track_gain", "replaygain_track_peak", "replaygain_album_gain"};
  for (unsigned int i = 0; i < 25; i++) set(&stream, keys[i], "Unicode café 音楽\nsecond line");
  assert(merge_bounded_audio_text_metadata(&output, container, stream) == 0);
  assert(av_dict_count(output) == 25);
  for (unsigned int i = 0; i < 25; i++) assert(strcmp(value(output, keys[i]), "Unicode café 音楽\nsecond line") == 0);
  set(&container, "ARTIST", "container wins");
  set(&container, "ARTIST", "second container value");
  set(&stream, "performer", "second stream value");
  set(&stream, "empty", "");
  assert(merge_bounded_audio_text_metadata(&output, container, stream) == 0);
  const AVDictionaryEntry *first = av_dict_get(output, "artist", NULL, 0);
  assert(first && strcmp(first->value, "container wins") == 0);
  const AVDictionaryEntry *second = av_dict_get(output, "artist", first, 0);
  assert(second && strcmp(second->value, "second container value") == 0);
  assert(av_dict_get(output, "artist", second, 0) == NULL);
  first = av_dict_get(output, "performer", NULL, 0);
  assert(first && av_dict_get(output, "performer", first, 0));
  assert(value(output, "empty") && !*value(output, "empty"));
  assert(strcmp(value(stream, "artist"), "Unicode café 音楽\nsecond line") == 0);
  assert(merge_bounded_audio_text_metadata(NULL, container, stream) == AVERROR(EINVAL));

  /* A real allocator failure must not destroy the previous output dictionary. */
  AVDictionary *before = output;
  av_max_alloc(1);
  const int allocation_failure = merge_bounded_audio_text_metadata(&output, container, stream);
  av_max_alloc(SIZE_MAX);
  assert(allocation_failure == AVERROR(ENOMEM)); assert(output == before);
  assert(strcmp(value(output, "artist"), "container wins") == 0);
  av_dict_free(&stream);
  for (unsigned int i = 0; i < 4097; i++) set(&stream, "repeated", "x");
  assert(partition_bounded_audio_muxer_metadata(&stream) == AVERROR(ENOSPC));
  assert(merge_bounded_audio_text_metadata(&output, NULL, stream) == AVERROR(ENOSPC));
  assert(output == before);
  av_dict_free(&stream);
  char *large = malloc(2 * 1024 * 1024 + 1); assert(large);
  memset(large, 'x', 2 * 1024 * 1024); large[2 * 1024 * 1024] = 0;
  set(&stream, "large", large); free(large);
  assert(partition_bounded_audio_muxer_metadata(&stream) == AVERROR(ENOSPC));
  assert(merge_bounded_audio_text_metadata(&output, NULL, stream) == AVERROR(ENOSPC)); assert(output == before);
  av_dict_free(&stream); av_dict_free(&container);
  assert(merge_bounded_audio_text_metadata(&output, NULL, NULL) == 0); assert(output == NULL);
  printf("{\"status\":\"passed-native-dictionary-behavior\",\"fields\":25,\"plainCopyDuplicateLossReproduced\":true,\"boundedCopyRestoresDistinctValues\":true,\"muxerEncoderSwapReproduced\":true,\"reservedTailPreservesUserValueOrder\":true,\"reservedTailAtomicAndBounded\":true,\"alreadyOrderedSkipsAllocation\":true,\"duplicateValuesPreserved\":true,\"containerPrecedence\":true,\"emptyValues\":true,\"entryAndByteBounds\":true,\"allocationFailureAtomic\":true,\"libavutilVersion\":%u,\"ffmpegVersion\":\"%s\",\"browserConversionVerified\":false}\n", avutil_version(), av_version_info());
  return 0;
}
