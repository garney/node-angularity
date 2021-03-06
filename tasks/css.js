'use strict';

var gulp        = require('gulp'),
    rimraf      = require('gulp-rimraf'),
    runSequence = require('run-sequence'),
    wordwrap    = require('wordwrap'),
    path        = require('path');

var nodeSass = require('../lib/build/node-sass'),
    yargs    = require('../lib/util/yargs'),
    hr       = require('../lib/util/hr'),
    streams  = require('../lib/config/streams');

yargs.getInstance('css')
  .usage(wordwrap(2, 80)('The "css" task performs a one time build of the SASS composition root(s).'))
  .example('angularity css', 'Run this task')
  .options('help', {
    describe: 'This help message',
    alias   : [ 'h', '?' ],
    boolean : true
  })
  .strict()
  .check(yargs.subCommandCheck)
  .wrap(80);

gulp.task('css', function (done) {
  console.log(hr('-', 80, 'css'));
  runSequence(
    'css:clean',
    'css:build',
    done
  );
});

// clean the css build directory
gulp.task('css:clean', function () {
  return gulp.src(streams.BUILD + '/**/*.css*', {read: false})
    .pipe(rimraf());
});

// compile sass with the previously discovered lib paths
gulp.task('css:build', function () {
  return streams.scssApp()
    .pipe(nodeSass(80, [streams.BOWER, streams.NODE]))
    .pipe(gulp.dest(streams.BUILD));
});