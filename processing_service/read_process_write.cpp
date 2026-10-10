#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <optional>
#include <cstdint>
#include <sqlite3.h>
#include "nlohmann/json.hpp"

using json = nlohmann::json;

// ============================================================
//  Structuri brute, exact ca în DB
// ============================================================

struct User {
    int32_t     id;
    std::string username;
    bool        is_online;
    std::string created_at;   // păstrat ca text ISO-8601
};

struct Drone {
    int64_t                id;
    std::optional<double>  latitude;
    std::optional<double>  longitude;
    std::optional<double>  height;
    std::optional<double>  speed;
    std::string            last_seen_at;
};

struct Sensor {
    int64_t     id;
    std::string nume;
    std::string sensor_type;   // "camera" / "radar"
    double      latitude;
    double      longitude;
};

struct InputRadar {
    int64_t                id;
    int64_t                sensor_id;
    std::optional<int64_t> drone_id;
    double                 latitude;
    double                 longitude;
    std::optional<double>  height;
    std::optional<double>  speed;
    std::string            detected_at;
};

struct Infrastructure {
    int32_t     id;
    std::string infrastructure_name;
    std::string infrastructure_type;
    double      latitude_1,  longitude_1;
    double      latitude_2,  longitude_2;
    double      latitude_3,  longitude_3;
    double      latitude_4,  longitude_4;
};

struct GroundDefence {
    int64_t                id;
    int32_t                infrastructure_id;
    std::string            defence_type;
    bool                   operational;
    std::optional<double>  latitude;
    std::optional<double>  longitude;
};

// ============================================================
//  Serializare nlohmann/json (to_json)
//  Câmpurile opționale NULL din DB devin null în JSON.
// ============================================================

void to_json(json& j, const User& u) {
    j = json{
        {"id",         u.id},
        {"username",   u.username},
        {"is_online",  u.is_online},
        {"created_at", u.created_at}
    };
}

void to_json(json& j, const Drone& d) {
    j = json{
        {"id",           d.id},
        {"latitude",     d.latitude},
        {"longitude",    d.longitude},
        {"height",       d.height},
        {"speed",        d.speed},
        {"last_seen_at", d.last_seen_at}
    };
}

void to_json(json& j, const Sensor& s) {
    j = json{
        {"id",          s.id},
        {"nume",        s.nume},
        {"sensor_type", s.sensor_type},
        {"latitude",    s.latitude},
        {"longitude",   s.longitude}
    };
}

void to_json(json& j, const InputRadar& r) {
    j = json{
        {"id",          r.id},
        {"sensor_id",   r.sensor_id},
        {"drone_id",    r.drone_id},
        {"latitude",    r.latitude},
        {"longitude",   r.longitude},
        {"height",      r.height},
        {"speed",       r.speed},
        {"detected_at", r.detected_at}
    };
}

void to_json(json& j, const Infrastructure& i) {
    j = json{
        {"id",                  i.id},
        {"infrastructure_name", i.infrastructure_name},
        {"infrastructure_type", i.infrastructure_type},
        {"latitude_1",  i.latitude_1},  {"longitude_1", i.longitude_1},
        {"latitude_2",  i.latitude_2},  {"longitude_2", i.longitude_2},
        {"latitude_3",  i.latitude_3},  {"longitude_3", i.longitude_3},
        {"latitude_4",  i.latitude_4},  {"longitude_4", i.longitude_4}
    };
}

void to_json(json& j, const GroundDefence& g) {
    j = json{
        {"id",                g.id},
        {"infrastructure_id", g.infrastructure_id},
        {"defence_type",      g.defence_type},
        {"operational",       g.operational},
        {"latitude",          g.latitude},
        {"longitude",         g.longitude}
    };
}

// Snapshot-ul complet
struct Snapshot {
    std::vector<User>           users;
    std::vector<Drone>          drones;
    std::vector<Sensor>         sensors;
    std::vector<InputRadar>     input_radar;
    std::vector<Infrastructure> infrastructure;
    std::vector<GroundDefence>  ground_defence;
};

