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
  app.userData = null;        // to be filled by user object
  app.groupData = null;       // maybe
 

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
    // create user_state object if necessary
    // create userState object and wake it up (sub to collection)

  };

  app.bindPageElements = function() {
    console.log('Binding page elements...');

    jQuery('#log-in-success').click(function() {
      app.hidePageElements();

      // insert the grouping check here


      jQuery('#team-assignment .small-button').show();
    });
  };

  app.hidePageElements = function() {
    console.log('Hiding page elements...');
    jQuery('#loading-page').hide();
    jQuery('#team-meeting').hide();
    jQuery('#log-in-success').hide();
    jQuery('#team-assignment').hide();
  };


};

EvoRoom.Mobile.prototype = new Sail.App();

