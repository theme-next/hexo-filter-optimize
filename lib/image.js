const Promise = require('bluebird');
const micromatch = require('micromatch');

const Imagemin = require('imagemin');
const mozjpeg = require('imagemin-mozjpeg');
const pngquant = require('imagemin-pngquant');
const gifsicle = require('imagemin-gifsicle');
const jpegtran = require('imagemin-jpegtran');
const optipng = require('imagemin-optipng');
const svgo = require('imagemin-svgo');

const { streamRead, inExcludes } = require('./util');

module.exports = function() {

  let { route } = this;
  let list = route.list();

  // Filter images.
  let images = list.filter(path => micromatch.isMatch(path, '**/*.{jpg,png,gif,svg}', { nocase: true }));
  // Retrieve image contents, and minify it.
  return Promise.map(routes, (path) => {
    // Retrieve and concatenate buffers.
    streamRead(path)
      .then(buffer => {
        // Create the Imagemin instance.
        const imageminOption = {
          plugins: [
            mozjpeg({ progressive: options.progressive }),
            gifsicle({ interlaced: options.interlaced }),
            jpegtran({ progressive: options.progressive }),
            optipng({ optimizationLevel: options.optimizationLevel }),
            svgo({ multipass: options.multipass })
          ]
        };

        // Add additional plugins.
        if (options.pngquant) { // Lossy compression.
          imageminOption.plugins.push(pngquant());
        }

        return Imagemin.buffer(buffer, imageminOption)
          .then((newBuffer) => {
            let length = buffer.length;
            if (newBuffer && length > newBuffer.length) {
              let saved = ((length - newBuffer.length) / length * 100).toFixed(2);
              log[options.silent ? 'debug' : 'info']('update Optimize IMG: %s [ %s saved]', path, saved + '%');
              route.set(path, newBuffer); // Update the route.
            }
          });
      });
  });
};
