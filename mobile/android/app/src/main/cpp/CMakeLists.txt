cmake_minimum_required(VERSION 3.22.1)
project(voiceshield_whisper)

set(WHISPER_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/whisper.cpp")

add_library(whisper-jni SHARED whisper_jni.cpp)
add_library(react_featureflagsjni SHARED react_featureflags_jni.cpp)

find_library(log-lib log)

target_compile_features(whisper-jni PRIVATE cxx_std_17)
target_compile_options(whisper-jni PRIVATE -O3)
target_compile_features(react_featureflagsjni PRIVATE cxx_std_17)
target_link_libraries(react_featureflagsjni ${log-lib})

if(NOT EXISTS "${WHISPER_CPP_DIR}/CMakeLists.txt")
  message(FATAL_ERROR "whisper.cpp source is missing. Refusing to build a non-functional Whisper stub.")
endif()

set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
add_subdirectory("${WHISPER_CPP_DIR}" whispercpp)
target_compile_definitions(whisper-jni PRIVATE VS_HAS_WHISPER_CPP=1)
target_include_directories(whisper-jni PRIVATE
  "${WHISPER_CPP_DIR}/include"
  "${WHISPER_CPP_DIR}/ggml/include"
)
target_link_libraries(whisper-jni whisper ${log-lib})
