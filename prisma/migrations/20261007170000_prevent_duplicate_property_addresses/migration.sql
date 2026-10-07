CREATE UNIQUE INDEX "Property_normalized_address_key"
ON "Property" (
  lower(regexp_replace(trim(coalesce("addressLine1", '')), '[^a-z0-9]+', ' ', 'g')),
  lower(regexp_replace(trim(coalesce("city", '')), '[^a-z0-9]+', ' ', 'g')),
  lower(regexp_replace(trim(coalesce("state", '')), '[^a-z0-9]+', ' ', 'g')),
  lower(regexp_replace(trim(coalesce("zipCode", '')), '[^a-z0-9]+', ' ', 'g'))
)
WHERE "addressLine1" IS NOT NULL AND trim("addressLine1") <> '';
