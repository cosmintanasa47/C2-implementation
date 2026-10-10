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
