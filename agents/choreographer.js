/*jshint node: true, strict: false, devel: true, debug: true, unused:false, undef:true, loopfunc:true */
// variables to store static data from MongoDB
var users = null;
var phases = null;

// grab information from user
var myArgs = require('optimist').argv,
     help = '\nUsage: \n\n    node agents/choreographer.js  <database_name>  \n\n';
if ((myArgs.h)||(myArgs.help)) {
  console.log(help);
  process.exit(0);
}
var DATABASE = myArgs._[0];

// S3 dependencies
var jQuery = require('jquery');
var _ = require('underscore');
// setting up backbone
var Backbone = require('backbone');
Backbone.$ = jQuery;
// setting up Drowsy and Wakeful
var Drowsy = require('Backbone.Drowsy').Drowsy;
var Wakeful = require('Backbone.Drowsy/wakeful').Wakeful;
// read config.json
var fs = require('fs');
var config = JSON.parse(fs.readFileSync('./config.json'));
// read static data from file system
var organism_groups = JSON.parse(fs.readFileSync('./assets/static_data/organism_groups.json'));
console.log(organism_groups);
var user_specializations = JSON.parse(fs.readFileSync('./assets/static_data/user_specializations.json'));
console.log(user_specializations);

// pull in EvoRoom model
var EvoRoom = {};
EvoRoom.Model = require('../js/evoroom.model.js').EvoRoom.Model;


// reacting to changes in PHASES Model
var reactToPhaseChange = function (phase) {
  var phasenumber = phase.get('phase_number');  // for debugging later phase_name
  console.log("Phase number is now: ", phasenumber);
  var users_with_assigned_organisms = {};

  if (phasenumber === 1 || phasenumber === 3) {
    console.log("Phase "+phasenumber+" entered. Start to assign animals to students!");
    
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

    console.log("Organisms assigned to users now writing into users ...");
    //console.log(users_with_assigned_organisms);

    // write organisms array into users
    users.each(function (user) {
      var username = user.get('username');
      var phase_data = user.get('phase_data');
      var assigned_organisms = users_with_assigned_organisms[username];
      if (assigned_organisms) {
        phase_data.assigned_organisms = assigned_organisms;
        user.set('phase_data', phase_data);
        user.wake(config.wakeful.url);
        user.save();
        console.log('...all users should have assigned organisms now !!!');
      }
    });
  }
};

// Wakeful connection via EvoRoom.Model that allows to receive change triggers 
EvoRoom.Model.init(config.drowsy.url, DATABASE).done(function () {
  // Start Listening to changes in the phases and react where needed
  var fetchUsersSuccess = function () {
    phases = new EvoRoom.Model.Phases();
    phases.wake(config.wakeful.url);

    phases.on('change add', reactToPhaseChange);
    phases.on('reset', function () {
      if (phases.models.length === 0) {
        var p = new EvoRoom.Model.Phase();
        //p.set('phase_name', "orientation");
        p.set('phase_number', 0);
        p.set('phase_name', 'orientation');
        p.set('time', null);
        p.save();
      } else {
        _.each(phases.models, function (phase) {reactToPhaseChange(phase);});
      }
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

 
// reacting to changes in USERS Model
function updateUserStuff(user) {
    console.log("doing stuff for", user.get('username'));
}