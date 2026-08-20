cmake_minimum_required(VERSION 3.20)
project(within_jxl LANGUAGES C CXX)

add_library(jxl_dec STATIC IMPORTED GLOBAL)
set_target_properties(jxl_dec PROPERTIES
  IMPORTED_LOCATION /src/build/libraries/libjxl/lib/libjxl_dec.a
)
add_library(hwy STATIC IMPORTED GLOBAL)
set_target_properties(hwy PROPERTIES
  IMPORTED_LOCATION /src/build/libraries/libjxl/third_party/highway/libhwy.a
)

add_executable(within-jxl within_jxl.c)
set_property(TARGET within-jxl PROPERTY LINKER_LANGUAGE CXX)
target_include_directories(within-jxl PRIVATE
  /src/libjxl/lib/include
  /src/build/libraries/libjxl/lib/include
  /src/libpng
  /src/zlib
)
target_compile_definitions(within-jxl PRIVATE JXL_STATIC_DEFINE)
target_compile_options(within-jxl PRIVATE -O3 -flto)
target_link_libraries(within-jxl PRIVATE
  jxl_dec
  hwy
  /src/libpng/.libs/libpng16.a
  /src/zlib/libz.a
)
target_link_options(within-jxl PRIVATE
  -O3
  -flto
  -sENVIRONMENT=worker
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createWithinJxlModule
  -sFILESYSTEM=0
  -sASYNCIFY=1
  -sASYNCIFY_STACK_SIZE=1048576
  "-sASYNCIFY_IMPORTS=['within_jxl_input_read','within_png_output_write']"
  -sINITIAL_MEMORY=117440512
  -sALLOW_MEMORY_GROWTH=0
  -sSTACK_SIZE=1048576
  -sMALLOC=emmalloc
  -sASSERTIONS=0
  -sNO_EXIT_RUNTIME=1
  "-sEXPORTED_FUNCTIONS=['_within_jxl_to_png','_within_jxl_error','_within_jxl_width','_within_jxl_height','_within_jxl_bits','_within_jxl_channels','_within_jxl_has_animation','_within_jxl_peak_decoder_allocation']"
  "-sEXPORTED_RUNTIME_METHODS=['ccall','UTF8ToString','HEAPU8']"
)
set_target_properties(within-jxl PROPERTIES
  OUTPUT_NAME within-jxl
  SUFFIX .mjs
  RUNTIME_OUTPUT_DIRECTORY /out
)
