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

async function captureConsoleErrors(callback) {
  const originalConsoleError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);

  try {
    await callback();
  } finally {
    console.error = originalConsoleError;
  }

  return errors;
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
    const errors = await captureConsoleErrors(async () => {
      const css = await instance.sassProcessor.compile(`${dir}/invalid.scss`);
      assert.equal(css, null);
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0][0], /Error compiling SASS file/);
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

  it('should write to an absolute destination directory', async () => {
    const dir = await createTestDir('render-absolute-destination');
    const destination = path.join(dir, 'generated');
    const instance = createInstance({destination});
    await instance.renderStylesTemplate(`${dir}/simple.scss`);
    const content = await fs.readFile(`${destination}/simple-styles.css.js`, 'utf8');
    assert.ok(content.includes('display: block'));
  });

  it('should skip partial files starting with _', async () => {
    const dir = await createTestDir('render-partial');
    let compileCalled = false;
    const instance = createInstance({
      sassProcessor: {
        compile() {
          compileCalled = true;
        },
      },
    });
    await instance.renderStylesTemplate(`${dir}/_partial.scss`);
    const files = await fs.readdir(dir);
    const partialOutput = files.find((f) => f.startsWith('_partial') && f !== '_partial.scss');
    assert.equal(compileCalled, false);
    assert.equal(partialOutput, undefined);
  });

  it('should preserve braces and escape backticks in CSS content strings', async () => {
    const dir = await createTestDir('render-css-content');
    const inputFile = `${dir}/content.scss`;
    await fs.writeFile(inputFile, '.test::before { content: "}x`"; }\n', 'utf8');
    const instance = createInstance();
    await instance.renderStylesTemplate(inputFile);
    const content = await fs.readFile(`${dir}/content-styles.css.js`, 'utf8');
    assert.ok(content.includes('content: "}x\\`"'));
  });

  it('should replace content between markers in existing file', async () => {
    const dir = await createTestDir('render-markers');
    const outputFile = `${dir}/simple-styles.css.js`;
    const existingContent = `import {css} from 'lit';\n\nconst styles = css\`\n  :host { color: blue; }\n\`;\n\nexport default styles;\n`;
    await fs.writeFile(outputFile, existingContent, 'utf8');
    const instance = createInstance();
    await instance.renderStylesTemplate(`${dir}/simple.scss`);
    const content = await fs.readFile(outputFile, 'utf8');
    assert.ok(content.includes('display: block'));
    assert.ok(!content.includes('color: blue'));
    assert.ok(content.endsWith('\nexport default styles;\n'));
  });

  it('should not generate output for compilation errors', async () => {
    const dir = await createTestDir('render-error');
    const instance = createInstance();
    const filesBefore = await fs.readdir(dir);
    const errors = await captureConsoleErrors(() =>
      instance.renderStylesTemplate(`${dir}/invalid.scss`)
    );
    const filesAfter = await fs.readdir(dir);
    const newFiles = filesAfter.filter((f) => !filesBefore.includes(f) && f.includes('invalid'));
    assert.equal(errors.length, 1);
    assert.match(errors[0][0], /Error compiling SASS file/);
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
    assert.equal(instance.options.once, false);
  });

  it('should set globFiles to empty array when no matches', () => {
    const instance = createInstance();
    assert.deepEqual(instance.globFiles, []);
  });

  it('should trim comma-separated glob patterns', () => {
    const instance = createInstance({customGlob: './*.scss, ./src/**/*.scss'});
    assert.deepEqual(instance.globPatterns, ['./*.scss', './src/**/*.scss']);
  });

  it('should derive bounded watch roots from glob patterns', () => {
    const instance = createInstance({customGlob: './*.scss, ./src/**/*.scss'});
    assert.deepEqual(instance.watchSpecs, [
      {root: process.cwd(), depth: 0},
      {root: path.resolve('src'), depth: undefined},
    ]);
  });
});

describe('unlinkFile', () => {
  it('should remove the output next to the deleted source instead of using shared fileInfo', async () => {
    const dir = await createTestDir('unlink');
    const outputFile = `${dir}/simple-styles.css.js`;
    await fs.writeFile(outputFile, 'generated', 'utf8');
    const instance = createInstance();
    instance.fileInfo = {fileDir: '/wrong/directory', fileExt: '.wrong'};

    await instance.unlinkFile(`${dir}/simple.scss`);

    await assert.rejects(fs.access(outputFile), {code: 'ENOENT'});
  });
});

describe('watchSass', () => {
  it('should discover the first file created under a glob root', async () => {
    const dir = path.join(tmpDir, 'watch-first-file');
    const sourceDir = path.join(dir, 'src', 'components');
    const outputFile = path.join(sourceDir, 'first-styles.css.js');
    await fs.mkdir(dir, {recursive: true});
    const instance = new SassStyleTemplate({
      customGlob: `${dir}/src/**/*.scss`,
      hideReload: true,
      template,
    });
    const watchersReady = Promise.all(
      instance.watchers.map(
        (watcher) => new Promise((resolve) => watcher.once('ready', resolve))
      )
    );

    try {
      await instance.ready;
      await watchersReady;
      await fs.mkdir(sourceDir, {recursive: true});
      await fs.copyFile(`${fixturesDir}/simple.scss`, path.join(sourceDir, 'first.scss'));

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          clearInterval(interval);
          reject(new Error('Timed out waiting for generated output'));
        }, 3000);
        const interval = setInterval(async () => {
          try {
            await fs.access(outputFile);
            clearTimeout(timeout);
            clearInterval(interval);
            resolve();
          } catch (error) {
            if (error.code !== 'ENOENT') {
              clearTimeout(timeout);
              clearInterval(interval);
              reject(error);
            }
          }
        }, 25);
      });
    } finally {
      await Promise.all(instance.watchers.map((watcher) => watcher.close()));
    }
  });
});

describe('once option', () => {
  it('does not start the watcher when enabled', () => {
    let watchStarted = false;

    class WatchRecordingSassStyleTemplate extends SassStyleTemplate {
      watchSass() {
        watchStarted = true;
      }
    }

    new WatchRecordingSassStyleTemplate({
      customGlob: '__none__',
      hideReload: true,
      once: true,
      template,
    });

    assert.equal(watchStarted, false);
  });
});
