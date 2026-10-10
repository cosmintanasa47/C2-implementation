CREATE DATABASE Winner_Drone_Detectio_System;
GO

USE Winner_Drone_Detectio_System;
GO

CREATE TABLE Users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(256) NOT NULL,
    salt varchar(64) Not null,
    is_online BIT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE User_Viewer (
    user_id INT PRIMARY KEY,
    alerted BIT NOT NULL DEFAULT 0,

    FOREIGN KEY (user_id) REFERENCES Users(id)
);
GO

CREATE TABLE User_Engager (
    user_id INT PRIMARY KEY,
    engage BIT NOT NULL DEFAULT 0,

    FOREIGN KEY (user_id) REFERENCES Users(id)
);
GO

CREATE TABLE Threat (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    threat_type VARCHAR(50) NOT NULL,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    height FLOAT,       -- metri
    speed FLOAT,        -- metri/secunda
    last_seen_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO


CREATE TABLE Position (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    delimitator INT NOT NULL DEFAULT 1000,
    longitude DECIMAL(9,6) NOT NULL,
    latitude DECIMAL(9,6) NOT NULL,

    CHECK (delimitator > 0),
    CHECK (longitude BETWEEN -180 AND 180),
    CHECK (latitude BETWEEN -90 AND 90)
);
GO


CREATE TABLE Sensor (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    nume VARCHAR(50) NOT NULL,
    sensor_type VARCHAR(50) NOT NULL, -- camera / radar
    description VARCHAR(1000),
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL
);
GO

CREATE TABLE Input_images (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    sensor_id BIGINT NOT NULL,
    drone_id BIGINT,
    image_path NVARCHAR(1000) NOT NULL,
    captured_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

    FOREIGN KEY (sensor_id) REFERENCES Sensor(id),
    FOREIGN KEY (drone_id) REFERENCES Drone(id)
);
GO

CREATE TABLE Input_radar (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    sensor_id BIGINT NOT NULL,
    drone_id BIGINT,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    height FLOAT,
    speed FLOAT,
    detected_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

    FOREIGN KEY (sensor_id) REFERENCES Sensor(id),
    FOREIGN KEY (drone_id) REFERENCES Drone(id)
);
GO

CREATE TABLE Critical_infrastructure (
    id INT IDENTITY(1,1) PRIMARY KEY,
    infrastructure_name NVARCHAR(150) NOT NULL,
    infrastructure_type NVARCHAR(100) NOT NULL,

    latitude_1 DECIMAL(9,6) NOT NULL,
    longitude_1 DECIMAL(9,6) NOT NULL,

    latitude_2 DECIMAL(9,6) NOT NULL,
    longitude_2 DECIMAL(9,6) NOT NULL,

    latitude_3 DECIMAL(9,6) NOT NULL,
    longitude_3 DECIMAL(9,6) NOT NULL,

    latitude_4 DECIMAL(9,6) NOT NULL,
    longitude_4 DECIMAL(9,6) NOT NULL,

    description NVARCHAR(1000)
);
GO

CREATE TABLE Ground_defence (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    infrastructure_id INT NOT NULL,
    defence_type VARCHAR(50) NOT NULL,
    operational BIT NOT NULL DEFAULT 0,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),

    FOREIGN KEY (infrastructure_id)
        REFERENCES Critical_infrastructure(id)
);
GO