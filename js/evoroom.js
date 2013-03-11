/*jslint devel: true, regexp: true, browser: true, unparam: true, debug: true, sloppy: true, sub: true, es5: true, vars: true, evil: true, fragment: true, plusplus: true, nomen: true, white: true, eqeq: false */
/*globals Sail, Rollcall, $, Foo, _, window */

var EvoRoom = {

  rollcallURL: '/rollcall',

  events: {
    sail: {
      /********************************************* INCOMING EVENTS *******************************************/
      
      dummy_event: function(ev) {
        if (ev.payload) {

        } else {
          console.log("dummy_event received, but payload is incomplete or not for this user");
        }
      }
    },

    initialized: function(ev) {
      Sail.app.authenticate();
    },

    authenticated: function(ev) {

    },

    connected: function(ev) {

    },

    unauthenticated: function(ev) {

    }
  },

  init: function() {
    Sail.app.rollcall = new Rollcall.Client(Sail.app.rollcallURL);

    Sail.app.run = Sail.app.run || JSON.parse($.cookie('run'));
    if (Sail.app.run) {
      Sail.app.groupchatRoom = Sail.app.run.name + '@conference.' + Sail.app.xmppDomain;
    }

    Sail.modules
    .load('Rollcall.Authenticator', {mode: 'picker', askForRun: true, curnit: 'EvoRoom4', userFilter: function(u) { return true; }})
    .load('Strophe.AutoConnector')
    .load('AuthStatusWidget')
    .thenRun(function () {
      Sail.autobindEvents(EvoRoom);

      $(document).ready(function() {
        $('#reload').click(function() {
          Sail.Strophe.disconnect();
          location.reload();
        });
      });

      $(Sail.app).trigger('initialized');
      return true;
    });
  },    

  authenticate: function() {
    Sail.app.token = Sail.app.rollcall.getCurrentToken();

    if (!Sail.app.run) {
      Rollcall.Authenticator.requestRun();
    } else if (!Sail.app.token) {
      Rollcall.Authenticator.requestLogin();
    } else {
      Sail.app.rollcall.fetchSessionForToken(Sail.app.token, function(data) {
        Sail.app.session = data.session;
        $(Sail.app).trigger('authenticated');
      },
      function(error) {
        console.warn("Token '"+Sail.app.token+"' is invalid. Will try to re-authenticate...");
        Rollcall.Authenticator.unauthenticate();
      }
      );
    }
  },


  /********************************************* OUTGOING EVENTS *******************************************/
  
  submitDummy: function() {
    var sev = new Sail.Event('dummy_done', {
      author:Sail.app.session.account.login,
      team_name:Sail.app.currentTeam,
    });
    Sail.app.groupchat.sendEvent(sev);
  },


  /********************************************** HELPER FUNCTIONS *****************************************/

  restoreState: function() {

  },


};
