#ifndef WITHIN_AUDIO_OGG_ARTWORK_H
#define WITHIN_AUDIO_OGG_ARTWORK_H

#include <libavutil/base64.h>
#include <libavutil/intreadwrite.h>
#include <libavutil/mem.h>

/* Ogg/Opus use a base64 FLAC PICTURE comment, not a PNG/JPEG media stream.
 * Called after the bounded text merge and existing image inspection. The image
 * budget remains 4 MiB / 4096 per side / 16 Mpixels, independent of audio size.
 * Text keeps its separate 2 MiB budget. One picture counts toward 4096 fields.
 * Stage every allocation and dictionary edit before replacing caller state.
 * FFmpeg exposes the picture role as comment and description as title; zero
 * depth/palette denotes unknown, never invented image properties (RFC 9639).
 */
static int add_bounded_ogg_audio_artwork(AVDictionary **metadata,
                                         const AVStream *artwork,
                                         int width, int height) {
  const int maximum_image_bytes = 4 * 1024 * 1024;
  const size_t maximum_description_bytes = 4096;
  if (!metadata || !artwork || !artwork->codecpar ||
      !artwork->attached_pic.data || artwork->attached_pic.size <= 0 ||
      artwork->attached_pic.size > maximum_image_bytes ||
      width <= 0 || height <= 0 || width > 4096 || height > 4096 ||
      (int64_t)width * height > 16 * 1024 * 1024)
    return AVERROR(EINVAL);
  const char *mime = artwork->codecpar->codec_id == AV_CODEC_ID_PNG
                         ? "image/png"
                         : artwork->codecpar->codec_id == AV_CODEC_ID_MJPEG
                               ? "image/jpeg" : NULL;
  if (!mime) return AVERROR(EINVAL);
  /* Refuse ambiguous preexisting picture comments instead of silently replacing
   * user metadata. The demuxer normally extracts valid pictures into streams. */
  if (av_dict_get(*metadata, "METADATA_BLOCK_PICTURE", NULL, 0))
    return AVERROR_INVALIDDATA;
  if (av_dict_count(*metadata) >= 4096) return AVERROR(ENOSPC);

  const AVDictionaryEntry *title = av_dict_get(artwork->metadata, "title", NULL, 0);
  const char *description = title ? title->value : "";
  if (!description) return AVERROR_INVALIDDATA;
  size_t description_bytes = 0;
  while (description_bytes < maximum_description_bytes &&
         description[description_bytes]) description_bytes++;
  if (description_bytes == maximum_description_bytes) return AVERROR(ENOSPC);
  /* Standard ID3/FLAC picture roles, also used by the pinned FFmpeg demuxer. */
  static const char *const roles[] = {
      "Other", "32x32 pixels 'file icon'", "Other file icon", "Cover (front)",
      "Cover (back)", "Leaflet page", "Media (e.g. label side of CD)",
      "Lead artist/lead performer/soloist", "Artist/performer", "Conductor",
      "Band/Orchestra", "Composer", "Lyricist/text writer", "Recording Location",
      "During recording", "During performance", "Movie/video screen capture",
      "A bright coloured fish", "Illustration", "Band/artist logotype",
      "Publisher/Studio logotype"};
  const AVDictionaryEntry *role = av_dict_get(artwork->metadata, "comment", NULL, 0);
  unsigned int picture_type = 0;
  if (role) {
    if (!role->value) return AVERROR_INVALIDDATA;
    int found = 0;
    for (unsigned int index = 0; index < sizeof(roles) / sizeof(roles[0]); index++) {
      if (!strcmp(role->value, roles[index])) { picture_type = index; found = 1; break; }
    }
    if (!found) return AVERROR_INVALIDDATA; /* Do not silently relabel artwork. */
  }
  if (picture_type == 1 && (width != 32 || height != 32 ||
                            artwork->codecpar->codec_id != AV_CODEC_ID_PNG))
    return AVERROR_INVALIDDATA;

  AVDictionary *next = NULL;
  int result = merge_bounded_audio_text_metadata(&next, *metadata, NULL);
  if (result < 0) return result;
  const size_t mime_bytes = strlen(mime);
  const size_t block_bytes = 32 + mime_bytes + description_bytes +
                             (size_t)artwork->attached_pic.size;
  const size_t encoded_bytes = AV_BASE64_SIZE(block_bytes);
  uint8_t *block = av_malloc(block_bytes);
  char *encoded = NULL;
  if (!block) { result = AVERROR(ENOMEM); goto cleanup; }
  encoded = av_malloc(encoded_bytes);
  if (!encoded) { result = AVERROR(ENOMEM); goto cleanup; }
  uint8_t *at = block;
  AV_WB32(at, picture_type); at += 4;
  AV_WB32(at, mime_bytes); at += 4;
  memcpy(at, mime, mime_bytes); at += mime_bytes;
  AV_WB32(at, description_bytes); at += 4;
  memcpy(at, description, description_bytes); at += description_bytes;
  AV_WB32(at, width); at += 4; AV_WB32(at, height); at += 4;
  AV_WB32(at, 0); at += 4; AV_WB32(at, 0); at += 4;
  AV_WB32(at, artwork->attached_pic.size); at += 4;
  memcpy(at, artwork->attached_pic.data, (size_t)artwork->attached_pic.size);
  if (!av_base64_encode(encoded, (int)encoded_bytes, block, (int)block_bytes)) {
    result = AVERROR_INVALIDDATA; goto cleanup;
  }
  /* av_dict_set owns/frees this value even on failure with DONT_STRDUP_VAL. */
  char *owned_value = encoded; encoded = NULL;
  result = av_dict_set(&next, "METADATA_BLOCK_PICTURE", owned_value,
                       AV_DICT_DONT_STRDUP_VAL);
  if (result < 0) goto cleanup;
  av_dict_free(metadata); *metadata = next; next = NULL;
cleanup:
  av_free(block); av_free(encoded); av_dict_free(&next);
  return result;
}

#endif
