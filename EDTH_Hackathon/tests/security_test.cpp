#include "security_helper.h"
#include <QCoreApplication>
#include <iostream>
int main(int argc,char **argv) {
    QCoreApplication app(argc,argv);
    security_helper security;
    const std::string salt="000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    const std::string password=u8"parolă-test";
    const std::string expected="f0e26adc52984b244e0f65590730d481d5bcf34b09f498e1320cdee5f8fa402f";
    if(security.generate_hash(password,salt)!=expected) return 1;
    if(!security.verify_hashed_password(expected,salt,password)) return 2;
    if(security.verify_hashed_password(expected,salt,"wrong")) return 3;
    if(!security.generate_hash(password,"invalid").empty()) return 4;
    if(security.generate_salt().size()!=64) return 5;
    std::cout << "PBKDF2 matches the Python hashlib reference vector.\n";
    return 0;
}
