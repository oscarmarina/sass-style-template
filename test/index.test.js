import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {SassStyleTemplate} from '../lib/index.js';

const fixturesDir = path.resolve(import.meta.dirname, 'fixtures');
const template = `import {css} from 'lit';\n\nexport const styles = css\`<% content %>\`;\n`;

let tmpDir;

class TestableSassStyleTemplate extends SassStyleTemplate {
  watchSass() {}
}

function createInstance(overrides = {}) {
  return new TestableSassStyleTemplate({
    customGlob: '__none__',
    hideReload: true,
    template,
    ...overrides,
  });
}

async function createTestDir(name) {
  const dir = path.join(tmpDir, name);
  await fs.mkdir(dir, {recursive: true});
  await fs.copyFile(`${fixturesDir}/simple.scss`, `${dir}/simple.scss`);
  await fs.copyFile(`${fixturesDir}/_partial.scss`, `${dir}/_partial.scss`);
  await fs.copyFile(`${fixturesDir}/with-partial.scss`, `${dir}/with-partial.scss`);
  await fs.copyFile(`${fixturesDir}/invalid.scss`, `${dir}/invalid.scss`);
  return dir;
}

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sass-test-'));
});

after(async () => {
  await fs.rm(tmpDir, {recursive: true, force: true});
});

describe('SassProcessor - compile', () => {
  let dir;
  before(async () => {
    dir = await createTestDir('compile');
  });

  it('should compile a simple .scss file', async () => {
    const instance = createInstance();
    const css = await instance.sassProcessor.compile(`${dir}/simple.scss`);
    assert.ok(css);
    assert.ok(css.includes(':host'));
    assert.ok(css.includes('display: block'));
  });

  it('should compile .scss with @use partial', async () => {
    const instance = createInstance();
    const css = await instance.sassProcessor.compile(`${dir}/with-partial.scss`);
    assert.ok(css);
    assert.ok(css.includes('color: red'));
  });

  it('should return null for invalid .scss', async () => {
    const instance = createInstance();
    const css = await instance.sassProcessor.compile(`${dir}/invalid.scss`);
    assert.equal(css, null);
  });
});

describe('CssProcessor - autoprefix', () => {
  it('should process CSS through autoprefixer', async () => {
    const instance = createInstance();
    const result = await instance.cssProcessor.autoprefix(':host { display: block; }');
    assert.ok(result);
    assert.ok(result.includes('display: block'));
  });
});

describe('renderStylesTemplate', () => {
  it('should generate JS template file by default', async () => {
    const dir = await createTestDir('render-js');
    const instance = createInstance();
    await instance.renderStylesTemplate(`${dir}/simple.scss`);
    const content = await fs.readFile(`${dir}/simple-styles.css.js`, 'utf8');
    assert.ok(content.includes("import {css} from 'lit'"));
    assert.ok(content.includes('display: block'));
  });

  it('should generate CSS file with cssFile option', async () => {
    const dir = await createTestDir('render-css');
    const instance = createInstance({cssFile: true});
    await instance.renderStylesTemplate(`${dir}/simple.scss`);
    const content = await fs.readFile(`${dir}/simple-styles.css`, 'utf8');
    assert.ok(content.includes('display: block'));
    assert.ok(!content.includes('import'));
  });

  it('should omit -styles suffix with woSuffix option', async () => {
    const dir = await createTestDir('render-wo-suffix');
    const instance = createInstance({woSuffix: true});
    await instance.renderStylesTemplate(`${dir}/simple.scss`);
    const content = await fs.readFile(`${dir}/simple.css.js`, 'utf8');
    assert.ok(content.includes('display: block'));
  });

  it('should use .ts extension with jsFile option', async () => {
    const dir = await createTestDir('render-ts');
    const instance = createInstance({jsFile: 'ts'});
    await instance.renderStylesTemplate(`${dir}/simple.scss`);
    const content = await fs.readFile(`${dir}/simple-styles.css.ts`, 'utf8');
    assert.ok(content.includes('display: block'));
  });

  it('should skip partial files starting with _', async () => {
    const dir = await createTestDir('render-partial');
    const instance = createInstance();
    await instance.renderStylesTemplate(`${dir}/_partial.scss`);
    const files = await fs.readdir(dir);
    const partialOutput = files.find((f) => f.startsWith('_partial') && f !== '_partial.scss');
    assert.equal(partialOutput, undefined);
  });

  it('should replace content between markers in existing file', async () => {
    const dir = await createTestDir('render-markers');
    const outputFile = `${dir}/simple-styles.css.js`;
    const existingContent = `import {css} from 'lit';\n\nconst styles = css\`\n  :host { color: blue; }\n\`;\n`;
    await fs.writeFile(outputFile, existingContent, 'utf8');
    const instance = createInstance();
    await instance.renderStylesTemplate(`${dir}/simple.scss`);
    const content = await fs.readFile(outputFile, 'utf8');
    assert.ok(content.includes('display: block'));
    assert.ok(!content.includes('color: blue'));
  });

  it('should not generate output for compilation errors', async () => {
    const dir = await createTestDir('render-error');
    const instance = createInstance();
    const filesBefore = await fs.readdir(dir);
    await instance.renderStylesTemplate(`${dir}/invalid.scss`);
    const filesAfter = await fs.readdir(dir);
    const newFiles = filesAfter.filter((f) => !filesBefore.includes(f) && f.includes('invalid'));
    assert.equal(newFiles.length, 0);
  });
});

describe('loadPaths option', () => {
  it('should default to node_modules', () => {
    const instance = createInstance();
    assert.deepEqual(instance.options.loadPaths, ['node_modules']);
  });

  it('should accept custom loadPaths', () => {
    const instance = createInstance({loadPaths: ['node_modules', 'custom/path']});
    assert.deepEqual(instance.options.loadPaths, ['node_modules', 'custom/path']);
  });

  it('should pass loadPaths to sassProcessor', () => {
    const instance = createInstance({loadPaths: ['node_modules', 'other']});
    assert.deepEqual(instance.sassProcessor.loadPaths, ['node_modules', 'other']);
  });
});

describe('options and defaults', () => {
  it('should set default options', () => {
    const instance = createInstance();
    assert.equal(instance.options.markerStart, 'const styles = css`');
    assert.equal(instance.options.markerEnd, '`;');
    assert.equal(instance.options.jsFile, 'js');
    assert.equal(instance.options.cssFile, undefined);
    assert.equal(instance.options.woSuffix, undefined);
  });

  it('should set globFiles to empty array when no matches', () => {
    const instance = createInstance();
    assert.deepEqual(instance.globFiles, []);
  });
});