void to_json(json& j, const Snapshot& s) {
    j = json{
        {"users",          s.users},
        {"drones",         s.drones},
        {"sensors",        s.sensors},
        {"input_radar",    s.input_radar},
        {"infrastructure", s.infrastructure},
        {"ground_defence", s.ground_defence}
    };
}

// ============================================================
//  Helper-e pentru citirea coloanelor SQLite (NULL-safe)
// ============================================================

// Text -> std::string (gol dacă e NULL)
static std::string col_text(sqlite3_stmt* stmt, int col) {
    const unsigned char* p = sqlite3_column_text(stmt, col);
    return p ? reinterpret_cast<const char*>(p) : "";
}

// REAL -> double, cu valoare implicită dacă NULL
static double col_double(sqlite3_stmt* stmt, int col, double def = 0.0) {
    if (sqlite3_column_type(stmt, col) == SQLITE_NULL) return def;
    return sqlite3_column_double(stmt, col);
}

// INTEGER -> int64, cu valoare implicită dacă NULL
static int64_t col_int64(sqlite3_stmt* stmt, int col, int64_t def = 0) {
    if (sqlite3_column_type(stmt, col) == SQLITE_NULL) return def;
    return sqlite3_column_int64(stmt, col);
}

// INTEGER -> int32
static int32_t col_int(sqlite3_stmt* stmt, int col, int32_t def = 0) {
    return static_cast<int32_t>(col_int64(stmt, col, def));
}

// Coloană opțională REAL (nullptr în JSON dacă e NULL în DB)
static std::optional<double> col_double_opt(sqlite3_stmt* stmt, int col) {
    if (sqlite3_column_type(stmt, col) == SQLITE_NULL) return std::nullopt;
    return sqlite3_column_double(stmt, col);
}

// Coloană opțională INTEGER
static std::optional<int64_t> col_int64_opt(sqlite3_stmt* stmt, int col) {
    if (sqlite3_column_type(stmt, col) == SQLITE_NULL) return std::nullopt;
    return sqlite3_column_int64(stmt, col);
}

// BIT (0/1) -> bool
static bool col_bool(sqlite3_stmt* stmt, int col, bool def = false) {
    if (sqlite3_column_type(stmt, col) == SQLITE_NULL) return def;
    return sqlite3_column_int(stmt, col) != 0;
}

// ============================================================
//  Query-uri simple, unul per tabelă
// ============================================================

static const char* Q_USERS =
    "SELECT id, username, is_online, created_at FROM Users";

static const char* Q_DRONES =
    "SELECT id, latitude, longitude, height, speed, last_seen_at FROM Drone";

static const char* Q_SENSORS =
    "SELECT id, nume, sensor_type, latitude, longitude FROM Sensor";

static const char* Q_RADAR =
    "SELECT id, sensor_id, drone_id, latitude, longitude, height, speed, detected_at "
    "FROM Input_radar";

static const char* Q_INFRA =
    "SELECT id, infrastructure_name, infrastructure_type, "
    "       latitude_1, longitude_1, latitude_2, longitude_2, "
    "       latitude_3, longitude_3, latitude_4, longitude_4 "
    "FROM Critical_infrastructure";

static const char* Q_DEFENCE =
    "SELECT id, infrastructure_id, defence_type, operational, latitude, longitude "
    "FROM Ground_defence";

// ============================================================
//  Citire per tabelă
// ============================================================

// Macro ca să nu repetăm pattern-ul prepare/step/finalize de 6 ori.
// Fiecare `fn` primește un `sqlite3_stmt*` și întoarce un obiect din rândul curent.
#define LOAD_TABLE(fn, query, out_vec, row_builder)                     \
    do {                                                                \
        sqlite3_stmt* stmt = nullptr;                                   \
        if (sqlite3_prepare_v2(db, query, -1, &stmt, nullptr) != SQLITE_OK) { \
            std::cerr << "prepare failed: " << sqlite3_errmsg(db)       \
                      << " [" << query << "]\n";                        \
            return false;                                               \
        }                                                               \
        while (sqlite3_step(stmt) == SQLITE_ROW) {                      \
            out_vec.push_back(row_builder);                             \
        }                                                               \
        sqlite3_finalize(stmt);                                         \
    } while (0)

