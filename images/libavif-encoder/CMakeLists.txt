cmake_minimum_required(VERSION 3.20)
project(within_avif_encoder LANGUAGES C CXX)

function(add_within_avif_encoder target_name output_name memory_bytes)
  add_executable(${target_name} within_avif_encode.c)
  set_property(TARGET ${target_name} PROPERTY LINKER_LANGUAGE CXX)
  target_include_directories(${target_name} PRIVATE
    /src/build/ffmpeg-install/include
    /src/build/aom-install/include
  )
  target_compile_options(${target_name} PRIVATE -O3 -flto)
  target_link_libraries(${target_name} PRIVATE
    /src/build/ffmpeg-install/lib/libavformat.a
    /src/build/ffmpeg-install/lib/libavcodec.a
    /src/build/ffmpeg-install/lib/libswscale.a
    /src/build/ffmpeg-install/lib/libavutil.a
    /src/build/aom-install/lib/libaom.a
    m
  )
  target_link_options(${target_name} PRIVATE
    -O3
    -flto
    -sENVIRONMENT=worker
    -sMODULARIZE=1
    -sEXPORT_ES6=1
    -sEXPORT_NAME=createWithinAvifEncoderModule
    -sFILESYSTEM=0
    -sASYNCIFY=1
    -sASYNCIFY_STACK_SIZE=1048576
    "-sASYNCIFY_IMPORTS=['within_avif_output_write','within_avif_output_truncate','within_avif_output_flush']"
    -sINITIAL_MEMORY=${memory_bytes}
    -sALLOW_MEMORY_GROWTH=0
    -sSTACK_SIZE=1048576
    -sMALLOC=emmalloc
    -sASSERTIONS=0
    -sNO_EXIT_RUNTIME=1
    "-sEXPORTED_FUNCTIONS=['_within_avif_encoder_probe','_within_avif_encoder_start','_within_avif_encoder_add_frame','_within_avif_encoder_finish','_within_avif_encoder_destroy','_within_avif_encoder_error','_within_avif_encoder_output_bytes','_within_avif_encoder_strip_bytes','_within_avif_encoder_frame_bytes']"
    "-sEXPORTED_RUNTIME_METHODS=['ccall','UTF8ToString','HEAPU8']"
  )
  set_target_properties(${target_name} PROPERTIES
    OUTPUT_NAME ${output_name}
    SUFFIX .mjs
    RUNTIME_OUTPUT_DIRECTORY /out
  )
endfunction()

add_within_avif_encoder(within-avif-encoder within-avif-encoder 83886080)
add_within_avif_encoder(within-avif-animation-encoder within-avif-animation-encoder 92274688)
