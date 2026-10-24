#ifndef WITHIN_AUDIO_MUXER_METADATA_ORDER_H
#define WITHIN_AUDIO_MUXER_METADATA_ORDER_H

/* FFmpeg rewrites encoder and deletes encoder-* before writing a header.
 * Dictionary replacement swaps in the last entry, which otherwise reverses
 * repeated user values. Stable-partition only those reserved fields to the
 * tail. Their documented muxer rewriting remains unchanged. */
static int audio_muxer_reserved_metadata_key(const char *key) {
  const char name[] = "encoder";
  for (unsigned int i = 0; name[i]; i++) {
    unsigned char c = (unsigned char)key[i];
    if (!c) return 0;
    if (c >= 'A' && c <= 'Z') c += 'a' - 'A';
    if (c != (unsigned char)name[i]) return 0;
  }
  return key[7] == 0 || key[7] == '-';
}

static int partition_bounded_audio_muxer_metadata(AVDictionary **metadata) {
  if (!metadata) return AVERROR(EINVAL);
  const size_t maximum_bytes = 2 * 1024 * 1024;
  size_t bytes = 0;
  unsigned int entries = 0;
  int saw_reserved = 0, needs_reorder = 0;
  const AVDictionaryEntry *entry = NULL;
  while ((entry = av_dict_get(*metadata, "", entry, AV_DICT_IGNORE_SUFFIX))) {
    if (++entries > 4096) return AVERROR(ENOSPC);
    const char *texts[] = {entry->key, entry->value};
    for (unsigned int field = 0; field < 2; field++) {
      if (!texts[field]) return AVERROR_INVALIDDATA;
      const size_t remaining = maximum_bytes - bytes;
      size_t length = 0;
      while (length < remaining && texts[field][length]) length++;
      if (length == remaining) return AVERROR(ENOSPC);
      bytes += length + 1;
    }
    const int reserved = audio_muxer_reserved_metadata_key(entry->key);
    if (reserved) saw_reserved = 1;
    else if (saw_reserved) needs_reorder = 1;
  }
  if (!needs_reorder) return 0; /* Already stable: no extra allocations. */

  AVDictionary *ordered = NULL;
  for (int reserved = 0; reserved <= 1; reserved++) {
    entry = NULL;
    while ((entry = av_dict_get(*metadata, "", entry, AV_DICT_IGNORE_SUFFIX))) {
      if (audio_muxer_reserved_metadata_key(entry->key) != reserved) continue;
      const int result = av_dict_set(&ordered, entry->key, entry->value,
                                     AV_DICT_MULTIKEY);
      if (result < 0) { av_dict_free(&ordered); return result; }
    }
  }
  av_dict_free(metadata);
  *metadata = ordered;
  return 0;
}
#endif
