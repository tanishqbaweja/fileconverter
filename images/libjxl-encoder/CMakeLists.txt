cmake_minimum_required(VERSION 3.20)
project(within_jxl_encoder LANGUAGES C CXX)

set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_TOOLS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_DOXYGEN OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_MANPAGES OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_BENCHMARK OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_EXAMPLES OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_JNI OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_SJPEG OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_OPENEXR OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_PLUGINS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_TRANSCODE_JPEG OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_BOXES OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_WASM_THREADS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_TCMALLOC OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_VIEWERS OFF CACHE BOOL "" FORCE)
set(JPEGXL_ENABLE_LTO ON CACHE BOOL "" FORCE)
set(JPEGXL_WARNINGS_AS_ERRORS OFF CACHE BOOL "" FORCE)

add_subdirectory(/src/libjxl /src/build/libjxl EXCLUDE_FROM_ALL)

add_executable(within-jxl-encoder within_jxl_encode.c)
set_property(TARGET within-jxl-encoder PROPERTY LINKER_LANGUAGE CXX)
target_include_directories(within-jxl-encoder PRIVATE
  /src/libjxl/lib/include
  /src/build/libjxl/lib/include
)
target_compile_definitions(within-jxl-encoder PRIVATE JXL_STATIC_DEFINE)
target_compile_options(within-jxl-encoder PRIVATE -O3 -flto)
target_link_libraries(within-jxl-encoder PRIVATE jxl)
target_link_options(within-jxl-encoder PRIVATE
  -O3
  -flto
  -sENVIRONMENT=worker
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createWithinJxlEncoderModule
  -sFILESYSTEM=0
  -sASYNCIFY=1
  -sASYNCIFY_STACK_SIZE=1048576
  "-sASYNCIFY_IMPORTS=['within_jxl_output_write']"
  -sINITIAL_MEMORY=58720256
  -sALLOW_MEMORY_GROWTH=0
  -sSTACK_SIZE=1048576
  -sMALLOC=emmalloc
  -sASSERTIONS=0
  -sNO_EXIT_RUNTIME=1
  "-sEXPORTED_FUNCTIONS=['_within_jxl_encoder_start','_within_jxl_encoder_add_frame','_within_jxl_encoder_finish','_within_jxl_encoder_destroy','_within_jxl_encoder_error','_within_jxl_encoder_peak_allocation','_within_jxl_encoder_peak_pixel_bytes','_within_jxl_encoder_output_bytes']"
  "-sEXPORTED_RUNTIME_METHODS=['ccall','UTF8ToString','HEAPU8']"
)
set_target_properties(within-jxl-encoder PROPERTIES
  OUTPUT_NAME within-jxl-encoder
  SUFFIX .mjs
  RUNTIME_OUTPUT_DIRECTORY /out
)
