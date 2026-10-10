SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
GO
-- BEGIN setup.sql
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

GO

-- BEGIN auth-migration.sql
USE Winner_Drone_Detectio_System;
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

-- Pentru baze vechi cu tabela Drone, verifica separat referintele existente.
-- setup.sql creeaza Input_images/Input_radar lipsa cu FOREIGN KEY catre Threat.

GO

-- BEGIN 01_sensor_catalog_migration.sql
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

GO

-- BEGIN 02_uav_catalog.sql
/* =====================================================================
   Winner_Drone_Detectio_System — catalog drone / loitering munitions
   Verificat pe surse publice la: 2026-10-10

   Ce face scriptul:
     1. UAV_Model   — catalog de modele (ostile + proprii/aliate), cu pret de achizitie
     2. Threat      — primeste uav_model_id (FK): o tinta detectata poate fi legata de un model
     3. Seed: 22 de modele, de la FPV de 400 USD la MALE de ~15 mil. USD
     4. v_UAV_Catalog + usp_GetUavCatalog

   Unitati ALINIATE cu tabela Threat: viteza in m/s, altitudine in m.

   Pretul are trei campuri, ca sa nu amestecam ce stim cu ce presupunem:
     unit_cost_usd  — cea mai buna estimare pe bucata (pentru sortare / cost_tier)
     cost_min_usd / cost_max_usd — intervalul din surse
     price_basis    — de unde vine cifra:
        pret_declarat_producator | estimare_presa | estimare_oficiala
        derivat_din_contract (valoare contract / cantitate, include de obicei
        lansatoare, statii de control, suport) | document_scurs | necunoscut
   cost_tier se calculeaza automat: low < 10k, medium < 100k, high < 1M, very_high >= 1M USD.

   NULL = nu am gasit cifra intr-o sursa verificata. Nu am completat din presupuneri.
   Necesita: sensor_catalog_migration.sql rulat inainte (tabela Manufacturer).
   ===================================================================== */

USE Winner_Drone_Detectio_System;
GO

/* ---------- 1. UAV_Model ---------- */
IF OBJECT_ID(N'dbo.UAV_Model', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UAV_Model (
        id                INT IDENTITY(1,1) PRIMARY KEY,
        manufacturer_id   INT            NULL,
        model_name        NVARCHAR(100)  NOT NULL,
        aliases           NVARCHAR(200)  NULL,
        affiliation       VARCHAR(20)    NOT NULL,   -- ostil / propriu_aliat
        uav_role          VARCHAR(30)    NOT NULL,
        propulsion        VARCHAR(20)    NULL,       -- electric / piston / jet
        max_speed_mps     FLOAT          NULL,       -- m/s, ca Threat.speed
        cruise_speed_mps  FLOAT          NULL,
        ceiling_m         INT            NULL,       -- m, ca Threat.height
        range_km          INT            NULL,
        endurance_min     INT            NULL,
        warhead_kg_min    DECIMAL(6,1)   NULL,
        warhead_kg_max    DECIMAL(6,1)   NULL,
        mtow_kg           DECIMAL(7,2)   NULL,
        unit_cost_usd     DECIMAL(12,0)  NULL,
        cost_min_usd      DECIMAL(12,0)  NULL,
        cost_max_usd      DECIMAL(12,0)  NULL,
        cost_tier AS CAST(CASE
                WHEN unit_cost_usd IS NULL     THEN NULL
                WHEN unit_cost_usd < 10000     THEN 'low'
                WHEN unit_cost_usd < 100000    THEN 'medium'
                WHEN unit_cost_usd < 1000000   THEN 'high'
                ELSE 'very_high' END AS VARCHAR(10)) PERSISTED,
        price_original    NVARCHAR(150)  NULL,       -- cifra exact cum apare in sursa
        price_basis       VARCHAR(30)    NOT NULL DEFAULT 'necunoscut',
        price_year        SMALLINT       NULL,
        status            VARCHAR(20)    NOT NULL DEFAULT 'in_serviciu',
        source_url        NVARCHAR(500)  NULL,
        verified_at       DATE           NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
        notes             NVARCHAR(1000) NULL,

        CONSTRAINT FK_UAVModel_Manufacturer FOREIGN KEY (manufacturer_id)
            REFERENCES dbo.Manufacturer(id),
        CONSTRAINT UQ_UAVModel UNIQUE (manufacturer_id, model_name),
        CONSTRAINT CK_UAVModel_Affiliation CHECK (affiliation IN ('ostil','propriu_aliat')),
        CONSTRAINT CK_UAVModel_Role CHECK (uav_role IN
            ('one_way_attack','loitering_munition','fpv_strike','interceptor',
             'isr','male_ucav','decoy','target_drone')),
        CONSTRAINT CK_UAVModel_Propulsion CHECK (propulsion IS NULL OR propulsion IN ('electric','piston','jet')),
        CONSTRAINT CK_UAVModel_PriceBasis CHECK (price_basis IN
            ('pret_declarat_producator','estimare_presa','estimare_oficiala',
             'derivat_din_contract','document_scurs','necunoscut')),
        CONSTRAINT CK_UAVModel_Status CHECK (status IN ('in_serviciu','prototip','scos_din_productie')),
        CONSTRAINT CK_UAVModel_Cost CHECK (
            (cost_min_usd IS NULL OR cost_max_usd IS NULL OR cost_min_usd <= cost_max_usd)
            AND (unit_cost_usd IS NULL OR unit_cost_usd > 0)),
        CONSTRAINT CK_UAVModel_Warhead CHECK (
            warhead_kg_min IS NULL OR warhead_kg_max IS NULL OR warhead_kg_min <= warhead_kg_max)
    );
END
GO

/* ---------- 2. Threat -> UAV_Model ---------- */
IF COL_LENGTH(N'dbo.Threat', N'uav_model_id') IS NULL
    ALTER TABLE dbo.Threat ADD uav_model_id INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Threat_UAVModel')
    ALTER TABLE dbo.Threat ADD CONSTRAINT FK_Threat_UAVModel
        FOREIGN KEY (uav_model_id) REFERENCES dbo.UAV_Model(id);
GO

/* ---------- 3a. Producatori noi ---------- */
INSERT INTO dbo.Manufacturer (name, country_code, website)
SELECT v.name, v.cc, v.web
FROM (VALUES
    (N'HESA',                                N'IR', NULL),
    (N'ZALA Aero',                           N'RU', NULL),
    (N'Special Technology Center (STC)',     N'RU', NULL),
    (N'BraveX Aero',                         N'RO', N'https://bravex.aero'),
    (N'Elbit Systems',                       N'IL', N'https://elbitsystems.com'),
    (N'AeroVironment',                       N'US', N'https://www.avinc.com'),
    (N'WB Group',                            N'PL', N'https://www.wbgroup.pl'),
    (N'Israel Aerospace Industries (IAI)',   N'IL', N'https://www.iai.co.il'),
    (N'Baykar',                              N'TR', N'https://baykartech.com'),
    (N'Fire Point',                          N'UA', NULL),
    (N'SkyFall',                             N'UA', NULL),
    (N'Wild Hornets',                        N'UA', NULL),
    (N'Liutyi Drones',                       N'UA', NULL)
) AS v(name, cc, web)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Manufacturer m WHERE m.name = v.name);
GO

