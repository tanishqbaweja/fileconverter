#include <archive.h>
#include <archive_entry.h>
#include <emscripten.h>
#include <errno.h>
#include <locale.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WITHIN_INPUT_BYTES (256 * 1024)
#define WITHIN_OUTPUT_BYTES (64 * 1024)
#define WITHIN_MAX_ENTRIES 10000
#define WITHIN_NAME_TABLE_SLOTS 32768
#define WITHIN_MAX_NAME_BYTES 255
#define WITHIN_MAX_EXPANDED_BYTES (64ULL * 1024ULL * 1024ULL * 1024ULL)
#define WITHIN_MAX_EXPANSION_RATIO 100ULL
#define WITHIN_RATIO_FLOOR_BYTES (1024ULL * 1024ULL)
#define WITHIN_ERROR_BYTES 1024

typedef struct {
  int64_t input_size;
  int64_t input_position;
  int input_ended;
  int64_t output_position;
  uint64_t total_payload;
  int entry_count;
  uint8_t *input_buffer;
  char **names;
  uint32_t *name_slots;
  int validate_tar;
  uint8_t tar_block[512];
  size_t tar_block_bytes;
  uint64_t tar_payload_padded_remaining;
  int tar_zero_blocks;
  int tar_ended;
} WithinArchive;

static char within_error_message[WITHIN_ERROR_BYTES];

EM_ASYNC_JS(int, within_archive_input_read,
            (double offset, uint8_t *destination, int requested), {
  try {
    return await Module["withinBridge"].read(
      offset,
      HEAPU8.subarray(destination, destination + requested)
    );
  } catch (error) {
    Module["withinBridge"].message(
      error instanceof Error ? error.message : String(error)
    );
    return -1;
  }
});

EM_ASYNC_JS(int, within_archive_output_write,
            (double offset, const uint8_t *source, int length), {
  try {
    const payload = HEAPU8.slice(source, source + length);
    return await Module["withinBridge"].write(offset, payload);
  } catch (error) {
    Module["withinBridge"].message(
      error instanceof Error ? error.message : String(error)
    );
    return -1;
  }
});

EM_JS(int, within_archive_temp_write_js,
      (double offset, const uint8_t *source, int length), {
  try {
    return Module["withinBridge"].tempWrite(
      offset, HEAPU8.subarray(source, source + length)
    );
  } catch (error) {
    Module["withinBridge"].message(
      error instanceof Error ? error.message : String(error)
    );
    return -1;
  }
});

EM_JS(int, within_archive_temp_read_js,
      (double offset, uint8_t *destination, int length), {
  try {
    return Module["withinBridge"].tempRead(
      offset, HEAPU8.subarray(destination, destination + length)
    );
  } catch (error) {
    Module["withinBridge"].message(
      error instanceof Error ? error.message : String(error)
    );
    return -1;
  }
});

int within_archive_temp_write(double offset, const uint8_t *source,
                              int length) {
  return within_archive_temp_write_js(offset, source, length);
}

int within_archive_temp_read(double offset, uint8_t *destination, int length) {
  return within_archive_temp_read_js(offset, destination, length);
}

EM_JS(int, within_archive_cancelled, (void), {
  return Module["withinBridge"].cancelled() ? 1 : 0;
});

EM_JS(void, within_archive_progress,
      (double input_position, double output_position, int entries), {
  Module["withinBridge"].progress(input_position, output_position, entries);
});

static void within_set_error(const char *prefix, struct archive *archive) {
  const char *detail = archive ? archive_error_string(archive) : NULL;
  if (!detail || !detail[0]) detail = "unknown archive error";
  snprintf(within_error_message, sizeof(within_error_message), "%s: %s",
           prefix, detail);
}

static void within_set_plain_error(const char *message) {
  snprintf(within_error_message, sizeof(within_error_message), "%s", message);
}