static bool load_users(sqlite3* db, std::vector<User>& out) {
    LOAD_TABLE(load_users, Q_USERS, out, (User{
        col_int(stmt, 0),
        col_text(stmt, 1),
        col_bool(stmt, 2),
        col_text(stmt, 3)
    }));
    return true;
}

static bool load_drones(sqlite3* db, std::vector<Drone>& out) {
    LOAD_TABLE(load_drones, Q_DRONES, out, (Drone{
        col_int64(stmt, 0),
        col_double_opt(stmt, 1),
        col_double_opt(stmt, 2),
        col_double_opt(stmt, 3),
        col_double_opt(stmt, 4),
        col_text(stmt, 5)
    }));
    return true;
}

static bool load_sensors(sqlite3* db, std::vector<Sensor>& out) {
    LOAD_TABLE(load_sensors, Q_SENSORS, out, (Sensor{
        col_int64(stmt, 0),
        col_text(stmt, 1),
        col_text(stmt, 2),
        col_double(stmt, 3),
        col_double(stmt, 4)
    }));
    return true;
}

static bool load_radar(sqlite3* db, std::vector<InputRadar>& out) {
    LOAD_TABLE(load_radar, Q_RADAR, out, (InputRadar{
        col_int64(stmt, 0),
        col_int64(stmt, 1),
        col_int64_opt(stmt, 2),
        col_double(stmt, 3),
        col_double(stmt, 4),
        col_double_opt(stmt, 5),
        col_double_opt(stmt, 6),
        col_text(stmt, 7)
    }));
    return true;
}

static bool load_infra(sqlite3* db, std::vector<Infrastructure>& out) {
    LOAD_TABLE(load_infra, Q_INFRA, out, (Infrastructure{
        col_int(stmt, 0),
        col_text(stmt, 1),
        col_text(stmt, 2),
        col_double(stmt, 3),  col_double(stmt, 4),
        col_double(stmt, 5),  col_double(stmt, 6),
        col_double(stmt, 7),  col_double(stmt, 8),
        col_double(stmt, 9),  col_double(stmt, 10)
    }));
    return true;
}

static bool load_defence(sqlite3* db, std::vector<GroundDefence>& out) {
    LOAD_TABLE(load_defence, Q_DEFENCE, out, (GroundDefence{
        col_int64(stmt, 0),
        col_int(stmt, 1),
        col_text(stmt, 2),
        col_bool(stmt, 3),
        col_double_opt(stmt, 4),
        col_double_opt(stmt, 5)
    }));
    return true;
}

// ============================================================
//  main
// ============================================================

int main() {
    sqlite3* db = nullptr;

    // Deschide baza SQLite. Fișierul trebuie să existe deja.
    if (sqlite3_open("Winner_Drone_Detectio_System.db", &db) != SQLITE_OK) {
        std::cerr << "Nu pot deschide baza: " << sqlite3_errmsg(db) << "\n";
        sqlite3_close(db);
        return 1;
    }

    Snapshot snap;
    bool ok = true;

    ok &= load_users(db, snap.users);
    ok &= load_drones(db, snap.drones);
    ok &= load_sensors(db, snap.sensors);
    ok &= load_radar(db, snap.input_radar);
    ok &= load_infra(db, snap.infrastructure);
    ok &= load_defence(db, snap.ground_defence);

    sqlite3_close(db);

    if (!ok) {
        std::cerr << "Una sau mai multe interogări au eșuat.\n";
        return 1;
    }

    // Scrie tot ca JSON pretty-printed
    std::ofstream out("snapshot.json");
    if (!out) {
        std::cerr << "Nu pot scrie snapshot.json\n";
        return 1;
    }
    out << json(snap).dump(4) << "\n";

    std::cout << "Exportat: "
              << snap.users.size()          << " users, "
              << snap.drones.size()         << " drones, "
              << snap.sensors.size()        << " sensors, "
              << snap.input_radar.size()    << " radar, "
              << snap.infrastructure.size() << " infra, "
              << snap.ground_defence.size() << " defence\n";

    return 0;
}
