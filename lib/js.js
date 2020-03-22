const Terser = require('terser');
const { inExcludes } = require('./util');

module.exports = function(str, data) {
  let { remove_comments, js } = this.config.filter_optimize;
  if (inExcludes(data.path, js.excludes)) return str;
  return Terser.minify(str, {
    output: {
      comments: !remove_comments
    }
  }).code;
};
