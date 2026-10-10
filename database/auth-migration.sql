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
