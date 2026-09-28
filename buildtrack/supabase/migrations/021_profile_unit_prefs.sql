-- Which unit codes (see src/i18n/units.js) a profile wants shown in the task
-- unit picker. NULL/empty means "not customized yet" — show every unit,
-- same as before this column existed.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unit_prefs text[];
