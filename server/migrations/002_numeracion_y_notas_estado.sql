-- Numeración propia de cada máquina (ej. "Beam N.º 12") y notas de mantención / fuera de servicio.
ALTER TABLE units ADD COLUMN unit_number INTEGER CHECK (unit_number IS NULL OR unit_number >= 1);
ALTER TABLE units ADD COLUMN status_note TEXT;
ALTER TABLE units ADD COLUMN status_changed_at TEXT;
ALTER TABLE units ADD COLUMN status_changed_by TEXT;

-- Las unidades que ya existían se numeran 1..n dentro de su equipo, en orden de creación.
UPDATE units SET unit_number = (SELECT COUNT(*) FROM units u2 WHERE u2.item_id = units.item_id AND u2.id <= units.id);
CREATE UNIQUE INDEX uq_units_number ON units(item_id, unit_number) WHERE unit_number IS NOT NULL;

-- Equipos por cantidad: nota general de los que están en mantención / fuera de servicio.
ALTER TABLE items ADD COLUMN maintenance_note TEXT;
ALTER TABLE items ADD COLUMN out_of_service_note TEXT;
