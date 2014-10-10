'use strict';

var path          = require('path');

var gulp          = require('gulp');
var concat        = require('gulp-concat');
var wrap          = require('gulp-wrap');
var inject        = require('gulp-inject');
var jshint        = require('gulp-jshint');
var minifyHtml    = require('gulp-minify-html');
var ngHtml2js     = require('gulp-ng-html2js');
var plumber       = require('gulp-plumber');
var rimraf        = require('gulp-rimraf');
var semiflat      = require('gulp-semiflat');
var slash         = require('gulp-slash');
var watch         = require('gulp-watch');
var watchSequence = require('gulp-watch-sequence');

var browserSync   = require('browser-sync');
var combined      = require('combined-stream');
var runSequence   = require('run-sequence');
var bourbon       = require('node-bourbon');

var project       = require(path.resolve('package.json'));

var HTTP_PORT     = 8000;
var CONSOLE_WIDTH = 80;

var BOWER         = 'bower_components';

var JS_LIB_BOWER  = 'bower_components/**/js-lib';
var JS_LIB_LOCAL  = 'src/js-lib';
var JS_SRC        = 'src/target';
var JS_BUILD      = 'build';

var CSS_LIB_BOWER = 'bower_components/**/css-lib';
var CSS_LIB_LOCAL = 'src/css-lib';
var CSS_SRC       = 'src/target';
var CSS_BUILD     = 'build';

var HTML_SRC      = 'src/target';
var HTML_BUILD    = 'build';
var PARTIALS_NAME = 'templates';

var RELEASE       = 'release';
var CDN_LIB       = 'html-lib';
var CDN_APP       = (project.category ? (project.category + '/') : '') + project.name;
var RELEASE_LIB   = RELEASE + '/' + CDN_LIB + '/$';
var RELEASE_APP   = RELEASE + '/' + CDN_APP + '/$';

var jsHintReporter   = require('./lib/build/jshint-reporter');
var browserify       = require('./lib/build/browserify');
var nodeSass         = require('./lib/build/node-sass');
var karma            = require('./lib/test/karma');
var bowerFiles       = require('./lib/inject/bower-files');
var injectAdjacent   = require('./lib/inject/adjacent-files');
var injectTransform  = require('./lib/inject/relative-transform');
var versionDirectory = require('./lib/release/version-directory');

function jsLibStream(opts) {
  return combined.create()
    .append(gulp.src(JS_LIB_BOWER + '/**/*.js', opts)                       // bower lib JS
      .pipe(semiflat(JS_LIB_BOWER)))
    .append(gulp.src([ JS_LIB_LOCAL + '/**/*.js', '`!**/*.spec.js' ], opts)  // local lib JS overwrites
      .pipe(semiflat(JS_LIB_LOCAL)));
}

function jsSrcStream(opts) {
  return gulp.src([ JS_SRC + '/**/*.js', '!**/assets/**' ], opts)           // local app JS
    .pipe(semiflat(JS_SRC));
}

function jsSpecStream(opts) {
  return gulp.src(JS_LIB_LOCAL + '/**/*.spec.js', opts)                     // local lib SPEC JS
    .pipe(semiflat(JS_LIB_LOCAL));
}

function scssLibStream(opts) {
  return combined.create()
    .append(gulp.src(CSS_LIB_BOWER + '/**/*.scss', opts)            // bower lib CSS
      .pipe(semiflat(CSS_LIB_BOWER)))
    .append(gulp.src(CSS_LIB_LOCAL + '/**/*.scss', opts)            // local lib CSS overwrites
      .pipe(semiflat(CSS_LIB_LOCAL)))
    .append(gulp.src(BOWER + '/**/bootstrap/bootstrap.scss', opts)  // bower bootstrap SASS
      .pipe(semiflat(BOWER + '/**/bootstrap')));
}

function scssSrcStream(opts) {
  return gulp.src([ CSS_SRC + '/**/*.scss', '!**/assets/**' ], opts)  // local app CSS
    .pipe(semiflat(CSS_SRC));
}

function bowerJsStream(opts) {
  return bowerFiles(CONSOLE_WIDTH)
    .prepend(browserify.RUNTIME)
    .js(opts);
}

function bowerJsCssStream(opts) {
  return bowerFiles(CONSOLE_WIDTH)
    .prepend(browserify.RUNTIME)
    .all(opts);
}

function htmlPartialsSrcStream(opts) {
  return gulp.src([ HTML_SRC + '/**/partials/**/*.html', '!**/assets/**' ], opts)
    .pipe(semiflat(HTML_SRC));
}

function htmlAppSrcStream(opts) {
  return gulp.src([ HTML_SRC + '/**/*.html', '!**/assets/**' ], opts) // ignore partials
    .pipe(semiflat(HTML_SRC));
}

