// the main filter function
module.exports = function (s, data) {
  var minimatch = require('minimatch');
  var Promise = require('bluebird');
  var Jsdom = require('jsdom').JSDOM;
  var streamToArray = require('stream-to-array');
  var streamToArrayAsync = Promise.promisify(streamToArray);

  var route = this.route;

  var list = route.list();

  // only filter html files.
  var routes = list.filter(function (path) {
    return minimatch(path, '**/*.html', { nocase: true });
  });
  // grab the main.css file
  var mainCss = list.filter(function (path) {
    return minimatch(path, 'css/main.css', { nocase: true });
  });

  var mainCssText = null;
  var first;
  if (mainCss.length > 0) {
    first = streamToArrayAsync(route.get(mainCss[0])).then(function (arr) {
      mainCssText = arr.join('');
    });
  } else {
    first = Promise.resolve();
  }
  return first.then(function () {
    return Promise.map(routes, function (path) {
      var stream = route.get(path);
      return streamToArrayAsync(stream)
        .then(function (arr) {
          return arr.join('');
        })
        .then(function (str) {
          // load jsdom from the html string
          var dom = new Jsdom(str);
          var doc = dom.window && dom.window.document;
          if (doc == null) {
            return;
          }

          // eslint-disable-next-line
          var cssCode = "function loadCss(l){var d=document,h=d.head,s=d.createElement('link');s.rel='stylesheet';s.href=l;!function e(f){if (d.body)return f();setTimeout(function(){e(f)})}(function(){h.appendChild(s);});}";
          var links = Array.from(doc.querySelectorAll('link'));
          if (links.length <= 0) {
            // something other static resources, skip
            return;
          }

          var hasMainCss = false;
          links
            .filter(function (el) { return el.rel === 'stylesheet'; })
            .forEach(function (el) {
              if (!el.href.includes('main.css')) {
                cssCode += 'loadCss(\'' + el.href + '\');';
              } else {
                hasMainCss = true;
              }
              el.remove();
            });

          var css = doc.createElement('script');
          css.textContent = cssCode;
          doc.head.appendChild(css);

          // main.css
          if (hasMainCss && mainCssText != null) {
            // only html with a link to main.css will be inlined.
            var main = doc.createElement('style');
            main.textContent = mainCssText;
            doc.head.appendChild(main);
          }

          // get the replaced string
          str = dom.serialize();
          route.set(path, str);
        });
    });
  });
};