static int within_tar_octal(const uint8_t *bytes, size_t length,
                            uint64_t *value) {
  if (length == 0 || (bytes[0] & 0x80)) return 0;
  size_t start = 0;
  while (start < length && bytes[start] == ' ') start++;
  size_t end = length;
  while (end > start && (bytes[end - 1] == 0 || bytes[end - 1] == ' ')) end--;
  if (start == end) return 0;
  uint64_t parsed = 0;
  for (size_t index = start; index < end; index++) {
    if (bytes[index] < '0' || bytes[index] > '7' ||
        parsed > (UINT64_MAX - 7) / 8)
      return 0;
    parsed = parsed * 8 + (uint64_t)(bytes[index] - '0');
  }
  *value = parsed;
  return 1;
}

static int within_validate_tar_block(WithinArchive *context) {
  int zero = 1;
  for (size_t index = 0; index < sizeof(context->tar_block); index++) {
    if (context->tar_block[index] != 0) {
      zero = 0;
      break;
    }
  }
  if (context->tar_payload_padded_remaining > 0) {
    context->tar_payload_padded_remaining -= 512;
    return 1;
  }
  if (zero) {
    context->tar_zero_blocks++;
    if (context->tar_zero_blocks >= 2) context->tar_ended = 1;
    return 1;
  }
  if (context->tar_ended || context->tar_zero_blocks != 0) {
    within_set_plain_error("TAR contains data after its end marker");
    return 0;
  }

  uint64_t expected_checksum = 0;
  if (!within_tar_octal(context->tar_block + 148, 8, &expected_checksum)) {
    within_set_plain_error("TAR header checksum is not valid octal");
    return 0;
  }
  uint64_t actual_checksum = 0;
  for (size_t index = 0; index < 512; index++) {
    actual_checksum +=
        index >= 148 && index < 156 ? 0x20 : context->tar_block[index];
  }
  if (actual_checksum != expected_checksum) {
    within_set_plain_error("TAR header checksum is invalid");
    return 0;
  }
  if (memcmp(context->tar_block + 257, "ustar", 5) != 0) {
    within_set_plain_error("TAR header is not in the bounded USTAR format");
    return 0;
  }
  uint8_t type = context->tar_block[156] ? context->tar_block[156] : '0';
  if (type != '0' && type != '5') {
    within_set_plain_error(
        "Only regular files and directories are accepted in bounded USTAR input");
    return 0;
  }
  uint64_t payload = 0;
  if (!within_tar_octal(context->tar_block + 124, 12, &payload) ||
      payload > WITHIN_MAX_EXPANDED_BYTES) {
    within_set_plain_error("TAR entry size is invalid or exceeds 64 GiB");
    return 0;
  }
  if (payload > UINT64_MAX - 511) {
    within_set_plain_error("TAR entry size overflowed its padded length");
    return 0;
  }
  context->tar_payload_padded_remaining = ((payload + 511) / 512) * 512;
  return 1;
}

static int within_validate_tar_bytes(WithinArchive *context,
                                     const uint8_t *bytes, size_t length) {
  while (length > 0) {
    size_t available = 512 - context->tar_block_bytes;
    size_t copied = length < available ? length : available;
    memcpy(context->tar_block + context->tar_block_bytes, bytes, copied);
    context->tar_block_bytes += copied;
    bytes += copied;
    length -= copied;
    if (context->tar_block_bytes == 512) {
      if (!within_validate_tar_block(context)) return 0;
      context->tar_block_bytes = 0;
    }
  }
  return 1;
}

static int within_finish_tar_validation(WithinArchive *context) {
  if (context->tar_block_bytes != 0) {
    within_set_plain_error("TAR input ends in a partial 512-byte block");
    return 0;
  }
  if (context->tar_payload_padded_remaining != 0) {
    within_set_plain_error("TAR input ends before an entry payload is complete");
    return 0;
  }
  if (!context->tar_ended) {
    within_set_plain_error("TAR input is missing its two-block end marker");
    return 0;
  }
  return 1;
}

static int within_open_callback(struct archive *archive, void *client_data) {
  (void)archive;
  WithinArchive *context = (WithinArchive *)client_data;
  context->input_position = 0;
  return ARCHIVE_OK;
}

static int within_output_open_callback(struct archive *archive,
                                       void *client_data) {
  (void)archive;
  (void)client_data;
  return ARCHIVE_OK;
}

