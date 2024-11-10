# sass-style-template

A simple SCSS watcher with autoprefixer.

## Goals

- Use [Lit](https://lit.dev/) + [SASS](https://github.com/sass/dart-sass) to build **Web Components**.
- Leverage ES6 module features to enable easy adoption of [import-attributes](https://fullystacked.net/import-attributes/) for [CSS module scripts](https://fullystacked.net/constructable/).
- Keep it simple and independent of any bundler such as _rollup, parcel, webpack_.

```js
// I don't want to use SASS directly in my code
import styles from './my-component-style.scss' 😟
```

<hr>

### Flow

- **my-component-styles.scss**

```scss
:host {
  display: block;
  color: #{'${unsafeCSS(tokens.colors.primary)}'};

  @at-root #{&}([variant=large]) {
    letter-spacing: 3px;
  }
}

p {
  background-color: #{'${unsafeCSS(tokens.colors.secondary)}'};
  :host([variant='large']) & {
    padding: calc(#{'${unsafeCSS(tokens.spaces.xlarge)}'} + 16px);
  }
}
```

- **my-component-styles.css.js**

```js
import {css, unsafeCSS} from 'lit';
import * as tokens from 'my-design-system-tokens';

export const styles = css`
  :host {
    display: block;
    color: ${unsafeCSS(tokens.colors.primary)};
  }
  :host([variant='large']) {
    letter-spacing: 3px;
  }

  p {
    background-color: ${unsafeCSS(tokens.colors.secondary)};
  }
  :host([variant='large']) p {
    padding: calc(${unsafeCSS(tokens.spaces.xlarge)} + 16px);
  }
`;
```

- **my-component.js**

```js
import {html, LitElement} from 'lit';
import { styles } from './my-component-styles.css.js';

class MyComponent extends LitElement {
  static get styles() {
    return [styles]
  }
}
```

---

Or just, compile .scss files to .css file and then use [CSS module scripts](https://github.com/web-platform-tests/interop/issues/703)


```js
import {html, LitElement} from 'lit';
import styles from './my-component-styles.css' with { type: 'css' };

class MyComponent extends LitElement {
  static get styles() {
    return [styles]
  }
}
```

---

### How it works

The first time a default template will be used to create a style file

```js
// sass-template.tmpl
import {css} from 'lit';

export const styles = css`<% content %>`;
```

```scss
// my-component.scss
:host {
  display: block;
  color: desaturate(#ad141e, 20%);
}
```

> `my-component.scss --> my-component-styles.css.js`

or without suffix

> `my-component.scss --> my-component.css.js`

Following changes in the `scss file (my-component.scss)` will update only the content between the ` css``; ` template literal in .css.js file

```js
// from original template
import {css} from 'lit';

// new content added later, it will not be deleted when updating scss file
import * as tokens from 'my-design-system-tokens';

export const styles = css`
  // only this part will be modified
  // new css from scss file
`;
```

---

### Usage

`npm i -D sass-style-template`

Here is an example of using [Vite](https://vite.dev/) + [concurrently](https://www.npmjs.com/package/concurrently) in the package scripts:

```js
// package.json
"scripts": {
  "start": "concurrently -k -r \"npm:sass:watch\" \"npm:vite\"",
  "vite": "vite",
  "sass:watch": "sass-style-template"
}
```

### Options

**sass-style-template**

```js
// commander options
version(pkg.version, '-v, --version', 'show version number')
  .option('-s, --marker-start <string>', 'start replace position')
  .option('-e, --marker-end <string>', 'end replace position')
  .option('-g, --custom-glob <string>', 'string pattern to be matched')
  .option('-c, --css-file', 'generate a CSS file instead of JS or TS')
  .option('-wo, --wo-suffix', 'without suffix string `-styles`')
  .option('-j, --js-file <string>', 'file extension')
  .option('-d, --destination <string>', 'location of the output file');
```

### Typescript (--js-file option)

```js
// package.json
"scripts": {
  "start": "concurrently -k -r \"npm:sass:watch\" \"npm:vite\"",
  "vite": "vite",
  "sass:watch": "sass-style-template -j ts"
}
```

---

### Default option value

**sass-template.tmpl**

```js
import {css}from 'lit';

export const styles = css`<% content %>`;
```

**Custom Template**

Creating a custom template file in the root directory with the name `sass-template.tmpl`

```js
// Example: sass-template.tmpl
// https://github.com/material-components/material-web/blob/main/scripts/css-to-ts.ts

/**
 * @license
 * Copyright 2024 XXX LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {css} from 'lit';
export const styles = css`<% content %>`;
```

---

##### --marker-start (-s)

> start replace position : `` const styles = css`  ``

##### --marker-end (-e)

> end replace position : `` `; export { styles as default };``

##### --custom-glob (g)

> pattern to be matched : `./*.scss, ./src/**/*.scss`

##### --css-file (-c)

> generate css file instead of using template : `undefined`

##### --wo-suffix (-wo)

> without suffix string **-styles** : `undefined`

##### --js-file (-j)

> file extension : `js`

##### --destination (-d)

> location of the output file : `undefined`

---

### Example:

Scaffold a new Lit component with SASS using:

> [npm init @blockquote/wc](https://github.com/oscarmarina/create-wc)

_Free Software._
