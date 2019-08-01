const Promise = require('bluebird');
const streamRead = require('./stream');

function bundleFiles(list, allfiles, route, concatChar, removeComments) {
  var p = Promise.resolve('');

  list.filter(function (b) {
    var file = allfiles.filter(function (path) {
      return b.indexOf(path) >= 0;
    });
    if (file.length > 0) {
      p = p.then(function (content) {
        return streamRead(route.get(file[0])).then(function (str) {
          return combine(content, str, concatChar, removeComments);
        });
      });
    }
  });

  return p;
}

function combine(content, target, concatChar, removeComments) {
  if (content.length > 0) {
    content += concatChar;
    if (!removeComments) {
      // avoiding an issue when the bottom line of target
      // is the single line comment, add a newline end of it
      content += '\n';
    }
  }
  if (removeComments) {
    target = target
      // remove the target's comments
      .replace(/\/\*(.|\n)*?\*\//mg, '')
      // and remove spaces at begin and end
      .replace(/(^\s*|\s*$)/g, '');
  }
  return content + target;
}

module.exports = {
  bundleFiles: bundleFiles,
  combine: combine,
};
