// Playwright normally detaches its browser into a separate process group. Keep
// this dedicated test workload in the watchdog's group so it can measure and
// kill browsers and servers even if Node is wedged. This is not loaded by the app.
'use strict';
const childProcess = require('node:child_process');
const spawn = childProcess.spawn;
childProcess.spawn = function scopedSpawn(command, args, options) {
  if (!Array.isArray(args)) return spawn.call(this, command, { ...args, detached: false });
  return spawn.call(this, command, args, { ...options, detached: false });
};
