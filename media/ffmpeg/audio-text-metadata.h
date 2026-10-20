#ifndef WITHIN_AUDIO_TEXT_METADATA_H
#define WITHIN_AUDIO_TEXT_METADATA_H

/* Preserve complete parsed dictionaries, not a seven-field allowlist. The
 * container retains the existing precedence over the selected audio stream.
 * Repeated values within the winning scope remain repeated dictionary entries.
 * Build atomically: allocation/budget failure leaves the caller's old dictionary
 * intact. This is metadata only; it never changes codec settings or audio data.
 */
static int merge_bounded_audio_text_metadata(
    AVDictionary **destination, const AVDictionary *container_metadata,
    const AVDictionary *stream_metadata) {
  const size_t maximum_bytes = 2 * 1024 * 1024;
  const unsigned int maximum_entries = 4096;
  const AVDictionary *scopes[] = {container_metadata, stream_metadata};
  size_t bytes = 0;
  unsigned int entries = 0;
  AVDictionary *merged = NULL;
  if (!destination) return AVERROR(EINVAL);

  for (unsigned int scope = 0; scope < 2; scope++) {
    const AVDictionaryEntry *entry = NULL;
    while ((entry = av_dict_get(scopes[scope], "", entry, AV_DICT_IGNORE_SUFFIX))) {
      if (++entries > maximum_entries) return AVERROR(ENOSPC);
      const char *texts[] = {entry->key, entry->value};
      for (unsigned int field = 0; field < 2; field++) {
        if (!texts[field]) return AVERROR_INVALIDDATA;
        const size_t remaining = maximum_bytes - bytes;
        size_t length = 0;
        while (length < remaining && texts[field][length]) length++;
        if (length == remaining) return AVERROR(ENOSPC);
        bytes += length + 1; /* Include both terminators in the text budget. */
      }
    }
  }

  for (unsigned int scope = 0; scope < 2; scope++) {
    const AVDictionaryEntry *entry = NULL;
    while ((entry = av_dict_get(scopes[scope], "", entry, AV_DICT_IGNORE_SUFFIX))) {
      if (scope == 1 && av_dict_get(container_metadata, entry->key, NULL, 0))
        continue;
      const int result = av_dict_set(&merged, entry->key, entry->value,
                                     AV_DICT_MULTIKEY);
      if (result < 0) {
        av_dict_free(&merged);
        return result;
      }
    }
  }
  av_dict_free(destination);
  *destination = merged;
  return 0;
}

#endif
