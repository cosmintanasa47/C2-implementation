#ifndef CLASSES_H
#define CLASSES_H

#include <QString>
#include <QDateTime>
#include <QtGlobal>

#include <memory>
#include <optional>
#include <stdexcept>

// ==================== USERS ====================

class User
{
public:
    User() = default;
    virtual ~User() = default;

    int get_id() const { return id; }
    void set_id(int value) { id = value; }

    const QString &get_username() const { return username; }
    void set_username(const QString &value) { username = value; }

    const QString &get_password_hash() const { return password_hash; }
    void set_password_hash(const QString &value) { password_hash = value; }

    const QString &get_salt() const { return salt; }
    void set_salt(const QString &value) { salt = value; }

    bool get_is_online() const { return is_online; }
    void set_is_online(bool value) { is_online = value; }

    const QDateTime &get_created_at() const { return created_at; }
    void set_created_at(const QDateTime &value) { created_at = value; }

private:
    int id = 0;
    QString username;
    QString password_hash;
    QString salt;
    bool is_online = false;
    QDateTime created_at;
};

class User_Admin : public User
{
public:
    User_Admin() = default;
    ~User_Admin() override = default;
};

class User_Viewer : public User
{
public:
    User_Viewer() = default;
    ~User_Viewer() override = default;

    bool get_alerted() const { return alerted; }
    void set_alerted(bool value) { alerted = value; }

private:
    bool alerted = false;
};

class User_Engager : public User
{
public:
    User_Engager() = default;
    ~User_Engager() override = default;

    bool get_engage() const { return engage; }
    void set_engage(bool value) { engage = value; }

private:
    bool engage = false;
};

// ==================== USER FACTORY ====================

enum class UserType
{
    Viewer,
    Engager,
    Admin
};

class UserFactory
{
public:
    UserFactory() = default;
    ~UserFactory() = default;

    static std::unique_ptr<User> create_user(UserType type)
    {
        switch (type) {
        case UserType::Viewer:
            return std::make_unique<User_Viewer>();

        case UserType::Engager:
            return std::make_unique<User_Engager>();

        case UserType::Admin:
            return std::make_unique<User_Admin>();
        }

        throw std::invalid_argument("Tip de utilizator invalid.");
    }
};

// ==================== DRONE ====================

class Drone
{
public:
    Drone() = default;
    ~Drone() = default;

    qint64 get_id() const { return id; }
    void set_id(qint64 value) { id = value; }

    std::optional<double> get_latitude() const { return latitude; }
    void set_latitude(std::optional<double> value) { latitude = value; }

    std::optional<double> get_longitude() const { return longitude; }
    void set_longitude(std::optional<double> value) { longitude = value; }

    std::optional<double> get_height() const { return height; }
    void set_height(std::optional<double> value) { height = value; }

    std::optional<double> get_speed() const { return speed; }
    void set_speed(std::optional<double> value) { speed = value; }

    const QDateTime &get_last_seen_at() const { return last_seen_at; }
    void set_last_seen_at(const QDateTime &value) { last_seen_at = value; }

private:
    qint64 id = 0;
    std::optional<double> latitude;
    std::optional<double> longitude;
    std::optional<double> height;
    std::optional<double> speed;
    QDateTime last_seen_at;
};

// ==================== POSITION ====================

class Position
{
public:
    Position() = default;
    ~Position() = default;

    qint64 get_id() const { return id; }
    void set_id(qint64 value) { id = value; }

    int get_delimitator() const { return delimitator; }
    void set_delimitator(int value) { delimitator = value; }

    double get_longitude() const { return longitude; }
    void set_longitude(double value) { longitude = value; }

    double get_latitude() const { return latitude; }
    void set_latitude(double value) { latitude = value; }

private:
    qint64 id = 0;
    int delimitator = 1000;
    double longitude = 0.0;
    double latitude = 0.0;
};

// ==================== SENSOR ====================

class Sensor
{
public:
    Sensor() = default;
    ~Sensor() = default;

    qint64 get_id() const { return id; }
    void set_id(qint64 value) { id = value; }

    const QString &get_nume() const { return nume; }
    void set_nume(const QString &value) { nume = value; }

    const QString &get_sensor_type() const { return sensor_type; }
    void set_sensor_type(const QString &value) { sensor_type = value; }

    const std::optional<QString> &get_description() const
    {
        return description;
    }

    void set_description(const std::optional<QString> &value)
    {
        description = value;
    }

    double get_latitude() const { return latitude; }
    void set_latitude(double value) { latitude = value; }

    double get_longitude() const { return longitude; }
    void set_longitude(double value) { longitude = value; }

private:
    qint64 id = 0;
    QString nume;
    QString sensor_type;
    std::optional<QString> description;
    double latitude = 0.0;
    double longitude = 0.0;
};

// ==================== INPUT IMAGES ====================

class Input_images
{
public:
    Input_images() = default;
    ~Input_images() = default;

    qint64 get_id() const { return id; }
    void set_id(qint64 value) { id = value; }

    qint64 get_sensor_id() const { return sensor_id; }
    void set_sensor_id(qint64 value) { sensor_id = value; }

