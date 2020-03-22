const Promise = require('bluebird');
const micromatch = require('micromatch');

function combine(content, target, concatChar) {
  if (content.length > 0) {
    // avoiding an issue when the bottom line of target
    // is the single line comment, add a newline end of it
    content += concatChar + '\n';
  }
  return content + target;
}

function streamRead(stream, binary) {
  if (binary) {
    return new Promise((resolve, reject) => {
      const arr = [];
      stream
        .on('data', chunk => arr.push(chunk))
        .on('end', () => resolve(Buffer.concat(arr)))
        .on('error', reject);
    });
  }
  return new Promise((resolve, reject) => {
    let data = '';
    stream
      .on('data', chunk => {
        data += chunk.toString();
      })
      .on('end', () => resolve(data))
      .on('error', reject);
  });
}

function bundleFiles(list, allfiles, route, concatChar) {
  let p = Promise.resolve('');

  list.forEach(b => {
    let file = allfiles.filter(path => b.includes(path));
    if (file.length > 0) {
      p = p.then(content => {
        return streamRead(route.get(file[0])).then(str => {
          return combine(content, str, concatChar);
        });
      });
    }
  });

  return p;
}

// check whether `path` is in `excludes`
function inExcludes(path, excludes) {
  return excludes && excludes.some(item => micromatch.isMatch(path, item, { nocase: true }));
}

module.exports = { combine, streamRead, bundleFiles, inExcludes };
