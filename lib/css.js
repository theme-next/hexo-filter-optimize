const csso = require('csso');
const { inExcludes } = require('./util');

module.exports = function(str, data) {
  let { remove_comments, css } = this.config.filter_optimize;
  if (inExcludes(data.path, css.excludes)) return str;
  return csso.minify(str, {
    comments: !remove_comments
  }).css;
};
