-- UNIQUE(product_id, asset_role, sort_order) already creates an index with the
-- same leftmost columns, so retaining this second copy only adds write/storage
-- overhead.

DROP INDEX IF EXISTS product_assets_product_idx;
PRAGMA optimize;