static la_ssize_t within_read_callback(struct archive *archive,
                                       void *client_data,
                                       const void **buffer) {
  WithinArchive *context = (WithinArchive *)client_data;
  if (within_archive_cancelled()) {
    archive_set_error(archive, EIO, "Conversion cancelled");
    return ARCHIVE_FATAL;
  }
  if (context->input_ended) {
    *buffer = NULL;
    return 0;
  }
  int requested = WITHIN_INPUT_BYTES;
  if (context->input_size >= 0) {
    int64_t remaining = context->input_size - context->input_position;
    if (remaining <= 0) {
      context->input_ended = 1;
      *buffer = NULL;
      return 0;
    }
    requested = remaining < WITHIN_INPUT_BYTES ? (int)remaining
                                                : WITHIN_INPUT_BYTES;
  }
  int received = within_archive_input_read((double)context->input_position,
                                           context->input_buffer, requested);
  if (received < 0 || received > requested) {
    archive_set_error(archive, EIO,
                      "The bounded browser input read failed");
    return ARCHIVE_FATAL;
  }
  if (received == 0) context->input_ended = 1;
  if (context->validate_tar &&
      !within_validate_tar_bytes(context, context->input_buffer,
                                 (size_t)received)) {
    archive_set_error(archive, EINVAL, "%s", within_error_message);
    return ARCHIVE_FATAL;
  }
  context->input_position += received;
  *buffer = context->input_buffer;
  within_archive_progress((double)context->input_position,
                          (double)context->output_position,
                          context->entry_count);
  return received;
}

static la_int64_t within_skip_callback(struct archive *archive,
                                       void *client_data,
                                       la_int64_t request) {
  (void)archive;
  WithinArchive *context = (WithinArchive *)client_data;
  if (request <= 0) return 0;
  if (context->validate_tar) return 0;
  int64_t remaining = context->input_size - context->input_position;
  int64_t skipped = request < remaining ? request : remaining;
  context->input_position += skipped;
  return skipped;
}

static la_int64_t within_seek_callback(struct archive *archive,
                                       void *client_data,
                                       la_int64_t offset, int whence) {
  WithinArchive *context = (WithinArchive *)client_data;
  if (context->input_size < 0) {
    if ((whence == SEEK_CUR && offset == 0) ||
        (whence == SEEK_SET && offset == context->input_position)) {
      return context->input_position;
    }
    archive_set_error(
        archive, EIO,
        "Unknown-length USTAR input is sequential and cannot seek");
    return ARCHIVE_FATAL;
  }
  int64_t base;
  if (whence == SEEK_SET) {
    base = 0;
  } else if (whence == SEEK_CUR) {
    base = context->input_position;
  } else if (whence == SEEK_END) {
    base = context->input_size;
  } else {
    archive_set_error(archive, EIO, "Invalid input seek mode");
    return ARCHIVE_FATAL;
  }
  if ((offset > 0 && base > INT64_MAX - offset) ||
      (offset < 0 &&
       (offset == INT64_MIN || base < -offset))) {
    archive_set_error(archive, EIO, "Input seek overflow");
    return ARCHIVE_FATAL;
  }
  int64_t position = base + offset;
  if (position < 0 || position > context->input_size) {
    archive_set_error(archive, EIO,
                      "Input seek is outside the selected file");
    return ARCHIVE_FATAL;
  }
  context->input_position = position;
  context->input_ended = position == context->input_size;
  return position;
}

static int within_close_callback(struct archive *archive, void *client_data) {
  (void)archive;
  (void)client_data;
  return ARCHIVE_OK;
}

static la_ssize_t within_write_callback(struct archive *archive,
                                        void *client_data,
                                        const void *buffer, size_t length) {
  WithinArchive *context = (WithinArchive *)client_data;
  const uint8_t *source = (const uint8_t *)buffer;
  size_t offset = 0;
  while (offset < length) {
    if (within_archive_cancelled()) {
      archive_set_error(archive, EIO, "Conversion cancelled");
      return ARCHIVE_FATAL;
    }
    size_t remaining = length - offset;
    int chunk = remaining < WITHIN_OUTPUT_BYTES ? (int)remaining
                                                : WITHIN_OUTPUT_BYTES;
    int written = within_archive_output_write(
        (double)context->output_position, source + offset, chunk);
    if (written != chunk) {
      archive_set_error(archive, EIO,
                        "The bounded browser output write failed");
      return ARCHIVE_FATAL;
    }
    context->output_position += written;
    offset += (size_t)written;
    within_archive_progress((double)context->input_position,
                            (double)context->output_position,
                            context->entry_count);
  }
  return (la_ssize_t)length;
}

