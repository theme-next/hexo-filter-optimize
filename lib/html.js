const { JSDOM, VirtualConsole } = require('jsdom');
const { combine, inExcludes } = require('./util');

// start to optimize the html defination
const virtualConsole = new VirtualConsole();
// to avoid some unnecessary css parsing information

module.exports = function(config, str, bundle, root) {
  let { remove_comments, css, js } = config;

  // load jsdom from the html string
  let dom = new JSDOM(str, { virtualConsole });
  let doc = dom.window.document;

  let links = [...doc.querySelectorAll('link')];
  if (links.length <= 0) {
    // something other static resources, skip
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
      // skip the script block defined in the <head>
      if (el.parentNode !== doc.head && scriptText != null
        // is text script block
        && !src
        // and has the content
        && el.textContent && el.textContent.length > 0) {
        // record it
        scriptText = combine(scriptText, el.textContent, ';', remove_comments);
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
  // if there is any css need to delivery
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
    // add the noscript block to make sure the css will be loaded
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

  // if there is some inline-styles need to be inserted
  if (hasInlines && inlineCssText.length > 0) {
    let main = doc.createElement('style');
    main.textContent = inlineCssText;
    if (noscripts.length > 0 && noscripts[0].parentNode === doc.head) {
      let noscript = noscripts[0];
      // avoiding to overmit the noscript css
      doc.head.insertBefore(main, noscript);
    } else {
      doc.head.appendChild(main);
    }
    changed = true;
  }

  if (changed) {
    // get the replaced string
    return dom.serialize();
  }
}