/* ---------- 3b. Modele ----------
   Ordinea coloanelor in VALUES:
   mfr, model, aliases, affiliation, role, propulsion,
   max_mps, cruise_mps, ceiling_m, range_km, endurance_min,
   wh_min, wh_max, mtow_kg,
   unit_cost, cost_min, cost_max, price_original, price_basis, price_year,
   status, url, notes                                                          */
INSERT INTO dbo.UAV_Model
    (manufacturer_id, model_name, aliases, affiliation, uav_role, propulsion,
     max_speed_mps, cruise_speed_mps, ceiling_m, range_km, endurance_min,
     warhead_kg_min, warhead_kg_max, mtow_kg,
     unit_cost_usd, cost_min_usd, cost_max_usd, price_original, price_basis, price_year,
     status, source_url, notes)
SELECT m.id, v.model, v.aliases, v.aff, v.role, v.prop,
       v.max_mps, v.cruise_mps, v.ceiling, v.range_km, v.endur,
       v.wh_min, v.wh_max, v.mtow,
       v.cost, v.cmin, v.cmax, v.porig, v.pbasis, v.pyear,
       v.status, v.url, v.notes
FROM (VALUES
/* ======================= OSTILE ======================= */
(N'HESA', N'Shahed-136', N'Geran-2', 'ostil', 'one_way_attack', 'piston',
 50.0, NULL, NULL, NULL, NULL,
 50.0, 90.0, NULL,
 50000, 48800, 193000, N'~50.000 USD (estimare TWZ); 193.000 USD pret export Iran, 48.800 USD tinta dupa localizare (documente scurse)', 'estimare_presa', 2024,
 'in_serviciu', N'https://www.twz.com/news-features/what-does-a-shahed-136-really-cost',
 N'Viteza: peste 180 km/h (Robin Radar / UKDJ). Focoase noi pana la 90 kg (NV, 2025). Motor MD-550. Autenticitatea documentelor scurse neconfirmata.'),

(NULL, N'Geran-3', NULL, 'ostil', 'one_way_attack', 'jet',
 102.8, NULL, NULL, 1000, NULL,
 50.0, 50.0, NULL,
 125000, 100000, 150000, N'de 2-3 ori pretul Geran-2 (expert V. Romanenko, aug. 2025)', 'estimare_presa', 2025,
 'scos_din_productie', N'https://kurs.com.ua/en/novost/1473687-gur-rossija-svernula-vipusk-reaktivnih-dronov-geran-3-i-pereshla-k-novoi-modeli',
 N'Productie rusa. 300-370 km/h si pana la 1.000 km (DIU via Militarnyi); alte surse ~500 km/h. Motor Telefly JT80. DIU: productie oprita, inlocuit de Geran-4 (aug. 2026).'),

(NULL, N'Geran-4', NULL, 'ostil', 'one_way_attack', 'jet',
 NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, 450.00,
 NULL, NULL, NULL, NULL, 'necunoscut', NULL,
 'in_serviciu', N'https://kurs.com.ua/en/novost/1473687-gur-rossija-svernula-vipusk-reaktivnih-dronov-geran-3-i-pereshla-k-novoi-modeli',
 N'Succesorul Geran-3 (DIU, aug. 2026): motor Telefly LX-WP-160, anvergura ~3 m, lungime 3,5 m, viteza si raza mai mari decat Geran-3.'),

(NULL, N'Gerbera', NULL, 'ostil', 'decoy', 'piston',
 44.4, NULL, 3000, 300, NULL,
 0.0, 5.0, NULL,
 10000, NULL, NULL, N'10.000 USD (estimare oficiali ucraineni, dec. 2024)', 'estimare_oficiala', 2024,
 'in_serviciu', N'https://en.wikipedia.org/wiki/Gerbera_(drone)',
 N'Momeala pentru saturarea apararii; unele au focos (pana la 5 kg). Raza 300 km, DIU indica 600 km. Motor 60-70 cc.'),

(N'ZALA Aero', N'Lancet-3', N'Izdeliye 53', 'ostil', 'loitering_munition', 'electric',
 30.6, 30.6, NULL, 40, 40,
 NULL, 3.0, 12.00,
 35000, NULL, NULL, N'~3 mil. ruble, ~35.000 USD (S. Bendett via Reuters, iun. 2023)', 'estimare_presa', 2023,
 'in_serviciu', N'https://en.wikipedia.org/wiki/ZALA_Lancet',
 N'Viteza 80-110 km/h; sarcina utila maxima 3 kg.'),

(N'Special Technology Center (STC)', N'Orlan-10', NULL, 'ostil', 'isr', 'piston',
 41.7, NULL, 5000, 110, 960,
 NULL, NULL, 15.00,
 75000, NULL, NULL, N'~5 mil. ruble (~150.000 USD) pe SISTEM de 2 drone + statie, 2013', 'estimare_presa', 2013,
 'in_serviciu', N'https://en.wikipedia.org/wiki/Orlan-10',
 N'Pretul pe bucata = jumatate din pretul sistemului (calcul propriu). Sarcina utila 6 kg; raza de transfer 600 km.'),

(NULL, N'FPV generic (ostil)', NULL, 'ostil', 'fpv_strike', 'electric',
 NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL,
 NULL, NULL, NULL, NULL, 'necunoscut', NULL,
 'in_serviciu', NULL,
 N'Clasa generica pentru FPV-urile ostile neidentificate (radio sau fibra optica). Folosita la clasificare cand modelul exact nu se poate determina.'),

/* ======================= PROPRII / ALIATE ======================= */
(N'BraveX Aero', N'Vimana Jet', N'Vimana', 'propriu_aliat', 'target_drone', 'jet',
 138.9, 69.4, NULL, NULL, 40,
 NULL, NULL, 7.00,
 NULL, NULL, NULL, NULL, 'necunoscut', NULL,
 'prototip', N'https://www.romania-insider.com/society/bravex-aero-jet-drone-romania-may-2026',
 N'Producator roman. Tinta aeriana si interceptor. Pana la 500 km/h, croaziera 250 km/h, 40-45 min. Sarcina utila 2 kg, anvergura 1,8 m. Firma il declara gata de productie; pret nepublicat.'),

(N'Elbit Systems', N'SkyStriker', NULL, 'propriu_aliat', 'loitering_munition', 'electric',
 NULL, NULL, NULL, 100, 120,
 NULL, 10.0, NULL,
 190000, 105000, 317000, N'Contract 95 mil. USD pentru "cateva sute" de bucati, tara europeana, sept. 2023', 'derivat_din_contract', 2023,
 'in_serviciu', N'https://raksha-anirveda.com/elbit-systems-95m-skystriker-lm-contract/',
 N'Interval = 95 mil. / 900 ... 95 mil. / 300 (calcul propriu; include canistere si suport). Focos interschimbabil pana la 10 kg. Se poate lansa din PULS.'),

(N'Elbit Systems', N'Lanius', NULL, 'propriu_aliat', 'loitering_munition', 'electric',
 20.1, NULL, NULL, NULL, 7,
 NULL, NULL, 1.25,
 NULL, NULL, NULL, NULL, 'necunoscut', NULL,
 'in_serviciu', N'https://interestingengineering.com/science/lanius-search-and-attack-drone',
 N'Quadcopter de cautare si atac pentru spatii inchise, 72 km/h. Propulsia electrica e dedusa din design, nu e declarata.'),

(N'Elbit Systems', N'Hermes 900', N'StarLiner', 'propriu_aliat', 'isr', 'piston',
 61.1, 31.1, 9100, NULL, 2160,
 NULL, NULL, 1180.00,
 15000000, NULL, NULL, N'Drona prabusita evaluata la 140 crore INR (~15 mil. USD), India', 'estimare_presa', 2023,
 'in_serviciu', N'https://en.wikipedia.org/wiki/Elbit_Hermes_900',
 N'MALE, 36 h, sarcina utila 350 kg, motor Rotax 916. Contracte: Filipine ~175 mil. USD pentru 9 Hermes 900 + 4 Hermes 450.'),

(N'AeroVironment', N'Switchblade 300 Block 20', NULL, 'propriu_aliat', 'loitering_munition', 'electric',
 44.4, 28.1, NULL, 10, 20,
 NULL, NULL, 3.60,
 NULL, NULL, NULL, N'Romania: 25 de sisteme pentru 176 mil. lei (iul. 2024)', 'necunoscut', 2024,
 'in_serviciu', N'https://en.wikipedia.org/wiki/AeroVironment_Switchblade',
 N'Pret pe bucata nepublicat; contractul romanesc e pe sisteme (mai multe munitii + control). Focos echivalent grenada 40 mm.'),

(N'AeroVironment', N'Switchblade 600', NULL, 'propriu_aliat', 'loitering_munition', 'electric',
 51.4, 31.4, NULL, 40, 40,
 NULL, NULL, 22.70,
 NULL, NULL, NULL, N'Comanda US Army 186 mil. USD (600 Block 2 + 300 Block 20), feb. 2026', 'necunoscut', 2026,
 'in_serviciu', N'https://en.wikipedia.org/wiki/AeroVironment_Switchblade',
 N'Focos derivat din Javelin, anti-blindat. Masa: 22,7 kg structura; 15 kg in alte surse.'),

(N'WB Group', N'Warmate', NULL, 'propriu_aliat', 'loitering_munition', 'electric',
 41.7, NULL, 3000, 30, 60,
 1.4, 1.4, 5.70,
 34754, NULL, NULL, N'26.460 USD (2017), ~34.754 USD in dolari 2025', 'estimare_presa', 2017,
 'in_serviciu', N'https://en.wikipedia.org/wiki/WB_Electronics_Warmate',
 N'Producator polonez. Romania: cerinta de minimum 70 de sisteme in programul SAFE. 120 km/h zbor, 150 km/h la atac.'),

(N'Israel Aerospace Industries (IAI)', N'Harop', NULL, 'propriu_aliat', 'loitering_munition', NULL,
 115.8, NULL, NULL, 200, 360,
 16.0, 16.0, NULL,
 NULL, NULL, NULL, N'India: ~100 mil. USD total, cantitate nepublicata (2009)', 'necunoscut', 2009,
 'in_serviciu', N'https://en.wikipedia.org/wiki/IAI_Harop',
 N'417 km/h, peste 6 h autonomie.'),

(N'Baykar', N'Bayraktar TB2', NULL, 'propriu_aliat', 'male_ucav', 'piston',
 61.7, 36.1, 7620, NULL, 1200,
 NULL, NULL, 700.00,
 5370000, 5000000, 17833000, N'~5,37 mil. USD/buc. (campanie Lituania 2022); Romania: 18 drone pentru 321 mil. USD (2023)', 'estimare_presa', 2022,
 'in_serviciu', N'https://en.wikipedia.org/wiki/Baykar_Bayraktar_TB2',
 N'Maximul = 321 mil. / 18 (calcul propriu, include statii de control si suport). Sarcina utila 150 kg; altitudine operationala 5.486 m. Propulsie piston: cunostinte anterioare.'),

(N'Fire Point', N'FP-1', NULL, 'propriu_aliat', 'one_way_attack', 'piston',
 NULL, NULL, NULL, 1600, NULL,
 60.0, 120.0, NULL,
 55000, 55000, 75000, N'55.000-75.000 USD (declarat, iul. 2026)', 'pret_declarat_producator', 2026,
 'in_serviciu', N'https://en.lb.ua/news/2026/08/04/39414_how_drones_price_calculated.html',
 N'Producator ucrainean. Motor in doi cilindri + booster cu combustibil solid la lansare.'),

(N'Fire Point', N'FP-2', NULL, 'propriu_aliat', 'one_way_attack', NULL,
 NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL,
 44000, 43000, 45000, N'43.000-45.000 USD (surse, 2026)', 'estimare_presa', 2026,
 'in_serviciu', N'https://en.lb.ua/news/2026/08/04/39414_how_drones_price_calculated.html',
 N'Specificatiile tehnice nu au fost gasite in surse verificate.'),

(N'Liutyi Drones', N'Liutyi', N'AN-196', 'propriu_aliat', 'one_way_attack', 'piston',
 NULL, NULL, NULL, 1000, NULL,
 50.0, 75.0, 300.00,
 200000, NULL, NULL, N'200.000 USD', 'estimare_presa', NULL,
 'in_serviciu', N'https://en.wikipedia.org/wiki/Liutyi',
 N'Raza 1.000-2.000 km; masa 250-300 kg.'),

(N'SkyFall', N'Shrike 10', NULL, 'propriu_aliat', 'fpv_strike', 'electric',
 NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL,
 400, NULL, NULL, N'400 USD (declarat de producator, iul. 2026)', 'pret_declarat_producator', 2026,
 'in_serviciu', N'https://www.kyivpost.com/post/80331',
 N'FPV de 10 inch.'),

(NULL, N'FPV fibra optica 20 km (generic)', NULL, 'propriu_aliat', 'fpv_strike', 'electric',
 NULL, NULL, NULL, 20, NULL,
 NULL, NULL, NULL,
 2040, 1709, 2375, N'77.000-107.000 UAH (Brave1 Market, mai 2026)', 'estimare_presa', 2026,
 'in_serviciu', N'https://oboronka.mezha.ua/en/optovolokonni-fpv-podorozhchali-na-brave1-market-310925/',
 N'Convertit la 45,06 UAH/USD (cursul BNU din 6 oct. 2026). Pretul aproape s-a dublat fata de 2025 din cauza fibrei optice.'),

(N'Wild Hornets', N'Sting', NULL, 'propriu_aliat', 'interceptor', 'electric',
 87.5, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL,
 2500, NULL, NULL, N'2.500 USD', 'pret_declarat_producator', 2025,
 'in_serviciu', N'https://dronexl.co/2025/08/14/ukraines-2500-sting-drone-rips-through',
 N'Interceptor anti-Shahed, ~315 km/h masurat in test. Propulsia electrica e dedusa (quadcopter FPV).')
) AS v(mfr, model, aliases, aff, role, prop,
       max_mps, cruise_mps, ceiling, range_km, endur,
       wh_min, wh_max, mtow,
       cost, cmin, cmax, porig, pbasis, pyear,
       status, url, notes)
