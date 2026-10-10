#ifndef SECURITY_HELPER_H
#define SECURITY_HELPER_H

#include <string>

class security_helper
{
public:
    security_helper() = default;
    ~security_helper() = default;

    std::string generate_salt();

    std::string generate_hash(
        const std::string &password,
        const std::string &salt
        );

    bool verify_hashed_password(
        const std::string &hashed_password,
        const std::string &salt,
        const std::string &password
        );

private:
    static constexpr int ITERATIONS = 600000;
    static constexpr int SALT_BYTES = 32;
    static constexpr int HASH_BYTES = 32;
};

#endif // SECURITY_HELPER_H