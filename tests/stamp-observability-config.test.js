import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const stampScript = join(repoRoot, 'scripts', 'stamp-observability-config.js');
const sourceConfig = join(repoRoot, 'public', 'assets', 'js', 'shared', 'observability-config.js');

function runStamp(cwd, env) {
    return spawnSync('node', [stampScript], {
        cwd,
        env: { ...process.env, ...env, PATH: process.env.PATH },
        encoding: 'utf8'
    });
}

function setupFakeDist() {
    const root = mkdtempSync(join(tmpdir(), 'gm-stamp-'));
    const distDir = join(root, 'dist', 'assets', 'js', 'shared');
    mkdirSync(distDir, { recursive: true });
    copyFileSync(sourceConfig, join(distDir, 'observability-config.js'));
    return { root, distFile: join(distDir, 'observability-config.js') };
}

describe('stamp-observability-config.js', () => {
    let root;
    let distFile;

    beforeEach(() => {
        const setup = setupFakeDist();
        root = setup.root;
        distFile = setup.distFile;
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('leaves the file untouched when no env vars are set', () => {
        const before = readFileSync(distFile, 'utf8');
        const result = runStamp(root, {
            PUBLIC_SENTRY_DSN: '',
            PUBLIC_SENTRY_RELEASE: '',
            PUBLIC_ENVIRONMENT: '',
            PUBLIC_PLAUSIBLE_DOMAIN: '',
            PUBLIC_PLAUSIBLE_API_HOST: ''
        });
        expect(result.status).toBe(0);
        expect(readFileSync(distFile, 'utf8')).toBe(before);
    });

    it('exits gracefully when the dist file is missing', () => {
        rmSync(distFile);
        const result = runStamp(root, { PUBLIC_PLAUSIBLE_DOMAIN: 'groupsmix.com' });
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('not found — skipping');
    });

    it('stamps SENTRY_CONFIG fields from env vars', () => {
        const result = runStamp(root, {
            PUBLIC_SENTRY_DSN: 'https://abcd1234@o12345.ingest.sentry.io/67890',
            PUBLIC_SENTRY_RELEASE: 'groupsmix@abc123',
            PUBLIC_ENVIRONMENT: 'production'
        });
        expect(result.status).toBe(0);
        const stamped = readFileSync(distFile, 'utf8');
        expect(stamped).toContain("dsn: 'https://abcd1234@o12345.ingest.sentry.io/67890'");
        expect(stamped).toContain("release: 'groupsmix@abc123'");
        expect(stamped).toContain("environment: 'production'");
    });

    it('stamps PLAUSIBLE_CONFIG fields from env vars', () => {
        const result = runStamp(root, {
            PUBLIC_PLAUSIBLE_DOMAIN: 'groupsmix.com',
            PUBLIC_PLAUSIBLE_API_HOST: 'https://plausible.example.com'
        });
        expect(result.status).toBe(0);
        const stamped = readFileSync(distFile, 'utf8');
        expect(stamped).toContain("domain: 'groupsmix.com'");
        expect(stamped).toContain("apiHost: 'https://plausible.example.com'");
    });

    it('defaults apiHost to https://plausible.io', () => {
        const result = runStamp(root, {
            PUBLIC_PLAUSIBLE_DOMAIN: 'groupsmix.com'
        });
        expect(result.status).toBe(0);
        const stamped = readFileSync(distFile, 'utf8');
        expect(stamped).toContain("apiHost: 'https://plausible.io'");
    });

    it('aborts when the DSN is not a valid Sentry DSN', () => {
        const result = runStamp(root, {
            PUBLIC_SENTRY_DSN: 'not-a-dsn'
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('does not look like a Sentry DSN');
    });

    it('aborts when the Plausible domain is not a valid domain', () => {
        const result = runStamp(root, {
            PUBLIC_PLAUSIBLE_DOMAIN: 'not a domain!'
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('is not a valid domain');
    });

    it('aborts when the Plausible API host is not a valid https URL', () => {
        const result = runStamp(root, {
            PUBLIC_PLAUSIBLE_DOMAIN: 'groupsmix.com',
            PUBLIC_PLAUSIBLE_API_HOST: 'http://insecure.example.com'
        });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('is not a valid https URL');
    });

    it('escapes quotes in stamped values to prevent JS injection', () => {
        const result = runStamp(root, {
            PUBLIC_SENTRY_RELEASE: "groupsmix@abc'; alert('xss"
        });
        // Release strings don't have a strict regex so the value passes
        // validation; the escape must prevent breaking out of the quote.
        expect(result.status).toBe(0);
        const stamped = readFileSync(distFile, 'utf8');
        expect(stamped).toContain("release: 'groupsmix@abc\\'; alert(\\'xss'");
    });
});
