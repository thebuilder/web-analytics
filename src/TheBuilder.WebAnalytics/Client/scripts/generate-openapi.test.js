import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { generateOpenApiClient } from './generate-openapi.js';

const scriptPath = fileURLToPath(new URL('./generate-openapi.js', import.meta.url));

const runGenerator = (url) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [scriptPath, ...(url === undefined ? [] : [url])]);
  let output = '';

  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  child.once('error', reject);
  child.once('close', (exitCode) => {
    resolve({ exitCode, output });
  });
});

const startServer = () => new Promise((resolve) => {
  const server = createServer((_, response) => {
    response.statusCode = 500;
    response.statusMessage = 'Test failure';
    response.end('not an OpenAPI document');
  });
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    resolve({ server, url: `http://127.0.0.1:${address.port}/openapi.json` });
  });
});

const closeServer = (server) => new Promise((resolve, reject) => {
  server.close((error) => error === undefined ? resolve() : reject(error));
});

describe('generate-openapi', () => {
  let server;

  afterEach(async () => {
    if (server !== undefined) {
      await closeServer(server);
      server = undefined;
    }
  });

  it('exits non-zero with the existing guidance when the URL is missing', async () => {
    const result = await runGenerator();

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('ERROR: Missing URL to OpenAPI spec');
    expect(result.output).toContain('Umbraco 17 example');
    expect(result.output).toContain('Umbraco 18 example');
  });

  it('exits non-zero when the OpenAPI endpoint returns an error response', async () => {
    const startedServer = await startServer();
    server = startedServer.server;

    const result = await runGenerator(startedServer.url);

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('ERROR: OpenAPI spec returned with a non OK (200) response: 500 Test failure');
  });

  it('reports a rejected fetch as a failed generation', async () => {
    const errors = [];
    const succeeded = await generateOpenApiClient({
      swaggerUrl: 'http://localhost/openapi.json',
      fetchImplementation: async () => {
        throw new Error('network unavailable');
      },
      log: () => {},
      error: (message) => errors.push(message),
    });

    expect(succeeded).toBe(false);
    expect(errors.join('\n')).toContain('network unavailable');
  });

  it('reports a rejected client generation as a failed generation', async () => {
    const errors = [];
    const succeeded = await generateOpenApiClient({
      swaggerUrl: 'http://localhost/openapi.json',
      fetchImplementation: async () => ({ ok: true }),
      createClientImplementation: async () => {
        throw new Error('generation failed');
      },
      log: () => {},
      error: (message) => errors.push(message),
    });

    expect(succeeded).toBe(false);
    expect(errors.join('\n')).toContain('generation failed');
  });

  it('does not report success until the client generator resolves', async () => {
    const logs = [];
    let resolveGeneration;
    const generation = generateOpenApiClient({
      swaggerUrl: 'http://localhost/openapi.json',
      fetchImplementation: async () => ({ ok: true }),
      createClientImplementation: () => new Promise((resolve) => {
        resolveGeneration = resolve;
      }),
      log: (message) => logs.push(message),
      error: () => {},
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(logs).not.toContain('OpenAPI client generated successfully');

    resolveGeneration();

    await expect(generation).resolves.toBe(true);
    expect(logs).toContain('OpenAPI client generated successfully');
  });
});
