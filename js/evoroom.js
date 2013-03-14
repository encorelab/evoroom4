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
  app.user = null;
  app.group = null;       // maybe 

  app.init = function() {
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
    // TODO: implement me... probalby just copy + modify code from washago?

    // TODO: for now we're hard-coding a run name... need to get this from auth
    //this.config.run = {name: "ck-alpha1", id: 12};
    if (!app.run) {
      Rollcall.Authenticator.requestRun();
    } else {
      Rollcall.Authenticator.requestLogin();
    }

    
  };

  app.restoreState = function () {
    console.log('restore UI state');
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
      // these can likely go back in ready() when it's working correctly
      app.initModels();
      app.bindPageElements();
      jQuery('#log-in-success').show();
    },

    // NB: this is currently not getting called!
    ready: function(ev) {
      // TODO: maybe also wait until we're connected?
      //       currently this just waits until CK.Model is initialized
      console.log("Ready!");

      // Disable logout button
      jQuery('#logout-button').unbind();
      jQuery('#logout-button a').unbind();
      jQuery('#logout-button a').click( function() {
        console.log('reload');
        window.location.reload();
      });

    },

    'unauthenticated': function(ev) {
      app.authenticate();
    },

    sail: {
      dummy: function(sev) {
        console.log('received dummy sail event');
      }
    }
  };


  /* Outgoing events */
  app.sendDummy = function(model) {
    var sev;
    sev = new Sail.Event('dummy', model.toJSON());
    
    Sail.app.groupchat.sendEvent(sev);
    return true;
  };



  /* Helper functions */

  app.initModels = function() {
    console.log('Initializing models...');

    // create phase (?) object and wake it up (sub to collection)
    

    // create users object and wake it up (sub to collection)
    if (app.user === null) {
      var u = Sail.app.session.account.login; // grab username from Rollcall
      var users = new EvoRoom.Model.Users(); // create a users collction object

      // users collection fetched
      var fetchSuccess = function(collection, response) {
        console.log('Users collection found retrieved');
        // check if users collection contains an object for our current user
        var myUser = users.find(function(user) { return user.get('username') === u; });
        
        if (myUser) {
          console.log('There seems to be a users entry for us already :)');
          app.user = myUser;
          app.user.wake(Sail.app.config.wakeful.url);
        } else {
          console.log("No users object found for ", u, " creating...");
          app.user = new EvoRoom.Model.User({username: u}); // create new user object

          var saveSuccess = function(model, response) {
            app.user.wake(Sail.app.config.wakeful.url); // make user object wakeful
            users.add(app.user); // Necessary???? add user model to users collection ??????
          };

          app.user.save(null, {success: saveSuccess}); // save the user object to the database
        }
      };

      // error fetching collection means something is wrong with the database or connection
      var fetchError = function(collection, response) {
        console.error('No users collection found - and we are dead!!!!');
      };

      users.fetch({success: fetchSuccess, error: fetchError}); // fetch users collection object

    }
  };

  app.bindPageElements = function() {
    console.log('Binding page elements...');

    jQuery('#log-in-success .small-button').click(function() {
      app.hidePageElements();

      // insert the grouping check here

      jQuery('#team-assignment').show();
    });

    jQuery('#team-assignment .small-button').click(function() {
      app.hidePageElements();

      // check which rotation we're on, add the appropriate dynamic text

      jQuery('#rotation-instructions').show();
    });    
  };

  app.hidePageElements = function() {
    console.log('Hiding page elements...');
    jQuery('#loading-page').hide();
    jQuery('#team-meeting').hide();
    jQuery('#log-in-success').hide();
    jQuery('#team-assignment').hide();
    jQuery('#rotation-instructions').hide();
  };


};

EvoRoom.Mobile.prototype = new Sail.App();

