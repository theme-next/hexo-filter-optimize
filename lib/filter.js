const Promise = require('bluebird');
const minimatch = require('minimatch');
const jsdom = require('jsdom');
const streamRead = require('./stream');
const concator = require('./concator');

// the main filter function
module.exports = function(s, data) {

  var Jsdom = jsdom.JSDOM;
  var VirtualConsole = jsdom.VirtualConsole;

  var route = this.route;
  var logger = this.log || console;
  var root = this.config.root;
  var config = this.config.filter_optimize;
  var css = config.css;
  var js = config.js;
  var removeComments = config.remove_comments;

  var list = route.list();

  // only filter html files.
  var htmls = list.filter(path => minimatch(path, '**/*.html', { nocase: true }));

  // check whether `path` is in `excludes`
  var inExcludes = function(path, excludes) {
    return excludes.some(item => minimatch(path, item, { nocase: true }));
  };

  css.excludes = css.excludes || [];
  css.inlines = css.inlines || ['css/main.css'];
  js.excludes = js.excludes || [];

  // grab the defined inline css files
  var inlineCssText = '';
  var first = Promise.resolve();

  if (css.enable) {
    var inlines = list.filter(path => {
      if (inExcludes(path, css.excludes)) {
        return false;
      }
      return css.inlines.includes(path);
    });

    if (inlines.length > 0) {
      first = concator.bundleFiles(inlines, list, route, '', removeComments)
        .then(content => {
          inlineCssText = content;
        }).catch(err => {
          logger.log('Errors when get the inline css: ', err);
        });
    }
  }

  // other parameters
  var bundleJsList = [];
  var bundleCssList = [];

  // start to optimize the html defination
  var vc = new VirtualConsole();
  // to avoid some unnecessary css parsing information
  return first.then(() => {
    return Promise.map(htmls, path => {
      var stream = route.get(path);
      return streamRead(stream)
        .then(str => {
          // load jsdom from the html string
          var dom = new Jsdom(str, { virtualConsole: vc });
          var doc = dom.window && dom.window.document;
          if (doc == null) return;

          var links = [...doc.querySelectorAll('link')];
          if (links.length <= 0) {
            // something other static resources, skip
            return;
          }

          // console.log('processing: ' + path);
          var regQuery = /\?v=[\d.]*$/;

          var cssCode = '';
          var cssList = [];
          var hasInlines = false;
          var hasDelivery = false;
          if (config.remove_query_string) {
            links.filter(el => regQuery.test(el.href))
              .forEach(el => {
                el.href = el.href.replace(regQuery, '');
              });
          }
          if (css.enable) {
            links
              .filter(el => el.rel === 'stylesheet')
              .forEach(el => {
                var href = el.href;
                if (inExcludes(href, css.excludes)) {
                  return;
                }
                var isCssBundle = false;
                if (css.inlines.some(p => href.includes(p))) {
                  hasInlines = true;
                } else {
                  if (href[0] === '/' && href[1] !== '/') {
                    if (!bundleCssList.includes(href)) {
                      bundleCssList.push(href);
                      isCssBundle = true;
                    }
                  }
                  if (!isCssBundle && !bundleCssList.includes(href)) {
                    cssCode += 'loadCss(\'' + href + '\');';
                    cssList.push(href);
                  }
                  hasDelivery = true;
                }
                el.remove();
              });
          }

          if (js.bundle || config.remove_query_string) {
            var scriptText = null;
            [...doc.querySelectorAll('script')].forEach(el => {
              var src = el.src;
              if (config.remove_query_string && regQuery.test(src)) {
                el.src = src.replace(regQuery, '');
              }
              if (js.bundle) {
                var isJsBundle = false;
                // skip the script block defined in the <head>
                if (el.parentNode !== doc.head && scriptText != null
                  // is text script block
                  && !src
                  // and has the content
                  && el.textContent && el.textContent.length > 0) {
                  // record it
                  scriptText = concator.combine(scriptText, el.textContent,
                    ';', removeComments);
                  el.remove();
                } else if (src && src[0] === '/' && src[1] !== '/') {
                  if (!bundleJsList.includes(src)) {
                    bundleJsList.push(src);
                    isJsBundle = true;
                  }
                }
                if (isJsBundle || bundleJsList.includes(src)) {
                  if (scriptText == null) scriptText = '';
                  el.remove();
                }
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
            if (bundleCssList.length > 0) {
              cssCode = 'loadCss(\'' + root + 'style.css\');' + cssCode;
            }
            // eslint-disable-next-line
            cssCode = "function loadCss(l){var d=document,h=d.head,s=d.createElement('link');s.rel='stylesheet';s.href=l;!function e(f){if (d.body)return f();setTimeout(function(){e(f)})}(function(){h.appendChild(s);});}"
              + cssCode;
            cssElement.textContent = cssCode;
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
          var noscript;
          if (noscripts.length > 0 && noscripts[0].parentNode === doc.head) {
            noscript = noscripts[0];
          }

          // if there is some inline-styles need to be inserted
          if (hasInlines && inlineCssText.length > 0) {
            var main = doc.createElement('style');
            main.textContent = inlineCssText;
            if (noscript != null) {
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
    var p;
    if (bundleCssList.length > 0) {
      p = concator
        .bundleFiles(bundleCssList, list, route, '', removeComments)
        .then(content => {
          return new Promise(resolve => {
            route.set(root + 'style.css', content);
            resolve();
          });
        });
    } else {
      p = Promise.resolve();
    }

    if (bundleJsList.length > 0) {
      p = p.then(() => {
        return concator
          .bundleFiles(bundleJsList, list, route, ';', removeComments)
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
