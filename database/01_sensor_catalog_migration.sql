USE Winner_Drone_Detectio_System;
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.Sensor','U') IS NULL OR OBJECT_ID('dbo.Threat','U') IS NULL
    THROW 50001, 'Ruleaza intai schema de baza.', 1;
IF OBJECT_ID('dbo.Manufacturer','U') IS NULL
    CREATE TABLE dbo.Manufacturer (
        id INT IDENTITY PRIMARY KEY,
        name NVARCHAR(150) NOT NULL UNIQUE,
        country_code NVARCHAR(2) NULL,
        website NVARCHAR(500) NULL
    );
IF OBJECT_ID('dbo.Sensor_Model','U') IS NULL
    CREATE TABLE dbo.Sensor_Model (
        id INT IDENTITY PRIMARY KEY,
        manufacturer_id INT NULL REFERENCES dbo.Manufacturer(id),
        model_name NVARCHAR(100) NOT NULL UNIQUE,
        sensor_type VARCHAR(50) NOT NULL
    );
IF COL_LENGTH('dbo.Sensor','sensor_model_id') IS NULL
    ALTER TABLE dbo.Sensor ADD sensor_model_id INT NULL REFERENCES dbo.Sensor_Model(id);
IF COL_LENGTH('dbo.Sensor','serial_number') IS NULL
    ALTER TABLE dbo.Sensor ADD serial_number NVARCHAR(100) NULL;
COMMIT;
GO
INSERT dbo.Sensor_Model(model_name,sensor_type)
SELECT v.model_name,v.sensor_type FROM (VALUES
(N'EO/IR on Kongsberg C-UAS platform (unpublished model)','eo_ir'),
(N'EchoGuard','radar'),
(N'EchoShield','radar'),
(N'FENEK','acoustic'),
(N'Ground Master 200 (GM200)','radar'),
(N'HARK (Hostile Acoustic Reconnaissance Kit)','acoustic'),
(N'IRIS','radar'),
(N'Kurbas-640a','ir'),
(N'RADA MHR (RPS-42 / ieMHR)','radar'),
(N'Radiotrex','rf'),
(N'SPEXER 2000 3D MkIII','radar'),
(N'SPYNEL-X','ir'),
(N'Sky Fortress (acoustic node)','acoustic'),
(N'Skydarix','radar'),
(N'Skyperion','rf'),
(N'Streamhunter','rf'),
(N'TRML-4D','radar'),
(N'X-TAR3D','radar'),
(N'Zvook (fixed station)','acoustic'),
(N'Zvook (portable tactical sensor)','acoustic')
) v(model_name,sensor_type)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Sensor_Model m WHERE m.model_name=v.model_name);
GO
-- Nu inventam producatori sau performante pentru modelele de senzori.
SELECT COUNT(*) AS sensor_models FROM dbo.Sensor_Model;
