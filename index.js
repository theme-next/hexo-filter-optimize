'use strict';

const minimatch = require('minimatch');
const Promise = require('bluebird');
const Jsdom = require('jsdom').JSDOM;
const streamToArray = require('stream-to-array');
const streamToArrayAsync = Promise.promisify(streamToArray);

const config = hexo.config;

// the main filter function
function filter(s, data) {
  const route = hexo.route;
  // const logger = hexo.log || console;

  const list = route.list();

  // only filter html files.
  const routes = list.filter(function (path) {
    return minimatch(path, '**/*.html', { nocase: true });
  });
  // grab the main.css file
  const mainCss = list.filter(function (path) {
    return minimatch(path, 'css/main.css', { nocase: true });
  });

  let mainCssText = null;
  let first;
  if (mainCss.length > 0) {
    first = streamToArrayAsync(route.get(mainCss[0])).then(function (arr) {
      mainCssText = arr.join('');
    });
  } else {
    first = Promise.resolve();
  }
  return first.then(function () {
    return Promise.map(routes, function (path) {
      const stream = route.get(path);
      return streamToArrayAsync(stream)
        .then(function (arr) {
          return arr.join('');
        })
        .then(function (str) {
          // load jsdom from the html string
          let dom = new Jsdom(str);
          const doc = dom.window && dom.window.document;
          if (doc == null) {
            return;
          }

          // eslint-disable-next-line
          let cssCode = `function loadCss(l){var d=document,h=d.head,s=d.createElement('link');s.rel='stylesheet';s.href=l;!function e(f){if (d.body)return f();setTimeout(function(){e(f)})}(function(){h.appendChild(s);});}`;
          const links = Array.from(doc.querySelectorAll('link'));
          if (links.length <= 0) {
            // something other static resources, skip
            return;
          }

          let hasMainCss = false;
          links
            .filter((el) => el.rel === 'stylesheet')
            .forEach((el) => {
              if (!el.href.includes('main.css')) {
                cssCode += `loadCss('${el.href}');`;
              } else {
                hasMainCss = true;
              }
              el.remove();
            });

          const css = doc.createElement('script');
          css.textContent = cssCode;
          doc.head.appendChild(css);

          // main.css
          if (hasMainCss && mainCssText != null) {
            // only html with a link to main.css will be inlined.
            const main = doc.createElement('style');
            main.textContent = mainCssText;
            doc.head.appendChild(main);
          }

          // get the replaced string
          str = dom.serialize();
          route.set(path, str);
        });
    });
  });
}

if (config.filter_optimize && config.filter_optimize.enable) {
  // enable optimize the css delivery
  if (config.filter_optimize.css_delivery) {
    hexo.extend.filter.register('after_generate', filter);
  }
}
