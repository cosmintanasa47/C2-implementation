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
