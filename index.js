/* global hexo */

'use strict';

var config = hexo.config.filter_optimize = Object.assign({
  enable         : true,
  remove_comments: false,
  css            : {
    minify  : true,
    bundle  : true,
    delivery: true,
    inlines : ['css/main.css'],
    excludes: []
  },
  js: {
    minify  : true,
    bundle  : true,
    excludes: []
  },
  image: {
    minify: true
  }
}, hexo.config.filter_optimize);

if (process.env.NODE_ENV !== 'development' && config.enable) {
  const { filter, css, js, image } = require('./lib/index');
  const priority = parseInt(config.priority, 10) || 10;

  // enable one of the optimizations
  if (config.css.bundle || config.js.bundle) {
    hexo.extend.filter.register('after_generate', filter, priority);
  }
  if (config.css.minify) {
    hexo.extend.filter.register('after_render:css', css);
  }
  if (config.js.minify) {
    hexo.extend.filter.register('after_render:js', js);
  }
  if (config.image.minify) {
    hexo.extend.filter.register('after_generate', image);
  }
}
