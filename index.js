'use strict';

var filterOptimize = hexo.config.filter_optimize;
if (filterOptimize && filterOptimize.enable) {
  var filter = require('./lib/filter');

  filterOptimize.css = filterOptimize.css || {};
  filterOptimize.js = filterOptimize.js || {};

  // enable one of the optimizations
  if (filterOptimize.css.enable || filterOptimize.js.bundle) {
    hexo.extend.filter.register('after_generate', filter);
  }
}
