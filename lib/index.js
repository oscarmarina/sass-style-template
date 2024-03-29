const fs = require('fs');
const glob = require('glob');
const sass = require('sass');
const path = require('path');
const chokidar = require('chokidar');
const mkdirp = require('mkdirp');
const autoprefixer = require('autoprefixer');
const postcss = require('postcss');

const color = {
  reset: '\x1b[0m',
  BrightCyan: '\x1b[96m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  grey: '\x1b[90m',
};

const delimTemplate = /<%\s*content\s*%>/;

class SassStyleTemplate {
  constructor({
    markerStart = 'const styles = css`',
    markerEnd = '`;',
    customGlob = './*.scss,./src/**/*.scss',
    cssFile = undefined,
    woSuffix = undefined,
    jsFile = 'js',
    destination = undefined,
    template = fs.readFileSync(
      `${__dirname}/../tpls/sass-template.tmpl`,
      'utf8'
    ),
  } = {}) {
    this.options = {
      markerStart,
      markerEnd,
      customGlob,
      cssFile,
      woSuffix,
      jsFile,
      destination,
      template,
    };
    this.globFiles = glob.sync(`{${this.options.customGlob},}`);

    this.init();
  }

  processCss(css) {
    return postcss([autoprefixer]).process(css).css;
  }

  processSass(file) {
    try {
      const result = sass.compile(file);
      return result.css;
    } catch (err) {
      const errL = `${color.red}${err}${color.reset}`;
      console.info(errL);
    }
  }

  get fileInfo() {
    return this._fileInfo;
  }

  set fileInfo(fileInfo = {}) {
    this._fileInfo = fileInfo;
  }

  get globFiles() {
    return this._globFiles;
  }

  set globFiles(files = []) {
    this._globFiles = files;
  }

  cleanDestinationPath() {
    const strBase = this.options.destination;
    const firstCharacter = strBase.charAt(0);
    const lastCharacter = strBase.charAt(strBase.length - 1);
    let strFinal = strBase;
    if (firstCharacter === path.sep) {
      strFinal = strFinal.slice(1);
    }
    if (lastCharacter === path.sep) {
      strFinal = strFinal.slice(0, strFinal.length - 1);
    }
    mkdirp.sync(strFinal);

    return `${path.resolve(strFinal)}`;
  }

  writeTemplate(fileName, cssResult) {
    fs.writeFileSync(fileName, cssResult, 'utf8');
    const relL = `${color.BrightCyan}[sass]${color.green} reload`;
    const filL = `${color.grey}${this.fileInfo.fileNameWithoutExt}${this.fileInfo.fileExt}${color.reset}`;
    console.info(`${relL} ${filL}`);
  }

  renderStylesTemplate(fileName) {
    const cssResult = this.processCss(this.processSass(fileName));

    if (path.basename(fileName).charAt(0) === '_') {
      return;
    }

    this.fileInfo = {
      fileNameWithoutExt: path.basename(fileName, '.scss'),
      fileExt: this.options.cssFile
        ? `${this.options.woSuffix ? '' : '-styles'}.css`
        : `${this.options.woSuffix ? '' : '-styles'}.css.${
            this.options.jsFile
          }`,
    };

    if (!this.options.destination) {
      this.fileInfo = Object.assign(this.fileInfo, {
        fileDir: path.dirname(fileName),
      });
    }

    if (this.options.destination) {
      this.fileInfo = Object.assign(this.fileInfo, {
        fileDir: this.cleanDestinationPath(),
      });
    }

    const fileNameStyle = `${this.fileInfo.fileDir}/${this.fileInfo.fileNameWithoutExt}${this.fileInfo.fileExt}`;
    if (this.options.cssFile) {
      return this.writeTemplate(fileNameStyle, cssResult);
    }

    const userFileExists = fs.existsSync(fileNameStyle);

    if (userFileExists) {
      let content = '';
      const file = fs.readFileSync(fileNameStyle, 'utf8');
      let startReplacePosition = file.indexOf(this.options.markerStart);
      if (startReplacePosition >= 0) {
        startReplacePosition += this.options.markerStart.length;
        content =
          file.substring(0, startReplacePosition) +
          cssResult +
          this.options.markerEnd +
          `\n`;
      } else {
        const errL = `${color.red}No found marker start "${this.options.markerStart}" in file.${color.reset}`;
        throw Error(errL);
      }
      return this.writeTemplate(fileNameStyle, content);
    }
    const content = this.options.template.replace(delimTemplate, cssResult);
    return this.writeTemplate(fileNameStyle, content);
  }

  watchSass(glob) {
    const watcher = chokidar.watch(glob, { ignoreInitial: true });

    watcher.on('change', () => {
      this.globSassFile(this.renderStylesTemplate);
    });

    watcher.on('add', () => {
      this.updateGlob();
    });

    watcher.on('unlink', (path) => {
      this.updateGlob();
      this.unlinkFile(path);
    });

    watcher.on('error', (err) =>
      console.info(`Watcher ${color.red}${err}${color.reset}`)
    );
  }

  unlinkFile(file) {
    const fileNameWithoutExt = path.basename(file, '.scss');
    const fileToUnlink = `${this.fileInfo.fileDir}/${fileNameWithoutExt}${this.fileInfo.fileExt}`;
    if (fs.existsSync(fileToUnlink)) {
      try {
        fs.unlinkSync(fileToUnlink);
        const remL = `${color.red}file removed ${path.basename(fileToUnlink)}${
          color.reset
        }`;
        console.info(remL);
      } catch (err) {
        const errL = `${color.red}${err}${color.reset}`;
        console.error(errL);
      }
    }
  }

  updateGlob() {
    this.globFiles = glob.sync(`{${this.options.customGlob}}`);
  }

  globSassFile(cb) {
    this.globFiles.forEach((file) => {
      cb.call(this, file);
    });
  }

  init() {
    this.watchSass(this.options.customGlob.split(','));
    this.globSassFile(this.renderStylesTemplate);
  }
}

module.exports = SassStyleTemplate;
