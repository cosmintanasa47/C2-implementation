#ifndef JSON_COMUNICATION_H
#define JSON_COMUNICATION_H

#include <string>
#include <vector>
#include <optional>
#include <cstdint>

#include "json.hpp"

namespace communication {

using json = nlohmann::json;

// ==================== DATE DB ====================

struct ThreatRow {
    std::int64_t id = 0;
    std::string threat_type;
    std::optional<double> latitude;
    std::optional<double> longitude;
    std::optional<double> height;
    std::optional<double> speed;
    std::string last_seen_at;
};

struct Sensor {
    std::int64_t id = 0;
    std::string nume;
    std::string sensor_type;
    double latitude = 0.0;
    double longitude = 0.0;
};

struct InputRadar {
    std::int64_t id = 0;
    std::int64_t sensor_id = 0;
    std::optional<std::int64_t> threat_id;
    double latitude = 0.0;
    double longitude = 0.0;
    std::optional<double> height;
    std::optional<double> speed;
    std::string detected_at;
};

struct Infrastructure {
    std::int32_t id = 0;
    std::string name;
    std::string type;

    double lat1 = 0.0;
    double lon1 = 0.0;
    double lat2 = 0.0;
    double lon2 = 0.0;
    double lat3 = 0.0;
    double lon3 = 0.0;
    double lat4 = 0.0;
    double lon4 = 0.0;
};

struct GroundDefence {
    std::int64_t id = 0;
    std::int32_t infrastructure_id = 0;
    std::string defence_type;
    bool operational = false;
    std::optional<double> latitude;
    std::optional<double> longitude;
};

struct PositionZone {
    std::int64_t id = 0;
    std::int32_t delimitator = 1000;
    double latitude = 0.0;
    double longitude = 0.0;
};

// ==================== REZULTATE INTERNE ====================

struct ThreatPosition {
    std::int64_t id = 0;
    double latitude = 0.0;
    double longitude = 0.0;
    std::optional<double> height;
    std::optional<double> speed;
    std::string seen_at;
    std::optional<double> bearing_deg;
};

struct RiskEval {
    std::int64_t threat_id = 0;
    std::int32_t infra_id = 0;
    std::string infra_name;
    std::string infra_type;
    double distance_m = 0.0;
    bool inside = false;
    double importance = 0.0;
    double speed_mps = 0.0;
    double coefficient = 0.0;
};

// ==================== MESAJE ====================

struct Threat {
    std::string threat_type;
    float latitude_sensor = 0.0f;
    float longitude_sensor = 0.0f;
    std::string sensor_type;
    std::string drone_type;
    std::vector<std::string> top_interceptors;
};

struct MapPoint {
    float latitude = 0.0f;
    float longitude = 0.0f;
};

struct LoginRequest {
    std::string username;
    std::string password;
};

struct LoginResponse {
    bool accepted = false;
};

struct LaunchCommand {
    bool launch = false;
    std::string interceptor_name;
};

// ==================== SERVER -> INTERFATA ====================

inline void to_json(json &j, const Threat &t)
{
    j = json{
        {"threat_type", t.threat_type},
        {"latitude_sensor", t.latitude_sensor},
        {"longitude_sensor", t.longitude_sensor},
        {"sensor_type", t.sensor_type},
        {"drone_type", t.drone_type},
        {"top_interceptors", t.top_interceptors}
    };
}

inline void to_json(json &j, const MapPoint &p)
{
    j = json{
        {"latitude", p.latitude},
        {"longitude", p.longitude}
    };
}

inline void to_json(json &j, const LoginResponse &response)
{
    j = json{
        {"accepted", response.accepted}
    };
}

// ==================== INTERFATA -> SERVER ====================

inline void from_json(const json &j, LoginRequest &request)
{
    j.at("username").get_to(request.username);
    j.at("password").get_to(request.password);
}

inline void from_json(const json &j, LaunchCommand &command)
{
    j.at("launch").get_to(command.launch);
    j.at("interceptor_name").get_to(command.interceptor_name);
}

} // namespace communication

#endif // JSON_COMUNICATION_H