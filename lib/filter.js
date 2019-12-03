const Promise = require('bluebird');
const micromatch = require('micromatch');
const jsdom = require('jsdom');
const streamRead = require('./stream');
const concator = require('./concator');

// check whether `path` is in `excludes`
function inExcludes(path, excludes) {
  return excludes && excludes.some(item => micromatch.isMatch(path, item, { nocase: true }));
}

// the main filter function
module.exports = function() {

  const { JSDOM, VirtualConsole } = jsdom;

  var route = this.route;
  var root = this.config.root;
  var config = this.config.filter_optimize;
  var { remove_comments, css, js } = config;

  var list = route.list();

  // only filter html files.
  var htmls = list.filter(path => micromatch.isMatch(path, '**/*.html', { nocase: true }));

  // grab the defined inline css files
  var inlineCssText = '';
  var first = Promise.resolve();

  if (css.bundle) {
    var inlines = list.filter(path => {
      return !inExcludes(path, css.excludes) && css.inlines && css.inlines.includes(path);
    });

    if (inlines.length > 0) {
      first = concator.bundleFiles(inlines, list, route, '', remove_comments)
        .then(content => {
          inlineCssText = content;
        }).catch(err => {
          this.log.warn('Errors when get the inline css: ', err);
        });
    }
  }

  // other parameters
  var bundleJsList = [];
  var bundleCssList = [];

  // start to optimize the html defination
  var virtualConsole = new VirtualConsole();
  // to avoid some unnecessary css parsing information
  return first.then(() => {
    return Promise.map(htmls, path => {
      // console.log('processing: ' + path);
      var stream = route.get(path);
      return streamRead(stream)
        .then(str => {
          // load jsdom from the html string
          var dom = new JSDOM(str, { virtualConsole });
          var doc = dom.window.document;

          var links = [...doc.querySelectorAll('link')];
          if (links.length <= 0) {
            // something other static resources, skip
            return;
          }

          var cssList = [];
          var hasInlines = false;
          var hasDelivery = false;
          if (css.bundle) {
            links
              .filter(el => el.rel === 'stylesheet')
              .forEach(el => {
                var href = el.href;
                var isCssBundle = false;
                if (inExcludes(href, css.excludes)) return;
                if (css.inlines && css.inlines.some(p => href.includes(p))) {
                  hasInlines = true;
                } else {
                  if (href[0] === '/' && href[1] !== '/' && !bundleCssList.includes(href)) {
                    bundleCssList.push(href);
                    isCssBundle = true;
                  }
                  if (!isCssBundle && !bundleCssList.includes(href)) {
                    cssList.push(href);
                  }
                  hasDelivery = true;
                }
                el.remove();
              });
          }

          if (js.bundle) {
            var scriptText = null;
            [...doc.querySelectorAll('script')].forEach(el => {
              var src = el.src;
              var isJsBundle = false;
              if (inExcludes(src, js.excludes)) return;
              // skip the script block defined in the <head>
              if (el.parentNode !== doc.head && scriptText != null
                // is text script block
                && !src
                // and has the content
                && el.textContent && el.textContent.length > 0) {
                // record it
                scriptText = concator.combine(scriptText, el.textContent, ';', remove_comments);
                el.remove();
              } else if (src && src[0] === '/' && src[1] !== '/' && !bundleJsList.includes(src)) {
                bundleJsList.push(src);
                isJsBundle = true;
              }
              if (isJsBundle || bundleJsList.includes(src)) {
                if (scriptText == null) scriptText = '';
                el.remove();
              }
            });

            if (bundleJsList.length > 0) {
              var bundleJs = doc.createElement('script');
              bundleJs.src = root + 'bundle.js';
              doc.body.appendChild(bundleJs);
            }

            if (scriptText != null && scriptText.length > 0) {
              var textScript = doc.createElement('script');
              textScript.textContent = scriptText;
              doc.body.appendChild(textScript);
            }
          }

          var changed = bundleJsList.length > 0;
          // if there is any css need to delivery
          if (hasDelivery) {
            var cssElement = doc.createElement('script');
            var cssCode = '';
            if (bundleCssList.length > 0) {
              cssCode = `loadCss('${root}style.css');` + cssList.map(href => `loadCss('${href}');`).join('');
            }
            // eslint-disable-next-line
            cssElement.textContent = "function loadCss(l){var d=document,h=d.head,s=d.createElement('link');s.rel='stylesheet';s.href=l;!function e(f){if (d.body)return f();setTimeout(function(){e(f)})}(function(){h.appendChild(s);});}"
              + cssCode;
            doc.head.appendChild(cssElement);
            // add the noscript block to make sure the css will be loaded
            if (cssList != null && cssList.length > 0) {
              var ns = doc.createElement('noscript');
              var c;
              if (bundleCssList.length > 0) {
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

          var noscripts = doc.getElementsByTagName('noscript');

          // if there is some inline-styles need to be inserted
          if (hasInlines && inlineCssText.length > 0) {
            var main = doc.createElement('style');
            main.textContent = inlineCssText;
            if (noscripts.length > 0 && noscripts[0].parentNode === doc.head) {
              var noscript = noscripts[0];
              // avoiding to overmit the noscript css
              doc.head.insertBefore(main, noscript);
            } else {
              doc.head.appendChild(main);
            }
            changed = true;
          }

          if (changed) {
            // get the replaced string
            str = dom.serialize();
            route.set(path, str);
          }
        });
    });

    /**
     * make javascript bundle file
     */
  }).then(() => {
    var p = Promise.resolve();
    if (bundleCssList.length > 0) {
      p = concator
        .bundleFiles(bundleCssList, list, route, '', remove_comments)
        .then(content => {
          return new Promise(resolve => {
            route.set(root + 'style.css', content);
            resolve();
          });
        });
    }

    if (bundleJsList.length > 0) {
      p = p.then(() => {
        return concator
          .bundleFiles(bundleJsList, list, route, ';', remove_comments)
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
