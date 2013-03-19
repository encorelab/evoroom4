/*jshint node: true, strict: false, devel: true, debug: true, unused:false, undef:true */

var jQuery = require('jquery');
var _ = require('underscore');
 
var Backbone = require('backbone');
Backbone.$ = jQuery;
 
var Drowsy = require('backbone.drowsy').Drowsy;
var Wakeful = require('backbone.drowsy/wakeful').Wakeful;
 
var fs = require('fs');
 
var config = JSON.parse(fs.readFileSync('./config.json'));
 
var EvoRoom = {};
 
// EvoRoom.Model = require('../js/evoroom.model.js').Model;

EvoRoom.Model = require('../js/evoroom.model.js').EvoRoom.Model;

var DATABASE = 'evo4-march-2013';
 
EvoRoom.Model.init(config.drowsy.url, DATABASE).done(function () {
  // Start Listening to changes in the phases and react where needed
  var phases = new EvoRoom.Model.Phases();
  phases.wake(config.wakeful.url);

  phases.on('change add', reactToPhaseChange);
  phases.on('reset', function () {
    _.each(phases.models, function (phase) {reactToPhaseChange(phase);});
  });

  phases.fetch();


  var users = new EvoRoom.Model.Users();
  users.wake(config.wakeful.url);

  users.on('change add', updateUserStuff);
  users.on('reset', function () {
    _.each(users.models, function (user) {updateUserStuff(user);});
  });

  users.fetch();
});


// For testing load student tablet and go to console
// p = new EvoRoom.Model.Phase({'_id': '51422225c03c1e6752000000'});
// p.fetch()
// p.wake(Sail.app.config.wakeful.url);
// p.set('foo', 'rotation 1');
// p.save();

function reactToPhaseChange(phase) {
  var phasename = phase.get('foo');  // for debugging later phase_name
  console.log("Phase is now: ", phase.get('phase_name'));

  if (phasename === "rotation 1") {
    console.log("Pahse rotation 1 entered. Start to assign animals to students!");
    // Need to look up students that are present
    // disregard students that are guides for this round
    // assign each student 1-2 species of their specialty group

    // assign all the other species evenly over all the students

  }
}
 
function updateUserStuff(user) {
    console.log("doing stuff for", user.get('username'));
}