ALTER TABLE products
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE TRIGGER audit_logs_append_only_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are append-only');
END;

CREATE TRIGGER audit_logs_append_only_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs are append-only');
END;
