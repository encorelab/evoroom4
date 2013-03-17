  /*jshint browser: true, devel: true, debug: true, strict: false, unused:false, undef:true */
/*globals jQuery, _, Sail, EvoRoom, Rollcall, Wakeful */

window.EvoRoom = window.EvoRoom || {};

EvoRoom.Mobile = function() {
  var app = this;

  app.name = "EvoRoom.Mobile";

  app.requiredConfig = {
    xmpp: {
      domain: 'string',
      port: 'number',
      url: 'string'
    },
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
  app.phases = null;    // maybe not necessary?
  app.phase = null;
  app.users = null;   // maybe not necessary?
  app.user = null;
  app.rollcallGroupName = null;
  app.groups = null;
  app.group = null;
  app.rollcallMetadata = null; // switch me to local?

  app.init = function() {
    jQuery('#evoroom').addClass('hide'); // hide everything except login screen

    Sail.verifyConfig(this.config, this.requiredConfig);
    
    Sail.modules
      // Enable multi-picker login for CommonKnowledge curnit - asking for run (must be linked to curnit)
      .load('Rollcall.Authenticator', {mode: 'picker', askForRun: true, curnit: 'EvoRoom'})
      .load('Strophe.AutoConnector')
      .load('AuthStatusWidget', {indicatorContainer: '#logout-container'})
      .thenRun(function () {
        Sail.autobindEvents(app);
        app.trigger('initialized');

        return true;
      });

    // Create a Rollcall instance so that sail.app has access to it later on
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
    console.log('Restoring UI state...');

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
      console.log('ui.initialized!');
    },    

    authenticated: function(ev) {
      console.log('Authenticated...');

      // now we call a class function (configure) and hand in the drowsy url and the run name so we don't need
      // to do this config again for each model instantiation
      EvoRoom.Model.init(app.config.drowsy.url, app.run.name)
      .done(function () {
        Wakeful.loadFayeClient(app.config.wakeful.url).done(function () {
          app.trigger('ready');
        });
      });
    },

    connected: function(ev) {
      console.log("Connected...");
      // FIXME: We might not even come through here once we take XMPP connection out.
    },

    ready: function(ev) {
      console.log("Ready!");

      Sail.app.rollcall.request(Sail.app.rollcall.url + "/users/"+Sail.app.session.account.login+".json", "GET", {}, function(data) {
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

        // init all models and collections needed an make them wakefull
        app.initModels();
        // return user to last screen according to user object and enable transitions according to phase object
        app.restoreState();
        // hook up event listener to buttons to allow interactions
        app.bindEventsToPageElements();

        jQuery('#evoroom').removeClass('hide'); // unhide everything
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
      var fetchPhaseSuccess = function(collection, response) {
        console.log('Retrieved phases collection...');
        if (collection.length === 1) {
          // PHASE model
          app.phase = app.phases.first();
          app.phase.wake(Sail.app.config.wakeful.url);
          app.phase.on('change', app.updatePhaseHTML);
          app.updatePhaseHTML();
        } else {
          console.error('More or less than 1 phase object found in phases collection...');
        }
      };
      var fetchPhaseError = function(collection, response) {
        console.error('No phase found - and we are dead!!!');
      };
      app.phases.fetch({success: fetchPhaseSuccess, error: fetchPhaseError});
    } else {
      console.error('Phase model already exists...');
    }

    // do the group one first?

    // USERS collection
    if (app.user === null) {
      var u = Sail.app.session.account.login;   // grab username from Rollcall
      app.users = new EvoRoom.Model.Users();    // create a users collction object
      app.users.wake(Sail.app.config.wakeful.url);

      var fetchUserSuccess = function(collection, response) {
        console.log('Retrieved users collection...');
        // check if users collection contains an object for our current user
        var myUser = app.users.find(function(user) { return user.get('username') === u; });
        // USER collection
        if (myUser) {
          console.log('There seems to be a users entry for us already :)');
          app.user = myUser;
          app.user.set('modified_at', new Date());
        } else {
          console.log("No users object found for ", u, " creating...");
          app.user = new EvoRoom.Model.User({username: u}); // create new user object
          app.user.set('user_phase', '');
          app.user.set('phase_data', {});
          app.user.set('created_at', new Date());
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
      var fetchUserError = function(collection, response) {
        console.error('No users collection found - and we are dead!!!');
      };
      app.users.fetch({success: fetchUserSuccess, error: fetchUserError});
    } else {
      console.error('User model already exists...');
    }

  };

  app.bindEventsToPageElements = function() {
    console.log('Binding page elements...');

    jQuery(".jquery-radios").buttonset();

    // to be removed once teacher tablet is up and going
    jQuery('#start-rotation-1').click(function() {

    });

    jQuery('#log-in-success .small-button').click(function() {
      app.hidePageElements();

      // insert the grouping check here?

      jQuery('#team-assignment').show();
    });

    jQuery('#team-assignment .small-button').click(function() {
      app.hidePageElements();
      jQuery('#rotation-instructions').show();
    });

    jQuery('#rotation-instructions .small-button').click(function() {
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

  app.updatePhaseHTML = function() {
    console.log('Hooking up phase model to UI elements...');

    jQuery('#phase-number-container').text(app.phase.get('phase_number'));
  };

  app.updateGroupHTML = function() {
    console.log('Hooking up group model to UI elements...');

    // this will likely suffer from sync issues - will need to nest group inside user in modelInit
    _.each(app.group.get(app.user.get('group_name')), function(m) {
      console.log('member:',m);
    });
  };

  app.updateUserHTML = function() {
    console.log('Hooking up user model to UI elements...');

    jQuery('#team-name-container').text(app.user.get('group_name'));
  };

  app.hidePageElements = function() {
    console.log('Hiding page elements...');
    jQuery('#loading-page').hide();
    jQuery('#team-meeting').hide();
    jQuery('#log-in-success').hide();
    jQuery('#team-assignment').hide();
    jQuery('#rotation-instructions').hide();
    jQuery('#organism-presence').hide();
  };


};

EvoRoom.Mobile.prototype = new Sail.App();

