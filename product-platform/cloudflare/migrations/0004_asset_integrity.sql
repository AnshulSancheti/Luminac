-- Public catalogue derivatives are limited to the V1 visual roles. Private
-- technical assets may retain other roles because they are never projected.

CREATE UNIQUE INDEX IF NOT EXISTS product_assets_product_asset_unique_idx
  ON product_assets(product_id, asset_id);

CREATE TRIGGER IF NOT EXISTS product_assets_public_role_insert_guard
BEFORE INSERT ON product_assets
WHEN NEW.is_public = 1 AND NEW.asset_role NOT IN ('product', 'application', 'line_drawing')
BEGIN
  SELECT RAISE(ABORT, 'unsupported public asset role');
END;

CREATE TRIGGER IF NOT EXISTS product_assets_public_role_update_guard
BEFORE UPDATE OF asset_role, is_public ON product_assets
WHEN NEW.is_public = 1 AND NEW.asset_role NOT IN ('product', 'application', 'line_drawing')
BEGIN
  SELECT RAISE(ABORT, 'unsupported public asset role');
END;

PRAGMA optimize;
