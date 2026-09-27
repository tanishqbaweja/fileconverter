cmake_minimum_required(VERSION 3.20)
project(within_jxl_inspector LANGUAGES C CXX)

add_library(jxl_dec STATIC IMPORTED GLOBAL)
set_target_properties(jxl_dec PROPERTIES
  IMPORTED_LOCATION /src/build/libraries/libjxl/lib/libjxl_dec.a
)
add_library(hwy STATIC IMPORTED GLOBAL)
set_target_properties(hwy PROPERTIES
  IMPORTED_LOCATION /src/build/libraries/libjxl/third_party/highway/libhwy.a
)

add_executable(within-jxl-inspector within_jxl_inspector.c)
set_property(TARGET within-jxl-inspector PROPERTY LINKER_LANGUAGE CXX)
target_include_directories(within-jxl-inspector PRIVATE
  /src/libjxl/lib/include
  /src/build/libraries/libjxl/lib/include
)
target_compile_definitions(within-jxl-inspector PRIVATE JXL_STATIC_DEFINE)
target_compile_options(within-jxl-inspector PRIVATE -Oz -flto)
target_link_libraries(within-jxl-inspector PRIVATE jxl_dec hwy)
target_link_options(within-jxl-inspector PRIVATE
  -Oz
  -flto
  -sENVIRONMENT=worker
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createWithinJxlInspectorModule
  -sFILESYSTEM=0
  -sASYNCIFY=1
  -sASYNCIFY_STACK_SIZE=262144
  "-sASYNCIFY_IMPORTS=['within_jxl_inspector_input_read']"
  -sINITIAL_MEMORY=16777216
  -sALLOW_MEMORY_GROWTH=0
  -sSTACK_SIZE=262144
  -sMALLOC=emmalloc
  -sASSERTIONS=0
  -sNO_EXIT_RUNTIME=1
  "-sEXPORTED_FUNCTIONS=['_within_jxl_inspect','_within_jxl_inspector_error','_within_jxl_inspector_width','_within_jxl_inspector_height','_within_jxl_inspector_intrinsic_width','_within_jxl_inspector_intrinsic_height','_within_jxl_inspector_bits','_within_jxl_inspector_color_channels','_within_jxl_inspector_alpha_bits','_within_jxl_inspector_orientation','_within_jxl_inspector_has_animation','_within_jxl_inspector_tps_numerator','_within_jxl_inspector_tps_denominator','_within_jxl_inspector_num_loops','_within_jxl_inspector_have_timecodes','_within_jxl_inspector_frame_count','_within_jxl_inspector_frame_count_exact','_within_jxl_inspector_total_duration_ticks','_within_jxl_inspector_named_frame_count','_within_jxl_inspector_inspected_bytes','_within_jxl_inspector_peak_allocation']"
  "-sEXPORTED_RUNTIME_METHODS=['ccall','UTF8ToString','HEAPU8']"
)
set_target_properties(within-jxl-inspector PROPERTIES
  OUTPUT_NAME within-jxl-inspector
  SUFFIX .mjs
  RUNTIME_OUTPUT_DIRECTORY /out
)
