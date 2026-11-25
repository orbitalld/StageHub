CREATE INDEX IF NOT EXISTS idx_items_company_category_name ON items(company_id,category_id,name,id);
CREATE INDEX IF NOT EXISTS idx_items_company_name ON items(company_id,name,id);
CREATE INDEX IF NOT EXISTS idx_items_photo ON items(photo);
CREATE INDEX IF NOT EXISTS idx_companies_logo ON companies(logo);
