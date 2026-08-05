import fs from 'node:fs/promises';
import path from 'node:path';
import {globSync} from 'tinyglobby';
import chokidar from 'chokidar';
import * as sass from 'sass';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';

const color = {
  reset: '\x1b[0m',
  BrightCyan: '\x1b[96m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  grey: '\x1b[90m',
};

const delimTemplate = /<%\s*content\s*%>/;

/**
 * @typedef {object} SassStyleTemplateOptions
 * @property {string} [markerStart] - The start marker for CSS injection.
 * @property {string} [markerEnd] - The end marker for CSS injection.
 * @property {string} [customGlob] - The glob pattern for SASS files.
 * @property {boolean} [cssFile] - Generate a CSS file instead of JS or TS.
 * @property {boolean} [woSuffix] - Whether to omit the suffix.
 * @property {string} [jsFile] - The JavaScript file extension.
 * @property {string} [destination] - The destination directory.
 * @property {boolean} [hideReload] - Suppress reload info output.
 * @property {boolean} [once] - Process matching files once without watching.
 * @property {string} [template] - The template content.
 * @property {string[]} [loadPaths] - Paths to resolve @use/@import.
 * @property {SassProcessor} [sassProcessor] - The SASS processor instance.
 * @property {CssProcessor} [cssProcessor] - The CSS processor instance.
 * @property {FileHandler} [fileHandler] - The file handler instance.
 */

class SassProcessor {
  /**
   * @param {Object} [options]
   * @param {string[]} [options.loadPaths=['node_modules']] - Paths to resolve @use/@import.
   */
  constructor({loadPaths = ['node_modules']} = {}) {
    this.loadPaths = loadPaths;
  }

  /**
   * Compiles a SASS file.
   * @param {string} file - The path to the SASS file.
   * @returns {Promise<string|null>} - The compiled CSS or null if an error occurred.
   */
  async compile(file) {
    try {
      const result = sass.compile(file, {loadPaths: this.loadPaths, charset: false});
      return result.css;
    } catch (error) {
      console.error(`Error compiling SASS file ${file}:`, error);
      return null;
    }
  }
}

class CssProcessor {
  /**
   * Adds vendor prefixes to CSS.
   * @param {string} css - The raw CSS.
   * @returns {Promise<string|null>} - The processed CSS or null if an error occurred.
   */
  async autoprefix(css) {
    try {
      const result = await postcss([autoprefixer]).process(css, {
        from: undefined,
      });
      return result.css;
    } catch (error) {
      console.error(`Error processing CSS with autoprefixer:`, error);
      return null;
    }
  }
}

class FileHandler {
  /**
   * @param {string|undefined} destination - The destination directory.
   */
  constructor(destination) {
    this.destination = destination || '';
  }

  /**
   * Cleans and resolves the destination path.
   * @returns {Promise<string>} - The cleaned and resolved path.
   */
  async cleanDestinationPath() {
    const cleanedPath = path.resolve(this.destination);
    await fs.mkdir(cleanedPath, {recursive: true});
    return cleanedPath;
  }

  /**
   * Writes the CSS result to a file.
   * @param {string} fileName - The name of the file.
   * @param {string} cssResult - The CSS content to write.
   */
  async writeTemplate(fileName, cssResult, hideReload=false) {
    try {
      await fs.writeFile(fileName, cssResult, 'utf8');
      if (!hideReload) {
        console.info(
          `${color.BrightCyan}[sass]${color.green} reload ${color.grey}${fileName}${color.reset}`
        );
      }
    } catch (error) {
      console.error(`Error writing template to file ${fileName}:`, error);
    }
  }
}

/**
 * Main class to handle SASS style template processing.
 */
export class SassStyleTemplate {
  /**
   * Creates an instance of SassStyleTemplate.
  * @param {SassStyleTemplateOptions} [options] - The configuration options.
   */
  constructor({
    markerStart = 'const styles = css`',
    markerEnd = '`;',
    customGlob = './*.scss,./src/**/*.scss',
    cssFile = undefined,
    woSuffix = undefined,
    jsFile = 'js',
    destination = undefined,
    hideReload = false,
    once = false,
    template = '',
    loadPaths = ['node_modules'],
    sassProcessor = new SassProcessor({loadPaths}),
    cssProcessor = new CssProcessor(),
    fileHandler = new FileHandler(destination),
  } = {}) {
    this.options = {
      markerStart,
      markerEnd,
      customGlob,
      cssFile,
      woSuffix,
      jsFile,
      destination,
      hideReload,
      once,
      template,
      loadPaths,
    };
    this.sassProcessor = sassProcessor;
    this.cssProcessor = cssProcessor;
    this.fileHandler = fileHandler;
    /** @type {Record<string, string>} */
    this.fileInfo = {};
    /** @type {string[]} */
    this.globFiles = globSync(this.globPatterns);

    this.ready = this.init();
  }

  get globPatterns() {
    return this.options.customGlob
      .split(',')
      .map((pattern) => pattern.trim())
      .filter(Boolean);
  }

  get watchSpecs() {
    const specs = new Map();

    for (const pattern of this.globPatterns.filter((value) => !value.startsWith('!'))) {
      const magicPosition = pattern.search(/[*?[{(]/);
      const staticPart = magicPosition < 0 ? pattern : pattern.slice(0, magicPosition);
      const root = path.resolve(staticPart.endsWith('/') ? staticPart : path.dirname(staticPart));
      const dynamicPart = magicPosition < 0 ? '' : pattern.slice(magicPosition);
      const segments = dynamicPart.split('/').filter(Boolean);
      const depth = segments.includes('**') ? undefined : Math.max(segments.length - 1, 0);
      const currentDepth = specs.get(root);

      if (!specs.has(root)) {
        specs.set(root, depth);
      } else if (currentDepth === undefined || depth === undefined) {
        specs.set(root, undefined);
      } else {
        specs.set(root, Math.max(currentDepth, depth));
      }
    }

    return [...specs].map(([root, depth]) => ({root, depth}));
  }

  /**
   * @param {string} fileName - The source SASS file.
   * @returns {Promise<{fileNameWithoutExt: string, fileExt: string, fileDir: string}>}
   */
  async getFileInfo(fileName) {
    return {
      fileNameWithoutExt: path.basename(fileName, '.scss'),
      fileExt: this.options.cssFile
        ? `${this.options.woSuffix ? '' : '-styles'}.css`
        : `${this.options.woSuffix ? '' : '-styles'}.css.${this.options.jsFile}`,
      fileDir: this.options.destination
        ? await this.fileHandler.cleanDestinationPath()
        : path.dirname(fileName),
    };
  }

  /**
   * Renders the styles template for a given SASS file.
   * @param {string} fileName - The name of the SASS file.
   */
  async renderStylesTemplate(fileName) {
    if (path.basename(fileName).startsWith('_')) {
      return;
    }

    const rawCss = await this.sassProcessor.compile(fileName);

    if (!rawCss) {
      return;
    }

    const processedContent = await this.cssProcessor.autoprefix(rawCss);

    if (!processedContent) {
      return;
    }

    const cssWithLine = `\n${processedContent.replace(/^(?!\s*$)/gm, '  ')}\n`;
    const cssResult = this.options.cssFile ? cssWithLine : cssWithLine.replace(/`/g, '\\`');

    const fileInfo = await this.getFileInfo(fileName);
    this.fileInfo = fileInfo;
    const fileNameStyle = path.join(
      fileInfo.fileDir,
      `${fileInfo.fileNameWithoutExt}${fileInfo.fileExt}`
    );
    if (this.options.cssFile) {
      return this.fileHandler.writeTemplate(fileNameStyle, cssResult, this.options.hideReload);
    }

    try {
      const userFileExists = await fs
        .access(fileNameStyle)
        .then(() => true)
        .catch(() => false);

      if (userFileExists) {
        const file = await fs.readFile(fileNameStyle, 'utf8');
        const startReplacePosition = file.indexOf(this.options.markerStart);
        if (startReplacePosition >= 0) {
          const endReplacePosition = file.indexOf(
            this.options.markerEnd,
            startReplacePosition + this.options.markerStart.length
          );
          if (endReplacePosition < 0) {
            throw new Error(
              `${color.red}No found marker end "${this.options.markerEnd}" in file.${color.reset}`
            );
          }
          const content = `${file.substring(
            0,
            startReplacePosition + this.options.markerStart.length
          )}${cssResult.trimEnd()}\n${file.substring(endReplacePosition)}`;
          return this.fileHandler.writeTemplate(fileNameStyle, content, this.options.hideReload);
        } else {
          throw new Error(
            `${color.red}No found marker start "${this.options.markerStart}" in file.${color.reset}`
          );
        }
      }
      const content = this.options.template.replace(delimTemplate, `${cssResult.trimEnd()}\n`);
      return this.fileHandler.writeTemplate(fileNameStyle, content, this.options.hideReload);
    } catch (error) {
      console.error(`Error processing file ${fileNameStyle}:`, error);
    }
  }

  /**
   * Watches for changes in SASS files and processes them.
   */
  watchSass() {
    /** @param {string} filePath */
    const isGlobFile = (filePath) =>
      this.globFiles.some((file) => path.resolve(file) === path.resolve(filePath));
    const processGlob = () => {
      this.globSassFile(this.renderStylesTemplate).catch((err) =>
        console.error(`Watcher ${color.red}${err}${color.reset}`)
      );
    };

    this.watchers = this.watchSpecs.map(({root, depth}) => {
      const watcher = chokidar.watch(root, {ignoreInitial: true, depth});

      watcher.on('change', (filePath) => {
        this.updateGlob();
        if (isGlobFile(filePath)) {
          processGlob();
        }
      });

      watcher.on('add', (filePath) => {
        if (!filePath.endsWith('.scss')) {
          return;
        }
        this.updateGlob();
        if (isGlobFile(filePath)) {
          processGlob();
        }
      });

      watcher.on('unlink', async (filePath) => {
        if (!filePath.endsWith('.scss') || !isGlobFile(filePath)) {
          return;
        }
        this.updateGlob();
        if (path.basename(filePath).startsWith('_')) {
          processGlob();
          return;
        }
        await this.unlinkFile(filePath);
      });

      watcher.on('error', (err) => console.error(`Watcher ${color.red}${err}${color.reset}`));
      return watcher;
    });

    if (!this.watchers.length) {
      console.info(
        `${color.BrightCyan}[sass]${color.grey} No valid SASS glob patterns to watch. ${color.reset}`
      );
    }
  }

  /**
   * Unlinks a processed CSS file when the corresponding SASS file is deleted.
   * @param {string} file - The path to the SASS file.
   */
  async unlinkFile(file) {
    if (path.basename(file).startsWith('_')) {
      return;
    }

    const fileInfo = await this.getFileInfo(file);
    const fileToUnlink = path.join(
      fileInfo.fileDir,
      `${fileInfo.fileNameWithoutExt}${fileInfo.fileExt}`
    );
    try {
      await fs.unlink(fileToUnlink);
      console.info(`${color.red}file removed ${path.basename(fileToUnlink)}${color.reset}`);
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
        return;
      }
      console.error(`${color.red}${err}${color.reset}`);
    }
  }

  updateGlob() {
    this.globFiles = globSync(this.globPatterns);
  }

  /**
   * Processes each SASS file using the provided callback.
   * @param {Function} cb - The callback function to process each file.
   */
  globSassFile(cb) {
    return Promise.all(this.globFiles.map((file) => cb.call(this, file)));
  }

  /**
   * Initializes the SASS style template processing.
   */
  async init() {
    const hasGlobFiles = this.globFiles && this.globFiles.length > 0;

    if (!hasGlobFiles) {
      console.info(
        `${color.BrightCyan}[sass]${color.grey} No SASS files found to process. ${color.reset}`
      );
    }

    if (!this.options.once) {
      this.watchSass();
    }
    await this.globSassFile(this.renderStylesTemplate);
  }
}
