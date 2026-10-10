#include "security_helper.h"

#include <QByteArray>
#include <QRandomGenerator>
#include <openssl/evp.h>

namespace {

bool valid_hex(const std::string &value, std::size_t length)
{
    if (value.size() != length)
        return false;

    for (char c : value) {
        const bool valid =
            (c >= '0' && c <= '9') ||
            (c >= 'a' && c <= 'f') ||
            (c >= 'A' && c <= 'F');

        if (!valid)
            return false;
    }

    return true;
}

// Produce 32 de octeti: un singur bloc PBKDF2-HMAC-SHA256.
QByteArray derive_hash(
    const QByteArray &password,
    const QByteArray &salt,
    int iterations)
{
    QByteArray result(32, '\0');
    if (PKCS5_PBKDF2_HMAC(password.constData(), password.size(),
                         reinterpret_cast<const unsigned char *>(salt.constData()), salt.size(),
                         iterations, EVP_sha256(), result.size(),
                         reinterpret_cast<unsigned char *>(result.data())) != 1) return {};

    return result;
}

}

std::string security_helper::generate_salt()
{
    QByteArray salt(SALT_BYTES, '\0');

    for (int i = 0; i < SALT_BYTES; ++i) {
        salt[i] = static_cast<char>(
            QRandomGenerator::system()->generate() & 0xFFu
            );
    }

    return salt.toHex().toStdString();
}

std::string security_helper::generate_hash(
    const std::string &password,
    const std::string &salt)
{
    if (!valid_hex(salt, SALT_BYTES * 2))
        return {};

    const QByteArray salt_bytes = QByteArray::fromHex(
        QByteArray::fromStdString(salt)
        );

    const QByteArray hash = derive_hash(
        QByteArray::fromStdString(password),
        salt_bytes,
        ITERATIONS
        );

    if (hash.size() != HASH_BYTES)
        return {};

    return hash.toHex().toStdString();
}

bool security_helper::verify_hashed_password(
    const std::string &hashed_password,
    const std::string &salt,
    const std::string &password)
{
    if (!valid_hex(hashed_password, HASH_BYTES * 2))
        return false;

    const std::string calculated_hash =
        generate_hash(password, salt);

    if (calculated_hash.empty())
        return false;

    const QByteArray expected = QByteArray::fromHex(
        QByteArray::fromStdString(hashed_password)
        );

    const QByteArray calculated = QByteArray::fromHex(
        QByteArray::fromStdString(calculated_hash)
        );

    unsigned int difference = 0;

    for (int i = 0; i < HASH_BYTES; ++i) {
        difference |=
            static_cast<unsigned char>(expected.at(i)) ^
            static_cast<unsigned char>(calculated.at(i));
    }

    return difference == 0;
}