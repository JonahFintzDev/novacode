// node_modules
import type { FastifyInstance } from 'fastify';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { existsSync } from 'node:fs';

// classes
import { jwtPreHandler, verifyToken } from '../classes/auth';
import { db } from '../classes/database';
import { config } from '../classes/config';

// --------------------------------------------- Config ---------------------------------------------

const IMAGE_DIR = join(config.configDir, 'prompt-images');

const ALLOWED_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp'
};

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

// --------------------------------------------- Helpers ---------------------------------------------

export async function deleteSessionImages(sessionId: string): Promise<void> {
  const dir = join(IMAGE_DIR, sessionId);
  // guard: only delete inside IMAGE_DIR
  if (!dir.startsWith(IMAGE_DIR + '/')) return;
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // non-critical — ignore if directory doesn't exist
  }
}

// --------------------------------------------- Routes ---------------------------------------------

export async function imageRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/sessions/:sessionId/images — upload a base64-encoded image
  fastify.post(
    '/api/sessions/:sessionId/images',
    { preHandler: jwtPreHandler },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const body = request.body as { data: string; mimeType: string };

      const session = await db.getSession(sessionId);
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }

      const ext = ALLOWED_MIME[body.mimeType];
      if (!ext) {
        return reply.status(400).send({ error: 'Unsupported image type' });
      }

      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      const dir = join(IMAGE_DIR, sessionId);

      if (!dir.startsWith(IMAGE_DIR + '/')) {
        return reply.status(400).send({ error: 'Invalid session ID' });
      }

      await mkdir(dir, { recursive: true });

      const buf = Buffer.from(body.data, 'base64');
      const filePath = join(dir, filename);
      await writeFile(filePath, buf);

      return reply.status(201).send({ path: filePath, filename });
    }
  );

  // GET /api/sessions/:sessionId/images/:filename — serve an uploaded image
  // Accepts token as query param so <img> tags can load authenticated images.
  fastify.get(
    '/api/sessions/:sessionId/images/:filename',
    async (request, reply) => {
      const query = request.query as Record<string, string>;
      const token = query['token'] ?? (request.headers['authorization'] ?? '').replace(/^Bearer /, '');
      try {
        await verifyToken(token);
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const { sessionId, filename } = request.params as {
        sessionId: string;
        filename: string;
      };

      const dir = join(IMAGE_DIR, sessionId);
      if (!dir.startsWith(IMAGE_DIR + '/')) {
        return reply.status(400).send({ error: 'Invalid session ID' });
      }

      // prevent path traversal via filename
      const safeName = basename(filename);
      const filePath = join(dir, safeName);
      if (!filePath.startsWith(dir + '/')) {
        return reply.status(400).send({ error: 'Invalid filename' });
      }

      if (!existsSync(filePath)) {
        return reply.status(404).send({ error: 'Image not found' });
      }

      const contentType = CONTENT_TYPES[extname(safeName).toLowerCase()] ?? 'application/octet-stream';
      const data = await readFile(filePath);
      return reply.header('Content-Type', contentType).send(data);
    }
  );
}
