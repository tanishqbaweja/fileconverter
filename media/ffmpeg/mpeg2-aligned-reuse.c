/* Private fixed-heap candidate, not public acceptance. Preserve FFmpeg's
 * av_malloc size policy, poisoning, zeroing callers, codec references and ABI.
 * Only a freshly acquired, never-exposed pointer may be released here.
 */
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

int __real_posix_memalign(void **pointer, size_t alignment, size_t bytes);

int __wrap_posix_memalign(void **pointer, size_t alignment, size_t bytes)
{
    if (alignment == 16 && bytes >= 262144) {
        void *candidate = malloc(bytes);
        if (candidate) {
            if (((uintptr_t)candidate & 15) == 0) {
                *pointer = candidate;
                return 0;
            }
            free(candidate);
        }
    }
    return __real_posix_memalign(pointer, alignment, bytes);
}
