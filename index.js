/* global hexo */

'use strict';

var env = process.env.NODE_ENV;
var filterOptimize = hexo.config.filter_optimize = Object.assign({
  enable         : true,
  remove_comments: false,
  css            : {
    bundle  : true,
    delivery: true,
    inlines : ['css/main.css'],
    excludes: []
  },
  js: {
    bundle  : true,
    excludes: []
  }
}, hexo.config.filter_optimize);

if (env !== 'development' && filterOptimize.enable) {
  var filter = require('./lib/filter');
  var priority = parseInt(filterOptimize.priority, 10) || 10;

  // enable one of the optimizations
  if (filterOptimize.css.bundle || filterOptimize.js.bundle) {
    hexo.extend.filter.register('after_generate', filter, priority);
  }
}
