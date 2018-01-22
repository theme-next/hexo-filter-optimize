'use strict';

if (hexo.config.filter_optimize && hexo.config.filter_optimize.enable) {
  var filter = require('./lib/filter');

  // enable optimize the css delivery
  if (hexo.config.filter_optimize.css_delivery) {
    hexo.extend.filter.register('after_generate', filter);
  }
}
