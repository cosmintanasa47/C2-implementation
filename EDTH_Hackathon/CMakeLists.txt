cmake_minimum_required(VERSION 3.16)

project(EDTH_Hackathon VERSION 0.1 LANGUAGES CXX)

set(CMAKE_AUTOUIC ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(QT NAMES Qt6 Qt5 REQUIRED COMPONENTS Widgets Sql Network)
find_package(Qt${QT_VERSION_MAJOR} REQUIRED COMPONENTS Widgets Sql Network)

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

    authentification_service.h
    authentification_service.cpp
)

if(QT_VERSION_MAJOR GREATER_EQUAL 6)
    qt_add_executable(EDTH_Hackathon
        MANUAL_FINALIZATION
        ${PROJECT_SOURCES}
        classes.h classes.cpp
        json.hpp
        json_communication.h
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

target_link_libraries(EDTH_Hackathon PRIVATE
    Qt${QT_VERSION_MAJOR}::Widgets
    Qt${QT_VERSION_MAJOR}::Sql
    Qt${QT_VERSION_MAJOR}::Network
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