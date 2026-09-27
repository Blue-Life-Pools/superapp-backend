INSERT INTO "ChemicalOwner" (
    "id",
    "name",
    "email",
    "passwordHash",
    "active",
    "createdAt",
    "updatedAt"
)
VALUES (
    'c4e5d6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f',
    'Ricardo',
    'ricardor@bluelifepools.com',
    'scrypt$52f84c2dfb9debebe821fd3190fdbcab$47f21c9195e5141677b13a39f5200867d8bfecae87ae7e0ca5c550d84c4fc80b02a12d4512879fe2c35a4cf1ab356908773ea9ca1265a773a35b54af14bb5ad1',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE SET
    "name" = EXCLUDED."name",
    "passwordHash" = EXCLUDED."passwordHash",
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;
