'use strict';

var gulp         = require('gulp'),
    concat       = require('gulp-concat'),
    wrap         = require('gulp-wrap'),
    inject       = require('gulp-inject'),
    wordwrap     = require('wordwrap'),
    path         = require('path'),
    childProcess = require('child_process');

var yargs            = require('../lib/util/yargs'),
    hr               = require('../lib/util/hr'),
    jshintReporter   = require('../lib/util/jshint-reporter'),
    streams          = require('../lib/config/streams');

yargs.getInstance('cordova')
  .usage(wordwrap(2, 80)('The "cordova" task performs a cordova run with optional --device.'))
  .example('angularity cordova', 'Run this task')
  .example('angularity cordova --device', 'Run this task and use the connected device')
  .options('help', {
    describe: 'This help message',
    alias   : [ 'h', '?' ],
    boolean : true
  })
  .options('device', {
    description: "device flag from cordova",
    boolean: true,
    default: false
  })
  .options('emulator', {
    description: "emulator flag from cordova",
    boolean: true,
    default: false
  })
  .options(jshintReporter.yargsOption.key, jshintReporter.yargsOption.value)
  .strict()
  .check(yargs.subCommandCheck)
  .check(jshintReporter.yargsCheck)
  .wrap(80);

gulp.task('cordova', ['release'], function (done) {
  console.log(hr('-', 80, 'cordova'));
  childProcess.spawn('cordova', ['run', '--device'], { stdio: 'inherit', cwd: path.resolve('app-cordova') });
});
