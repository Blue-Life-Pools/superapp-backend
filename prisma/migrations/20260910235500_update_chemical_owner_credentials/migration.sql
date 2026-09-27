DELETE FROM "ChemicalOwnerSession"
WHERE "ownerId" = '65c4cb9f-3c06-4bcf-a6a4-a78f72bbd06c';

UPDATE "ChemicalOwner"
SET
    "email" = 'ximena.velosa@bluelifepools.com',
    "passwordHash" = 'scrypt$cb38755752188779932d1f07e5f36dbc$3dc1ab4d15099e81f843795b87c826b4265b45cc52af57d259fe2499785f65c57ae3751d330ea81b231a44065622dcd179d63daa519b09a899807f4ec3eeb821',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = '65c4cb9f-3c06-4bcf-a6a4-a78f72bbd06c';
