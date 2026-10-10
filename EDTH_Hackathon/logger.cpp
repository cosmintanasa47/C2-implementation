#include "logger.h"

Logger::Logger()
{
}

Logger& Logger::getInstance()
{
    static Logger instance;
    return instance;
}