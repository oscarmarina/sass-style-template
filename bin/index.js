#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {program} from 'commander';
import {SassStyleTemplate} from '../lib/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const customTemplatePath = path.resolve(process.cwd(), '.sass-template.tmpl');
const tplTemplatePath = path.resolve(__dirname, '../tpls/sass-template.tmpl');

const pkgPath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

program
  .version(pkg.version, '-v, --version', 'show version number')
  .option('-s, --marker-start <string>', 'start replace position')
  .option('-e, --marker-end <string>', 'end replace position')
  .option('-g, --custom-glob <string>', 'string pattern to be matched')
  .option('-c, --css-file', 'generate a CSS file instead of JS or TS')
  .option('-wo, --wo-suffix', 'without suffix string `-styles`')
  .option('-j, --js-file <string>', 'file extension')
  .option('-d, --destination <string>', 'location of the output file');

program.parse(process.argv);

const template = fs.existsSync(customTemplatePath)
  ? fs.readFileSync(customTemplatePath, 'utf8')
  : fs.readFileSync(tplTemplatePath, 'utf8');

const config = Object.assign({}, program.opts(), {template});

new SassStyleTemplate(config);
