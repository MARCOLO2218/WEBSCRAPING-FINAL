import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import {
  proxyImage,
  readJsonBody,
  sendJson,
  serveStatic,
} from '../server/http.js';

type CapturedResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
};

function responseDouble(): { response: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = {};
  const response = {
    writeHead: (status: number, headers?: Record<string, string>) => {
      captured.status = status;
      captured.headers = headers;
      return response;
    },
    end: (body?: unknown) => {
      captured.body = body;
      return response;
    },
  } as unknown as ServerResponse;
  return { response, captured };
}

async function requestWithBody(body: string): Promise<IncomingMessage> {
  const request = new PassThrough();
  request.end(body);
  return request as unknown as IncomingMessage;
}

test('el lector JSON conserva cuerpo válido y tolera JSON inválido', async () => {
  const valid = await readJsonBody(await requestWithBody('{"stores":["FACENCO"]}'));
  const invalid = await readJsonBody(await requestWithBody('{invalido'));

  assert.deepEqual(valid, { stores: ['FACENCO'] });
  assert.deepEqual(invalid, {});
});

test('sendJson conserva estado, contenido y serialización', () => {
  const { response, captured } = responseDouble();
  sendJson(response, { ok: true });

  assert.equal(captured.status, 200);
  assert.deepEqual(captured.headers, { 'Content-Type': 'application/json; charset=utf-8' });
  assert.equal(captured.body, '{"ok":true}');
});

test('el proxy de imágenes conserva validaciones previas a la red', async () => {
  for (const [url, message] of [
    [null, 'Falta URL de imagen'],
    ['no-es-url', 'URL de imagen invalida'],
    ['file:///tmp/imagen.png', 'Protocolo de imagen no permitido'],
  ] as const) {
    const { response, captured } = responseDouble();
    await proxyImage(url, response);
    assert.equal(captured.status, 400);
    assert.equal(captured.body, message);
  }
});

test('los archivos estáticos conservan 403 para escape y 404 para faltantes', () => {
  const publicDir = resolve('public');
  const forbidden = responseDouble();
  const missing = responseDouble();

  serveStatic('/../archivo-secreto.txt', forbidden.response, publicDir);
  serveStatic('/archivo-que-no-existe.txt', missing.response, publicDir);

  assert.equal(forbidden.captured.status, 403);
  assert.equal(forbidden.captured.body, 'Forbidden');
  assert.equal(missing.captured.status, 404);
  assert.equal(missing.captured.body, 'Not found');
});
