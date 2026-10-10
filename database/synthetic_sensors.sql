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
