-- Existing naive timestamps were stored as local Swedish wall time.
ALTER TABLE "AuditLog"
ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3)
USING ("createdAt" AT TIME ZONE 'Europe/Stockholm');