static int within_path_is_safe(const char *path, size_t length) {
  if (!path || length == 0 || length > WITHIN_MAX_NAME_BYTES ||
      path[0] == '/' || path[0] == '\\' ||
      (length >= 2 && ((path[0] >= 'A' && path[0] <= 'Z') ||
                       (path[0] >= 'a' && path[0] <= 'z')) &&
       path[1] == ':')) {
    return 0;
  }
  size_t segment_start = 0;
  for (size_t index = 0; index <= length; index++) {
    unsigned char value = index == length ? '/' : (unsigned char)path[index];
    if (value == '\\' || value == 0 || value < 0x20 || value == 0x7f)
      return 0;
    if (value == '/') {
      size_t segment_length = index - segment_start;
      if (segment_length == 0 && index != length) return 0;
      if ((segment_length == 1 && path[segment_start] == '.') ||
          (segment_length == 2 && path[segment_start] == '.' &&
           path[segment_start + 1] == '.'))
        return 0;
      segment_start = index + 1;
    }
  }
  return 1;
}

static int within_add_name(WithinArchive *context, const char *name,
                           size_t length) {
  uint64_t hash = 1469598103934665603ULL;
  for (size_t index = 0; index < length; index++) {
    hash ^= (uint8_t)name[index];
    hash *= 1099511628211ULL;
  }
  uint32_t slot = (uint32_t)hash & (WITHIN_NAME_TABLE_SLOTS - 1);
  for (uint32_t probe = 0; probe < WITHIN_NAME_TABLE_SLOTS; probe++) {
    uint32_t stored = context->name_slots[slot];
    if (stored == 0) {
      char *copy = (char *)malloc(length + 1);
      if (!copy) return -1;
      memcpy(copy, name, length);
      copy[length] = 0;
      context->names[context->entry_count] = copy;
      context->name_slots[slot] = (uint32_t)context->entry_count + 1;
      return 1;
    }
    int index = (int)stored - 1;
    if (strlen(context->names[index]) == length &&
        memcmp(context->names[index], name, length) == 0) {
      return 0;
    }
    slot = (slot + 1) & (WITHIN_NAME_TABLE_SLOTS - 1);
  }
  return -1;
}

static int within_write_all(struct archive *writer, const uint8_t *buffer,
                            size_t length) {
  size_t offset = 0;
  while (offset < length) {
    la_ssize_t written = archive_write_data(writer, buffer + offset,
                                            length - offset);
    if (written <= 0) return ARCHIVE_FATAL;
    offset += (size_t)written;
  }
  return ARCHIVE_OK;
}

EMSCRIPTEN_KEEPALIVE
const char *within_archive_error(void) { return within_error_message; }

