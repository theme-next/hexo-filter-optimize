# hexo-filter-optimize

A hexo plugin that optimize the pages loading speed.

It will auto filter your html file, find the `<link rel="stylesheet">` block and replace them into a javascript to [optimize CSS delivery](https://developers.google.com/speed/docs/insights/OptimizeCSSDelivery).

And inline the `main.css` into the html page like @maple3142 [does](https://github.com/maple3142/Blog/blob/master/gulpfile.js).

It will improve your pages loading and get a higher score in the [Google PageSpeed Insights](https://developers.google.com/speed/pagespeed/insights/).

## Installation

```bash
npm install hexo-filter-optimize --save
```

## Usage

Activate the plugin in hexo's `_config.yml` like this:
```yml
filter_optimize:
  enable: true
  css_delivery: true
  ...
```