LEFT JOIN dbo.Manufacturer m ON m.name = v.mfr
WHERE NOT EXISTS (SELECT 1 FROM dbo.UAV_Model u WHERE u.model_name = v.model);
GO

/* ---------- 4. View + procedura ---------- */
CREATE OR ALTER VIEW dbo.v_UAV_Catalog AS
SELECT  u.id                          AS uav_model_id,
        u.model_name,
        u.aliases,
        mf.name                       AS manufacturer,
        mf.country_code,
        u.affiliation,
        u.uav_role,
        u.propulsion,
        u.max_speed_mps,
        CAST(ROUND(u.max_speed_mps * 3.6, 0) AS INT)    AS max_speed_kmh,
        u.cruise_speed_mps,
        CAST(ROUND(u.cruise_speed_mps * 3.6, 0) AS INT) AS cruise_speed_kmh,
        u.ceiling_m,
        u.range_km,
        u.endurance_min,
        u.warhead_kg_min,
        u.warhead_kg_max,
        u.mtow_kg,
        u.unit_cost_usd,
        u.cost_min_usd,
        u.cost_max_usd,
        u.cost_tier,
        u.price_original,
        u.price_basis,
        u.price_year,
        u.status,
        u.source_url,
        u.verified_at,
        u.notes
FROM dbo.UAV_Model u
LEFT JOIN dbo.Manufacturer mf ON mf.id = u.manufacturer_id;
GO

