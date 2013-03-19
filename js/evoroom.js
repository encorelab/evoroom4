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
    }
  };

  app.rollcall = null;
  app.phases = null;
  app.phase = null;
  app.users = null;
  app.user = null;
  app.groups = null;
  app.group = null;
  app.rollcallGroupName = null;
  app.rollcallGroupMembers = null;
  app.rollcallMetadata = null; // switch me to local?

  app.init = function() {
    jQuery('#evoroom').addClass('hide'); // hide everything except login screen

    Sail.verifyConfig(this.config, this.requiredConfig);
    
    Sail.modules
      // Enable multi-picker login for CommonKnowledge curnit - asking for run (must be linked to curnit)
      .load('Rollcall.Authenticator', {mode: 'picker', askForRun: true, curnit: 'EvoRoom'})
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


  /* Helper functions */

  app.initModels = function() {
    console.log('Initializing models...');

    // PHASES collection
    if (app.phase === null) {
      app.phases = new EvoRoom.Model.Phases();
      // app.phases.wake(Sail.app.config.wakeful.url);
      // app.phases.on('add remove', somefunction (c));
      var fetchPhasesSuccess = function(collection, response) {
        console.log("Retrieved phases collection...");
        if (collection.length === 1) {
          // PHASE model
          app.phase = app.phases.first();
          app.phase.wake(Sail.app.config.wakeful.url);
          app.phase.on('change', app.updatePhaseHTML);
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

    // GROUPS collection
    if (app.group === null) {
      app.groups = new EvoRoom.Model.Users();
      app.groups.wake(Sail.app.config.wakeful.url);   // do we actually need this?

      var fetchGroupsSuccess = function(collection, response) {
        console.log("Retrieved groups collection...");
        // GROUP model
        app.group = app.groups.find(function(group) { return group.get('group_name') === app.rollcallGroupName; });
        if (app.group) {
          app.group.set('all_members', app.rollcallGroupMembers);
          app.group.wake(Sail.app.config.wakeful.url);
          app.group.on('change', app.updateGroupHTML);
          app.updateGroupHTML();
        } else {
          console.log('This user hasnt been assigned a group in Rollcall...');
        }
      };
      var fetchGroupsError = function(collection, response) {
        console.error("No users collection found - and we are dead!!!");
      };
      app.groups.fetch({success: fetchGroupsSuccess, error: fetchGroupsError});
    } else {
      console.log("Group model already exists...");
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

  };

  app.updatePhaseHTML = function() {
    console.log('Updating phase model related UI elements...');

    jQuery('#phase-number-container').text(app.phase.get('phase_number'));
  };

  app.updateGroupHTML = function() {
    console.log('Updating group model related UI elements...');

    // 
    _.each(app.group.get('all_members'), function(m) {
      console.log('member',m.display_name);

      var memberDiv = jQuery('<div />');
      // assign the needed classes
      memberDiv.addClass('indented-text');
      // insert the username to be displayed
      memberDiv.text(m.display_name);
      // add the div to the members container
      jQuery('#team-members-container').append(memberDiv);      
    });
  };

  app.updateUserHTML = function() {
    console.log('Updating user model related UI elements...');

    jQuery('#team-name-container').text(app.user.get('group_name'));
    // TODO change group listing to dynamic based on who's in the room? (replacing stuff in updateGroupHTML)
    jQuery('.time').text(app.user.get('phase_data').time);

    // rotation 1
    if (app.user.get('user_phase') === "orientation") {
      jQuery('.time-periods-text').text("200, 150, 100, and 50 mya");
      jQuery('.time-choice-1').text("200 mya");
      jQuery('.time-choice-2').text("150 mya");
      jQuery('.time-choice-3').text("100 mya");
      jQuery('.time-choice-4').text("50 mya");
    }
    // rotation 2
    else if (app.user.get('user_phase') === "rotation 2") {           // this is likely the wrong phase to key off
      jQuery('.time-periods-text').text("25, 10, 5, and 2 mya");
      jQuery('.time-choice-1').text("25 mya");
      jQuery('.time-choice-2').text("10 mya");
      jQuery('.time-choice-3').text("5 mya");
      jQuery('.time-choice-4').text("2 mya");
    } else {
      console.log("Not in user phase orientation or other...");
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
      app.user.setPhaseData('role', 'guide');
      app.hidePageElements();
      jQuery('#guide-instructions-1').show();
    });
    jQuery('#rotation-instructions .participant-button').click(function() {
      app.user.setPhaseData('role', 'participant');
      app.hidePageElements();
      jQuery('#participant-instructions').show();
    });

    jQuery('#guide-instructions-1 .time-choice-button').click(function(ev) {
      var time = jQuery(ev.target).text();
      app.user.setPhaseData('time', time);
      app.hidePageElements();
      jQuery('#guide-instructions-2').show();      
    });    
    jQuery('#guide-instructions-1 .small-button').click(function() {
      app.hidePageElements();
      jQuery('#rotation-instructions').show();
    });

    jQuery('#participant-instructions .small-button').click(function() {
      app.hidePageElements();
      jQuery('#organism-presence').show();
    });

    jQuery('#organism-presence .presence-choice-button').click(function() {
      // update observations collection
      jQuery('#organism-presence .small-button').show();
    });
    jQuery('#organism-presence .small-button').click(function() {
      app.hidePageElements();
      jQuery('#SOMETHING').show();
    });
    
  };

};

EvoRoom.Mobile.prototype = new Sail.App();

