#!/usr/bin/env node

const fs = require('fs');
const program = require('commander');
const path = require('path');
const pkg = require('../package.json');

const SassStyleTemplate = require('../lib/index.js');

const customTemplate = path.resolve('.sass-template.tmpl');

program
  .version(pkg.version, '-v, --version', 'show version number')
  .option('-s, --marker-start <string>', 'start replace position')
  .option('-e, --marker-end <string>', 'end replace position')
  .option('-g, --custom-glob <string>', 'string pattern to be matched')
  .option('-f, --css-file', 'generate css file instead of using template')
  .option('-wo, --wo-suffix', 'without suffix string `-styles`')
  .option('-j, --js-file <string>', 'file extension')
  .option('-d, --destination <string>', 'location of the output file');

program.parse(process.argv);

const template = fs.existsSync(customTemplate)
  ? fs.readFileSync(customTemplate, 'utf8')
  : undefined;

const config = Object.assign({}, program.opts(), { template: template });

new SassStyleTemplate(config);
