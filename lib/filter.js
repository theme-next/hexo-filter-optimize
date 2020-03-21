const Promise = require('bluebird');
const micromatch = require('micromatch');
const { streamRead, bundleFiles, inExcludes } = require('./util');
const html = require('./html');

// the main filter function
module.exports = function() {

  var route = this.route;
  var root = this.config.root;
  var config = this.config.filter_optimize;
  var { remove_comments, css } = config;

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
      first = bundleFiles(inlines, list, route, '', remove_comments)
        .then(content => {
          inlineCssText = content;
        }).catch(err => {
          this.log.warn('Errors when get the inline css: ', err);
        });
    }
  }

  // other parameters
  let bundle = {
    css: [],
    js : []
  };

  return first.then(() => {
    return Promise.map(htmls, path => {
      // console.log('processing: ' + path);
      var stream = route.get(path);
      return streamRead(stream)
        .then(str => {
          str = html(config, str, bundle, root);
          if (str) route.set(path, str);
        });
    });

    /**
     * make javascript bundle file
     */
  }).then(() => {
    var p = Promise.resolve();
    if (bundle.css.length > 0) {
      p = bundleFiles(bundle.css, list, route, '', remove_comments)
        .then(content => {
          return new Promise(resolve => {
            route.set(root + 'style.css', content);
            resolve();
          });
        });
    }

    if (bundle.js.length > 0) {
      p = p.then(() => {
        return bundleFiles(bundle.js, list, route, ';', remove_comments)
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
