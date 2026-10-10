#ifndef LOGGER_H
#define LOGGER_H

#include <string>

class Logger
{
public:
    static Logger& getInstance();

    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;

    Logger(Logger&&) = delete;
    Logger& operator=(Logger&&) = delete;


private:
    std::string last_message;
    void logger_set_message(std::string message);
    std::string logger_get_message();
    Logger();
    ~Logger() = default;
};

#endif // LOGGER_H