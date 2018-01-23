// the main filter function
module.exports = function (s, data) {
  var minimatch = require('minimatch');
  var Promise = require('bluebird');
  var Jsdom = require('jsdom').JSDOM;
  var streamRead = require('./stream');

  var route = this.route;
  var logger = this.log || console;
  var root = this.config.root;
  var config = this.config.filter_optimize;
  var css = config.css;
  var js = config.js;

  var list = route.list();

  // only filter html files.
  var routes = list.filter(function (path) {
    return minimatch(path, '**/*.html', { nocase: true });
  });

  // check whether `path` is in `excludes`
  var inExcludes = function (path, excludes) {
    for (var i = 0; i < excludes.length; i++) {
      if (minimatch(path, excludes[i], { nocase: true })) {
        return true;
      }
    }
    return false;
  };

  css.excludes = css.excludes || [];
  css.inlines = css.inlines || ['css/main.css'];
  js.excludes = js.excludes || [];

  // grab the defined inline css files
  var inlines = [];
  var inlineCssText = '';
  var first = Promise.resolve();

  if (css.enable) {
    inlines = list.filter(function (path) {
      if (inExcludes(path, css.excludes)) {
        return false;
      }
      return css.inlines.indexOf(path) >= 0;
    });

    if (inlines.length > 0) {
      first = Promise.map(inlines, function (path) {
        var stream = route.get(path);
        return streamRead(stream)
          .then(function (data) {
            inlineCssText += data;
          })
          .catch(function (err) {
            logger.log('Errors when get the inline css: ', path, err);
          });
      });
    }
  }

  // other parameters
  var bundles = [];

  // start to optimize the html defination
  return first.then(function () {
    return Promise.map(routes, function (path) {
      var stream = route.get(path);
      return streamRead(stream)
        .then(function (str) {
          // load jsdom from the html string
          var dom = new Jsdom(str);
          var doc = dom.window && dom.window.document;
          if (doc == null) {
            return;
          }

          var links = Array.from(doc.querySelectorAll('link'));
          if (links.length <= 0) {
            // something other static resources, skip
            return;
          }

          var regQuery = /\?v=[\d.]*$/;

          // eslint-disable-next-line
          var cssCode = "function loadCss(l){var d=document,h=d.head,s=d.createElement('link');s.rel='stylesheet';s.href=l;!function e(f){if (d.body)return f();setTimeout(function(){e(f)})}(function(){h.appendChild(s);});}";
          var hasInlines = false;
          var hasDelivery = false;
          if (config.remove_query_string) {
            links.filter(function (el) { return regQuery.test(el.href); })
              .forEach(function (el) {
                el.href = el.href.replace(regQuery, '');
              });
          }
          if (css.enable) {
            links
              .filter(function (el) { return el.rel === 'stylesheet'; })
              .forEach(function (el) {
                var href = el.href;
                if (inExcludes(href, css.excludes)) {
                  return;
                }
                if (css.inlines.filter(function (p) {
                  return href.indexOf(p) >= 0;
                }).length > 0) {
                  hasInlines = true;
                } else {
                  cssCode += 'loadCss(\'' + href + '\');';
                  hasDelivery = true;
                }
                el.remove();
              });
          }

          if (js.bundle || config.remove_query_string) {
            var scripts = Array.from(doc.querySelectorAll('script'));
            var scriptText = null;
            scripts.forEach(function (el) {
              var src = el.src;
              if (config.remove_query_string && regQuery.test(src)) {
                el.src = src.replace(regQuery, '');
              }
              if (js.bundle) {
                var isbundle = false;
                // skip the `hexo.configurations` block,
                // to avoid the NexT is not defined error.
                if (el.id !== 'hexo.configurations' && scriptText != null
                  // is text script block
                  && !src
                  // and has the content
                  && el.textContent && el.textContent.length > 0) {
                  // record it
                  if (scriptText.length > 0) {
                    scriptText += ';\n';
                  }
                  scriptText += el.textContent;
                  el.remove();
                } else if (bundles.indexOf(src) < 0) {
                  if (src[0] === '/' && src[1] !== '/') {
                    bundles.push(src);
                    isbundle = true;
                  }
                }
                if (isbundle || bundles.indexOf(src) >= 0) {
                  if (scriptText == null) {
                    scriptText = '';
                  }
                  el.remove();
                }
              }
            });

            if (bundles.length > 0) {
              var bundle = doc.createElement('script');
              bundle.type = 'text/javascript';
              bundle.src = root + 'bundle.js';
              doc.body.appendChild(bundle);
            }

            if (scriptText != null && scriptText.length > 0) {
              var textScript = doc.createElement('script');
              textScript.type = 'text/javascript';
              textScript.textContent = scriptText;
              doc.body.appendChild(textScript);
            }
          }

          var changed = bundles.length > 0;
          // if there is any css need to delivery
          if (hasDelivery) {
            var cssElement = doc.createElement('script');
            cssElement.textContent = cssCode;
            doc.head.appendChild(cssElement);
            changed = true;
          }

          // if there is some inline-styles need to be inserted
          if (hasInlines && inlineCssText.length > 0) {
            var main = doc.createElement('style');
            main.textContent = inlineCssText;
            doc.head.appendChild(main);
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
  }).then(function () {
    var content = '';
    var files = [];

    var concat = function (path) {
      return function () {
        var stream = route.get(path);
        return streamRead(stream)
          .then(function (str) {
            // console.log('bundle: ' + path);
            if (content.length > 0) {
              content += ';\n';
            }
            content += str;
          });
      };
    };

    bundles.filter(function (b) {
      var file = list.filter(function (path) {
        return b.indexOf(path) >= 0;
      });
      if (file.length > 0) {
        files.push(concat(file[0]));
      }
    });
    var p = Promise.resolve();
    for (var i = 0; i < files.length; i++) {
      (function (n) {
        p = p.then(function () {
          return files[n]();
        });
      })(i);
    }
    return p.then(function () {
      route.set(root + 'bundle.js', content);
    });
  });
};
