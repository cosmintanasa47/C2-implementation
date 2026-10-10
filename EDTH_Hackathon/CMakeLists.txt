cmake_minimum_required(VERSION 3.16)

project(EDTH_Hackathon VERSION 0.1 LANGUAGES CXX)

option(EDTH_WITH_OCTAVE "Compileaza modulul matematic Octave" ON)
find_package(OpenSSL REQUIRED COMPONENTS Crypto)

set(CMAKE_AUTOUIC ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(QT NAMES Qt6 Qt5 REQUIRED COMPONENTS Widgets Sql Network)
find_package(Qt${QT_VERSION_MAJOR} REQUIRED COMPONENTS Widgets Sql Network)

# Configurare Octave
if(EDTH_WITH_OCTAVE)
    find_program(MKOCTFILE_EXECUTABLE NAMES mkoctfile)

    if(NOT MKOCTFILE_EXECUTABLE)
        message(FATAL_ERROR
        "mkoctfile nu a fost gasit. Instaleaza: sudo apt install octave octave-dev"
        )
    endif()

    execute_process(
    COMMAND "${MKOCTFILE_EXECUTABLE}" -p OCTINCLUDEDIR
    RESULT_VARIABLE OCTAVE_INCLUDE_RESULT
    OUTPUT_VARIABLE OCTAVE_INCLUDE_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
    )

    execute_process(
    COMMAND "${MKOCTFILE_EXECUTABLE}" -p OCTLIBDIR
    RESULT_VARIABLE OCTAVE_LIBRARY_RESULT
    OUTPUT_VARIABLE OCTAVE_LIBRARY_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
    )

    if(NOT OCTAVE_INCLUDE_RESULT EQUAL 0
        OR NOT OCTAVE_LIBRARY_RESULT EQUAL 0
        OR OCTAVE_INCLUDE_DIR STREQUAL ""
        OR OCTAVE_LIBRARY_DIR STREQUAL "")
        message(FATAL_ERROR "Nu pot determina caile de dezvoltare Octave.")
    endif()

    get_filename_component(
    OCTAVE_INCLUDE_PARENT
    "${OCTAVE_INCLUDE_DIR}"
    DIRECTORY
    )

    find_library(OCTAVE_LIBRARY
    NAMES octave
    HINTS "${OCTAVE_LIBRARY_DIR}"
    )

    find_library(OCTINTERP_LIBRARY
    NAMES octinterp
    HINTS "${OCTAVE_LIBRARY_DIR}"
    )

    if(NOT OCTAVE_LIBRARY OR NOT OCTINTERP_LIBRARY)
        message(FATAL_ERROR
        "Bibliotecile octave si octinterp nu au fost gasite."
        )
    endif()

endif()

set(PROJECT_SOURCES
main.cpp

drone_monitor.cpp
drone_monitor.h
drone_monitor.ui

servermanager.h
servermanager.cpp

security_helper.h
security_helper.cpp

database_manager.h
database_manager.cpp
sql_hex.h
sql_hex.h

authentification_service.h
authentification_service.cpp

classes.h
classes.cpp

json.hpp
json_communication.h

backend_worker.h
backend_worker.cpp

logger.h
logger.cpp
)

if(EDTH_WITH_OCTAVE)
    list(APPEND PROJECT_SOURCES
    math_functionalities.h
    math_functionalities.cpp
    )
endif()

list(APPEND PROJECT_SOURCES
    threat_analysis.cpp
    threat_analysis.h
    risk_geometry.h
)

if(QT_VERSION_MAJOR GREATER_EQUAL 6)
    qt_add_executable(EDTH_Hackathon
    MANUAL_FINALIZATION
    ${PROJECT_SOURCES}
    )
else()
    if(ANDROID)
        add_library(EDTH_Hackathon SHARED
        ${PROJECT_SOURCES}
        )
    else()
        add_executable(EDTH_Hackathon
        ${PROJECT_SOURCES}
        )
    endif()
endif()

if(EDTH_WITH_OCTAVE)
    target_compile_definitions(EDTH_Hackathon PRIVATE EDTH_WITH_OCTAVE_ENABLED=1)
    target_include_directories(EDTH_Hackathon PRIVATE
    "${OCTAVE_INCLUDE_DIR}"
    "${OCTAVE_INCLUDE_PARENT}"
    )

    target_link_libraries(EDTH_Hackathon PRIVATE "${OCTINTERP_LIBRARY}" "${OCTAVE_LIBRARY}")
endif()

target_link_libraries(EDTH_Hackathon PRIVATE
Qt${QT_VERSION_MAJOR}::Widgets
Qt${QT_VERSION_MAJOR}::Sql
Qt${QT_VERSION_MAJOR}::Network
OpenSSL::Crypto
)

if(QT_VERSION VERSION_LESS 6.1.0)
    set(BUNDLE_ID_OPTION
    MACOSX_BUNDLE_GUI_IDENTIFIER com.example.EDTH_Hackathon
    )
endif()

set_target_properties(EDTH_Hackathon PROPERTIES
${BUNDLE_ID_OPTION}
MACOSX_BUNDLE_BUNDLE_VERSION ${PROJECT_VERSION}
MACOSX_BUNDLE_SHORT_VERSION_STRING
${PROJECT_VERSION_MAJOR}.${PROJECT_VERSION_MINOR}
MACOSX_BUNDLE TRUE
WIN32_EXECUTABLE TRUE
)

include(GNUInstallDirs)

install(TARGETS EDTH_Hackathon
BUNDLE DESTINATION .
LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)

if(QT_VERSION_MAJOR EQUAL 6)
    qt_finalize_executable(EDTH_Hackathon)
endif()

include(CTest)
if(BUILD_TESTING)
    add_executable(edth_security_test tests/security_test.cpp security_helper.cpp security_helper.h)
    target_include_directories(edth_security_test PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
    target_link_libraries(edth_security_test PRIVATE Qt${QT_VERSION_MAJOR}::Core OpenSSL::Crypto)
    add_test(NAME security_helper_pbkdf2 COMMAND edth_security_test)
endif()

if(BUILD_TESTING)
    add_executable(edth_sql_hex_test tests/sql_hex_test.cpp)
    target_include_directories(edth_sql_hex_test PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
    target_link_libraries(edth_sql_hex_test PRIVATE Qt${QT_VERSION_MAJOR}::Core)
    add_test(NAME sql_hex_validation COMMAND edth_sql_hex_test)
endif()

if(BUILD_TESTING)
    add_executable(edth_threat_test tests/threat_analysis_test.cpp threat_analysis.cpp)
    target_include_directories(edth_threat_test PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
    target_link_libraries(edth_threat_test PRIVATE Qt${QT_VERSION_MAJOR}::Core)
    if(EDTH_WITH_OCTAVE)
        target_compile_definitions(edth_threat_test PRIVATE EDTH_WITH_OCTAVE_ENABLED=1)
        target_include_directories(edth_threat_test PRIVATE "${OCTAVE_INCLUDE_DIR}" "${OCTAVE_INCLUDE_PARENT}")
        target_link_libraries(edth_threat_test PRIVATE "${OCTINTERP_LIBRARY}" "${OCTAVE_LIBRARY}")
    endif()
    add_test(NAME threat_analysis_worker COMMAND edth_threat_test)
endif()
