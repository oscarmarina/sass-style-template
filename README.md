## sass-style-template

Simple SCSS watcher with autoprefixer.

#### Why?
- I want to use __SASS__ and __LitElement__ for creating __Web Components__.
- I want to use ES Modules for CSS (CSS Modules) helping me through ES6 modules.
- I want to make it simple and decoupled from any bundle generator (_snowpack, parcel, rollup, webpack_)

```js
// I don't want to use SASS directly in my code
import styles from './my-component-style.scss' 😟
```
#### Lit Element makes it easy to _"shimming"_ CSS Modules and _"using"_ CSS-in-JS in a simple and lightweight way
```scss
:host {
  display: block;
  color: #{"${unsafeCSS(tokens.colors.primary)}"};

  @at-root #{&}([variant=large]) {
    letter-spacing: 3px;
  }
}

p {
  background-color: #{"${unsafeCSS(tokens.colors.secondary)}"};
  :host([variant=large]) & {
    padding:calc(#{"${unsafeCSS(tokens.spaces.xlarge)}"} + 16px);
  }
}
```

```js
import { css, unsafeCSS } from 'lit-element';
import * as tokens from 'my-design-system-tokens';

export default css`:host {
  display: block;
  color: ${unsafeCSS(tokens.colors.primary)}; }
  :host([variant=large]) {
    letter-spacing: 3px; }

p {
  background-color: ${unsafeCSS(tokens.colors.secondary)}; }
  :host([variant=large]) p {
    padding: calc(${unsafeCSS(tokens.spaces.xlarge)} + 16px); }
`;
```
---

##### Or just, compile .scss files to .css file and then use [ES Module Shims](https://github.com/guybedford/es-module-shims)
>[CSS Modules - chromestatus](https://www.chromestatus.com/feature/5948572598009856)


```js
// LitElement
import styles from './style.css';
...
static get styles() {
    return [styles]
  }
```



---
#### How does it work
The first time a default template will be used to create a style file

```js
// sass-template.tmpl
import { css, unsafeCSS } from 'lit-element';

export default css`<% content %>`;
```
```scss
// my-component.scss
:host {
  display: block;
  color: desaturate(#ad141e, 20%);
}
```
>``my-component.scss --> my-component-styles.js``

Following changes in the ``scss file (my-component.scss)`` will update only the content between the __css function__ in  ``-styles.js file (my-component-styles.js)``




```js
// from original template
import { css, unsafeCSS } from 'lit-element';

// new content added later, it will not be deleted when updating scss file
import * as tokens from 'my-design-system-tokens';

export default css`
  //only this part will be modified
  //new css from scss file
`;
```
---


### Usage

``npm i -D sass-style-template``


### Options

**_sass-style-template_** 😄
```js
// template default

const customTemplate = path.resolve('.sass-template.tmpl');

// commander options
  version(pkg.version, '-v, --version','show version number')
  .option('-s, --marker-start <string>', 'start replace position')
  .option('-e, --marker-end <string>', 'end replace position')
  .option('-g, --custom-glob <string>', 'string pattern to be matched')
  .option('-f, --css-file', 'generate css file instead of using template')
  .option('-d, --destination <string>', 'location of the output file');
```
---

#### Default option value

##### .sass-template.tmpl
```js
import { css, unsafeCSS } from 'lit-element';

export default css`<% content %>`;
```

##### Creating a custom template file _in root directory_, using this name ``.sass-template.tmpl``

```js
 // 😎 https://github.com/material-components/material-components-web-components/blob/master/sass-template.tmpl

import {css} from 'lit-element';
export const style = css`<% content %>`;
```
---

 ##### --marker-start (-s)
> start replace position : ``` export default css` ```

##### --marker-end (-e)
> end replace position : ``` `; ```

##### --custom-glob (g)
> pattern to be matched : ``` ./*.scss, ./src/**/*.scss ```

##### --css-file (-f)
> generate css file instead of using template : ``` undefined ```

##### --destination (-d)
> location of the output file : ``` undefined ```

---

### Example:

[open-wc-sass](https://github.com/oscarmarina/open-wc-sass)

_Free Software._

