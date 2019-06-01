'use strict';

var env = process.env.NODE_ENV;
var filterOptimize = hexo.config.filter_optimize;
if (env !== 'development' && filterOptimize && filterOptimize.enable) {
  var filter = require('./lib/filter');

  filterOptimize.css = filterOptimize.css || {};
  filterOptimize.js = filterOptimize.js || {};

  var priority = parseInt(filterOptimize.priority);
  if (isNaN(priority)) {
    priority = 10;
  }

  // enable one of the optimizations
  if (filterOptimize.css.enable || filterOptimize.js.bundle) {
    hexo.extend.filter.register('after_generate', filter, priority);
  }
}
