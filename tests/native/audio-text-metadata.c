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

static void set(AVDictionary **dictionary, const char *key, const char *value) {
  assert(av_dict_set(dictionary, key, value, AV_DICT_MULTIKEY) == 0);
}
static const char *value(const AVDictionary *dictionary, const char *key) {
  const AVDictionaryEntry *entry = av_dict_get(dictionary, key, NULL, 0);
  return entry ? entry->value : NULL;
}
int main(void) {
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
  assert(merge_bounded_audio_text_metadata(&output, NULL, stream) == AVERROR(ENOSPC));
  assert(output == before);
  av_dict_free(&stream);
  char *large = malloc(2 * 1024 * 1024 + 1); assert(large);
  memset(large, 'x', 2 * 1024 * 1024); large[2 * 1024 * 1024] = 0;
  set(&stream, "large", large); free(large);
  assert(merge_bounded_audio_text_metadata(&output, NULL, stream) == AVERROR(ENOSPC)); assert(output == before);
  av_dict_free(&stream); av_dict_free(&container);
  assert(merge_bounded_audio_text_metadata(&output, NULL, NULL) == 0); assert(output == NULL);
  printf("{\"status\":\"passed-native-dictionary-behavior\",\"fields\":25,\"duplicateValuesPreserved\":true,\"containerPrecedence\":true,\"emptyValues\":true,\"entryAndByteBounds\":true,\"allocationFailureAtomic\":true,\"libavutilVersion\":%u,\"ffmpegVersion\":\"%s\",\"browserConversionVerified\":false}\n", avutil_version(), av_version_info());
  return 0;
}
