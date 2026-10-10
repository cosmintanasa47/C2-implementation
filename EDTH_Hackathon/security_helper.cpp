#include "security_helper.h"

#include <QByteArray>
#include <QCryptographicHash>
#include <QMessageAuthenticationCode>
#include <QRandomGenerator>

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

QByteArray hmac_sha256(
    const QByteArray &key,
    const QByteArray &data)
{
    return QMessageAuthenticationCode::hash(
        data,
        key,
        QCryptographicHash::Sha256
        );
}

// Produce 32 de octeti: un singur bloc PBKDF2-HMAC-SHA256.
QByteArray derive_hash(
    const QByteArray &password,
    const QByteArray &salt,
    int iterations)
{
    // Indexul blocului 1, codificat pe 4 octeti big-endian.
    QByteArray first_input = salt;
    first_input.append('\0');
    first_input.append('\0');
    first_input.append('\0');
    first_input.append('\x01');

    QByteArray current = hmac_sha256(password, first_input);

    if (current.size() != 32)
        return {};

    QByteArray result = current;

    for (int iteration = 1; iteration < iterations; ++iteration) {
        current = hmac_sha256(password, current);

        if (current.size() != 32)
            return {};

        for (int i = 0; i < 32; ++i) {
            result[i] = static_cast<char>(
                static_cast<unsigned char>(result.at(i)) ^
                static_cast<unsigned char>(current.at(i))
                );
        }
    }

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