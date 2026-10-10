#include "sql_hex.h"
#include <iostream>
int main()
{
    const QString hex = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    if (sql_hex64(hex) != "LOWER(CONVERT(varchar(64), 0x" + hex + ", 2))") return 1;
    for (const QString &bad : {QString(), hex.left(63), hex + "0", QString(64, '\''), QString(64, 'g')}) {
        try { sql_hex64(bad); return 2; }
        catch (const std::invalid_argument &) {}
    }
    std::cout << "Hex SQL encoder rejects malformed values and preserves 32 bytes.\n";
}
