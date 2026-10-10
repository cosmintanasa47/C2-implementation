#pragma once
#include <QString>
#include <stdexcept>

// Only internally generated SHA-256/salt hex is permitted in this SQL fragment.
// Usernames, passwords and all other user input remain bound parameters.
inline QString sql_hex64(const QString &hex)
{
    if (hex.size() != 64)
        throw std::invalid_argument("Expected 64 hex characters");
    for (const QChar c : hex) {
        if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') ||
              (c >= 'A' && c <= 'F')))
            throw std::invalid_argument("Invalid hex character");
    }
    // A 32-byte binary SQL literal is converted server-side to exactly 64
    // ASCII hex characters (style 2). No ODBC text/binary parameter inference.
    return "LOWER(CONVERT(varchar(64), 0x" + hex + ", 2))";
}
