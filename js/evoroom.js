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
  app.rollcallMetadata = null; // switch me to local?
  app.rotationNumber = 1;
  app.keyCount = 0;

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
    
    // user state 1    TODO
    jQuery('#log-in-success').show();
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
          app.trigger('ready');
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
          // return user to last screen according to user object and enable transitions according to phase object
          app.restoreState();
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
      app.groups = new EvoRoom.Model.Groups();
      app.groups.wake(Sail.app.config.wakeful.url);   // do we actually need this?

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
          app.group.set('meetup_1_notes_completed',0);
        }
        var saveSuccess = function(model, response) {
          app.group.wake(Sail.app.config.wakeful.url);
          app.group.on('change', app.updateGroupHTML);
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
      app.users = new EvoRoom.Model.Users();    // create a users collction object
      app.users.wake(Sail.app.config.wakeful.url);

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
          app.user.set('user_phase', 'orientation');
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
      app.notes = new EvoRoom.Model.Notes();
      app.notes.wake(Sail.app.config.wakeful.url);

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
      app.explanations = new EvoRoom.Model.Explanations();
      app.explanations.wake(Sail.app.config.wakeful.url);

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
      app.phases = new EvoRoom.Model.Phases();
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
      app.observations = new EvoRoom.Model.Observations();
      app.observations.wake(Sail.app.config.wakeful.url);

      var fetchObservationsSuccess = function(collection, response) {
        console.log("Retrieved observations collection...");
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
    app.observation.set('time',app.user.get('phase_data').time);
    // app.observation.set('group_name', app.rollcallTHISAINTRIGHTObservationName);
    app.observation.wake(Sail.app.config.wakeful.url);
    app.observation.save();
  };

  app.createNewNote = function() {
    app.note = new EvoRoom.Model.Note();
    app.note.set('username',app.user.get('username'));
    app.note.set('group_name',app.group.get('group_name'));
    app.note.set('body','');
    app.note.set('published',false);
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

    if (phase === 0) {


    } else if (phase === 1) {
      jQuery('#participant-instructions .small-button').show();
      jQuery('#guide-instructions .small-button').show();

      jQuery('.time-periods-text').text("200, 150, 100, and 50 mya");
      jQuery('.time-choice-1').text("200 mya");
      jQuery('.time-choice-2').text("150 mya");
      jQuery('.time-choice-3').text("100 mya");
      jQuery('.time-choice-4').text("50 mya");


    } else if (phase === 2) {
      // might be a very bad idea to put these shows here
      app.hidePageElements();
      jQuery('#rotation-complete').show();
      jQuery('#rotation-complete .small-button').show();

      if (app.group.get('meetup_location_1') === "200 mya") {
        jQuery('.large-year-text').text("200 mya and 150 mya");
      } else if (app.group.get('meetup_location_1') === "150 mya") {
        jQuery('.large-year-text').text("150 mya and 100 mya");
      } else if (app.group.get('meetup_location_1') === "100 mya") {
        jQuery('.large-year-text').text("100 mya and 50 mya");
      } else {
        console.error('Unknown meetup_location_1');
      }


    } else if (phase === 3) {
      app.group.set('notes_completed_meetup_1', 0, {silent: true});
      app.group.save(null, {silent: true});

      jQuery('.time-periods-text').text("25, 10, 5, and 2 mya");
      jQuery('.time-choice-1').text("25 mya");
      jQuery('.time-choice-2').text("10 mya");
      jQuery('.time-choice-3').text("5 mya");
      jQuery('.time-choice-4').text("2 mya");


    } else if (phase === 4) {
      if (app.group.get('meetup_location_2') === "25 mya") {
        jQuery('.large-year-text').text("25 mya and 10 mya");
      } else if (app.group.get('meetup_location_2') === "10 mya") {
        jQuery('.large-year-text').text("10 mya and 5 mya");
      } else if (app.group.get('meetup_location_2') === "5 mya") {
        jQuery('.large-year-text').text("5 mya and 2 mya");
      } else {
        console.error('Unknown meetup_location_2');
      }

    } else if (phase === 5) {
      // explanation stuff goes here
      var explanation_id = app.user.get('phase_data').explanation_id;
      if (explanation_id) {
        // go back to work on explanation
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
    if (app.phase && app.group.get('notes_completed_meetup_1') > 2) {
      app.hidePageElements();
      if (app.phase.get('phase_number') === 2) {
        jQuery('#rotation-instructions').show();
      } else if (app.phase.get('phase_number') === 4) {
        jQuery('#explanation-instructions').show();
      } else {
        console.error('About to be very stuck - check updateGroupHTML');
      }
    }

  };

  app.updateUserHTML = function() {
    console.log('Updating user model related UI elements...');

    jQuery('#team-name-container').text(app.user.get('group_name'));

    // ROTATIONS    
    jQuery('.time').text(app.user.get('phase_data').time);
    if (app.user.get('current_organism')) {
      jQuery('.assigned-organism-text').text(app.convertToHumanReadable(app.user.get('current_organism')));
      jQuery('#assigned-organism-container .organism-image').attr('src', '/assets/images/' + app.user.get('current_organism') + '_icon.png');
    }

    // MEETUPS
    if (app.note && app.note.get('question')) {
      jQuery('#note-response .note-entry').val(""); 
      jQuery('#question-text').html('');
      var qHTML = jQuery('<span />');
      if (app.note.get('question') === "Question 1") {
        qHTML.html("<b>1. </b>What are the major differences between the two time periods?");
        jQuery('#question-text').append(qHTML);
      } else if (app.note.get('question') === "Question 2") {
        qHTML.html("<div><b>2. </b>What species appeared in this time period that wasn't there before?</div><div style='color:#A6AAAD'>Consider climate, habitat, animals, plants.</div>");      // TODO MOAR TEXT
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
      // TODO: add me back in!
      // var ok = confirm("Do you want to choose to be a guide?");
      // if (ok) {
        app.user.setPhaseData('role', 'guide');
        app.user.save();
        app.hidePageElements();
        jQuery('#guide-instructions-1').show();
      // }

    });
    jQuery('#rotation-instructions .participant-button').click(function() {
      // TODO: add me back in!
      // var ok = confirm("Do you want to choose to be a participant?");
      // if (ok) {
        app.user.setPhaseData('role', 'participant');
        app.user.setPhaseData('time','');                 // TODO - remove me so restoreState works
        app.user.setPhaseData('assigned_times',[]);       // TODO - remove me so restoreState works
        app.user.save();
        app.hidePageElements();
        jQuery('#participant-instructions').show();
      // }
    });

    jQuery('#guide-instructions-1 .time-choice-button').click(function(ev) {
      var time = jQuery(ev.target).text();
      app.user.setPhaseData('time', time);
      app.user.save();
      app.hidePageElements();
      jQuery('#guide-instructions-2').show();      
    });    
    jQuery('#guide-instructions-1 .small-button').click(function() {
      app.hidePageElements();
      jQuery('#rotation-instructions').show();
    });

    jQuery('#participant-instructions .small-button').click(function() {
      app.hidePageElements();
      jQuery('#assigned-organism-container').show();
      app.rotationStepForward();
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

    // GUIDE //
    jQuery('#guide-instructions-2 .small-button').click(function() {
      app.setupGuideTable();
      app.clearPageElements();
      jQuery('#guide-choice').show();
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
          myNote = app.notes.find(function(n) { return n.get('username') === app.user.get('username') && n.get('question') === "Question 1" && n.get('published') === false; });
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
          myNote = app.notes.find(function(n) { return n.get('username') === app.user.get('username') && n.get('question') === "Question 2" && n.get('published') === false; });
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
          myNote = app.notes.find(function(n) { return n.get('username') === app.user.get('username') && n.get('question') === "Question 3" && n.get('published') === false; });
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
      app.note.save();
      app.hidePageElements();

      var notesCompleted = app.group.get('notes_completed_meetup_1');
      notesCompleted++;
      app.group.set('notes_completed_meetup_1',notesCompleted);
      app.group.save();
      if (notesCompleted < 3) {
        jQuery('#meetup-instructions').show();
      }
      // else gets handled by updateGroupHTML
    });

    jQuery('#information-lookup-overview .small-button').click(function() {
      app.hidePageElements();
      jQuery('#meetup-instructions').show();
    });
    jQuery('#information-lookup-overview .time-period-image').click(function() {
      app.hidePageElements();
      jQuery('#information-lookup-year').show();
      jQuery('#information-lookup-container').show();

      // START HERE
      var time = '200mya';
      app.showTimePeriodLandscape(time);
    });

    jQuery('#information-lookup-year .small-button').click(function() {
      app.hidePageElements();
      jQuery('#information-lookup-overview').show();
    });


    ////////////////////////// EXPLANATION ////////////////////////////
    // fake entrance
    jQuery('#fake-explanation').click( function() {
      app.hidePageElements();
      jQuery('#explanation-instructions').show();
    });

    jQuery('#explanation-instructions button').click( function() {
      app.hidePageElements();
      // we need to write the organism name into the HTML and make sure the picture is available
      var img = jQuery('#assigned-organism-container .organism-image'); // retrieve image container
      img.attr('src', '/assets/images/' + app.explanationOrganism + '_icon.png'); // change src to point at image associated with users explanation organism
      jQuery('#assigned-organism-container').show(); // show assigned organism image

      var readableOrganism = app.convertToHumanReadable(app.explanationOrganism);
      jQuery('#explanation-organism-assigned .assigned-organism-text').text(readableOrganism);
      jQuery('#explanation-response .assigned-organism-text').text(readableOrganism);
      
      jQuery('#explanation-organism-assigned').show();
    });

    jQuery('#explanation-organism-assigned button').click( function() {
      app.hidePageElements();
      // create new Explanation or use unpublished one
      // explanation
      app.createNewExplanation(function () {
        // some setup depending on time?
        jQuery('#explanation-response').show();
      });
    });

    jQuery('#explanation-response .small-button').click( function() {
      if (!app.explanation.get('pikachu_file')) {
        alert('Please include at least one source photo.');
      } else if (jQuery('.explanation-entry').val() === "") {
        alert('Please explain your thinking. Point form notes are sufficient');
      } else {
        app.saveExplanationResponse();
        app.hidePageElements();
        jQuery('#explanation-organism-assigned').show();        
      }
    });
  };



  /************** Helper functions **************/

  app.showTimePeriodLandscape = function(time) {
    jQuery('<div class="organism-image-container">').html('');
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
            jQuery('#lookup-text').text(text);
          }
        });

        jQuery('#clickable-organism-container').append(cont);
      });
      jQuery('#clickable-organism-container').append('<div id="lookup-text" class="highlighted-text">None selected.</div>');
    });
    
  };

  app.rotationStepForward = function() {
    app.clearPageElements();
    app.hidePageElements();
    // if there are still times to do for this org, change time and remove that time from the array
    if (app.user.get('phase_data').assigned_times && app.user.get('phase_data').assigned_times.length > 0) {
      app.user.setPhaseData('time',app.user.get('phase_data').assigned_times[0]);
      app.user.get('phase_data').assigned_times.shift();
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

        app.user.save();
        // remove an org and a time
        app.user.get('phase_data').assigned_times.shift();
        app.user.get('phase_data').assigned_organisms.shift();

        app.createNewObservation();
        jQuery('#organism-presence').show();        
      } else {
        console.log('Rotation complete!');
        app.user.setPhaseData('complete',true);
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
          // chosenAncestor = 'fig_tree_test';       // TODO: get rid of me when there are real ancestor descriptions to fetch
          
          jQuery('.ancestor-organism-text').text(app.convertToHumanReadable(chosenAncestor));
          jQuery.get('assets/ancestor_descriptions/' + chosenAncestor + '.html', function(data) {
            jQuery('.ancestor-description-body').html(data);
            jQuery('.ancestor-description-body').children(":first").css('display', 'inline');     //compensating for an early mistake in how the fetched html is formatted
            // jQuery('.guide-text').css('color', '#F7F7F7');

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
        // chosenAncestor = 'fig_tree_test';       // TODO: get rid of me when there are real ancestor descriptions to fetch
        
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

  // ======= EXPLANATION STUFF ==========

  app.clearExplanationResponse = function () {

  };

  app.saveExplanationResponse = function () {
    var evolutionary_forces = jQuery('.explanation-response-list input:checked').map(function(){return this.value;}).get();
    app.explanation.set('evolutionary_forces', evolutionary_forces);

    var justification = jQuery('.explanation-entry').val();
    app.explanation.set('justification', justification);

    app.explanation.set('published', true);
    app.explanation.save();
    
  };

  app.initPikachu = function() {
    var pikachuFile = jQuery('#pikachu-file');
    // var uploadInput = jQuery('#upload');

    pikachuFile.on('change', function () { 
      if (pikachuFile.val()) {
        //uploadInput.removeAttr('disabled');
        jQuery('#explanation-response').attr('disabled', 'disabled'); // disable the UI during upload
        app.uploadToPikachu(pikachuFile);
      }
    });

    // uploadInput.on('click', function () {
    //   upload();
    // });
  };

  app.uploadToPikachu = function(fileInput) {
    var file = fileInput[0].files.item(0);

    var formData = new FormData();
    formData.append('file', file);

    jQuery.ajax({
        url: app.config.pikachu.url,
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
      // var pikachu = {'pikachuPath':pikachuPath};
      // app.user.setPhaseData('explanation', pikachu);
      // app.user.save();
      app.explanation.set('pikachu_file', pikachuFile);
      app.explanation.save();

      // show toast that upload was successfull
      jQuery().toastmessage('showSuccessToast', "Uploaded file "+pikachuFile+" successfully to Pikachu");
      jQuery('#explanation-response').removeAttr('disabled'); // enable the UI
    }
  };

};

EvoRoom.Mobile.prototype = new Sail.App();

