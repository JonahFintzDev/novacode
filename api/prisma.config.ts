import { defineConfig } from 'prisma/config';

function resolveDatabaseUrl(): string {
  const explicit = process.env['DATABASE_URL']?.trim();
  if (explicit) return explicit;

  const user = process.env['POSTGRES_USER'];
  const password = process.env['POSTGRES_PASSWORD'];
  const db = process.env['POSTGRES_DB'];
  const host = process.env['POSTGRES_HOST'] ?? 'localhost';
  const port = process.env['POSTGRES_PORT'] ?? '5432';

  if (!user || !password || !db) {
    return 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    url: resolveDatabaseUrl()
  }
});