CREATE OR ALTER PROCEDURE dbo.usp_GetUavCatalog
    @affiliation   VARCHAR(20) = NULL,    -- ostil / propriu_aliat
    @uav_role      VARCHAR(30) = NULL,
    @cost_tier     VARCHAR(10) = NULL,    -- low / medium / high / very_high
    @max_cost_usd  DECIMAL(12,0) = NULL,
    @country_code  CHAR(2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT *
    FROM dbo.v_UAV_Catalog
    WHERE (@affiliation  IS NULL OR affiliation   = @affiliation)
      AND (@uav_role     IS NULL OR uav_role      = @uav_role)
      AND (@cost_tier    IS NULL OR cost_tier     = @cost_tier)
      AND (@max_cost_usd IS NULL OR unit_cost_usd <= @max_cost_usd)
      AND (@country_code IS NULL OR country_code  = @country_code)
    ORDER BY affiliation, unit_cost_usd, model_name;
END
GO

/* ---------- Exemple ----------
EXEC dbo.usp_GetUavCatalog;                                   -- tot catalogul
EXEC dbo.usp_GetUavCatalog @affiliation = 'ostil';            -- ce putem detecta
EXEC dbo.usp_GetUavCatalog @affiliation = 'propriu_aliat', @uav_role = 'loitering_munition';
EXEC dbo.usp_GetUavCatalog @cost_tier = 'low';                -- tot ce e sub 10.000 USD

-- Raportul de cost: cat costa tinta vs. cat costa interceptorul
SELECT t.model_name AS tinta, t.unit_cost_usd AS cost_tinta,
       i.model_name AS interceptor, i.unit_cost_usd AS cost_interceptor,
       CAST(t.unit_cost_usd / i.unit_cost_usd AS DECIMAL(8,1)) AS raport
FROM dbo.v_UAV_Catalog t CROSS JOIN dbo.v_UAV_Catalog i
WHERE t.affiliation = 'ostil' AND t.unit_cost_usd IS NOT NULL
  AND i.uav_role = 'interceptor' AND i.unit_cost_usd IS NOT NULL;

-- Legarea unei tinte detectate de un model
UPDATE dbo.Threat SET uav_model_id = (SELECT id FROM dbo.UAV_Model WHERE model_name = N'Shahed-136')
WHERE id = 1;
-------------------------------------- */

GO

-- BEGIN 03_synthetic_sensors.sql
/* =====================================================================
   Winner_Drone_Detectio_System — DATE SINTETICE: senzori Galati / Tulcea / Bucuresti
   104 senzori: Galati 32, Tulcea 36, Bucuresti 36
   pe tipuri: 34 radar, 45 acustici, 13 IR/EO-IR, 12 RF

   Necesita: sensor_catalog_migration.sql rulat inainte.
   Inlocuieste varianta anterioara a acestui fisier (aceleasi serii SYN-...):
   daca ai rulat-o, sterge intai datele sintetice cu blocul de la final.

   Pozitii: concrete, ancorate pe localitati reale (coordonate GeoNames),
   cu offset de 0,3–5 km. Senzorii de pe Dunare sunt pe malul romanesc,
   impinsi spre interior. Verificat: fiecare punct are cea mai apropiata
   localitate in Romania; cea mai apropiata localitate straina e la >= 6,9 km.
   Toti senzorii: serial 'SYN-...', descriere cu prefix [SINTETIC].
   ===================================================================== */

USE Winner_Drone_Detectio_System;
GO

DECLARE @net TABLE (
    nume        VARCHAR(50)   NOT NULL,
    model_name  NVARCHAR(100) NOT NULL,
    sensor_type VARCHAR(50)   NOT NULL,
    latitude    DECIMAL(9,6)  NOT NULL,
    longitude   DECIMAL(9,6)  NOT NULL,
    description VARCHAR(900)  NOT NULL,
    serial      NVARCHAR(100) NOT NULL
);

INSERT INTO @net (nume, model_name, sensor_type, latitude, longitude, description, serial)
VALUES
    -- ===== GALATI (32 senzori) =====
    ('GL-TRML-01', N'TRML-4D', 'radar', 45.483330, 27.920517, 'Galati / Smardan: Avertizare timpurie 360 grade, strat Shahed / rachete de croaziera', N'SYN-001'),
    ('GL-GM200-01', N'Ground Master 200 (GM200)', 'radar', 45.454492, 27.843597, 'Galati / Branistea: Supraveghere aeriana raza medie, 360 grade', N'SYN-002'),
    ('GL-XTAR-01', N'X-TAR3D', 'radar', 45.432508, 28.009396, 'Galati / Galati: Radar de achizitie baterie Skynex; zona port', N'SYN-003'),
    ('GL-SPX-01', N'SPEXER 2000 3D MkIII', 'radar', 45.450475, 28.054203, 'Galati / Galati: Radar AESA banda X; sector 120 grade, orientare 060', N'SYN-004'),
    ('GL-SPX-02', N'SPEXER 2000 3D MkIII', 'radar', 45.414542, 28.047802, 'Galati / Galati: Radar AESA banda X; sector 120 grade, orientare 120', N'SYN-005'),
    ('GL-IRIS-01', N'IRIS', 'radar', 45.463949, 27.983792, 'Galati / Galati: Radar 3D C-UAS, Long-Range Mode activ; nord-vest oras', N'SYN-006'),
    ('GL-IRIS-02', N'IRIS', 'radar', 45.382034, 28.210273, 'Galati / Grindu: Radar 3D C-UAS, Long-Range Mode activ; malul sudic al Dunarii', N'SYN-007'),
    ('GL-ECHO-01', N'EchoShield', 'radar', 45.428017, 28.028599, 'Galati / Galati: Aparare apropiata, 4 panouri 360 grade; santier naval', N'SYN-008'),
    ('GL-ECHOG-01', N'EchoGuard', 'radar', 45.423525, 28.038841, 'Galati / Galati: Radar portabil, punct de acces; poarta port', N'SYN-009'),
    ('GL-SKYD-01', N'Skydarix', 'radar', 45.333625, 28.161870, 'Galati / Garvan: Radar 360 grade, pozitie avansata', N'SYN-010'),
    ('GL-RADA-01', N'RADA MHR (RPS-42 / ieMHR)', 'radar', 45.408983, 27.923067, 'Galati / Sendreni: Radar tactic emisferic', N'SYN-011'),
    ('GL-SF-01', N'Sky Fortress (acoustic node)', 'acoustic', 45.386525, 28.203876, 'Galati / Grindu: Nod acustic pe stalp 2 m; mal Dunare', N'SYN-012'),
    ('GL-SF-02', N'Sky Fortress (acoustic node)', 'acoustic', 45.338117, 28.174652, 'Galati / Garvan: Nod acustic pe stalp 2 m; mal Dunare', N'SYN-013'),
    ('GL-SF-03', N'Sky Fortress (acoustic node)', 'acoustic', 45.310675, 28.195120, 'Galati / Vacareni: Nod acustic pe stalp 2 m; mal Dunare', N'SYN-014'),
    ('GL-SF-04', N'Sky Fortress (acoustic node)', 'acoustic', 45.291017, 28.150000, 'Galati / Jijila: Nod acustic pe stalp 2 m', N'SYN-015'),
    ('GL-SF-05', N'Sky Fortress (acoustic node)', 'acoustic', 45.236524, 28.135640, 'Galati / Macin: Nod acustic pe stalp 2 m', N'SYN-016'),
    ('GL-SF-06', N'Sky Fortress (acoustic node)', 'acoustic', 45.472932, 28.060604, 'Galati / Galati: Nod acustic pe stalp 2 m; nord-est oras', N'SYN-017'),
    ('GL-SF-07', N'Sky Fortress (acoustic node)', 'acoustic', 45.505788, 27.952549, 'Galati / Smardan: Nod acustic pe stalp 2 m', N'SYN-018'),
    ('GL-SF-08', N'Sky Fortress (acoustic node)', 'acoustic', 45.436525, 27.850000, 'Galati / Branistea: Nod acustic pe stalp 2 m', N'SYN-019'),
    ('GL-ZVK-01', N'Zvook (fixed station)', 'acoustic', 45.463949, 28.041401, 'Galati / Galati: Statie acustica pe turn telecom la 12 m', N'SYN-020'),
    ('GL-ZVK-02', N'Zvook (fixed station)', 'acoustic', 45.319658, 28.207897, 'Galati / Vacareni: Statie acustica pe turn telecom la 12 m', N'SYN-021'),
    ('GL-ZVKP-01', N'Zvook (portable tactical sensor)', 'acoustic', 45.437000, 28.067005, 'Galati / Galati: Senzor acustic portabil, anti-FPV fibra optica; est oras', N'SYN-022'),
    ('GL-FNK-01', N'FENEK', 'acoustic', 45.308983, 28.137229, 'Galati / Jijila: Nod retea acustica', N'SYN-023'),
    ('GL-HARK-01', N'HARK (Hostile Acoustic Reconnaissance Kit)', 'acoustic', 45.445983, 27.996594, 'Galati / Galati: Senzor acustic pe vehicul de patrula', N'SYN-024'),
    ('GL-SPY-01', N'SPYNEL-X', 'ir', 45.429814, 28.058044, 'Galati / Galati: Camera IR panoramica 360 grade, catarg 10 m; port', N'SYN-025'),
    ('GL-SPY-02', N'SPYNEL-X', 'ir', 45.377542, 28.216670, 'Galati / Grindu: Camera IR panoramica 360 grade, catarg 10 m', N'SYN-026'),
    ('GL-KRB-01', N'Kurbas-640a', 'ir', 45.445508, 27.869208, 'Galati / Branistea: Baza interceptoare; camera termala pe UAV, pozitia = punct de lansare', N'SYN-027'),
    ('GL-FLIR-01', N'EO/IR on Kongsberg C-UAS platform (unpublished model)', 'eo_ir', 45.454966, 28.015797, 'Galati / Galati: EO/IR pe vehicul C-UAS, identificare tinta', N'SYN-028'),
    ('GL-STRH-01', N'Streamhunter', 'rf', 45.454966, 28.060604, 'Galati / Galati: Interceptare legatura video UAV', N'SYN-029'),
    ('GL-RTX-01', N'Radiotrex', 'rf', 45.468441, 28.054203, 'Galati / Galati: Radiogoniometru RF; baza triangulatie 1/2', N'SYN-030'),
    ('GL-RTX-02', N'Radiotrex', 'rf', 45.333625, 28.168261, 'Galati / Garvan: Radiogoniometru RF; baza triangulatie 2/2', N'SYN-031'),
    ('GL-SKYP-01', N'Skyperion', 'rf', 45.445983, 28.035000, 'Galati / Galati: Detectie RF pasiva', N'SYN-032'),
    -- ===== TULCEA (36 senzori) =====
    ('TL-TRML-01', N'TRML-4D', 'radar', 45.140068, 28.761770, 'Tulcea / Tulcea: Avertizare timpurie 360 grade, strat Shahed / rachete de croaziera; dealuri sud-vest', N'SYN-033'),
    ('TL-GM200-01', N'Ground Master 200 (GM200)', 'radar', 45.169855, 28.483330, 'Tulcea / Niculitel: Supraveghere aeriana raza medie, 360 grade', N'SYN-034'),
    ('TL-XTAR-01', N'X-TAR3D', 'radar', 45.162525, 28.819115, 'Tulcea / Tulcea: Radar de achizitie baterie Skynex', N'SYN-035'),
    ('TL-SPX-01', N'SPEXER 2000 3D MkIII', 'radar', 45.253195, 28.466670, 'Tulcea / Isaccea: Radar AESA banda X; sector 120 grade, orientare 000', N'SYN-036'),
    ('TL-SPX-02', N'SPEXER 2000 3D MkIII', 'radar', 45.165364, 28.666670, 'Tulcea / Somova: Radar AESA banda X; sector 120 grade, orientare 020', N'SYN-037'),
    ('TL-IRIS-01', N'IRIS', 'radar', 45.286525, 28.966670, 'Tulcea / Pardina: Radar 3D C-UAS, Long-Range Mode activ; Delta, axa Izmail', N'SYN-038'),
    ('TL-IRIS-02', N'IRIS', 'radar', 45.394212, 29.283330, 'Tulcea / Chilia Veche: Radar 3D C-UAS, Long-Range Mode activ; bratul Chilia', N'SYN-039'),
    ('TL-ECHO-01', N'EchoShield', 'radar', 45.171508, 28.793628, 'Tulcea / Tulcea: Aparare apropiata, 4 panouri 360 grade', N'SYN-040'),
    ('TL-ECHOG-01', N'EchoGuard', 'radar', 45.259484, 28.476881, 'Tulcea / Isaccea: Radar portabil, punct de acces', N'SYN-041'),
    ('TL-SKYD-01', N'Skydarix', 'radar', 45.151408, 29.634452, 'Tulcea / Sulina: Radar 360 grade, pozitie avansata; axa Marea Neagra', N'SYN-042'),
    ('TL-RADA-01', N'RADA MHR (RPS-42 / ieMHR)', 'radar', 45.274347, 28.266670, 'Tulcea / Luncavita: Radar tactic emisferic', N'SYN-043'),
    ('TL-SF-01', N'Sky Fortress (acoustic node)', 'acoustic', 45.257687, 28.441143, 'Tulcea / Isaccea: Nod acustic pe stalp 2 m; mal Dunare', N'SYN-044'),
    ('TL-SF-02', N'Sky Fortress (acoustic node)', 'acoustic', 45.248704, 28.504961, 'Tulcea / Isaccea: Nod acustic pe stalp 2 m; mal Dunare', N'SYN-045'),
    ('TL-SF-03', N'Sky Fortress (acoustic node)', 'acoustic', 45.169855, 28.666670, 'Tulcea / Somova: Nod acustic pe stalp 2 m; mal Dunare', N'SYN-046'),
    ('TL-SF-04', N'Sky Fortress (acoustic node)', 'acoustic', 45.189475, 28.825486, 'Tulcea / Tulcea: Nod acustic pe stalp 2 m; Delta, nord brat Tulcea', N'SYN-047'),
    ('TL-SF-05', N'Sky Fortress (acoustic node)', 'acoustic', 45.291017, 28.985827, 'Tulcea / Pardina: Nod acustic pe stalp 2 m; Delta', N'SYN-048'),
    ('TL-SF-06', N'Sky Fortress (acoustic node)', 'acoustic', 45.394212, 29.244938, 'Tulcea / Chilia Veche: Nod acustic pe stalp 2 m; bratul Chilia', N'SYN-049'),
    ('TL-SF-07', N'Sky Fortress (acoustic node)', 'acoustic', 45.394212, 29.334520, 'Tulcea / Chilia Veche: Nod acustic pe stalp 2 m; bratul Chilia', N'SYN-050'),
    ('TL-SF-08', N'Sky Fortress (acoustic node)', 'acoustic', 45.174620, 29.385980, 'Tulcea / Crisan: Nod acustic pe stalp 2 m; bratul Sulina', N'SYN-051'),
    ('TL-SF-09', N'Sky Fortress (acoustic node)', 'acoustic', 45.148714, 29.666299, 'Tulcea / Sulina: Nod acustic pe stalp 2 m', N'SYN-052'),
    ('TL-SF-10', N'Sky Fortress (acoustic node)', 'acoustic', 45.078838, 29.083330, 'Tulcea / Mahmudia: Nod acustic pe stalp 2 m', N'SYN-053'),
    ('TL-SF-11', N'Sky Fortress (acoustic node)', 'acoustic', 45.033330, 29.166670, 'Tulcea / Murighiol: Nod acustic pe stalp 2 m', N'SYN-054'),
    ('TL-SF-12', N'Sky Fortress (acoustic node)', 'acoustic', 45.145508, 28.916670, 'Tulcea / Nufaru: Nod acustic pe stalp 2 m', N'SYN-055'),
    ('TL-ZVK-01', N'Zvook (fixed station)', 'acoustic', 45.262178, 28.473052, 'Tulcea / Isaccea: Statie acustica pe turn telecom la 12 m', N'SYN-056'),
    ('TL-ZVK-02', N'Zvook (fixed station)', 'acoustic', 45.171508, 28.800000, 'Tulcea / Tulcea: Statie acustica pe turn telecom la 12 m', N'SYN-057'),
    ('TL-ZVKP-01', N'Zvook (portable tactical sensor)', 'acoustic', 45.278838, 28.285821, 'Tulcea / Luncavita: Senzor acustic portabil, anti-FPV fibra optica', N'SYN-058'),
    ('TL-FNK-01', N'FENEK', 'acoustic', 45.019855, 29.160314, 'Tulcea / Murighiol: Nod retea acustica; flanc Marea Neagra', N'SYN-059'),
    ('TL-HARK-01', N'HARK (Hostile Acoustic Reconnaissance Kit)', 'acoustic', 45.183330, 28.502447, 'Tulcea / Niculitel: Senzor acustic pe vehicul de patrula', N'SYN-060'),
    ('TL-SPY-01', N'SPYNEL-X', 'ir', 45.259484, 28.460288, 'Tulcea / Isaccea: Camera IR panoramica 360 grade, catarg 10 m', N'SYN-061'),
    ('TL-SPY-02', N'SPYNEL-X', 'ir', 45.171508, 28.812743, 'Tulcea / Tulcea: Camera IR panoramica 360 grade, catarg 10 m', N'SYN-062'),
    ('TL-KRB-01', N'Kurbas-640a', 'ir', 45.160872, 28.647553, 'Tulcea / Somova: Baza interceptoare; camera termala pe UAV, pozitia = punct de lansare', N'SYN-063'),
    ('TL-FLIR-01', N'EO/IR on Kongsberg C-UAS platform (unpublished model)', 'eo_ir', 45.158034, 28.780885, 'Tulcea / Tulcea: EO/IR pe vehicul C-UAS, identificare tinta', N'SYN-064'),
    ('TL-STRH-01', N'Streamhunter', 'rf', 45.255890, 28.485815, 'Tulcea / Isaccea: Interceptare legatura video UAV', N'SYN-065'),
    ('TL-RTX-01', N'Radiotrex', 'rf', 45.248704, 28.428379, 'Tulcea / Isaccea: Radiogoniometru RF; baza triangulatie 1/2', N'SYN-066'),
    ('TL-RTX-02', N'Radiotrex', 'rf', 45.149051, 28.787257, 'Tulcea / Tulcea: Radiogoniometru RF; baza triangulatie 2/2', N'SYN-067'),
    ('TL-SKYP-01', N'Skyperion', 'rf', 45.158034, 28.806372, 'Tulcea / Tulcea: Detectie RF pasiva', N'SYN-068'),
    -- ===== BUCURESTI (36 senzori) =====
    ('B-TRML-01', N'TRML-4D', 'radar', 44.445508, 26.339622, 'Bucuresti / Branesti: Avertizare timpurie 360 grade, strat Shahed / rachete de croaziera; axa est', N'SYN-069'),
    ('B-GM200-01', N'Ground Master 200 (GM200)', 'radar', 44.604492, 26.050000, 'Bucuresti / Corbeanca: Supraveghere aeriana raza medie, 360 grade; nord', N'SYN-070'),
    ('B-XTAR-01', N'X-TAR3D', 'radar', 44.567966, 26.085578, 'Bucuresti / Otopeni: Radar de achizitie baterie Skynex; aeroport Otopeni', N'SYN-071'),
    ('B-SPX-01', N'SPEXER 2000 3D MkIII', 'radar', 44.490020, 26.179676, 'Bucuresti / Voluntari: Radar AESA banda X; sector 120 grade, orientare 060', N'SYN-072'),
    ('B-SPX-02', N'SPEXER 2000 3D MkIII', 'radar', 44.383330, 26.166670, 'Bucuresti / Popesti-Leordeni: Radar AESA banda X; sector 120 grade, orientare 120', N'SYN-073'),
    ('B-IRIS-01', N'IRIS', 'radar', 44.516670, 26.266670, 'Bucuresti / Afumati: Radar 3D C-UAS, Long-Range Mode activ', N'SYN-074'),
    ('B-IRIS-02', N'IRIS', 'radar', 44.383330, 26.250000, 'Bucuresti / Glina: Radar 3D C-UAS, Long-Range Mode activ', N'SYN-075'),
    ('B-ECHO-01', N'EchoShield', 'radar', 44.427466, 26.087274, 'Bucuresti / Bucuresti: Aparare apropiata, 4 panouri 360 grade; zona Palatul Parlamentului', N'SYN-076'),
    ('B-ECHO-02', N'EchoShield', 'radar', 44.572458, 26.079275, 'Bucuresti / Otopeni: Aparare apropiata, 4 panouri 360 grade; aeroport Otopeni', N'SYN-077'),
    ('B-ECHOG-01', N'EchoGuard', 'radar', 44.449475, 26.128162, 'Bucuresti / Bucuresti: Radar portabil, punct de acces', N'SYN-078'),
    ('B-SKYD-01', N'Skydarix', 'radar', 44.416670, 26.283330, 'Bucuresti / Cernica: Radar 360 grade, pozitie avansata', N'SYN-079'),
    ('B-RADA-01', N'RADA MHR (RPS-42 / ieMHR)', 'radar', 44.333330, 26.078060, 'Bucuresti / Jilava: Radar tactic emisferic', N'SYN-080'),
    ('B-SF-01', N'Sky Fortress (acoustic node)', 'acoustic', 44.458983, 26.358498, 'Bucuresti / Branesti: Nod acustic pe stalp 2 m', N'SYN-081'),
    ('B-SF-02', N'Sky Fortress (acoustic node)', 'acoustic', 44.534636, 26.285567, 'Bucuresti / Afumati: Nod acustic pe stalp 2 m', N'SYN-082'),
    ('B-SF-03', N'Sky Fortress (acoustic node)', 'acoustic', 44.563475, 26.150000, 'Bucuresti / Tunari: Nod acustic pe stalp 2 m', N'SYN-083'),
    ('B-SF-04', N'Sky Fortress (acoustic node)', 'acoustic', 44.617966, 26.068924, 'Bucuresti / Corbeanca: Nod acustic pe stalp 2 m', N'SYN-084'),
    ('B-SF-05', N'Sky Fortress (acoustic node)', 'acoustic', 44.403195, 26.302195, 'Bucuresti / Cernica: Nod acustic pe stalp 2 m', N'SYN-085'),
    ('B-SF-06', N'Sky Fortress (acoustic node)', 'acoustic', 44.374347, 26.268854, 'Bucuresti / Glina: Nod acustic pe stalp 2 m', N'SYN-086'),
    ('B-SF-07', N'Sky Fortress (acoustic node)', 'acoustic', 44.450000, 26.200000, 'Bucuresti / Pantelimon: Nod acustic pe stalp 2 m', N'SYN-087'),
    ('B-SF-08', N'Sky Fortress (acoustic node)', 'acoustic', 44.503495, 26.192269, 'Bucuresti / Voluntari: Nod acustic pe stalp 2 m', N'SYN-088'),
    ('B-SF-09', N'Sky Fortress (acoustic node)', 'acoustic', 44.561390, 25.948890, 'Bucuresti / Buftea: Nod acustic pe stalp 2 m', N'SYN-089'),
    ('B-SF-10', N'Sky Fortress (acoustic node)', 'acoustic', 44.350000, 26.033330, 'Bucuresti / Magurele: Nod acustic pe stalp 2 m', N'SYN-090'),
    ('B-ZVK-01', N'Zvook (fixed station)', 'acoustic', 44.512178, 26.254072, 'Bucuresti / Afumati: Statie acustica pe turn telecom la 12 m', N'SYN-091'),
    ('B-ZVK-02', N'Zvook (fixed station)', 'acoustic', 44.387822, 26.243715, 'Bucuresti / Glina: Statie acustica pe turn telecom la 12 m', N'SYN-092'),
    ('B-ZVKP-01', N'Zvook (portable tactical sensor)', 'acoustic', 44.445508, 26.212584, 'Bucuresti / Pantelimon: Senzor acustic portabil, anti-FPV fibra optica', N'SYN-093'),
    ('B-FNK-01', N'FENEK', 'acoustic', 44.399190, 25.916180, 'Bucuresti / Domnesti: Nod retea acustica', N'SYN-094'),
    ('B-HARK-01', N'HARK (Hostile Acoustic Reconnaissance Kit)', 'acoustic', 44.460000, 25.973330, 'Bucuresti / Chiajna: Senzor acustic pe vehicul de patrula', N'SYN-095'),
    ('B-SPY-01', N'SPYNEL-X', 'ir', 44.429712, 26.090419, 'Bucuresti / Bucuresti: Camera IR panoramica 360 grade, catarg 10 m; zona Palatul Parlamentului', N'SYN-096'),
    ('B-SPY-02', N'SPYNEL-X', 'ir', 44.569763, 26.085578, 'Bucuresti / Otopeni: Camera IR panoramica 360 grade, catarg 10 m; aeroport Otopeni', N'SYN-097'),
    ('B-KRB-01', N'Kurbas-640a', 'ir', 44.374347, 26.185524, 'Bucuresti / Popesti-Leordeni: Baza interceptoare; camera termala pe UAV, pozitia = punct de lansare', N'SYN-098'),
    ('B-KRB-02', N'Kurbas-640a', 'ir', 44.529170, 26.000000, 'Bucuresti / Mogosoaia: Baza interceptoare; camera termala pe UAV, pozitia = punct de lansare', N'SYN-099'),
    ('B-FLIR-01', N'EO/IR on Kongsberg C-UAS platform (unpublished model)', 'eo_ir', 44.494512, 26.198565, 'Bucuresti / Voluntari: EO/IR pe vehicul C-UAS, identificare tinta', N'SYN-100'),
    ('B-STRH-01', N'Streamhunter', 'rf', 44.499003, 26.185972, 'Bucuresti / Voluntari: Interceptare legatura video UAV', N'SYN-101'),
    ('B-RTX-01', N'Radiotrex', 'rf', 44.458983, 26.320746, 'Bucuresti / Branesti: Radiogoniometru RF; baza triangulatie 1/2', N'SYN-102'),
    ('B-RTX-02', N'Radiotrex', 'rf', 44.550000, 26.162605, 'Bucuresti / Tunari: Radiogoniometru RF; baza triangulatie 2/2', N'SYN-103'),
    ('B-SKYP-01', N'Skyperion', 'rf', 44.436000, 26.103000, 'Bucuresti / Bucuresti: Detectie RF pasiva', N'SYN-104');

-- Orice model care lipseste din catalog opreste scriptul
IF EXISTS (SELECT 1 FROM @net n
           WHERE NOT EXISTS (SELECT 1 FROM dbo.Sensor_Model m WHERE m.model_name = n.model_name))
BEGIN
    SELECT n.nume, n.model_name AS model_lipsa FROM @net n
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Sensor_Model m WHERE m.model_name = n.model_name);
    THROW 50001, 'Modele lipsa din Sensor_Model. Ruleaza intai sensor_catalog_migration.sql.', 1;
