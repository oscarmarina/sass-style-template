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

class SassProcessor {
  /**
   * Compiles a SASS file.
   * @param {string} file - The path to the SASS file.
   * @returns {Promise<string|null>} - The compiled CSS or null if an error occurred.
   */
  async compile(file) {
    try {
      const result = sass.compile(file);
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
    const cleanedPath = path.resolve(this.destination).replace(/^\/+|\/+$/g, '');
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
   * @param {Object} options - The configuration options.
   * @param {string} [options.markerStart='const styles = css`'] - The start marker for CSS injection.
   * @param {string} [options.markerEnd='`;'] - The end marker for CSS injection.
   * @param {string} [options.customGlob='./*.scss,./src/**\/**\/*.scss'] - The glob pattern for SASS files.
   * @param {string} [options.cssFile] - Generate a CSS file instead of JS or TS.
   * @param {boolean} [options.woSuffix] - Whether to omit the suffix.
   * @param {string} [options.jsFile='js'] - The JavaScript file extension.
   * @param {string} [options.destination] - The destination directory.
   * @param {boolean} [options.hideReload = false] - suppress reload info output.
   * @param {string} [options.template=''] - The template content.
   * @param {SassProcessor} [options.sassProcessor=new SassProcessor()] - The SASS processor instance.
   * @param {CssProcessor} [options.cssProcessor=new CssProcessor()] - The CSS processor instance.
   * @param {FileHandler} [options.fileHandler=new FileHandler(destination)] - The file handler instance.
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
    template = '',
    sassProcessor = new SassProcessor(),
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
      template,
    };
    this.sassProcessor = sassProcessor;
    this.cssProcessor = cssProcessor;
    this.fileHandler = fileHandler;
    this.globFiles = globSync(this.options.customGlob.split(','));

    this.init();
  }

  get fileInfo() {
    return this._fileInfo;
  }

  set fileInfo(fileInfo) {
    this._fileInfo = fileInfo || {};
  }

  get globFiles() {
    return this._globFiles;
  }

  set globFiles(files) {
    this._globFiles = files || [];
  }

  /**
   * Renders the styles template for a given SASS file.
   * @param {string} fileName - The name of the SASS file.
   */
  async renderStylesTemplate(fileName) {
    const rawCss = await this.sassProcessor.compile(fileName);

    if (!rawCss) {
      return;
    }

    const processedContent = await this.cssProcessor.autoprefix(rawCss);

    if (!processedContent) {
      return;
    }

    if (path.basename(fileName).startsWith('_')) {
      return;
    }

    const cssResult = `\n${processedContent.replace(/^(?!\s*$)/gm, '  ')}\n`;

    this.fileInfo = {
      fileNameWithoutExt: path.basename(fileName, '.scss'),
      fileExt: this.options.cssFile
        ? `${this.options.woSuffix ? '' : '-styles'}.css`
        : `${this.options.woSuffix ? '' : '-styles'}.css.${this.options.jsFile}`,
    };

    if (!this.options.destination) {
      this.fileInfo = {...this.fileInfo, fileDir: path.dirname(fileName)};
    } else {
      this.fileInfo = {
        ...this.fileInfo,
        fileDir: await this.fileHandler.cleanDestinationPath(),
      };
    }

    const fileNameStyle = `${this.fileInfo.fileDir}/${this.fileInfo.fileNameWithoutExt}${this.fileInfo.fileExt}`;
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
          const content = `${file.substring(
            0,
            startReplacePosition + this.options.markerStart.length
          )}${cssResult}${this.options.markerEnd}\n`;
          return this.fileHandler.writeTemplate(fileNameStyle, content, this.options.hideReload);
        } else {
          throw new Error(
            `${color.red}No found marker start "${this.options.markerStart}" in file.${color.reset}`
          );
        }
      }

      const content = this.options.template.replace(delimTemplate, cssResult);
      return this.fileHandler.writeTemplate(fileNameStyle, content, this.options.hideReload);
    } catch (error) {
      console.error(`Error processing file ${fileNameStyle}:`, error);
    }
  }

  /**
   * Watches for changes in SASS files and processes them.
   * @param {string | string[]} glob - The glob pattern for SASS files.
   */
  watchSass(glob) {
    const watcher = chokidar.watch(glob, {ignoreInitial: true});

    watcher.on('change', () => {
      this.globSassFile(this.renderStylesTemplate);
    });

    watcher.on('add', () => {
      this.updateGlob();
    });

    watcher.on('unlink', (filePath) => {
      this.updateGlob();
      this.unlinkFile(filePath);
    });

    watcher.on('error', (err) => console.error(`Watcher ${color.red}${err}${color.reset}`));
  }

  /**
   * Unlinks a processed CSS file when the corresponding SASS file is deleted.
   * @param {string} file - The path to the SASS file.
   */
  async unlinkFile(file) {
    const fileNameWithoutExt = path.basename(file, '.scss');
    const fileToUnlink = `${this.fileInfo.fileDir}/${fileNameWithoutExt}${this.fileInfo.fileExt}`;
    try {
      await fs.unlink(fileToUnlink);
      console.info(`${color.red}file removed ${path.basename(fileToUnlink)}${color.reset}`);
    } catch (err) {
      console.error(`${color.red}${err}${color.reset}`);
    }
  }

  updateGlob() {
    this.globFiles = globSync(this.options.customGlob.split(','));
  }

  /**
   * Processes each SASS file using the provided callback.
   * @param {Function} cb - The callback function to process each file.
   */
  globSassFile(cb) {
    this.globFiles.forEach((file) => {
      cb.call(this, file);
    });
  }

  /**
   * Initializes the SASS style template processing.
   */
  init() {
    const hasGlobFiles = this.globFiles && this.globFiles.length > 0;
    const globFiles = hasGlobFiles ? this.globFiles : [` `];

    if (!hasGlobFiles) {
      console.info(
        `${color.BrightCyan}[sass]${color.grey} No SASS files found to process. ${color.reset}`
      );
    }

    this.watchSass(globFiles);
    this.globSassFile(this.renderStylesTemplate);
  }
}
