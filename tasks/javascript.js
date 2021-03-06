'use strict';

var path            = require('path'),
    fs              = require('fs');

var gulp            = require('gulp'),
    jshint          = require('gulp-jshint'),
    rimraf          = require('gulp-rimraf'),
    runSequence     = require('run-sequence'),
    combined        = require('combined-stream'),
    to5ify          = require('6to5ify'),
    stringify       = require('stringify'),
    wordwrap        = require('wordwrap'),
    ngAnnotate      = require('browserify-ngannotate');

var karma           = require('../lib/test/karma'),
    browserify      = require('../lib/build/browserify'),
    yargs           = require('../lib/util/yargs'),
    hr              = require('../lib/util/hr'),
    streams         = require('../lib/config/streams'),
    jshintReporter  = require('../lib/util/jshint-reporter');

var cliArgs;
var transforms;

yargs.getInstance('javascript')
  .usage(wordwrap(2, 80)('The "javascript" task performs a one time build of the javascript composition root(s).'))
  .example('angularity javascript', 'Run this task')
  .example('angularity javascript -u', 'Run this task but do not minify javascript')
  .options('help', {
    describe: 'This help message',
    alias: ['h', '?'],
    boolean: true
  })
  .options('unminified', {
    describe: 'Inhibit minification of javascript',
    alias: ['u'],
    boolean: true,
    default: false
  })
  .options(jshintReporter.yargsOption.key, jshintReporter.yargsOption.value)
  .strict()
  .check(yargs.subCommandCheck)
  .check(jshintReporter.yargsCheck)
  .wrap(80);

//TODO @bguiz jsHintReporter module should only need to be imported by this module
//however, at the moment, the other gulp tasks use different yargs instances
//and therefore the options and checks need to repeated in each one,
//making the code tightly couple when they should not be.
//Proper solution would be to have yargs.getInstance modified to
//mixin options and checks from dependent/ prequisite yargs instances

yargs.getInstance('test')
  .usage(wordwrap(2, 80)('The "test" task performs a one time build and '+
    'karma test of all .spec.js files in the project.'))
  .example('angularity test', 'Run this task')
  .options('help', {
    describe: 'This help message',
    alias   : [ 'h', '?' ],
    boolean : true
  })
  .options(jshintReporter.yargsOption.key, jshintReporter.yargsOption.value)
  .options(karma.yargsOption.key, karma.yargsOption.value)
  .strict()
  .check(yargs.subCommandCheck)
  .check(jshintReporter.yargsCheck)
  .check(karma.yargsCheck)
  .wrap(80);

gulp.task('javascript', function (done) {
  console.log(hr('-', 80, 'javascript'));
  init();
  runSequence(
    ['javascript:cleanbuild', 'javascript:lint'],
    ['javascript:build'],
    done
  );
});

gulp.task('test', function (done) {
  console.log(hr('-', 80, 'test'));
  init();
  runSequence(
    ['javascript:cleanunit', 'javascript:lint'],
    'javascript:unit',
    done
  );
});

// clean javascript from the build directory
gulp.task('javascript:cleanbuild', function () {
  return gulp.src(streams.BUILD + '/**/*.js*', {read: false})
    .pipe(rimraf());
});

// clean javascript from the test directory
gulp.task('javascript:cleanunit', function () {
  return gulp.src(streams.TEST + '/**/*.js*', {read: false})
    .pipe(rimraf());
});

// run linter
gulp.task('javascript:lint', function () {
  return combined.create()
    .append(streams.jsApp())
    .append(streams.jsLib())
    .append(streams.jsSpec())
    .pipe(jshint())
    .pipe(jshintReporter.get(cliArgs[jshintReporter.yargsOption.key]));
});

// karma unit tests in local library only
gulp.task('javascript:unit', function () {
  var reporters = [].concat(cliArgs[karma.yargsOption.key])
    .filter(function isString(value) {
      return (typeof value === 'string');
    });
  return combined.create()
    .append(
      streams
        .testDependencies({
          dev: true,
          read: false
        })
    )
    .append(
      streams
        .jsSpec()
        .pipe(browserify
          .compile(80, transforms.concat(browserify.jasmineTransform('@')))
          .all('index.js'))
        .pipe(gulp.dest(streams.TEST))
    )
    .pipe(karma.createConfig(reporters))
    .pipe(gulp.dest(streams.TEST))
    .pipe(karma.run(reporters, 80));
});

// give a single optimised javascript file in the build directory with source map for each
gulp.task('javascript:build', function () {
  return streams.jsApp({read: false})
    .pipe(browserify
      .compile(80, transforms)
      .each(!cliArgs.unminified))
    .pipe(gulp.dest(streams.BUILD));
});

/**
 * Initialisation must be deferred until a task actually starts
 */
function init() {
  cliArgs    = cliArgs || yargs.resolveArgv();
  transforms = [
    to5ify.configure({ ignoreRegex: /(?!)/ }),              // convert any es6 to es5 (ignoreRegex is degenerate)
    stringify({ minify: false }),                           // allow import of html to a string
    !cliArgs.unminified && ngAnnotate, { sourcemap: true }  // @ngInject for angular injection points
  ];
  // TODO @bholloway fix stringify({ minify: true }) throwing error on badly formed html so that we can minify
  // TODO @bholloway fix sourcemaps in ngAnnotate so that it may be included even when not minifying
}