END

IF EXISTS (SELECT 1 FROM @net n LEFT JOIN dbo.Sensor_Model m ON m.model_name=n.model_name WHERE m.id IS NULL)
    THROW 50002, 'Lipsesc modele Sensor_Model. Ruleaza 01_sensor_catalog_migration.sql.', 1;

INSERT INTO dbo.Sensor (nume, sensor_type, description, latitude, longitude, sensor_model_id, serial_number)
SELECT  n.nume, n.sensor_type, '[SINTETIC] ' + n.description,
        n.latitude, n.longitude, m.id, n.serial
FROM @net n
JOIN dbo.Sensor_Model m ON m.model_name = n.model_name
WHERE NOT EXISTS (SELECT 1 FROM dbo.Sensor s WHERE s.serial_number = n.serial);

SELECT LEFT(nume, CHARINDEX('-', nume) - 1) AS regiune, sensor_type, COUNT(*) AS nr
FROM dbo.Sensor WHERE serial_number LIKE 'SYN-%'
GROUP BY LEFT(nume, CHARINDEX('-', nume) - 1), sensor_type
ORDER BY regiune, sensor_type;
GO

/* ---------- Verificare ----------
SELECT * FROM dbo.v_Sensor_Deployed WHERE serial_number LIKE 'SYN-%' ORDER BY nume;

---------- Stergere date sintetice (ordinea conteaza din cauza cheilor straine) ----------
DELETE a FROM dbo.Input_acoustic a JOIN dbo.Sensor s ON s.id = a.sensor_id WHERE s.serial_number LIKE 'SYN-%';
DELETE r FROM dbo.Input_radar    r JOIN dbo.Sensor s ON s.id = r.sensor_id WHERE s.serial_number LIKE 'SYN-%';
DELETE i FROM dbo.Input_images   i JOIN dbo.Sensor s ON s.id = i.sensor_id WHERE s.serial_number LIKE 'SYN-%';
DELETE FROM dbo.Sensor WHERE serial_number LIKE 'SYN-%';
---------------------------------- */

