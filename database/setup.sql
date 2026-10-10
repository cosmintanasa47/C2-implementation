-- Executa in SQL Server / sqlcmd. Idempotent: nu sterge datele existente.
IF DB_ID(N'Winner_Drone_Detectio_System') IS NULL
    CREATE DATABASE Winner_Drone_Detectio_System;
GO

USE Winner_Drone_Detectio_System;
GO

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
CREATE TABLE Users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(256) NOT NULL,
    salt varchar(64) Not null,
    is_online BIT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID(N'dbo.User_Viewer', N'U') IS NULL
CREATE TABLE User_Viewer (
    user_id INT PRIMARY KEY,
    alerted BIT NOT NULL DEFAULT 0,

    FOREIGN KEY (user_id) REFERENCES Users(id)
);
GO

IF OBJECT_ID(N'dbo.User_Engager', N'U') IS NULL
CREATE TABLE User_Engager (
    user_id INT PRIMARY KEY,
    engage BIT NOT NULL DEFAULT 0,

    FOREIGN KEY (user_id) REFERENCES Users(id)
);
GO

IF OBJECT_ID(N'dbo.Threat', N'U') IS NULL
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


IF OBJECT_ID(N'dbo.Position', N'U') IS NULL
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


IF OBJECT_ID(N'dbo.Sensor', N'U') IS NULL
CREATE TABLE Sensor (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    nume VARCHAR(50) NOT NULL,
    sensor_type VARCHAR(50) NOT NULL, -- camera / radar
    description VARCHAR(1000),
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL
);
GO

IF OBJECT_ID(N'dbo.Input_images', N'U') IS NULL
CREATE TABLE Input_images (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    sensor_id BIGINT NOT NULL,
    drone_id BIGINT,
    image_path NVARCHAR(1000) NOT NULL,
    captured_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

    FOREIGN KEY (sensor_id) REFERENCES Sensor(id),
    FOREIGN KEY (drone_id) REFERENCES Threat(id)
);
GO

IF OBJECT_ID(N'dbo.Input_radar', N'U') IS NULL
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
    FOREIGN KEY (drone_id) REFERENCES Threat(id)
);
GO

IF OBJECT_ID(N'dbo.Critical_infrastructure', N'U') IS NULL
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

IF OBJECT_ID(N'dbo.Ground_defence', N'U') IS NULL
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
IF OBJECT_ID(N'dbo.User_Admin', N'U') IS NULL
CREATE TABLE dbo.User_Admin (
    user_id INT PRIMARY KEY REFERENCES dbo.Users(id)
);
GO

IF OBJECT_ID(N'dbo.Threat_Evaluation', N'U') IS NULL
CREATE TABLE dbo.Threat_Evaluation (
    threat_id BIGINT PRIMARY KEY REFERENCES dbo.Threat(id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('new','review','confirmed','closed')),
    reason NVARCHAR(1000) NOT NULL DEFAULT N'',
    user_id INT NOT NULL REFERENCES dbo.Users(id),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID(N'dbo.Evaluation_Audit', N'U') IS NULL
CREATE TABLE dbo.Evaluation_Audit (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    threat_id BIGINT NOT NULL REFERENCES dbo.Threat(id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('review','confirmed','closed')),
    reason NVARCHAR(1000) NOT NULL DEFAULT N'',
    user_id INT NOT NULL REFERENCES dbo.Users(id),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
