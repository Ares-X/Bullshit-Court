import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'court-personas-'));
let casts;
try {
  const entry = join(directory, 'courtCasts.mjs');
  await build({ entryPoints: [fileURLToPath(new URL('../src/data/courtCasts.ts', import.meta.url))], outfile: entry, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent' });
  casts = await import(pathToFileURL(entry).href);
} finally { await rm(directory, { recursive: true, force: true }); }

// Cast choice must carry role personas to the dossier external agents actually read.
test('each judge selection preserves the parties and supplies distinct role personas', () => {
  const dossier = { id: 'persona-case', plaintiffName: '小林', defendantName: '小陈' };
  const styles = { judge: new Set(), plaintiff: new Set(), defendant: new Set() };
  for (const cast of casts.COURT_CASTS) {
    const selected = casts.applyCourtCast(dossier, cast.id);
    assert.equal(casts.getCourtCast(selected).id, cast.id);
    assert.equal(selected.agents.judge.name, cast.judgeName);
    assert.equal(selected.agents.plaintiff.name, '小林');
    assert.equal(selected.agents.defendant.name, '小陈');
    for (const role of ['judge', 'plaintiff', 'defendant']) {
      assert.equal(selected.agents[role].id, `cast:${cast.id}:${role}`);
      assert.equal(selected.agents[role].persona, cast.style[role]);
      styles[role].add(selected.agents[role].persona);
    }
    assert.equal(dossier.agents, undefined);
  }
  for (const role of ['judge', 'plaintiff', 'defendant']) assert.equal(styles[role].size, casts.COURT_CASTS.length);
});

test('each configured cast has a readable fixed judge prompt', async () => {
  for (const cast of casts.COURT_CASTS) {
    const prompt = await readFile(new URL(`../public/agents/judges/${cast.id}.md`, import.meta.url), 'utf8');
    assert.ok(prompt.includes(`cast:${cast.id}:judge`));
    assert.ok(prompt.includes(cast.judgeName));
  }
});
