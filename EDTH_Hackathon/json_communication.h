#include <string>
#include "nlohmann/json.hpp"

using json = nlohmann::json;


// ============================================================
// 3. STRUCTURI DB (reflecta schema SQLite)
// ============================================================

struct ThreatRow {
    int64_t                id;
    std::string            threat_type;
    std::optional<double>  latitude;
    std::optional<double>  longitude;
    std::optional<double>  height;
    std::optional<double>  speed;
    std::string            last_seen_at;
};

struct Sensor {
    int64_t     id;
    std::string nume;
    std::string sensor_type;
    double      latitude;
    double      longitude;
};

struct InputRadar {
    int64_t                id;
    int64_t                sensor_id;
    std::optional<int64_t> threat_id;      // FK -> Threat.id
    double                 latitude;
    double                 longitude;
    std::optional<double>  height;
    std::optional<double>  speed;
    std::string            detected_at;
};

struct Infrastructure {
    int32_t     id;
    std::string name;
    std::string type;
    double      lat1, lon1, lat2, lon2, lat3, lon3, lat4, lon4;
};

struct GroundDefence {
    int64_t                id;
    int32_t                infrastructure_id;
    std::string            defence_type;
    bool                   operational;
    std::optional<double>  latitude;
    std::optional<double>  longitude;
};

struct PositionZone {
    int64_t id;
    int32_t delimitator;   // raza in metri
    double  latitude;
    double  longitude;
};

// ---- Structuri interne (rezultat al calculelor) ----

struct ThreatPosition {
    int64_t                id;
    double                 latitude;
    double                 longitude;
    std::optional<double>  height;
    std::optional<double>  speed;
    std::string            seen_at;
    std::optional<double>  bearing_deg;
};

struct RiskEval {
    int64_t     threat_id;
    int32_t     infra_id;
    std::string infra_name;
    std::string infra_type;
    double      distance_m;
    bool        inside;
    double      importance;
    double      speed_mps;
    double      coefficient;
};

// ============================================================
// 4. STRUCTURI JSON PENTRU INTERFATA
// ============================================================

// ---- Server -> Interfata : Amenintare ----
struct Threat {
    std::string threat_type;
    float       latitude_sensor;
    float       longitude_sensor;
    std::string sensor_type;
    std::string drone_type;
    std::vector<std::string> top_interceptors;
};

// ---- Server -> Interfata : Punct de harta (trimis continuu) ----
struct MapPoint {
    float latitude;
    float longitude;
};

// ---- Interfata -> Server : Cerere de login ----
struct LoginRequest {
    std::string username;
    std::string password;
};

// ---- Server -> Interfata : Raspuns login ----
struct LoginResponse {
    bool accepted;
};

// ---- Interfata -> Server : Comanda de lansare interceptor ----
struct LaunchCommand {
    bool        launch;
    std::string interceptor_name;
};

// to_json DOAR pentru cele trimise de server catre interfata.
inline void to_json(json& j, const Threat& t) {
    j = json{
        {"threat_type",       t.threat_type},
        {"latitude_sensor",   t.latitude_sensor},
        {"longitude_sensor",  t.longitude_sensor},
        {"sensor_type",       t.sensor_type},
        {"drone_type",        t.drone_type},
        {"top_interceptors",  t.top_interceptors}
    };
}

inline void to_json(json& j, const MapPoint& p) {
    j = json{
        {"latitude",  p.latitude},
        {"longitude", p.longitude}
    };
}

// from_json pentru cele primite de server.
inline void from_json(const json& j, LoginRequest& r) {
    j.at("username").get_to(r.username);
    j.at("password").get_to(r.password);
}

inline void from_json(const json& j, LaunchCommand& c) {
    j.at("launch").get_to(c.launch);
    j.at("interceptor_name").get_to(c.interceptor_name);
}
