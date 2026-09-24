// Vitest setup: runs before any test import.
// Server modules construct a (lazy, never-connected) Prisma client at
// import time; give it a dummy URL so collection never touches a database.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://localhost:5432/fuelup_test_dummy';
}