EMSCRIPTEN_KEEPALIVE
int within_archive_7z_to_tar(double input_size_value) {
  within_error_message[0] = 0;
  if (!setlocale(LC_CTYPE, "C.UTF-8")) {
    within_set_plain_error("The 7Z engine could not activate its UTF-8 locale");
    return 3;
  }
  if (input_size_value < 1 || input_size_value > 9007199254740991.0) {
    within_set_plain_error("7Z input size is outside the safe integer range");
    return 1;
  }

  WithinArchive context;
  memset(&context, 0, sizeof(context));
  context.input_size = (int64_t)input_size_value;
  context.input_buffer = (uint8_t *)malloc(WITHIN_INPUT_BYTES);
  context.names = (char **)calloc(WITHIN_MAX_ENTRIES, sizeof(char *));
  context.name_slots =
      (uint32_t *)calloc(WITHIN_NAME_TABLE_SLOTS, sizeof(uint32_t));
  uint8_t *entry_buffer = (uint8_t *)malloc(WITHIN_OUTPUT_BYTES);
  if (!context.input_buffer || !context.names || !context.name_slots ||
      !entry_buffer) {
    within_set_plain_error("The 7Z engine exhausted its fixed Wasm memory");
    free(entry_buffer);
    free(context.name_slots);
    free(context.names);
    free(context.input_buffer);
    return 2;
  }

  struct archive *reader = archive_read_new();
  struct archive *writer = archive_write_new();
  int result = 1;
  if (!reader || !writer) {
    within_set_plain_error("The 7Z engine could not allocate archive state");
    goto cleanup;
  }
  if (archive_read_support_filter_none(reader) != ARCHIVE_OK ||
      archive_read_support_format_7zip(reader) != ARCHIVE_OK) {
    within_set_error("Could not enable the 7Z reader", reader);
    goto cleanup;
  }
  archive_read_set_callback_data(reader, &context);
  archive_read_set_open_callback(reader, within_open_callback);
  archive_read_set_read_callback(reader, within_read_callback);
  archive_read_set_skip_callback(reader, within_skip_callback);
  archive_read_set_seek_callback(reader, within_seek_callback);
  archive_read_set_close_callback(reader, within_close_callback);
  if (archive_read_open1(reader) != ARCHIVE_OK) {
    within_set_error("Could not open the 7Z archive", reader);
    goto cleanup;
  }

  if (archive_write_set_format_ustar(writer) != ARCHIVE_OK ||
      archive_write_set_bytes_per_block(writer, WITHIN_OUTPUT_BYTES) !=
          ARCHIVE_OK ||
      archive_write_set_bytes_in_last_block(writer, 1) != ARCHIVE_OK ||
      archive_write_open(writer, &context, within_output_open_callback,
                         within_write_callback, within_close_callback) !=
          ARCHIVE_OK) {
    within_set_error("Could not open the bounded TAR writer", writer);
    goto cleanup;
  }

  struct archive_entry *input_entry = NULL;
  int status;
  while ((status = archive_read_next_header(reader, &input_entry)) ==
         ARCHIVE_OK) {
    if (within_archive_cancelled()) {
      within_set_plain_error("Conversion cancelled");
      goto cleanup;
    }
    if (context.entry_count >= WITHIN_MAX_ENTRIES) {
      within_set_plain_error("7Z exceeds the 10,000-entry safety limit");
      goto cleanup;
    }
    if (archive_entry_is_encrypted(input_entry)) {
      within_set_plain_error("Encrypted 7Z entries are not supported");
      goto cleanup;
    }
    const char *name = archive_entry_pathname(input_entry);
    size_t name_length = name ? strlen(name) : 0;
    if (!within_path_is_safe(name, name_length)) {
      within_set_plain_error("7Z contains an unsafe or unsupported entry path");
      goto cleanup;
    }
    int added = within_add_name(&context, name, name_length);
    if (added == 0) {
      within_set_plain_error("7Z contains a duplicate entry name");
      goto cleanup;
    }
    if (added < 0) {
      within_set_plain_error("The 7Z name table exhausted fixed Wasm memory");
      goto cleanup;
    }
    context.entry_count++;

    mode_t filetype = archive_entry_filetype(input_entry);
    if (filetype != AE_IFREG && filetype != AE_IFDIR) {
      within_set_plain_error("7Z links and special-file entries are rejected");
      goto cleanup;
    }
    if (archive_entry_hardlink(input_entry) ||
        archive_entry_symlink(input_entry)) {
      within_set_plain_error("7Z link entries are rejected");
      goto cleanup;
    }
    int64_t entry_size = 0;
    if (filetype == AE_IFREG) {
      if (!archive_entry_size_is_set(input_entry) ||
          archive_entry_size(input_entry) < 0) {
        within_set_plain_error("7Z entry has no safe declared size");
        goto cleanup;
      }
      entry_size = archive_entry_size(input_entry);
      if ((uint64_t)entry_size > WITHIN_MAX_EXPANDED_BYTES -
                                     context.total_payload) {
        within_set_plain_error("7Z payload exceeds the 64 GiB safety limit");
        goto cleanup;
      }
      context.total_payload += (uint64_t)entry_size;
      if (context.total_payload > WITHIN_RATIO_FLOOR_BYTES &&
          context.total_payload >
              (uint64_t)context.input_size * WITHIN_MAX_EXPANSION_RATIO) {
        within_set_plain_error("7Z exceeds the 100:1 expansion safety limit");
        goto cleanup;
      }
    }

    struct archive_entry *output_entry = archive_entry_new();
    if (!output_entry) {
      within_set_plain_error("The TAR entry allocator exhausted fixed memory");
      goto cleanup;
    }
    archive_entry_set_pathname(output_entry, name);
    archive_entry_set_filetype(output_entry, filetype);
    archive_entry_set_perm(output_entry,
                           filetype == AE_IFDIR ? 0755 : 0644);
    archive_entry_set_size(output_entry, entry_size);
    archive_entry_set_uid(output_entry, 0);
    archive_entry_set_gid(output_entry, 0);
    if (archive_entry_mtime_is_set(input_entry)) {
      archive_entry_set_mtime(output_entry,
                              archive_entry_mtime(input_entry),
                              archive_entry_mtime_nsec(input_entry));
    }
    if (archive_write_header(writer, output_entry) != ARCHIVE_OK) {
      archive_entry_free(output_entry);
      within_set_error("Could not write a USTAR entry header", writer);
      goto cleanup;
    }
    archive_entry_free(output_entry);

    int64_t actual_size = 0;
    for (;;) {
      la_ssize_t bytes = archive_read_data(reader, entry_buffer,
                                           WITHIN_OUTPUT_BYTES);
      if (bytes == 0) break;
      if (bytes < 0) {
        within_set_error("Could not decode a 7Z entry", reader);
        goto cleanup;
      }
      if (actual_size > entry_size - bytes) {
        within_set_plain_error("7Z entry exceeded its declared size");
        goto cleanup;
      }
      if (within_write_all(writer, entry_buffer, (size_t)bytes) != ARCHIVE_OK) {
        within_set_error("Could not write TAR entry data", writer);
        goto cleanup;
      }
      actual_size += bytes;
    }
    if (actual_size != entry_size) {
      within_set_plain_error("7Z entry ended before its declared size");
      goto cleanup;
    }
    if (archive_write_finish_entry(writer) != ARCHIVE_OK) {
      within_set_error("Could not finish a TAR entry", writer);
      goto cleanup;
    }
    within_archive_progress((double)context.input_position,
                            (double)context.output_position,
                            context.entry_count);
  }
  if (status != ARCHIVE_EOF) {
    within_set_error("Could not read the next 7Z entry", reader);
    goto cleanup;
  }
  if (archive_read_has_encrypted_entries(reader) > 0) {
    within_set_plain_error("Encrypted 7Z archives are not supported");
    goto cleanup;
  }
  if (archive_write_close(writer) != ARCHIVE_OK) {
    within_set_error("Could not finalize the TAR output", writer);
    goto cleanup;
  }
  if (archive_read_close(reader) != ARCHIVE_OK) {
    within_set_error("Could not finish validating the 7Z input", reader);
    goto cleanup;
  }
  result = 0;

cleanup:
  if (writer) archive_write_free(writer);
  if (reader) archive_read_free(reader);
  for (int index = 0; index < context.entry_count; index++)
    free(context.names[index]);
  free(entry_buffer);
  free(context.name_slots);
  free(context.names);
  free(context.input_buffer);
  return result;
}