function routes() {
  var result = { };
  [ BOWER,
    JS_SRC,
    JS_BUILD,
    JS_LIB_LOCAL,
    CSS_SRC,
    CSS_BUILD,
    CSS_LIB_LOCAL,
    browserify.RUNTIME
  ].forEach(function(path) {
    result['/' + slash(path)] = path;
  });
  return result;
}

function hr(char, length, title) {
  var text = (title) ? (' ' + title.split('').join(' ').toUpperCase() + ' ') : '';  // double spaced title text
  while (text.length < length) {
    text = char + text + char;  // centre title between the given character
  }
  return text.slice(0, length); // enforce length, left justified
}

// DEFAULT ---------------------------------
var isMinify = (process.argv[process.argv.length - 1] !== 'nominify');
var task     =  process.argv[process.argv.length - 1 - Number(!isMinify)];

gulp.task('default', [ 'watch' ]);

gulp.task('nominify', [ 'watch' ]);

gulp.task('build', function(done) {
  console.log(hr('-', CONSOLE_WIDTH, 'build'));
  runSequence('js', 'css', 'html', done);
});

// SERVER ---------------------------------
gulp.task('server', [ 'build' ], function() {
  console.log(hr('-', CONSOLE_WIDTH, 'server'));
  browserSync({
    server: {
      baseDir: HTML_BUILD,
      routes:  routes()
    },
    port:     HTTP_PORT,
    logLevel: 'silent',
    open:     false
  });
});

gulp.task('reload', function() {
  console.log(hr('-', CONSOLE_WIDTH, 'reload'));
  browserSync.reload();
});

// JS ---------------------------------
gulp.task('js', function(done) {
  console.log(hr('-', CONSOLE_WIDTH, 'javascript'));
  runSequence(
    [ 'js:clean', 'js:init' ],
    'js:build',
    done
  );
});

gulp.task('test', function(done) {
  console.log(hr('-', CONSOLE_WIDTH, 'test'));
  runSequence(
    'js:init',
    'js:unit',
    done
  );
});

// clean the js build directory
gulp.task('js:clean', function() {
  return gulp.src(JS_BUILD + '/**/*.js*', { read: false })
    .pipe(rimraf());
});

var bundler;

// mark sources for browserify and run linter
gulp.task('js:init', function() {
  bundler = browserify(CONSOLE_WIDTH);
  return combined.create()
    .append(jsLibStream())
    .append(jsSrcStream())
    .append(jsSpecStream())
    .pipe(bundler.sources())
    .pipe(bundler.reserve())
    .pipe(jshint())
    .pipe(jsHintReporter(CONSOLE_WIDTH));
});

// karma unit tests in local library only
gulp.task('js:unit', function() {
  var preJasmine = bundler.getJasmineTransform({
    '@': function (filename) { return filename + ':0:0'; }  // @ is replaced with filename:0:0
  });
  return jsSpecStream()
    .pipe(bundler.compile(preJasmine, bundler.es6ifyTransform).all('test/karma-main.js'))
    .pipe(gulp.dest(JS_BUILD))
    .pipe(karma({
      files:      bowerJsStream({ dev: true }).list,
      frameworks: [ 'jasmine' ],
      reporters:  [ 'spec' ],
      browsers:   [ 'Chrome' ],
      logLevel:   'error'
    }, CONSOLE_WIDTH));
});

// give a single optimised js file in the build directory with source map for each
gulp.task('js:build', function() {
  return jsSrcStream({ read: false })
    .pipe(bundler.compile(bundler.es6ifyTransform).each(isMinify))
    .pipe(gulp.dest(JS_BUILD));
});

// CSS ---------------------------------
gulp.task('css', function(done) {
  console.log(hr('-', CONSOLE_WIDTH, 'css'));
  runSequence(
    [ 'css:clean', 'css:init' ],
    'css:build',
    done
  );
});

// clean the css build directory
gulp.task('css:clean', function() {
  return gulp.src(CSS_BUILD + '/**/*.css*', { read: false })
    .pipe(rimraf());
});

var sass;

// discover css libs
gulp.task('css:init', function() {
  sass = nodeSass(CONSOLE_WIDTH);
  return scssLibStream({ read: false })
    .pipe(sass.libraries(bourbon.includePaths));
});

// compile sass with the previously discovered lib paths
gulp.task('css:build', function() {
  return scssSrcStream({ read: false })
    .pipe(sass.compile())
    .pipe(gulp.dest(CSS_BUILD));
});

// HTML ---------------------------------
gulp.task('html', function(done) {
  console.log(hr('-', CONSOLE_WIDTH, 'html'));
  runSequence(
    'html:clean',
    [ 'html:partials', 'html:assets' ],
    'html:inject',
    done
  );
});

// clean the html build directory
gulp.task('html:clean', function() {
  return gulp.src([ HTML_BUILD + '/**/*.html*', HTML_BUILD + '/**/assets/**' ], { read: false })
    .pipe(rimraf());
});

