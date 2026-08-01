#ifndef WITHIN_ARCHIVE_TEMP_BRIDGE_H
#define WITHIN_ARCHIVE_TEMP_BRIDGE_H

#include <stddef.h>
#include <stdint.h>

int within_archive_temp_write(double offset, const uint8_t *source, int length);
int within_archive_temp_read(double offset, uint8_t *destination, int length);

#endif
