const Promise = require('bluebird');
const micromatch = require('micromatch');
const { JSDOM, VirtualConsole } = require('jsdom');
const { combine, streamRead, bundleFiles, inExcludes } = require('./util');

// Start to optimize the html defination.
const virtualConsole = new VirtualConsole();
// To avoid some unnecessary css parsing information.

function html(config, str, bundle, inlineCssText) {
  let { root, filter_optimize } = config;
  let { css, js } = filter_optimize;

  // Load jsdom from the html string.
  let dom = new JSDOM(str, { virtualConsole });
  let doc = dom.window.document;

  let links = [...doc.querySelectorAll('link')];
  if (links.length <= 0) {
    // Something other static resources, skip.
    return;
  }

  let cssList = [];
  let hasInlines = false;
  let hasDelivery = false;
  if (css.bundle) {
    links
      .filter(el => el.rel === 'stylesheet')
      .forEach(el => {
        let href = el.href;
        let isCssBundle = false;
        if (inExcludes(href, css.excludes)) return;
        if (css.inlines && css.inlines.some(p => href.includes(p))) {
          hasInlines = true;
        } else {
          if (href[0] === '/' && href[1] !== '/' && !bundle.css.includes(href)) {
            bundle.css.push(href);
            isCssBundle = true;
          }
          if (!isCssBundle && !bundle.css.includes(href)) {
            cssList.push(href);
          }
          hasDelivery = true;
        }
        el.remove();
      });
  }

  if (js.bundle) {
    let scriptText = null;
    [...doc.querySelectorAll('script')].forEach(el => {
      let src = el.src;
      let isJsBundle = false;
      if (inExcludes(src, js.excludes)) return;
      // Skip the script block defined in the <head>
      if (el.parentNode !== doc.head && scriptText != null
        // Is text script block.
        && !src
        // And has the content.
        && el.textContent && el.textContent.length > 0) {
        // Record it.
        scriptText = combine(scriptText, el.textContent, ';');
        el.remove();
      } else if (src && src[0] === '/' && src[1] !== '/' && !bundle.js.includes(src)) {
        bundle.js.push(src);
        isJsBundle = true;
      }
      if (isJsBundle || bundle.js.includes(src)) {
        if (scriptText == null) scriptText = '';
        el.remove();
      }
    });

    if (bundle.js.length > 0) {
      let bundleJs = doc.createElement('script');
      bundleJs.src = root + 'bundle.js';
      doc.body.appendChild(bundleJs);
    }

    if (scriptText != null && scriptText.length > 0) {
      let textScript = doc.createElement('script');
      textScript.textContent = scriptText;
      doc.body.appendChild(textScript);
    }
  }

  let changed = bundle.js.length > 0;
  // If there is any css need to delivery.
  if (hasDelivery) {
    let cssElement = doc.createElement('script');
    let cssCode = '';
    if (bundle.css.length > 0) {
      cssCode = `loadCss('${root}style.css');` + cssList.map(href => `loadCss('${href}');`).join('');
    }
    // eslint-disable-next-line
    cssElement.textContent = "function loadCss(l){var d=document,h=d.head,s=d.createElement('link');s.rel='stylesheet';s.href=l;!function e(f){if (d.body)return f();setTimeout(function(){e(f)})}(function(){h.appendChild(s);});}"
      + cssCode;
    doc.head.appendChild(cssElement);
    // Add the noscript block to make sure the css will be loaded.
    if (cssList != null && cssList.length > 0) {
      let ns = doc.createElement('noscript');
      let c;
      if (bundle.css.length > 0) {
        c = doc.createElement('link');
        c.rel = 'stylesheet';
        c.href = root + 'style.css';
        ns.appendChild(c);
      }
      for (let i in cssList) {
        c = doc.createElement('link');
        c.rel = 'stylesheet';
        c.href = cssList[i];
        ns.appendChild(c);
      }
      doc.head.appendChild(ns);
    }
    changed = true;
  }

  let noscripts = doc.getElementsByTagName('noscript');

  // If there is some inline-styles need to be inserted.
  if (hasInlines && inlineCssText.length > 0) {
    let main = doc.createElement('style');
    main.textContent = inlineCssText;
    if (noscripts.length > 0 && noscripts[0].parentNode === doc.head) {
      let noscript = noscripts[0];
      // Avoiding to overmit the noscript css.
      doc.head.insertBefore(main, noscript);
    } else {
      doc.head.appendChild(main);
    }
    changed = true;
  }

  if (changed) {
    // Get the replaced string.
    return dom.serialize();
  }
}

module.exports = function() {

  let { route, config } = this;
  let { root, filter_optimize } = config;
  let { css } = filter_optimize;

  let list = route.list();

  // Filter html files.
  let htmls = list.filter(path => micromatch.isMatch(path, '**/*.html', { nocase: true }));

  // Grab the defined inline css files.
  let inlineCssText = '';
  let first = Promise.resolve();

  if (css.bundle) {
    let inlines = list.filter(path => {
      return !inExcludes(path, css.excludes) && css.inlines && css.inlines.includes(path);
    });

    if (inlines.length > 0) {
      first = bundleFiles(inlines, list, route, '')
        .then(content => {
          inlineCssText = content;
        }).catch(err => {
          this.log.warn('Errors when get the inline css: ', err);
        });
    }
  }

  // Other parameters.
  let bundle = {
    css: [],
    js : []
  };

  return first.then(() => {
    return Promise.map(htmls, path => {
      // console.log('processing: ' + path);
      return streamRead(path)
        .then(str => {
          str = html(config, str, bundle, inlineCssText);
          if (str) route.set(path, str);
        });
    });
  }).then(() => {

    /**
     * Make javascript & css bundle file.
     */
    let p = Promise.resolve();
    if (bundle.css.length > 0) {
      p = bundleFiles(bundle.css, list, route, '')
        .then(content => {
          return new Promise(resolve => {
            route.set(root + 'style.css', content);
            resolve();
          });
        });
    }

    if (bundle.js.length > 0) {
      p = p.then(() => {
        return bundleFiles(bundle.js, list, route, ';')
          .then(content => {
            return new Promise(resolve => {
              route.set(root + 'bundle.js', content);
              resolve();
            });
          });
      });
    }

    return p;
  });
};