EMSCRIPTEN_KEEPALIVE
int within_archive_tar_to_7z(double input_size_value, int use_copy) {
  within_error_message[0] = 0;
  if (!setlocale(LC_CTYPE, "C.UTF-8")) {
    within_set_plain_error("The 7Z engine could not activate its UTF-8 locale");
    return 3;
  }
  if (input_size_value != 0.0 &&
      (input_size_value < 1024 || input_size_value > 9007199254740991.0)) {
    within_set_plain_error("TAR input size is outside the safe integer range");
    return 1;
  }
  if (use_copy != 0 && use_copy != 1) {
    within_set_plain_error("The adaptive 7Z compression mode is invalid");
    return 1;
  }

  WithinArchive context;
  memset(&context, 0, sizeof(context));
  context.input_size =
      input_size_value == 0.0 ? -1 : (int64_t)input_size_value;
  context.validate_tar = 1;
  context.input_buffer = (uint8_t *)malloc(WITHIN_INPUT_BYTES);
  context.names = (char **)calloc(WITHIN_MAX_ENTRIES, sizeof(char *));
  context.name_slots =
      (uint32_t *)calloc(WITHIN_NAME_TABLE_SLOTS, sizeof(uint32_t));
  uint8_t *entry_buffer = (uint8_t *)malloc(WITHIN_OUTPUT_BYTES);
  if (!context.input_buffer || !context.names || !context.name_slots ||
      !entry_buffer) {
    within_set_plain_error("The 7Z engine exhausted its fixed Wasm memory");
    free(entry_buffer);
    free(context.name_slots);
    free(context.names);
    free(context.input_buffer);
    return 2;
  }

  struct archive *reader = archive_read_new();
  struct archive *writer = archive_write_new();
  int result = 1;
  if (!reader || !writer) {
    within_set_plain_error("The 7Z engine could not allocate archive state");
    goto cleanup;
  }
  if (archive_read_support_filter_none(reader) != ARCHIVE_OK ||
      archive_read_support_format_tar(reader) != ARCHIVE_OK) {
    within_set_error("Could not enable the TAR reader", reader);
    goto cleanup;
  }
  archive_read_set_callback_data(reader, &context);
  archive_read_set_open_callback(reader, within_open_callback);
  archive_read_set_read_callback(reader, within_read_callback);
  archive_read_set_skip_callback(reader, within_skip_callback);
  archive_read_set_seek_callback(reader, within_seek_callback);
  archive_read_set_close_callback(reader, within_close_callback);
  if (archive_read_open1(reader) != ARCHIVE_OK) {
    within_set_error("Could not open the USTAR archive", reader);
    goto cleanup;
  }

  if (archive_write_set_format_7zip(writer) != ARCHIVE_OK ||
      archive_write_set_format_option(writer, "7zip", "compression",
                                      use_copy ? "copy" : "lzma2") !=
          ARCHIVE_OK ||
      (!use_copy &&
       archive_write_set_format_option(writer, "7zip", "compression-level", "0") !=
           ARCHIVE_OK) ||
      archive_write_set_bytes_per_block(writer, WITHIN_OUTPUT_BYTES) !=
          ARCHIVE_OK ||
      archive_write_set_bytes_in_last_block(writer, 1) != ARCHIVE_OK ||
      archive_write_open(writer, &context, within_output_open_callback,
                         within_write_callback, within_close_callback) !=
          ARCHIVE_OK) {
    within_set_error("Could not open the bounded 7Z writer", writer);
    goto cleanup;
  }

  struct archive_entry *input_entry = NULL;
  int status;
  while ((status = archive_read_next_header(reader, &input_entry)) ==
         ARCHIVE_OK) {
    if (within_archive_cancelled()) {
      within_set_plain_error("Conversion cancelled");
      goto cleanup;
    }
    if (archive_format(reader) != ARCHIVE_FORMAT_TAR_USTAR) {
      within_set_plain_error(
          "Only bounded UTF-8 USTAR input is accepted; GNU and PAX records are rejected");
      goto cleanup;
    }
    if (context.entry_count >= WITHIN_MAX_ENTRIES) {
      within_set_plain_error("TAR exceeds the 10,000-entry safety limit");
      goto cleanup;
    }
    const char *name = archive_entry_pathname(input_entry);
    size_t name_length = name ? strlen(name) : 0;
    if (!within_path_is_safe(name, name_length)) {
      within_set_plain_error("TAR contains an unsafe or unsupported entry path");
      goto cleanup;
    }
    int added = within_add_name(&context, name, name_length);
    if (added == 0) {
      within_set_plain_error("TAR contains a duplicate entry name");
      goto cleanup;
    }
    if (added < 0) {
      within_set_plain_error("The TAR name table exhausted fixed Wasm memory");
      goto cleanup;
    }
    context.entry_count++;

    mode_t filetype = archive_entry_filetype(input_entry);
    if (filetype != AE_IFREG && filetype != AE_IFDIR) {
      within_set_plain_error("TAR links and special-file entries are rejected");
      goto cleanup;
    }
    if (archive_entry_hardlink(input_entry) ||
        archive_entry_symlink(input_entry)) {
      within_set_plain_error("TAR link entries are rejected");
      goto cleanup;
    }
    int64_t entry_size = 0;
    if (filetype == AE_IFREG) {
      if (!archive_entry_size_is_set(input_entry) ||
          archive_entry_size(input_entry) < 0) {
        within_set_plain_error("TAR entry has no safe declared size");
        goto cleanup;
      }
      entry_size = archive_entry_size(input_entry);
      if ((uint64_t)entry_size > WITHIN_MAX_EXPANDED_BYTES -
                                     context.total_payload) {
        within_set_plain_error("TAR payload exceeds the 64 GiB safety limit");
        goto cleanup;
      }
      context.total_payload += (uint64_t)entry_size;
    }

    struct archive_entry *output_entry = archive_entry_new();
    if (!output_entry) {
      within_set_plain_error("The 7Z entry allocator exhausted fixed memory");
      goto cleanup;
    }
    archive_entry_set_pathname(output_entry, name);
    archive_entry_set_filetype(output_entry, filetype);
    archive_entry_set_perm(output_entry,
                           filetype == AE_IFDIR ? 0755 : 0644);
    archive_entry_set_size(output_entry, entry_size);
    archive_entry_set_uid(output_entry, 0);
    archive_entry_set_gid(output_entry, 0);
    if (archive_entry_mtime_is_set(input_entry)) {
      archive_entry_set_mtime(output_entry, archive_entry_mtime(input_entry),
                              archive_entry_mtime_nsec(input_entry));
    }
    if (archive_write_header(writer, output_entry) != ARCHIVE_OK) {
      archive_entry_free(output_entry);
      within_set_error("Could not write a 7Z entry header", writer);
      goto cleanup;
    }
    archive_entry_free(output_entry);

    int64_t actual_size = 0;
    for (;;) {
      la_ssize_t bytes = archive_read_data(reader, entry_buffer,
                                           WITHIN_OUTPUT_BYTES);
      if (bytes == 0) break;
      if (bytes < 0) {
        within_set_error("Could not read a TAR entry", reader);
        goto cleanup;
      }
      if (actual_size > entry_size - bytes) {
        within_set_plain_error("TAR entry exceeded its declared size");
        goto cleanup;
      }
      if (within_write_all(writer, entry_buffer, (size_t)bytes) != ARCHIVE_OK) {
        within_set_error("Could not encode 7Z entry data", writer);
        goto cleanup;
      }
      actual_size += bytes;
    }
    if (actual_size != entry_size) {
      within_set_plain_error("TAR entry ended before its declared size");
      goto cleanup;
    }
    if (archive_write_finish_entry(writer) != ARCHIVE_OK) {
      within_set_error("Could not finish a 7Z entry", writer);
      goto cleanup;
    }
    within_archive_progress((double)context.input_position,
                            (double)context.output_position,
                            context.entry_count);
  }
  if (status != ARCHIVE_EOF) {
    within_set_error("Could not read the next TAR entry", reader);
    goto cleanup;
  }
  while ((context.input_size < 0 && !context.input_ended) ||
         (context.input_size >= 0 &&
          context.input_position < context.input_size)) {
    const void *unused = NULL;
    la_ssize_t drained = within_read_callback(reader, &context, &unused);
    if (drained < 0 || (drained == 0 && context.input_size >= 0)) {
      within_set_plain_error("Could not finish validating the TAR byte stream");
      goto cleanup;
    }
  }
  if (!within_finish_tar_validation(&context)) goto cleanup;
  if (archive_read_close(reader) != ARCHIVE_OK) {
    within_set_error("Could not finish validating the TAR input", reader);
    goto cleanup;
  }
  if (archive_write_close(writer) != ARCHIVE_OK) {
    within_set_error("Could not finalize the 7Z output", writer);
    goto cleanup;
  }
  result = 0;

cleanup:
  if (writer) archive_write_free(writer);
  if (reader) archive_read_free(reader);
  for (int index = 0; index < context.entry_count; index++)
    free(context.names[index]);
  free(entry_buffer);
  free(context.name_slots);
  free(context.names);
  free(context.input_buffer);
  return result;
}