GO

-- BEGIN 04_threat_history.sql
USE Winner_Drone_Detectio_System;
GO
IF OBJECT_ID('dbo.Threat_Position_History','U') IS NULL
BEGIN
 CREATE TABLE dbo.Threat_Position_History (
  id BIGINT IDENTITY PRIMARY KEY,
  threat_id BIGINT NOT NULL REFERENCES dbo.Threat(id),
  latitude DECIMAL(9,6) NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude DECIMAL(9,6) NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  observed_at DATETIME2 NOT NULL,
  CONSTRAINT UQ_ThreatHistory UNIQUE(threat_id,observed_at)
 );
 CREATE INDEX IX_ThreatHistory_Time ON dbo.Threat_Position_History(threat_id,observed_at DESC);
END;
GO
CREATE OR ALTER TRIGGER dbo.tr_Threat_Position_History ON dbo.Threat AFTER INSERT, UPDATE AS
BEGIN
 SET NOCOUNT ON;
 INSERT dbo.Threat_Position_History(threat_id,latitude,longitude,observed_at)
 SELECT i.id,i.latitude,i.longitude,i.last_seen_at FROM inserted i
 WHERE i.latitude BETWEEN -90 AND 90 AND i.longitude BETWEEN -180 AND 180
 AND NOT EXISTS(SELECT 1 FROM dbo.Threat_Position_History h WITH(UPDLOCK,HOLDLOCK)
                WHERE h.threat_id=i.id AND h.observed_at=i.last_seen_at);
