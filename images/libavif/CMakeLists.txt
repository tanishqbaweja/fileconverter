cmake_minimum_required(VERSION 3.20)
project(within_avif LANGUAGES C CXX)

add_executable(within-avif within_avif.c)
set_property(TARGET within-avif PROPERTY LINKER_LANGUAGE CXX)
target_include_directories(within-avif PRIVATE
  /src/libavif/include
  /src/ffmpeg
  /src/libpng
  /src/zlib
)
target_compile_options(within-avif PRIVATE -O3 -flto)
target_link_libraries(within-avif PRIVATE
  /src/build/libraries/libavif/libavif.a
  /src/ffmpeg/libswscale/libswscale.a
  /src/ffmpeg/libavutil/libavutil.a
  /src/libpng/.libs/libpng16.a
  /src/zlib/libz.a
  m
)
target_link_options(within-avif PRIVATE
  -O3
  -flto
  -sENVIRONMENT=worker
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createWithinAvifModule
  -sFILESYSTEM=0
  -sASYNCIFY=1
  -sASYNCIFY_STACK_SIZE=1048576
  "-sASYNCIFY_IMPORTS=['within_avif_input_read','within_png_output_write','within_avif_frame_start','within_avif_frame_end']"
  -sINITIAL_MEMORY=41943040
  -sALLOW_MEMORY_GROWTH=0
  -sSTACK_SIZE=1048576
  -sMALLOC=emmalloc
  -sASSERTIONS=0
  -sNO_EXIT_RUNTIME=1
  "-sEXPORTED_FUNCTIONS=['_within_avif_to_png_frames','_within_avif_error','_within_avif_width','_within_avif_height','_within_avif_depth','_within_avif_channels','_within_avif_frame_count']"
  "-sEXPORTED_RUNTIME_METHODS=['ccall','UTF8ToString','HEAPU8']"
)
set_target_properties(within-avif PROPERTIES
  OUTPUT_NAME within-avif
  SUFFIX .mjs
  RUNTIME_OUTPUT_DIRECTORY /out
)
