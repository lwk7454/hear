import { PrismaClient } from '@prisma/client';

import { env } from '../env.js';

const getDbUrl = () => {
  try {
    const sbUrl = new URL(env.SUPABASE_URL);
    const ref = sbUrl.hostname.split('.')[0];
    if (!ref || ref === 'localhost') return process.env.DATABASE_URL || ''; // Fallback for local

    // Construct Direct PostgreSQL Connection String (Session Mode, Port 5432)
    // Format: postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
    return `postgresql://postgres:${env.DB_PASSWORD}@db.${ref}.supabase.co:5432/postgres`;
  } catch (e) {
    console.warn("Failed to derive DATABASE_URL from SUPABASE_URL", e);
    return "";
  }
};

const databaseUrl = getDbUrl();

if (!databaseUrl) {
  console.warn("WARN: DATABASE_URL is missing and could not be derived.");
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl
    }
  }
});
