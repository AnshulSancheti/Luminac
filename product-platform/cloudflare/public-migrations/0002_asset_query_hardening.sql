-- Keep the internet-facing projection limited to reviewed visual asset roles.
-- Binary discovery happens through D1 metadata; R2 is never listed by clients.

CREATE UNIQUE INDEX IF NOT EXISTS product_assets_product_asset_unique_idx
  ON product_assets(product_id, asset_id);

CREATE INDEX IF NOT EXISTS product_families_environment_sort_idx
  ON product_families(environment, sort_order, id);

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