// convert partials into template js
gulp.task('html:partials', function() {
  return htmlPartialsSrcStream()
    .pipe(plumber())
    .pipe(minifyHtml({
      empty:  true,
      spare:  true,
      quotes: true
    }))
    .pipe(ngHtml2js({
      moduleName: PARTIALS_NAME
    }))
    .pipe(concat(PARTIALS_NAME + '.html.js'))
    .pipe(gulp.dest(JS_BUILD));
});

// copy assets to build directory
gulp.task('html:assets', function() {
  return gulp.src(HTML_SRC + '/**/assets/**')
    .pipe(gulp.dest(HTML_BUILD));
});

// inject dependencies into html and output to build directory
gulp.task('html:inject', function() {
  return htmlAppSrcStream()
    .pipe(plumber())
    .pipe(injectAdjacent('js', JS_BUILD))
    .pipe(injectAdjacent('css', CSS_BUILD))
    .pipe(inject(bowerJsCssStream({ read: false }), {
      name: 'bower'
    }))
    .pipe(gulp.dest(HTML_BUILD));
});

// RELEASE ---------------------------------
gulp.task('release', [ 'build' ], function(done) {
  console.log(hr('-', CONSOLE_WIDTH, 'release'));
  runSequence(
    'release:clean',
    [ 'release:adjacent', 'release:bower' ],
    'release:versionlib',
    'release:inject',
    'release:versionapp',
    done
  );
});

// clean the html build directory
gulp.task('release:clean', function() {
  return gulp.src(RELEASE, { read: false })
    .pipe(rimraf());
});

gulp.task('release:adjacent', function() {
  return combined.create()
    .append(gulp.src([ JS_BUILD   + '/**/*.js',   '!**/dev/**', '!**/test**'      ]))
    .append(gulp.src([ CSS_BUILD  + '/**/*.css',  '!**/dev/**', '!**/test**'      ]))
    .append(gulp.src([ HTML_SRC   + '/**/*.html', '!**/dev/**', '!**/partials/**' ]))
    .append(gulp.src([ HTML_SRC   + '/**/assets/**' ]))
    .pipe(gulp.dest(RELEASE_APP));
});

// copy bower main elements to versioned directories in release
gulp.task('release:bower', function() {
  return bowerJsCssStream({ manifest: true })
    .pipe(wrap([
        '/* ' + hr('-', 114),
        ' * <%= file.relative %>',
        ' * ' + hr('-', 114) + ' */',
        '<%= contents %>'
      ].join('\n')))
    .pipe(concat('vendor.js'))
    .pipe(gulp.dest(RELEASE_LIB));
});

// version the release app directory
gulp.task('release:versionlib', function() {
  return gulp.src(RELEASE_LIB + '/**')
    .pipe(versionDirectory('$', true));
});

// inject dependencies into html and output to build directory
gulp.task('release:inject', function() {
  return gulp.src([ RELEASE_APP + '/**/*.html', '!**/dev/**' ])
    .pipe(plumber())
    .pipe(injectAdjacent('js|css', RELEASE_APP, {
      name: 'inject',
      transform: injectTransform
    }))
    .pipe(inject(gulp.src(RELEASE_LIB.replace('$', '*') + '/**', { read: false }), {
      name: 'bower',
      transform: injectTransform
    }))
    .pipe(gulp.dest(RELEASE_APP));
});

// version the release app directory
gulp.task('release:versionapp', function() {
  return gulp.src(RELEASE_APP + '/**')
    .pipe(versionDirectory('$', true));
});

// WATCH ---------------------------------
gulp.task('watch', [ 'server' ], function() {

  // enqueue actions to avoid multiple trigger
  var queue = watchSequence(500, function() {
    console.log(hr('\u2591', CONSOLE_WIDTH));
  });

  // watch statements
  watch([
    JS_LIB_BOWER + '/**/*.js',
    JS_LIB_LOCAL + '/**/*.js',
    JS_SRC       + '/**/*.js'
  ], {
    name: 'JS',
    emitOnGlob: false
  }, queue.getHandler('js', 'html', 'reload')); // html will be needed in case previous injection failed

  watch([
    CSS_LIB_BOWER + '/**/*.scss',
    CSS_LIB_LOCAL + '/**/*.scss',
    CSS_SRC       + '/**/*.scss'
  ],{
    name: 'CSS',
    emitOnGlob: false
  }, queue.getHandler('css', 'html', 'reload')); // html will be needed in case previous injection failed

  watch([
    BOWER    + '/**/*',
    HTML_SRC + '/**/*.html'
  ], {
    name: 'HTML | BOWER',
    emitOnGlob: false
  }, queue.getHandler('html', 'reload'));
});

// KICKOFF ---------------------------------
if (process.argv.indexOf('gulp') < 0) {
  gulp.start(gulp.hasTask(task) ? task : 'default');
}