    std::optional<qint64> get_drone_id() const { return drone_id; }
    void set_drone_id(std::optional<qint64> value) { drone_id = value; }

    const QString &get_image_path() const { return image_path; }
    void set_image_path(const QString &value) { image_path = value; }

    const QDateTime &get_captured_at() const { return captured_at; }
    void set_captured_at(const QDateTime &value) { captured_at = value; }

private:
    qint64 id = 0;
    qint64 sensor_id = 0;
    std::optional<qint64> drone_id;
    QString image_path;
    QDateTime captured_at;
};

// ==================== INPUT RADAR ====================

class Input_radar
{
public:
    Input_radar() = default;
    ~Input_radar() = default;

    qint64 get_id() const { return id; }
    void set_id(qint64 value) { id = value; }

    qint64 get_sensor_id() const { return sensor_id; }
    void set_sensor_id(qint64 value) { sensor_id = value; }

    std::optional<qint64> get_drone_id() const { return drone_id; }
    void set_drone_id(std::optional<qint64> value) { drone_id = value; }

    double get_latitude() const { return latitude; }
    void set_latitude(double value) { latitude = value; }

    double get_longitude() const { return longitude; }
    void set_longitude(double value) { longitude = value; }

    std::optional<double> get_height() const { return height; }
    void set_height(std::optional<double> value) { height = value; }

    std::optional<double> get_speed() const { return speed; }
    void set_speed(std::optional<double> value) { speed = value; }

    const QDateTime &get_detected_at() const { return detected_at; }
    void set_detected_at(const QDateTime &value) { detected_at = value; }

private:
    qint64 id = 0;
    qint64 sensor_id = 0;
    std::optional<qint64> drone_id;
    double latitude = 0.0;
    double longitude = 0.0;
    std::optional<double> height;
    std::optional<double> speed;
    QDateTime detected_at;
};

// ==================== CRITICAL INFRASTRUCTURE ====================

class Critical_infrastructure
{
public:
    Critical_infrastructure() = default;
    ~Critical_infrastructure() = default;

    int get_id() const { return id; }
    void set_id(int value) { id = value; }

    const QString &get_infrastructure_name() const
    {
        return infrastructure_name;
    }

    void set_infrastructure_name(const QString &value)
    {
        infrastructure_name = value;
    }

    const QString &get_infrastructure_type() const
    {
        return infrastructure_type;
    }

    void set_infrastructure_type(const QString &value)
    {
        infrastructure_type = value;
    }

    double get_latitude_1() const { return latitude_1; }
    void set_latitude_1(double value) { latitude_1 = value; }

    double get_longitude_1() const { return longitude_1; }
    void set_longitude_1(double value) { longitude_1 = value; }

    double get_latitude_2() const { return latitude_2; }
    void set_latitude_2(double value) { latitude_2 = value; }

    double get_longitude_2() const { return longitude_2; }
    void set_longitude_2(double value) { longitude_2 = value; }

    double get_latitude_3() const { return latitude_3; }
    void set_latitude_3(double value) { latitude_3 = value; }

    double get_longitude_3() const { return longitude_3; }
    void set_longitude_3(double value) { longitude_3 = value; }

    double get_latitude_4() const { return latitude_4; }
    void set_latitude_4(double value) { latitude_4 = value; }

    double get_longitude_4() const { return longitude_4; }
    void set_longitude_4(double value) { longitude_4 = value; }

    const std::optional<QString> &get_description() const
    {
        return description;
    }

    void set_description(const std::optional<QString> &value)
    {
        description = value;
    }

    std::optional<int> get_population_estimate() const
    {
        return population_estimate;
    }

    void set_population_estimate(std::optional<int> value)
    {
        population_estimate = value;
    }

private:
    int id = 0;
    QString infrastructure_name;
    QString infrastructure_type;

    double latitude_1 = 0.0;
    double longitude_1 = 0.0;

    double latitude_2 = 0.0;
    double longitude_2 = 0.0;

    double latitude_3 = 0.0;
    double longitude_3 = 0.0;

    double latitude_4 = 0.0;
    double longitude_4 = 0.0;

    std::optional<QString> description;
    std::optional<int> population_estimate;
};

// ==================== GROUND DEFENCE ====================

class Ground_defence
{
public:
    Ground_defence() = default;
    ~Ground_defence() = default;

    qint64 get_id() const { return id; }
    void set_id(qint64 value) { id = value; }

    int get_infrastructure_id() const { return infrastructure_id; }
    void set_infrastructure_id(int value) { infrastructure_id = value; }

    const QString &get_defence_type() const { return defence_type; }
    void set_defence_type(const QString &value) { defence_type = value; }

    bool get_operational() const { return operational; }
    void set_operational(bool value) { operational = value; }

    std::optional<double> get_latitude() const { return latitude; }
    void set_latitude(std::optional<double> value) { latitude = value; }

    std::optional<double> get_longitude() const { return longitude; }
    void set_longitude(std::optional<double> value) { longitude = value; }

private:
    qint64 id = 0;
    int infrastructure_id = 0;
    QString defence_type;
    bool operational = false;
    std::optional<double> latitude;
    std::optional<double> longitude;
};

#endif // CLASSES_H