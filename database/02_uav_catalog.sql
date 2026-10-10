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