END;
GO
INSERT dbo.Threat_Position_History(threat_id,latitude,longitude,observed_at)
SELECT t.id,t.latitude,t.longitude,t.last_seen_at FROM dbo.Threat t
WHERE t.latitude BETWEEN -90 AND 90 AND t.longitude BETWEEN -180 AND 180
AND NOT EXISTS(SELECT 1 FROM dbo.Threat_Position_History h WHERE h.threat_id=t.id AND h.observed_at=t.last_seen_at);
GO
-- Importam istoricul radar numai daca drone_id refera Threat, nu o alta tabela Drone.
IF EXISTS(SELECT 1 FROM sys.foreign_key_columns WHERE parent_object_id=OBJECT_ID('dbo.Input_radar')
          AND referenced_object_id=OBJECT_ID('dbo.Threat')
          AND COL_NAME(parent_object_id,parent_column_id)='drone_id')
BEGIN
 INSERT dbo.Threat_Position_History(threat_id,latitude,longitude,observed_at)
 SELECT r.drone_id,AVG(r.latitude),AVG(r.longitude),r.detected_at
 FROM dbo.Input_radar r JOIN dbo.Threat t ON t.id=r.drone_id
 WHERE r.latitude BETWEEN -90 AND 90 AND r.longitude BETWEEN -180 AND 180
 AND NOT EXISTS(SELECT 1 FROM dbo.Threat_Position_History h WHERE h.threat_id=r.drone_id AND h.observed_at=r.detected_at)
 GROUP BY r.drone_id,r.detected_at;
