  /*jshint browser: true, devel: true, debug: true, strict: false, unused:false, undef:true */
/*globals jQuery, _, Sail, EvoRoom, Rollcall, Wakeful */

window.EvoRoom = window.EvoRoom || {};

EvoRoom.Mobile = function() {
  var app = this;

  app.name = "EvoRoom.Mobile";

  app.requiredConfig = {
    rollcall: {
      url: 'string'
    },
    drowsy: {
      url: 'string'
    },
    wakeful: {
      url: 'string'
    },
    pikachu: {
      url: 'string'
    },
    curnit:'string'
  };

  app.rollcall = null;
  app.ancestors = null;
  app.guideOrganisms = null;
  app.explanationOrganism = null;
  app.phases = null;
  app.phase = null;
  app.users = null;
  app.user = null;
  app.groups = null;
  app.group = null;
  app.observations = null;
  app.observation = null;
  app.notes = null;
  app.note = null;
  app.explanations = null;
  app.explanation = null;
  app.rollcallGroupName = null;
  app.rollcallGroupMembers = null;
  app.rollcallMetadata = null;
  app.rotationNumber = 1;
  app.keyCount = 0;
  app.explanationTime = null;

  app.autoSaveTimer = window.setTimeout(function() { console.log("timer activated"); } ,10);

  app.init = function() {
    jQuery('#evoroom').addClass('hide'); // hide everything except login screen

    Sail.verifyConfig(this.config, this.requiredConfig);
    
    Sail.modules
      // Enable multi-picker login for CommonKnowledge curnit - asking for run (must be linked to curnit)
      .load('Rollcall.Authenticator', {mode: 'picker', askForRun: true, curnit: app.config.curnit})
      .load('Wakeful.ConnStatusIndicator')
      .load('AuthStatusWidget', {indicatorContainer: '#logout-container'})
      .thenRun(function () {
        Sail.autobindEvents(app);
        app.trigger('initialized');

        return true;
      });

    // create a Rollcall instance so that sail.app has access to it later on
    app.rollcall = new Rollcall.Client(app.config.rollcall.url);

    // configure the toasts
    jQuery().toastmessage({
      position : 'middle-center'
    });

  };

  app.authenticate = function() {
    // TODO: implement me... probably just copy + modify code from washago?

    // TODO: for now we're hard-coding a run name... need to get this from auth
    //this.config.run = {name: "ck-alpha1", id: 12};
    if (!app.run) {
      Rollcall.Authenticator.requestRun();
    } else {
      Rollcall.Authenticator.requestLogin();
    }    
  };

  app.restoreState = function () {
    console.log("Restoring UI state...");

    // Reading user object and deciding which screen to go to    
    if (app.user.get('user_phase') === "orientation") {
      jQuery('#log-in-success').show();
    } else if (app.user.get('user_phase') === "rotation_1") {
      if (app.user.get('phase_data').role === "participant") {
        app.createNewObservation();
        app.updateUserHTML();
        jQuery('#assigned-organism-container').show();
        jQuery('#organism-presence').show();
      } else if (app.user.get('phase_data').role === "guide") {
        jQuery('#guide-choice').show();
      } else {
        console.error('User on rotation 1 but doesnt have a role');
      }
    } else if (app.user.get('user_phase') === "meetup_1") {
      jQuery('#meetup-instructions').show();
    } else if (app.user.get('user_phase') === "rotation_2") {
      if (app.user.get('phase_data').role === "participant") {
        app.createNewObservation();
        app.updateUserHTML();
        jQuery('#assigned-organism-container').show();
        jQuery('#organism-presence').show();
      } else if (app.user.get('phase_data').role === "guide") {
        jQuery('#guide-choice').show();
      } else {
        console.error('User on rotation 1 but doesnt have a role');
      }
    } else if (app.user.get('user_phase') === "meetup_2") {
      jQuery('#meetup-instructions').show();
    } else if (app.user.get('user_phase') === "explanation") {
      jQuery('#explanation-instructions').show();
    } else {
      console.log('Not restoring state...');
    }
    
    //app.handlePhaseChange();
    // Reading phase object and calling functions that allow transitions to certain phases
  };

  app.events = {
    initialized: function(ev) {
      app.authenticate();
    },

    'ui.initialized': function(ev) {
      console.log("ui.initialized!");
    },    

    authenticated: function(ev) {
      console.log("Authenticated...");

      // now we call a class function (init) and hand in the drowsy url and the run name so we don't need
      // to do this config again for each model instantiation
      EvoRoom.Model.init(app.config.drowsy.url, app.run.name)
      .done(function () {
        Wakeful.loadFayeClient(app.config.wakeful.url).done(function () {
          EvoRoom.Model.initWakefulCollections(app.config.wakeful.url).done(function () {
            app.trigger('ready');
          });
        });
      });
    },

    ready: function(ev) {
      console.log("Ready!");

      // grab all the stuff that won't be changing (ancestors, guide_organisms, etc.)
      app.fetchStaticData();

      // setup picture upload service
      app.initPikachu();

      Sail.app.rollcall.request(Sail.app.rollcall.url + "/users/" + Sail.app.session.account.login + ".json", "GET", {}, function(data) {
        // retrieve group name from Rollcall
        app.rollcallGroupName = data.groups[0].name;
        // grab metadata from Rollcall
        app.rollcallMetadata = data.metadata;
        // do the rest of the ready function ;)
        // Disable logout button to avoid crash of node-bosh-ws-xmpp bridge
        // FIXME: unneccessary once XMPP is turned off
        jQuery('#logout-button').unbind();
        jQuery('#logout-button a').unbind();
        jQuery('#logout-button a').click( function() {
          console.log('reload');
          window.location.reload();
        });

        Sail.app.rollcall.request(Sail.app.rollcall.url + "/groups/" + app.rollcallGroupName + ".json", "GET", {}, function(data) {
          // create the all_members
          app.rollcallGroupMembers = data.members;
          app.rollcallGroupMetadata = data.metadata;
          // init all models and collections needed an make them wakefull
          app.initModels();
          // hook up event listener to buttons to allow interactions
          app.bindEventsToPageElements();

          jQuery('#evoroom').removeClass('hide'); // unhide everything
        });
      });
    },

    'unauthenticated': function(ev) {
      app.authenticate();
    }
  };


  /************** Collection and Model functions **************/

  app.fetchStaticData = function() {
    jQuery.get("../assets/static_data/ancestors.json", function(data) {
      app.ancestors = data;
    });
    jQuery.get("../assets/static_data/guide_organisms.json", function(data) {
      app.guideOrganisms = data;
    });
    jQuery.get("../assets/static_data/explanation_organisms.json", function(data) {
      _.map(data, function (v, k) {
        if (k === Sail.app.session.account.login) {
          app.explanationOrganism = v;
        }
      });

      if (app.explanationOrganism === null) {
        console.error("No organsim was assigned to this user for explanation phase");
      }
    });    
  };

  app.initModels = function() {
    console.log('Initializing models...');

    // GROUPS collection
    if (app.group === null) {
      var gn = app.rollcallGroupName;
      app.groups = EvoRoom.Model.awake.groups;

      var fetchGroupsSuccess = function(collection, response) {
        console.log("Retrieved groups collection...");
        // GROUP model
        var myGroup = app.groups.find(function(group) { return group.get('group_name') === gn; });
        if (myGroup) {
          app.group = myGroup;
          app.group.set('modified_at', new Date());
        } else {
          console.log("No group found for this user, creating...");
          app.group = new EvoRoom.Model.Group({group_name: gn});
          app.group.set('all_members', app.rollcallGroupMembers);
          app.group.set('meetup_location_1',app.rollcallGroupMetadata.meetup_location_1);
          app.group.set('meetup_location_2',app.rollcallGroupMetadata.meetup_location_2);
          app.group.set('notes_completed',[]);
        }
        var saveSuccess = function(model, response) {
          app.group.on('change', app.updateGroupHTML);
          app.group.wake(Sail.app.config.wakeful.url);
          app.updateGroupHTML();
          app.initPhaseModels();
        };
        app.group.save(null, {success: saveSuccess});
      };
      var fetchGroupsError = function(collection, response) {
        console.error("No group collection found - and we are dead!!!");
      };
      app.groups.fetch({success: fetchGroupsSuccess, error: fetchGroupsError});
    } else {
      console.log("Groups model already exists...");
    }

    // USERS collection
    if (app.user === null) {
      var u = Sail.app.session.account.login;   // grab username from Rollcall
      app.users = EvoRoom.Model.awake.users;

      var fetchUsersSuccess = function(collection, response) {
        console.log('Retrieved users collection...');
        // check if users collection contains an object for our current user
        var myUser = app.users.find(function(user) { return user.get('username') === u; });
        // USER model
        if (myUser) {
          console.log("There seems to be a users entry for us already :)");
          app.user = myUser;
          app.user.set('modified_at', new Date());
        } else {
          console.log("No users object found for ", u, ", creating...");
          app.user = new EvoRoom.Model.User({username: u}); // create new user object
          app.user.set('user_phase','orientation');
          app.user.set('phases_completed',[]);
          app.user.set('phase_data', {});
        }
        var saveSuccess = function(model, response) {
          // many other collections require this user collection to be fetched and the model set up first - so nested...
          app.initObservationModels();

          app.user.wake(Sail.app.config.wakeful.url); // make user object wakeful
          app.user.on('change', app.updateUserHTML);
          app.updateUserHTML();
        };
        app.user.set('group_name', app.rollcallGroupName);
        app.user.set('direction', app.rollcallMetadata.direction);
        app.user.save(null, {success: saveSuccess}); // save the user object to the database
      };
      var fetchUsersError = function(collection, response) {
        console.error("No users collection found - and we are dead!!!");
      };
      app.users.fetch({success: fetchUsersSuccess, error: fetchUsersError});
    } else {
      console.error("User model already exists...");
    }

    // NOTES collection
    if (app.note === null) {
      app.notes = EvoRoom.Model.awake.notes;

      var fetchNotesSuccess = function(collection, response) {
        console.log("Retrieved notes collection...");
      };
      var fetchNotesError = function(collection, response) {
        console.error("No users collection found - and we are dead!!!");
      };
      app.notes.fetch({success: fetchNotesSuccess, error: fetchNotesError});
    } else {
      console.log("Note model already exists...");
    }

    // EXPLANATIONS collection
    if (app.explanations === null) {
      app.explanations = EvoRoom.Model.awake.explanations;

      var fetchExplanationsSuccess = function(collection, response) {
        console.log("Retrieved explanations collection...");
      };
      var fetchExplanationsError = function(collection, response) {
        console.error("No users collection found - and we are dead!!!");
      };
      app.explanations.fetch({success: fetchExplanationsSuccess, error: fetchExplanationsError});
    } else {
      console.log("Explanation model already exists...");
    }

  };

  app.initPhaseModels = function() {
    // PHASES collection
    if (app.phase === null) {
      app.phases = EvoRoom.Model.awake.phases;
      var fetchPhasesSuccess = function(collection, response) {
        console.log("Retrieved phases collection...");
        if (collection.length === 1) {
          // PHASE model
          app.phase = app.phases.first();
          app.phase.wake(Sail.app.config.wakeful.url);
          app.phase.on('change', app.updatePhaseHTML);
          if (app.phase.get('phase_number') > 3) {
            app.rotationNumber = 2;
          }
          app.updatePhaseHTML();
        } else {
          console.error("More or less than 1 phase object found in phases collection...");
        }
      };
      var fetchPhasesError = function(collection, response) {
        console.error("No phase found - and we are dead!!!");
      };
      app.phases.fetch({success: fetchPhasesSuccess, error: fetchPhasesError});
    } else {
      console.error("Phase model already exists...");
    }
  };

  app.initObservationModels = function() {
    // OBSERVATIONS collection
    if (app.observation === null) {
      app.observations = EvoRoom.Model.awake.observations;

      var fetchObservationsSuccess = function(collection, response) {
        console.log("Retrieved observations collection...");
        // return user to last screen according to user object and enable transitions according to phase object
        app.restoreState();
      };
      var fetchObservationsError = function(collection, response) {
        console.error("No users collection found - and we are dead!!!");
      };
      app.observations.fetch({success: fetchObservationsSuccess, error: fetchObservationsError});
    } else {
      console.log("Observation model already exists...");
    }
  };

  app.createNewObservation = function() {
    app.observation = new EvoRoom.Model.Observation();
    app.observation.set('username',app.user.get('username'));
    app.observation.set('assigned_organism',app.user.get('current_organism'));
    app.observation.set('observed_organism','not chosen');
    app.observation.set('phase',app.phase.get('phase_number'));
    app.observation.set('time',app.user.get('phase_data').time);
    app.observation.wake(Sail.app.config.wakeful.url);
    app.observation.save();
  };

  app.createNewNote = function() {
    app.note = new EvoRoom.Model.Note();
    app.note.set('username',app.user.get('username'));
    app.note.set('group_name',app.group.get('group_name'));
    app.note.set('body','');
    app.note.set('published',false);
    app.note.set('phase',app.phase.get('phase_number'));
    app.note.wake(Sail.app.config.wakeful.url);
    app.note.on('change', app.updateUserHTML);
    app.note.save();
  };

  app.createNewExplanation = function(callback) {
    // also initExplanationModels
    var myExplanation = app.explanations.find(function(expl) { return (expl.get('username') === Sail.app.session.account.login && !expl.get('published')); });

    if (myExplanation) {
      app.explanation = myExplanation;
      callback();
    } else {
      app.explanation = new EvoRoom.Model.Explanation();
      app.explanation.set('username',app.user.get('username'));
      // more sets
      app.explanation.set('published',false);
      app.explanation.wake(Sail.app.config.wakeful.url);
      // app.explanation.on('change', ???);
      app.explanation.save(null, {success:callback});
    }
  };


  /************** UI related functions **************/

  app.updatePhaseHTML = function() {
    console.log('Updating phase model related UI elements...');

    var phase = app.phase.get('phase_number');
    phase = parseInt(phase, 10);
    jQuery('#phase-number-container').text(phase);

    if (app.users.allObservationsCompleted(app.phase.get('phase_number')) && (app.phase.get('phase_number') === 2)) {
      app.markCompleted(2);
    } else if (app.users.allObservationsCompleted(app.phase.get('phase_number')) && (app.phase.get('phase_number') === 4)) {
      app.markCompleted(4);
    }    

    if (phase === 0) { // orientation

    } else if (phase === 1) { // rotation 1
      jQuery('#participant-instructions .small-button').show();
      jQuery('#guide-instructions-2 .small-button').show();
    
    } else if (phase === 2) { // meetup 1
      app.user.setPhaseData('role','');
      app.user.setPhaseData('assigned_organisms',[]);

      app.hidePageElements();
      app.user.set('user_phase',"meetup_1");
      app.user.save().done(function() {
        jQuery('#rotation-complete').show();                 // FOR EXTRA TEACHER OVERRIDE (GUIDE ISSUES?) - also 4
        jQuery('#rotation-complete .small-button').show();
      });

      // rehide the part/guide Next buttons for agent
      jQuery('#participant-instructions .small-button').hide();
      jQuery('#guide-instructions-2 .small-button').hide();      

    } else if (phase === 3) { // rotation 2
      app.user.on('change:phase_data',function() {
        if (app.user.get('phase_data').assigned_organisms.length > 0) {
          app.user.set('user_phase','rotation_2');
          jQuery('#participant-instructions .small-button').show();
          jQuery('#guide-instructions-2 .small-button').show();
        }
      });
      app.user.save().done(function() {
        // jQuery('#rotation-instructions').show();
        // reenable question buttons
        // jQuery('.question-button').prop('disabled', false);
        app.group.set('notes_completed', [], {silent: true});
        app.group.save(null, {silent: true});
        jQuery('#rotation-complete .small-button').hide();
      });

    } else if (phase === 4) { // meetup 2
      app.hidePageElements();
      app.user.set('user_phase',"meetup_2");
      app.user.save().done(function() {
        jQuery('#rotation-complete').show();
        jQuery('#rotation-complete .small-button').show();        
      });

    } else if (phase === 5) { // explanation
      app.user.set('user_phase',"explanation");
      app.user.save().done(function() {
        jQuery('#explanation-instructions').show();
        jQuery('#explanation-instructions .small-button').show();
      });

      // explanation stuff goes here
      // if time changed re-enable next button
      if (app.explanationTime && app.explanationTime !== app.phase.get('time')) {
        // disable next button and wait for time advance
        jQuery('#explanation-organism-assigned button').prop('disabled', false);
      }
      
    } else {
      console.error('Unknown phase - this is probably really bad!');
    }
  };

  app.updateGroupHTML = function() {
    console.log('Updating group model related UI elements...');

    jQuery('.team-members-container').html('');
    _.each(app.group.get('all_members'), function(m) {
      console.log('member',m.display_name);
      var memberDiv = jQuery('<div />');
      // assign the needed classes
      memberDiv.addClass('indented-text');
      // insert the username to be displayed
      memberDiv.text(m.display_name);
      // add the div to the members container
      jQuery('.team-members-container').append(memberDiv);      
    });

    // MOVING TO ROTATION 2 OR EXPLANATION
    // var notesStarted = app.group.get('notes_started');
    // if (notesStarted.length < 3) {
    //   _.each(Sail.app.group.get('notes_started'), function(n) {
    //     jQuery('.q'+n+'-button').prop('disabled', true);
    //   });
    // }

    var userPhase = null;
    if (app.user) {
      userPhase = app.user.get('user_phase');      
    }
    if (userPhase && (userPhase === "meetup_1" || userPhase === "meetup_2")) {
      // if all of the groups notes are completed, move on to the next phase
      if (app.group.get('notes_completed').length  >= 3) {
        app.updateUserHTML();   // this will move tablet screens
        // jQuery('.question-button').prop('disabled', true);
      // else not all notes are completed, go back to the 'choose question' screen
      } else if (app.group.get('notes_completed').length < 3) {
        jQuery('#meetup-instructions').show();
      }      
    }

  };

  app.updateUserHTML = function() {
    console.log('Updating user model related UI elements...');

    jQuery('#team-name-container').text(app.user.get('group_name'));

    var userPhase = app.user.get('user_phase');
    if (userPhase === "orientation" || userPhase === "rotation_1" || userPhase === "meetup_1") {
      jQuery('.time-periods-text').text("200, 150, 100, and 50 mya");
      jQuery('.time-choice-1').text("200 mya");
      jQuery('.time-choice-2').text("150 mya");
      jQuery('.time-choice-3').text("100 mya");
      jQuery('.time-choice-4').text("50 mya");
      jQuery('.time-period-image-1').removeAttr('id');
      jQuery('.time-period-image-2').removeAttr('id');
      if (app.group && app.group.get('meetup_location_1') === "200 mya") {
        jQuery('.large-year-text').text("200 mya and 150 mya");
        jQuery('.time-period-image-1').attr('src','assets/information_lookup_images/200mya/200mya_640x320.png');
        jQuery('.time-period-image-1').attr('id','200mya');
        jQuery('.time-period-image-2').attr('src','assets/information_lookup_images/150mya/150mya_640x320.png');
        jQuery('.time-period-image-2').attr('id','150mya');
      } else if (app.group && app.group.get('meetup_location_1') === "150 mya") {
        jQuery('.large-year-text').text("150 mya and 100 mya");
        jQuery('.time-period-image-1').attr('src','assets/information_lookup_images/150mya/150mya_640x320.png');
        jQuery('.time-period-image-1').attr('id','150mya');
        jQuery('.time-period-image-2').attr('src','assets/information_lookup_images/100mya/100mya_640x320.png');
        jQuery('.time-period-image-2').attr('id','100mya');
      } else if (app.group && app.group.get('meetup_location_1') === "100 mya") {
        jQuery('.large-year-text').text("100 mya and 50 mya");
        jQuery('.time-period-image-1').attr('src','assets/information_lookup_images/100mya/100mya_640x320.png');
        jQuery('.time-period-image-1').attr('id','100mya');
        jQuery('.time-period-image-2').attr('src','assets/information_lookup_images/50mya/50mya_640x320.png');
        jQuery('.time-period-image-2').attr('id','50mya');
      } else {
        console.error('Unknown meetup_location_1');
      }
    } else if (userPhase === "rotation_2" || userPhase === "meetup_2") {
      jQuery('.time-periods-text').text("25, 10, 5, and 2 mya");
      jQuery('.time-choice-1').text("25 mya");
      jQuery('.time-choice-2').text("10 mya");
      jQuery('.time-choice-3').text("5 mya");
      jQuery('.time-choice-4').text("2 mya");
      jQuery('.time-period-image-1').removeAttr('id');
      jQuery('.time-period-image-2').removeAttr('id');
      if (app.group.get('meetup_location_2') === "25 mya") {      
        jQuery('.large-year-text').text("25 mya and 10 mya");
        jQuery('.time-period-image-1').attr('src','assets/information_lookup_images/25mya/25mya_640x320.png');
        jQuery('.time-period-image-1').attr('id','25mya');
        jQuery('.time-period-image-2').attr('src','assets/information_lookup_images/10mya/10mya_640x320.png');
        jQuery('.time-period-image-2').attr('id','10mya');
      } else if (app.group.get('meetup_location_2') === "10 mya") {
        jQuery('.large-year-text').text("10 mya and 5 mya");
        jQuery('.time-period-image-1').attr('src','assets/information_lookup_images/10mya/10mya_640x320.png');
        jQuery('.time-period-image-1').attr('id','10mya');
        jQuery('.time-period-image-2').attr('src','assets/information_lookup_images/5mya/5mya_640x320.png');
        jQuery('.time-period-image-2').attr('id','5mya');
      } else if (app.group.get('meetup_location_2') === "5 mya") {
        jQuery('.large-year-text').text("5 mya and 2 mya");
        jQuery('.time-period-image-1').attr('src','assets/information_lookup_images/5mya/5mya_640x320.png');
        jQuery('.time-period-image-1').attr('id','5mya');
        jQuery('.time-period-image-2').attr('src','assets/information_lookup_images/2mya/2mya_640x320.png');
        jQuery('.time-period-image-2').attr('id','2mya');
      } else {
        console.error('Unknown meetup_location_2');
      }      
    }

    // user_phase is complete, but not general phase
    if (userPhase === "meetup_1" && app.group.get('notes_completed').length > 2) {
      jQuery('.time-periods-text').text("25, 10, 5, and 2 mya");
      jQuery('.time-choice-1').text("25 mya");
      jQuery('.time-choice-2').text("10 mya");
      jQuery('.time-choice-3').text("5 mya");
      jQuery('.time-choice-4').text("2 mya");

      app.user.set('user_phase','rotation_2');

      app.hidePageElements();
      jQuery('#rotation-instructions').show();
    }
    else if (userPhase === "meetup_2" && app.group.get('notes_completed').length > 2) {
      app.markCompleted(4);
      app.user.set('user_phase','explanation');

      app.hidePageElements();
      jQuery('#explanation-instructions').show();
    }


    // ROTATIONS    
    jQuery('.time').text(app.user.get('phase_data').time);
    if (app.user.get('current_organism')) {
      jQuery('.assigned-organism-text').text(app.convertToHumanReadable(app.user.get('current_organism')));
      jQuery('#assigned-organism-container .organism-image').attr('src', '/assets/images/' + app.user.get('current_organism') + '_icon.png');
    }

    // do a set of guide checks
    //jQuery('#rotation-complete').show(); is result

    // MEETUPS
    if (app.note && app.note.get('question')) {
      jQuery('#note-response .note-entry').val(""); 
      jQuery('#question-text').html('');
      var qHTML = jQuery('<span />');
      if (app.note.get('question') === "Question 1") {
        qHTML.html("<b>1. </b>What are the major differences between the two time periods?");
        jQuery('#question-text').append(qHTML);
      } else if (app.note.get('question') === "Question 2") {
        qHTML.html("<div><b>2. </b>What species appeared in this time period that wasn't there before?</div><div style='color:#A6AAAD'>Consider climate, habitat, animals, plants.</div>");
        jQuery('#question-text').append(qHTML);
      } else if (app.note.get('question') === "Question 3") {
        qHTML.html("<b>3. </b>What evolutionary processes might have occurred during this time period? How were these processes related to the climate, habitats or other species at the time?");
        jQuery('#question-text').append(qHTML);
      } else {
        console.error('Unknown question type!');
      }
    }
    
  };

  app.hidePageElements = function() {
    console.log('Hiding page elements...');
    jQuery('#loading-page').hide();
    jQuery('#team-meeting').hide();
    jQuery('#log-in-success').hide();
    jQuery('#team-assignment').hide();
    jQuery('#rotation-instructions').hide();
    jQuery('#participant-instructions').hide();
    jQuery('#guide-instructions-1').hide();
    jQuery('#guide-instructions-2').hide();
    jQuery('#organism-presence').hide();
    jQuery('#organism-presence .small-button').hide();
    jQuery('#ancestor-choice').hide();
    jQuery('#ancestor-description').hide();
    jQuery('#guide-choice').hide();
    jQuery('#rotation-complete').hide();
    jQuery('#meetup-instructions').hide();
    jQuery('#note-response').hide();
    jQuery('#information-lookup-overview').hide();
    jQuery('#information-lookup-year').hide();
    jQuery('#information-lookup-container').hide();    
    jQuery('#explanation-instructions').hide();
    jQuery('#explanation-organism-assigned').hide();
    jQuery('#explanation-response').hide();
  };

  app.clearPageElements = function() {
    jQuery(':radio:checked').attr('checked', false);
    jQuery('.ui-state-active').removeClass('ui-state-active');
  };

  app.bindEventsToPageElements = function() {
    console.log('Binding page elements...');

    // required for the organism-presence buttons
    jQuery(".jquery-radios").buttonset();

    jQuery('#log-in-success .small-button').click(function() {
      app.hidePageElements();
      jQuery('#team-assignment').show();
    });

    jQuery('#team-assignment .small-button').click(function() {
      app.hidePageElements();
      jQuery('#rotation-instructions').show();
    });

    jQuery('#rotation-instructions .guide-button').click(function() {
      var ok = confirm("Do you want to choose to be a guide?");
      if (ok) {
        app.user.setPhaseData('role', 'guide');
        app.hidePageElements();
        jQuery('#guide-instructions-1').show();
      }
    });
    jQuery('#rotation-instructions .participant-button').click(function() {
      var ok = confirm("Do you want to choose to be a participant?");
      if (ok) {
        app.user.setPhaseData('role', 'participant');
        app.user.setPhaseData('time','');
        app.user.setPhaseData('assigned_times',[]); 
        app.user.save().done(function() {
          // resync
          if (app.phase.get('phase_number') === 0) {
            app.markCompleted(0);
          } else if (app.phase.get('phase_number') === 2) {
            app.markCompleted(2);
          } else {
            console.error('Out of sync (617)');
          }
          // // mark previous phase as completed
          // if (userPhase === "meetup_1") {
          //   app.markCompleted(2);
          // }
          app.hidePageElements();
          jQuery('#participant-instructions').show();          
        });
      }
    });

    jQuery('#participant-instructions .small-button').click(function() {
      // resync
      if (app.phase.get('phase_number') === 1) {
        app.user.set('user_phase','rotation_1');
        app.updateUserHTML();
        app.user.save();
      } else if (app.phase.get('phase_number') === 3) {
        app.user.set('user_phase','rotation_2');
        app.updateUserHTML();
        app.user.save();
      } else {
        console.error('Out of sync (633)');
      }
      app.hidePageElements();
      jQuery('#assigned-organism-container').show();
      app.rotationStepForward();
    });

    jQuery('#guide-instructions-1 .time-choice-button').click(function(ev) {
      var time = jQuery(ev.target).text();
      app.user.setPhaseData('time', time);
      app.user.save().done(function() {
        if (app.phase.get('phase_number') === 0) {
          app.markCompleted(0);
          app.markCompleted(1);
        } else if (app.phase.get('phase_number') === 2) {
          app.markCompleted(2);
          app.markCompleted(3);
        } else {
          console.error('Out of sync (599)');
          app.hidePageElements();
          jQuery('#guide-instructions-2').show();          
        }
      });
    });    
    jQuery('#guide-instructions-1 .small-button').click(function() {
      // back button
      app.hidePageElements();
      jQuery('#rotation-instructions').show();
    });

    jQuery('#guide-instructions-2 .small-button').click(function() {
      if (app.phase.get('phase_number') === 1) {
        app.user.set('user_phase','rotation_1');
        app.updateUserHTML();
        app.user.save();
      } else if (app.phase.get('phase_number') === 3) {
        app.user.set('user_phase','rotation_2');
        app.updateUserHTML();
        app.user.save();
      } else {
        console.error('Out of sync (648)');
      }
      app.setupGuideTable();
      app.clearPageElements();
      jQuery('#guide-choice').show();
    });
    

    ////////////////////////// ROTATIONS ////////////////////////////
    // PARTICIPANT //
    jQuery('#organism-presence .presence-choice-button').click(function() {       
      jQuery('#organism-presence .small-button').show();
    });
    jQuery('#organism-presence .small-button').click(function() {
      if (jQuery(':radio:checked').data('choice') === "yes") {
        app.observation.set('observed_organism',app.user.get('current_organism'));
        app.observation.save();
        app.rotationStepForward();

      } else if (jQuery(':radio:checked').data('choice') === "no") {
        app.setupAncestorTable(app.user.get('current_organism'));
        app.clearPageElements();
        app.hidePageElements();
        jQuery('#ancestor-choice').show();
      } else {
        alert('Please select Yes or No before proceeding. This should never occur.');
      }
    });

    jQuery('#ancestor-choice .small-button').click(function() {
      if (app.observation.get('observed_organism') !== "not chosen") {
        app.observation.save();
        app.rotationStepForward();
      } else {
        alert("Which of the following is most likely the organism's ancestor or predecessor?\n\nPlease make a selection.");
      }
    });

    // BOTH //
    jQuery('#ancestor-description .small-button').click(function() {
      app.hidePageElements();
      if (app.user.get('phase_data').role === "participant") {
        jQuery('#ancestor-choice').show();
      } else if (app.user.get('phase_data').role === "guide") {
        jQuery('#guide-choice').show();
      } else {
        console.error('Something wrong with the click bindings?');
      }
    });

    jQuery('#rotation-complete .small-button').click(function() {
      if (app.phase.get('phase_number') === 2) {
        app.user.set('user_phase','meetup_1');
        app.user.save();
      } else if (app.phase.get('phase_number') === 4) {
        app.user.set('user_phase','meetup_2');
        app.user.save();
      } else {
        console.error('Out of sync (704)');
      }
      app.hidePageElements();
      jQuery('#meetup-instructions').show();
    });


    ////////////////////////// MEETUPS ////////////////////////////

    jQuery('#meetup-instructions .question-button').click(function(ev) {
      if (jQuery(ev.target).hasClass('info-button')) {
        app.hidePageElements();
        jQuery('#information-lookup-overview').show();
      } else {
        var myNote = null;
        if (jQuery(ev.target).hasClass('q1-button')) {
          // check if there's already an an finished note, then either set it up or create a new one - this needs to get cleaned up to deal with rot2 at least
          if (app.phase.get('phase_number') === 2) {
            myNote = app.notes.find(function(n) { return n.get('username') === app.user.get('username') && n.get('question') === "Question 1" && n.get('published') === false && n.get('phase') === 2; });
          } else if (app.phase.get('phase_number') === 4) {
            myNote = app.notes.find(function(n) { return n.get('username') === app.user.get('username') && n.get('question') === "Question 1" && n.get('published') === false && n.get('phase') === 4; });
          }
          if (myNote) {
            app.note = myNote;
            jQuery('#note-response .note-entry').val(app.note.get('body'));
          } else {
            jQuery('#note-response .note-entry').val("");
            app.createNewNote();
            app.note.set('question','Question 1');
            app.note.set('time',app.group.get('meetup_location_1'));
          }
        } else if (jQuery(ev.target).hasClass('q2-button')) {         
          if (app.phase.get('phase_number') === 2) {
            myNote = app.notes.find(function(n) { return n.get('username') === app.user.get('username') && n.get('question') === "Question 2" && n.get('published') === false && n.get('phase') === 2; });
          } else if (app.phase.get('phase_number') === 4) {
            myNote = app.notes.find(function(n) { return n.get('username') === app.user.get('username') && n.get('question') === "Question 2" && n.get('published') === false && n.get('phase') === 4; });
          }
          if (myNote) {
            app.note = myNote;
            jQuery('#note-response .note-entry').val(app.note.get('body'));
          } else {
            jQuery('#note-response .note-entry').val("");
            app.createNewNote();
            app.note.set('question','Question 2');
            app.note.set('time',app.group.get('meetup_location_1'));
          }
        } else if (jQuery(ev.target).hasClass('q3-button')) {         
          if (app.phase.get('phase_number') === 2) {
            myNote = app.notes.find(function(n) { return n.get('username') === app.user.get('username') && n.get('question') === "Question 3" && n.get('published') === false && n.get('phase') === 2; });
          } else if (app.phase.get('phase_number') === 4) {
            myNote = app.notes.find(function(n) { return n.get('username') === app.user.get('username') && n.get('question') === "Question 3" && n.get('published') === false && n.get('phase') === 4; });
          }
          if (myNote) {
            app.note = myNote;
            jQuery('#note-response .note-entry').val(app.note.get('body'));
          } else {
            jQuery('#note-response .note-entry').val("");
            app.createNewNote();
            app.note.set('question','Question 3');
            app.note.set('time',app.group.get('meetup_location_1'));
          }
        }
        app.note.save();

        jQuery('#note-response .note-entry').keyup(function(ev) {
          app.autoSave(app.note, "body", jQuery('#note-response .note-entry').val(), false);
        });
        app.hidePageElements();
        jQuery('#note-response').show();
      }
    });

    jQuery('#note-response .back-button').click(function() {
      app.hidePageElements();
      jQuery('#meetup-instructions').show();
    });
    jQuery('#note-response .done-button').click(function() {
      app.note.set('body',jQuery('#note-response .note-entry').val());
      app.note.set('published',true);
      app.hidePageElements();
      app.note.save().done(function() {
        var notesCompleted = app.group.get('notes_completed');
        var currentQuestion = app.note.get('question');
        if (currentQuestion === "Question 1") {
          notesCompleted[0] = 1;
          app.group.set('notes_completed',notesCompleted);
        } else if (currentQuestion === "Question 2") {
          notesCompleted[1] = 2;
          app.group.set('notes_completed',notesCompleted);
        } else if (currentQuestion === "Question 3") {
          notesCompleted[2] = 3;
          app.group.set('notes_completed',notesCompleted);
        }
        app.group.save();
        // else gets handled by updateGroupHTML
      });
      jQuery('#meetup-instructions').show();
    });

    jQuery('#information-lookup-overview .small-button').click(function() {
      app.hidePageElements();
      jQuery('#meetup-instructions').show();
    });
    jQuery('#information-lookup-overview .time-period-image').click(function(ev) {
      app.hidePageElements();

      jQuery('#information-lookup-year').show();
      jQuery('#information-lookup-container').show();

      var time = ev.target.id;              // TODO check me!
      app.showTimePeriodLandscape(time);
    });

    jQuery('#information-lookup-year .small-button').click(function() {
      app.hidePageElements();
      jQuery('#information-lookup-overview').show();
    });


    ////////////////////////// EXPLANATION ////////////////////////////
    // fake entrance
    // jQuery('#fake-explanation').click( function() {
    //   app.hidePageElements();
    //   jQuery('#explanation-instructions').show();
    // });

    jQuery('#explanation-instructions button').click( function() {
      app.hidePageElements();
      app.user.set('user_phase','explanation');
      app.user.save();
      // we need to write the organism name into the HTML and make sure the picture is available
      var img = jQuery('#assigned-organism-container .organism-image'); // retrieve image container
      img.attr('src', '/assets/images/' + app.explanationOrganism + '_icon.png'); // change src to point at image associated with users explanation organism
      jQuery('#assigned-organism-container').show(); // show assigned organism image

      var readableOrganism = app.convertToHumanReadable(app.explanationOrganism);
      jQuery('#explanation-organism-assigned .assigned-organism-text').text(readableOrganism);
      jQuery('#explanation-response .assigned-organism-text').text(readableOrganism);
      
      jQuery('#explanation-organism-assigned').show();
    });

    jQuery('#explanation-organism-assigned button').click(function() {
      app.hidePageElements();
      // create new Explanation or use unpublished one
      // explanation
      app.createNewExplanation(function () {
        // some setup depending on time?
        app.explanationTime = app.phase.get('time');
        if (app.explanationTime) {
          jQuery('#explanation-response .time-periods-text').text(app.explanationTime);
        } else {
          console.warn("Time in phase is null but should be a string");
        }

        // restore data from unfinished explanation
        if (app.explanation.get('published')) {
          app.clearExplanationResponse();
        } else {
          app.restoreUnfinishedExplanation();
        }
        
        jQuery('#explanation-response').show();
      });
    });

    jQuery('#explanation-response .small-button').click(function() {
      if (!app.explanation.get('cladogram_picture') && !app.explanation.get('rainforest_picture') && !app.explanation.get('additional_picture')) {
        // alert('Please include at least one source photo.');
        jQuery().toastmessage('showErrorToast', "Please include at least one source photo.");
      } else if (jQuery('.explanation-entry').val() === "") {
        jQuery().toastmessage('showErrorToast', "Please explain your thinking. Point form notes are sufficient");
        // alert('Please explain your thinking. Point form notes are sufficient');
      } else {
        app.saveExplanationResponse(true);
        app.clearExplanationResponse();
        app.hidePageElements();
        jQuery('#explanation-organism-assigned').show();        
      }
    });

    jQuery('#explanation-response .cladogram-picture').click(function() {
      app.cladogram_picture.click();
    });

    jQuery('#explanation-response .rainforest-picture').click(function() {
      app.rainforest_picture.click();
    });

    jQuery('#explanation-response .additional-picture').click(function() {
      app.additional_picture.click();
    });
  };


  /************** Helper functions **************/

  app.showTimePeriodLandscape = function(time) {
    jQuery('.organism-image-container').html('');
    jQuery('#lookup-text').text("None selected.");

    // grab the orgs and org descriptions for Information Lookup guy
    jQuery.get('assets/static_data/information_lookup.json', function(data) {
      _.each(data[time], function (text, org) {
        var cont = jQuery('<div class="organism-image-container">');
        cont.attr('id',"organism-"+org);
        var srcOff = 'assets/information_lookup_images/' + time + '/' + org + '_white.png';
        var srcOn = 'assets/information_lookup_images/' + time + '/' + org + '_blue.png';
        cont.append('<img class="image-button image-button-off" src="'+srcOff+'" />');
        cont.append('<img class="image-button image-button-on" src="'+srcOn+'" style="display:none"/>');
        
        cont.click(function(ev) {
          jQuery('#lookup-text').text("None selected.");
          jQuery('.image-button-off').show();
          jQuery('.image-button-on').not(cont.find('.image-button-on')).hide();
          if (cont.find('.image-button-on').is(':visible')) {
            cont.find('.image-button-on').hide();
            cont.find('.image-button-off').show();
          } else {
            cont.find('.image-button-off').hide();
            cont.find('.image-button-on').show();
            // jQuery('#lookup-text').text("");
            jQuery('#lookup-text').text(text);
          }
        });

        jQuery('#clickable-organism-container').append(cont);
      });
      jQuery('#clickable-organism-container').append('<div id="lookup-text" class="highlighted-text"></div>');
    });
    
  };

  app.rotationStepForward = function() {
    app.clearPageElements();
    app.hidePageElements();
    var times = [];
    var orgs = [];
    // if there are still times to do for this org, change time and remove that time from the array
    if (app.user.get('phase_data').assigned_times && app.user.get('phase_data').assigned_times.length > 0) {
      app.user.setPhaseData('time',app.user.get('phase_data').assigned_times[0]);
      times = app.user.get('phase_data').assigned_times;
      times.shift();
      app.user.setPhaseData('assigned_times',times);
      app.user.save();
      
      app.createNewObservation();
      jQuery('#organism-presence').show();      
    }
    else {
      if (app.user.get('phase_data').assigned_organisms && app.user.get('phase_data').assigned_organisms.length > 0) {
        if (app.user.get('direction') === "forward") {
          app.user.setPhaseData('assigned_times', ["200 mya", "150 mya", "100 mya", "50 mya"]);
        } else {
          app.user.setPhaseData('assigned_times', ["50 mya", "100 mya", "150 mya", "200 mya"]);
        }
        // set current org and time
        app.user.setPhaseData('time',app.user.get('phase_data').assigned_times[0]);
        app.user.set('current_organism',app.user.get('phase_data').assigned_organisms[0]);

        // remove an org and a time
        times = app.user.get('phase_data').assigned_times;
        orgs = app.user.get('phase_data').assigned_organisms;
        times.shift();
        orgs.shift();
        app.user.setPhaseData('assigned_times',times);
        app.user.setPhaseData('assigned_organisms',orgs);
        app.user.save();

        app.createNewObservation();
        jQuery('#organism-presence').show();        
      } else {
        console.log('Rotation complete!');

        if (app.phase.get('phase_number') === 1) {
          app.markCompleted(1);
        } else if (app.phase.get('phase_number') === 3) {
          app.markCompleted(3);
        } else {
          console.error('Out of sync (918)');
        }
        jQuery('#assigned-organism-container').hide();


        app.hidePageElements();
        jQuery('#rotation-complete').show();
      }
    }
  };


  app.setupAncestorTable = function(organism) {
    var k = 0;
    var tr;
    var table;
    var time = app.user.get('phase_data').time;

    var dropdownTd = jQuery('<td class="organism-boxes"><div><b>Selection</b></div></td>');          // TODO check the dropdown on the tablet
    var dropdown = '<select class="organism-selector-dropdown"><option value="not chosen">...</option>';    

    jQuery('.ancestor-information-table').html('');
    table = jQuery('.ancestor-information-table');

    _.each(app.ancestors[organism][time], function(org) {
      k++;
      var img = jQuery('<img />');
      img.data('organism', org);
      img.attr('src', '/assets/images/' + org + '_icon.png');
      img.addClass('organism'+k);
      img.addClass('organism-image');
      var td = jQuery('<td />');
      td.addClass('organism-boxes');

      img.click(function() {
        var chosenAncestor = jQuery(this).data('organism');

        if (chosenAncestor !== "none"){
          jQuery('.ancestor-organism-image').attr('src', '/assets/images/' + chosenAncestor + '_icon.png');     // AWK          
          jQuery('.ancestor-organism-text').text(app.convertToHumanReadable(chosenAncestor));
          jQuery.get('assets/ancestor_descriptions/' + chosenAncestor + '.html', function(data) {
            jQuery('.ancestor-description-body').html(data);
            jQuery('.ancestor-description-body').children(":first").css('display', 'inline');     //compensating for an early mistake in how the fetched html is formatted

            app.hidePageElements();
            jQuery('#ancestor-description').show();
          });
        }

      });

      td.append(img);
      td.append('<div>' + app.convertToHumanReadable(org) + '</div>');

      // add the org to the dropdown list
      dropdown = dropdown + '<option value="' + org + '">' + app.convertToHumanReadable(org) + '</option>';

      // checking if the tr should be closed (if row is full)
      if (k%2 !== 0) {
        tr = jQuery('<tr />');
      }
      tr.append(td);
      if (k%2 === 0) {
        table.append(tr);
      }
    });

    // finish the table
    dropdown += '<option value="';
    dropdown += app.user.get('current_organism');
    dropdown += '">I changed my mind, my assigned organism is actually present</option></select>';
    dropdown = jQuery(dropdown);
    dropdownTd.append(dropdown);
    tr.append(dropdownTd);
    if (k%2 !== 0) {
      table.append(tr);
    }
    // adding the event listener here since the element doesn't exist when we define our other handlers
    jQuery('.organism-selector-dropdown').change(function() {
      app.observation.set('observed_organism',jQuery('.organism-selector-dropdown').val());
    });
  };

  app.setupGuideTable = function() {
    var k = 0;
    var tr;
    var table;
    var time = app.user.get('phase_data').time;   

    jQuery('.guide-information-table').html('');
    table = jQuery('.guide-information-table');

    _.each(app.guideOrganisms[time], function(org) {
      k++;
      var img = jQuery('<img />');
      img.data('organism', org);
      img.attr('src', '/assets/images/' + org + '_icon.png');
      img.addClass('organism'+k);
      img.addClass('organism-image');
      var td = jQuery('<td />');
      td.addClass('organism-boxes');

      img.click(function() {
        var chosenAncestor = jQuery(this).data('organism');
        jQuery('.ancestor-organism-image').attr('src', '/assets/images/' + chosenAncestor + '_icon.png');        
        jQuery('.ancestor-organism-text').text(app.convertToHumanReadable(chosenAncestor));
        jQuery.get('assets/ancestor_descriptions/' + chosenAncestor + '_guide.html', function(data) {
          jQuery('.ancestor-description-body').html(data);
          jQuery('.ancestor-description-body').children(":first").css('display', 'inline');     //compensating for an early mistake in how the fetched html is formatted
          app.hidePageElements();
          jQuery('#ancestor-description').show();
        });

      });

      td.append(img);
      td.append('<div>' + app.convertToHumanReadable(org) + '</div>');
      // checking if the tr should be closed (if row is full)
      if (k%2 !== 0) {
        tr = jQuery('<tr />');
      }
      tr.append(td);
      if (k%2 === 0) {
        table.append(tr);
      }
    });

    if (k%2 !== 0) {
      table.append(tr);
    }
  };

  app.autoSave = function(model, inputKey, inputValue, instantSave) {
    app.keyCount++;
    console.log("saving stuff as we go at", app.keyCount);

    if (instantSave || app.keyCount > 9) {
      model.set(inputKey, inputValue, {silent: true});
      model.save(null, {silent: true});
      app.keyCount = 0;
    }
  }; 

  app.convertToHumanReadable = function(str) {
    str = str[0].toUpperCase() + str.slice(1);
    str = str.replace(/_/g, " ");
    return str;
  };

  app.markCompleted = function(phase) {
    var cArr = app.user.get('phases_completed');
    cArr.push(phase);
    app.user.set('phases_completed',cArr);
    app.user.save();
  };

  // ======= EXPLANATION STUFF ==========

  app.clearExplanationResponse = function () {
    jQuery('.explanation-response-list input:checkbox').removeAttr('checked');
    jQuery('.explanation-entry').val('');
    var file = jQuery('#pikachu-file');
    file.val('');
  };

  app.saveExplanationResponse = function (published) {
    // disable next button and wait for time advance
    jQuery('#explanation-organism-assigned button').prop('disabled', true);

    var evolutionary_forces = jQuery('.explanation-response-list input:checked').map(function(){return this.value;}).get();
    app.explanation.set('evolutionary_forces', evolutionary_forces);

    var justification = jQuery('.explanation-entry').val();
    app.explanation.set('justification', justification);

    var time_period = jQuery('#explanation-response .time-periods-text').text();
    app.explanation.set('time_period', time_period);

    app.explanation.set('assigned_organism', app.explanationOrganism);

    if (published) {
      app.explanation.set('published', true);
    } else {
      app.explanation.set('published', false);
    }
    app.explanation.save();
    
  };

  app.restoreUnfinishedExplanation = function (published) {
    var evolutionary_forces = app.explanation.get('evolutionary_forces');
    _.each(evolutionary_forces, function(evo) {
      var checkbox = jQuery('#'+evo);
      checkbox.attr('checked','checked');
    });

    var justification = app.explanation.get('justification');
    jQuery('.explanation-entry').val(justification);

    var time_period = app.explanation.get('time_period');
    jQuery('#explanation-response .time-periods-text').text(time_period);
  };

  app.initPikachu = function() {
    app.cladogram_picture = jQuery('#cladogram-picture');
    app.rainforest_picture = jQuery('#rainforest-picture');
    app.additional_picture = jQuery('#additional-picture');
    // var uploadInput = jQuery('#upload');

    app.cladogram_picture.on('change', function () { 
      app.handlePictureChangeEvent(app.cladogram_picture, 'cladogram_picture');
    });

    app.rainforest_picture.on('change', function () { 
      app.handlePictureChangeEvent(app.rainforest_picture, 'rainforest_picture');
    });

    app.additional_picture.on('change', function () { 
      app.handlePictureChangeEvent(app.additional_picture, 'additional_picture');
    });

    // uploadInput.on('click', function () {
    //   upload();
    // });
  };

  app.handlePictureChangeEvent = function(input_file, explanation_key) {
    if (input_file.val()) {
      //uploadInput.removeAttr('disabled');
      // jQuery('#explanation-response').attr('disabled', 'disabled'); // disable the UI during upload
      jQuery().toastmessage('showSuccessToast', "Uploading picture...");
      console.log("Uploading picture...");

      app.uploadToPikachu(input_file, function (pikachuFile) {
        var pikachuUrl = app.config.pikachu.url + "/" + pikachuFile;
        var fileObj = {file: pikachuFile, url:pikachuUrl};
        app.explanation.set(explanation_key, fileObj);

        app.saveExplanationResponse(false);

        // show toast that upload was successfull
        jQuery().toastmessage('showSuccessToast', "Uploaded file "+pikachuFile+" successfully to Pikachu");
        console.log("Uploaded file "+pikachuFile+" successfully to Pikachu");
      });
    }
  };

  app.uploadToPikachu = function(fileInput, successCallback) {
    var file = fileInput[0].files.item(0);

    var formData = new FormData();
    formData.append('file', file);

    jQuery.ajax({
        url: app.config.pikachu.url + '/',
        type: 'POST',
        success: success,
        error: failure,
        data: formData,
        cache: false,
        contentType: false,
        processData: false
    });

    function failure(err) {
      console.error("UPLOAD TO PIKACHU FAILED!", err);
    }

    function success(data, status, xhr) {
      console.log("Upload to Pikachu SUCCEEDED!");
      console.log(xhr.getAllResponseHeaders());

      var pikachuFile = data.url;

      successCallback(pikachuFile);
      // var pikachu = {'pikachuPath':pikachuPath};
      // app.user.setPhaseData('explanation', pikachu);
      // app.user.save();
      
      // jQuery('#explanation-response').removeAttr('disabled'); // enable the UI
    }
  };

};

EvoRoom.Mobile.prototype = new Sail.App();
