/*jshint node: true, strict: false, devel: true, debug: true, unused:false, undef:true */
// variables to store static data from MongoDB
var organism_groups;
var user_specializations;
var users = null;
var phases = null;
// S3 dependencies
var jQuery = require('jquery');
var _ = require('underscore');
// setting up backbone
var Backbone = require('backbone');
Backbone.$ = jQuery;
// setting up Drowsy and Wakeful
var Drowsy = require('backbone.drowsy').Drowsy;
var Wakeful = require('backbone.drowsy/wakeful').Wakeful;
// read config.json
var fs = require('fs');
var config = JSON.parse(fs.readFileSync('./config.json'));
// pull in EvoRoom model
var EvoRoom = {};
EvoRoom.Model = require('../js/evoroom.model.js').EvoRoom.Model;

var DATABASE = 'evo4-march-2013';


// reacting to changes in PHASES Model
var reactToPhaseChange = function (phase) {
  var phasename = phase.get('foo');  // for debugging later phase_name
  console.log("Phase is now: ", phasename);
  var users_with_assigned_organisms = {};

  if (phasename === "rotation 1") {
    console.log("Phase rotation 1 entered. Start to assign animals to students!");
    
    // Look up students that are present and marked as participants from users collection
    var participant_names = [];
    _.each(users.models, function (user) {
      if (user.get('phase_data').role === "participant") {
        participant_names.push(user.get('username'));
      }
    });
    console.log('Available participants');
    console.log(participant_names);

    // copy organism_groups into assignable_organisms so we can consume while keeping organism_groups
    var assignable_organisms = {};
    _.map(organism_groups, function (organisms, group) {
      if (group !== '_id') {
        assignable_organisms[group] = organisms.slice(0);
      }
    });
    console.log(assignable_organisms);

    // copy speciality from user_specializations
    // into participants object
    var participants = {};
    _.each(participant_names, function (participant_name) {
      var speciality = user_specializations[participant_name];
      participants[participant_name] = speciality;
      // prime the resulting object with user names
      users_with_assigned_organisms[participant_name] = [];
    });

    // assign each student 1-2 species of their specialty group
    var assign_from_specialty_group = true;

    while (assign_from_specialty_group) {
      _.map(participants, function (s, p) {
        // get an organism from specialty group
        if (assignable_organisms[s].length > 0) {
          var organism = assignable_organisms[s].pop();
          users_with_assigned_organisms[p].push(organism);
        } else {
          console.log('No organism left in group "'+s+'" so we assign something else');
          var assign_extra = true;
          _.map(assignable_organisms, function (o, g) {
            if (o.length > 0 && assign_extra) {
              var organism = assignable_organisms[g].pop();
              users_with_assigned_organisms[p].push(organism);
              assign_extra = false;
            }
          });
        }
      });

      assign_from_specialty_group = false;
      // decide if to stay in this loop or not
      _.map(assignable_organisms, function (organisms) {
        if (organisms.length > 0) {
          assign_from_specialty_group = true;
        }
      });
    }

    // assign all the other species evenly over all the students

    console.log("Resulting user and their assigned organisms");
    console.log(users_with_assigned_organisms);

  }
};


var whenObj = jQuery.when(jQuery.get(config.drowsy.url +'/'+DATABASE+'/organism_groups'), jQuery.get(config.drowsy.url +'/'+DATABASE+'/user_specializations'));
whenObj.done(function (og_result, us_result) {
  organism_groups = og_result[0][0];
  console.log(organism_groups);
  user_specializations = us_result[0][0];
  console.log(user_specializations);

  // Wakeful connection via EvoRoom.Model that allows to receive change triggers 
  EvoRoom.Model.init(config.drowsy.url, DATABASE).done(function () {
    // Start Listening to changes in the phases and react where needed
    var fetchUsersSuccess = function () {
      phases = new EvoRoom.Model.Phases();
      phases.wake(config.wakeful.url);

      phases.on('change add', reactToPhaseChange);
      phases.on('reset', function () {
        _.each(phases.models, function (phase) {reactToPhaseChange(phase);});
      });

      phases.fetch();
    };

    users = new EvoRoom.Model.Users();
    users.wake(config.wakeful.url);

    users.on('change add', updateUserStuff);
    users.on('reset', function () {
      _.each(users.models, function (user) {updateUserStuff(user);});
    });

    users.fetch({success: fetchUsersSuccess});
  });

});


 
// reacting to changes in USERS Model
function updateUserStuff(user) {
    console.log("doing stuff for", user.get('username'));
}