END;
GO

GO

-- BEGIN 05_auth_storage.sql
USE Winner_Drone_Detectio_System;
GO
-- Only widen short text columns. Do not truncate/rewrite existing credentials.
DECLARE @column sysname, @type sysname, @length smallint, @nullable bit, @sql nvarchar(max);
DECLARE auth_columns CURSOR LOCAL FAST_FORWARD FOR
SELECT c.name, t.name, c.max_length, c.is_nullable
FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id
WHERE c.object_id=OBJECT_ID(N'dbo.Users') AND c.name IN ('salt','password_hash');
OPEN auth_columns;
FETCH NEXT FROM auth_columns INTO @column,@type,@length,@nullable;
WHILE @@FETCH_STATUS=0
BEGIN
    IF @type NOT IN ('varchar','nvarchar')
        THROW 50002, 'Users.salt/password_hash trebuie sa fie varchar sau nvarchar. Verifica schema; nu converti automat credentialele binare.', 1;
    IF @length<>-1 AND @length < CASE WHEN @type='nvarchar' THEN 128 ELSE 64 END
    BEGIN
        SET @sql=N'ALTER TABLE dbo.Users ALTER COLUMN '+QUOTENAME(@column)+N' '+@type+N'(64) '+CASE WHEN @nullable=1 THEN N'NULL' ELSE N'NOT NULL' END;
        EXEC sp_executesql @sql;
    END;
    FETCH NEXT FROM auth_columns INTO @column,@type,@length,@nullable;
END;
CLOSE auth_columns;
DEALLOCATE auth_columns;
GO

GO
