/*jshint browser: true, devel: true, debug: true, strict: false, undef:true */
/*globals jQuery, _, Sail, EvoRoom, Rollcall, Wakeful */

window.EvoRoom = window.EvoRoom || {};

window.EvoRoom.Teacher = function () {
  var app = this;

  app.name = "EvoRoom.Teacher";
  
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
    curnit: 'string'
  };

  app.users = {};
  app.doneFeatures = {};
  
  app.init = function() {
    Sail.verifyConfig(this.config, this.requiredConfig);

    Sail.modules
      .load('Rollcall.Authenticator', {
        //mode: 'username-and-password', 
        mode: 'picker',
        askForRun: true, 
        curnit: app.config.curnit,
        usersQuery: {},
        userFilter: function(u) {return u.kind === "Instructor";}
      })
      .load('Wakeful.ConnStatusIndicator')
      .load('AuthStatusWidget')
      .thenRun(function () {
        Sail.autobindEvents(app);
        jQuery(Sail.app).trigger('initialized');

        return true;
      });

      app.rollcall = new Rollcall.Client(app.config.rollcall.url);
  };

  app.authenticate = function() {
    app.token = app.rollcall.getCurrentToken();

    if (!app.run) {
      Rollcall.Authenticator.requestRun();
    } else if (!app.token) {
      Rollcall.Authenticator.requestLogin();
    } else {
      app.rollcall.fetchSessionForToken(app.token, function(data) {
          app.session = data.session;
          jQuery(Sail.app).trigger('authenticated');
        },
        function(error) {
          console.warn("Token '"+app.token+"' is invalid. Will try to re-authenticate...");
          Rollcall.Authenticator.unauthenticate();
        }
      );
    }
  };

  app.initModels = function() {
    console.log('Initializing models...');

    var phases = new EvoRoom.Model.Phases();
    phases.fetch().done(function () {
      app.phase = phases.first();
      app.phase.wake(app.config.wakeful.url);
    });

    app.users = new EvoRoom.Model.Users();
    app.users.wake(app.config.wakeful.url);
    app.users.fetch();
  };
  
  app.events = {
    initialized: function(ev) {
      app.authenticate();
    },
  
    authenticated: function(ev) {
      console.log('Authenticated...');

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
      jQuery('button, input[type=submit], input[type=reset], input[type=button]').button();
      jQuery(".teacher-dashboard").css('visibility', 'visible');

      app.initModels();
      app.makeInteractive();
      
      // app.groupchat.addParticipantJoinedHandler(function(who, stanza) {
      //   var match = who.match(/\/(\w*)/);
      //   console.log(who + " joined...");
      //   if (match && match[1]) {
      //     var username = match[1];
      //     EvoRoom.Teacher.refreshDataForUser(username);
      //   }
      // });
    },
  
    unauthenticated: function(ev) {
      app.authenticate();
    },
    
    sail: {
      orient: function(sev) {
        jQuery('button[value="'+sev.payload.time_period+'"]').addClass('teacher-button-done');
      },
      
      observations_start: function(sev) {
        if (sev.payload.rotation === 1) {
          jQuery('.step-1-2 button.start_rotation_1')
            .addClass('teacher-button-done')  
            .addClass('teacher-button-faded');
            //.attr('disabled','disabled');
            
          jQuery('.indicator.step-1-2').addClass('done')
            .prevAll().addClass('done');
        } else {
          jQuery('.step-1-4 button.start_rotation_2')
            .addClass('teacher-button-done')
            .addClass('teacher-button-faded');
            //.attr('disabled','disabled');
          jQuery('.indicator.step-1-4').addClass('done')
            .prevAll().addClass('done');
        }
      },
      
      homework_assignment: function(sev) {
        if (sev.payload.day === 1) {
          jQuery('.step-1-6 button.assign_homework_1')
            .addClass('teacher-button-done')
            .addClass('teacher-button-faded');
            //.attr('disabled','disabled');
          jQuery('.indicator.step-1-6').addClass('done')
            .prevAll().addClass('done');
        } //else {
           // TODO
        //}
      },
      
      state_change: function(sev) {
        EvoRoom.Teacher.gotUpdatedUserState(sev.origin, sev.payload.to);
      },
      
      notes_completion: function(sev) {
        EvoRoom.Teacher.doneFeatures[sev.origin] = true;
        EvoRoom.Teacher.refreshDataForUser(sev.origin);
      },
      
      transition_animation: function(sev) {
        jQuery('button.start_pre_transition').removeClass('teacher-button-primed');
        jQuery('button.start_transition').removeClass('teacher-button-faded');
        jQuery('button.start_transition').addClass('teacher-button-primed');
      }
    }
  };
  
  app.gotUpdatedUserData = function(user) {
    if (!EvoRoom.Teacher.users) {
      EvoRoom.Teacher.users = {};
    }
    
    var username = user.account.login;
    var state = user.metadata.state || "OUTSIDE";
    
    console.log("got updated data for: ", username, user);
    
    EvoRoom.Teacher.users[username] = user;
    
    var marker = EvoRoom.Teacher.studentMarker(user);
    marker.attr('title', state + " ("+user.metadata.current_rotation+")");
    
    if (user.metadata.day === 2) { // day 2
      if (EvoRoom.Teacher.checkAllUsersInState('ORIENTATION')) {
        jQuery('.step-2-2 button.start_feature_observations').removeClass('teacher-button-faded');
        jQuery('.step-2-2 button.start_feature_observations').addClass('teacher-button-primed');
      } else {
        jQuery('.step-2-2 button.start_feature_observations').removeClass('teacher-button-primed');
      }

      if (_.all(EvoRoom.Teacher.users, function(user, username) {return EvoRoom.Teacher.doneFeatures[username] === true;}) && EvoRoom.Teacher.checkAllUsersInState('OBSERVING_PAST_FEATURES')) {
        jQuery('button.start_pre_transition').removeClass('teacher-button-faded');
        jQuery('button.start_pre_transition').addClass('teacher-button-primed');
        jQuery('button.start_transition').removeClass('teacher-button-faded');
      } else {
        jQuery('button.start_pre_transition').removeClass('teacher-button-primed');
        jQuery('button.start_transition').removeClass('teacher-button-primed');
      }
      
      if (EvoRoom.Teacher.checkAllUsersInState('BRAINSTORMING')) {
        jQuery('.step-2-5 .buttons button').removeClass('teacher-button-faded');
        jQuery('.assign_homework_2').removeClass('teacher-button-faded');
      }
      
      switch (state) {
        case "OUTSIDE":
          jQuery('.step-2-0 .students').append(marker);
          break;
        case "ORIENTATION":
          jQuery('.step-2-1 .students').append(marker);
          break;
        case "OBSERVING_PAST_FEATU =ES":
          if (EvoRoom.Teacher.doneFeatures[username] === true) {
            jQuery('.step-2-3 .students').append(marker);
          } else {
            jQuery('.step-2-2 .students').append(marker);
          }
          break;
        case "OBSERVING_PRESENT":
          jQuery('.step-2-4 .students').append(marker);
          break;
         case 'BRAINSTORMING':
          jQuery('.step-2-5 .students').append(marker);
          break;
        case 'DONE':
          jQuery('.step-2-6 .students').append(marker);
          break;
      }
      
      // end of day 2
    } else { // day 1
    
      if (EvoRoom.Teacher.checkAllUsersInRotation(1) && EvoRoom.Teacher.checkAllUsersInState('ORIENTATION')) {
        jQuery('.step-1-2 button.start_rotation_1').removeClass('teacher-button-faded');
        jQuery('.step-1-2 button.start_rotation_1').addClass('teacher-button-primed');
      } else {
        jQuery('.step-1-2 button.start_rotation_1').removeClass('teacher-button-primed');
      }
    
      if (EvoRoom.Teacher.checkAllUsersInRotation(1) && EvoRoom.Teacher.checkAllUsersInState('WAITING_FOR_GROUP_TO_FINISH_MEETUP')) {
        jQuery('.step-1-4 button.start_rotation_2').removeClass('teacher-button-faded');
        jQuery('.step-1-4 button.start_rotation_2').addClass('teacher-button-primed');
      } else {
        jQuery('.step-1-4 button.start_rotation_2').removeClass('teacher-button-primed');
      }
    
      if (EvoRoom.Teacher.checkAllUsersInRotation(2) && EvoRoom.Teacher.checkAllUsersInState('WAITING_FOR_GROUP_TO_FINISH_MEETUP')) {
        jQuery('.step-1-6 button.assign_homework_1').removeClass('teacher-button-faded');
        jQuery('.step-1-6 button.assign_homework_1').addClass('teacher-button-primed');
      } else {
        jQuery('.step-1-6 button.assign_homework_1').removeClass('teacher-button-primed');
      }
    
      switch (state) {
        case "OUTSIDE":
          jQuery('.step-1-0 .students').append(marker);
          break;
        case "ORIENTATION":
          jQuery('.step-1-1 .students').append(marker);
          break;
        case "OBSERVING_PAST":
          if (user.metadata.current_rotation === 1) {
            jQuery('.step-1-2 .students').append(marker);
          } else if (user.metadata.current_rotation === 2) {
            jQuery('.step-1-4 .students').append(marker);
          }
          break;
        case "MEETUP":
        case "WAITING_FOR_MEETUP_START":
        case "WAITING_FOR_GROUP_TO_FINISH_MEETUP":
          if (user.metadata.current_rotation === 1) {
            jQuery('.step-1-3 .students').append(marker);
          } else {
            jQuery('.step-1-5 .students').append(marker);
          }
          break;
        case "OUTSIDE":
          if (user.metadata.current_rotation === 2) {
            jQuery('.step-1-6 .students').append(marker);
          }
          break;
        case 'WAITING_FOR_LOCATION_ASSIGNMENT':
        case 'GOING_TO_ASSIGNED_LOCATION':
          switch(user.metadata.current_task) {
            case 'meetup':
              if (user.metadata.current_rotation === 1) {
                jQuery('.step-1-3 .students').append(marker);
              } else {
                jQuery('.step-1-5 .students').append(marker);
              }
              break;
            case 'observe_past_presence':
              if (user.metadata.current_rotation === 1) {
                jQuery('.step-1-2 .students').append(marker);
              } else {
                jQuery('.step-1-4 .students').append(marker);
              }
              break;
          }
          break;
      }
      
      // end of day 1
    }
    
    jQuery('#'+username).effect("highlight", {}, 800);
    //jQuery('.student').after(" "); // FIXME: hack -- inserts too many spaces right now, but needed for white-space wrap
  };

  
  app.makeInteractive = function() {
    jQuery('.step-1-1 .buttons button, .step-2-5 .buttons button').each(function() {
      var val = jQuery(this).val();
      jQuery(this).click(function() {
        var sev = new Sail.Event('orient', {
          time_period: val
        });
        app.groupchat.sendEvent(sev);
      });
    });
    
    jQuery('.start_rotation_1').click(function () {
      var sev = new Sail.Event('observations_start', {rotation: 1});
      app.groupchat.sendEvent(sev);
    });
    
    jQuery('.start_rotation_2').click(function () {
      var sev = new Sail.Event('observations_start', {rotation: 2});
      app.groupchat.sendEvent(sev);
    });
    
    jQuery('.assign_homework_1').click(function () {
      var sev = new Sail.Event('homework_assignment', {day: 1});
      app.groupchat.sendEvent(sev);
    });
    
    
    // day 2
    
    jQuery('.start_feature_observations').click(function () {
      var sev = new Sail.Event('feature_observations_start', {});
      app.groupchat.sendEvent(sev);
    });
    
    jQuery('.start_pre_transition').click(function () {
      var sev = new Sail.Event('transition_animation', {});
      app.groupchat.sendEvent(sev);
    });
    
    jQuery('.start_transition').click(function () {
      var sev = new Sail.Event('transition_to_present', {});
      app.groupchat.sendEvent(sev);
    });
    
    jQuery('.assign_homework_2').click(function () {
      var sev = new Sail.Event('homework_assignment', {day: 1});
      app.groupchat.sendEvent(sev);
    });
  };
  
  app.studentMarker = function(user) {
    var username = user.get('username');
    var phase = user.get('user_phase');
    var marker = jQuery('#'+username);
    
    if (marker.length < 1) {
      marker = jQuery("<span class='student' id='"+username+"' title='"+phase+"'>"+username+"</span>");
    }
    
    if (user.groups && user.groups[0]) {
      var teamName = user.groups[0].name;
      if (teamName) {
        marker.addClass('team-'+teamName);
      }
    } else {
      EvoRoom.Teacher.refreshDataForUser(username);
    }
    
    return marker;
  };
};

window.EvoRoom.Teacher.prototype = new Sail.App();