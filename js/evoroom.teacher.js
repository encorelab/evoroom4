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

  app.setupModels = function() {
    console.log('Initializing models...');

    var phases = new EvoRoom.Model.Phases();
    phases.fetch().done(function () {
      app.phase = phases.first();

      if (!app.phase.has('phase_name')) {
        var phaseDef = app.lookupPhaseDefinitionByNumber(app.phase.get('phase_number'));
        app.phase.set('phase_name', phaseDef.name);
      }

      if (!app.phase) {
        console.error("No phase document found in /phases!");
        throw "EXPLOSION!";
      }

      app.phase.on('change', app.phaseChanged);
      app.phase.wake(app.config.wakeful.url);

      app.users = new EvoRoom.Model.Users();
      app.users.on('change add', app.userChanged);
      app.users.on('reset', function(users) { users.each(app.userChanged); });
      app.users.wake(app.config.wakeful.url);
      app.users.fetch().done(function () {
        app.phaseChanged(app.phase);
      });

      app.explanations = new EvoRoom.Model.Explanations();
      app.explanations.wake(app.config.wakeful.url);
      app.explanations.on('change add', app.explanationChanged);
      app.explanations.on('reset', function(explanations) { 
        explanations.each(app.explanationChanged); 
      });
      app.users.fetch();

      app.observations = new EvoRoom.Model.Observations();
      app.observations.wake(app.config.wakeful.url);
      app.observations.on('change add', function (ob) {
        app.userChanged(app.lookupUserByUsername(ob.get('username'))); 
      });
      app.observations.on('change add reset', function () {
        jQuery('#obs-count .count').text(app.observations.filter(function (ob) { return ob.get('phase') == 1; }).length); 
        jQuery('#obs-count2 .count').text(app.observations.filter(function (ob) { return ob.get('phase') == 3; }).length); 
      });
      app.observations.fetch();

      app.notes = new EvoRoom.Model.Notes();
      app.notes.wake(app.config.wakeful.url);
      app.notes.on('change add', function (no) { 
        app.userChanged(app.lookupUserByUsername(no.get('username'))); 
      });
      app.notes.on('change add reset', function () {
        var publishedCount = app.notes.filter(function (n) { return n.get('phase') == 2 && n.get('published');}).length;
        var publishedCount2 = app.notes.filter(function (n) { return n.get('phase') == 4 && n.get('published');}).length;
        jQuery('#notes-count .count').text(publishedCount); 
        jQuery('#notes-count2 .count').text(publishedCount);
      });
      app.notes.fetch();
    });
  };
  
  app.events = {
    initialized: function(ev) {
      app.loadStaticData().done(function () {
        app.authenticate();
      });
    },
  
    authenticated: function(ev) {
      console.log('Authenticated...');

      EvoRoom.Model.init(app.config.drowsy.url, app.run.name).done(function () {
        Wakeful.loadFayeClient(app.config.wakeful.url).done(function () {
          app.trigger('ready');
        });
      });
    },
  
    ready: function(ev) {
      //jQuery('button, input[type=submit], input[type=reset], input[type=button]').button();
      jQuery(".teacher-dashboard").css('visibility', 'visible');

      app.setupModels();
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
    }
  };
    

  app.loadStaticData = function () {
    app.staticData = {};

    var datafiles = {
      'phase_definitions': 'assets/static_data/phase_definitions.json'
    };

    var loads = _.collect(datafiles, function (url, key) {
      return jQuery.get(url, function (data) {
        app.staticData[key] = data;
      });
    });

    return jQuery.when.apply(jQuery, loads);
  };

  app.lookupPhaseDefinitionByName = function(name) {
    return _.find(app.staticData.phase_definitions, function (p) {
      return p.name == name;
    });
  };

  app.lookupPhaseDefinitionByNumber = function(number) {
    return _.find(app.staticData.phase_definitions, function (p) {
      return p.number == number;
    });
  };

  app.lookupUserByUsername = function (username) {
    return app.users.find(function (u) { return u.get('username') === username; });
  };

  // find or create element in parent matching the selector;
  // if element doesn't exist in parent, create it with the given html
  function foc(parent, selector, html) {
        var el = jQuery(parent).find(selector);
        if (el.length) {
            return el;
        } else {
            el = jQuery(html);
            jQuery(parent).append(el);
            return el;
        }
    }

  app.updateProgressbar = function() {
    _.each(app.staticData.phase_definitions, function (pd) {
      var cssClass = 'phase-'+pd.name;
      var prog = foc('.progressbar', '.'+cssClass ,'<div class="indicator">');
      
      prog.addClass('phase-'+pd.number);
      prog.addClass('phase-'+pd.name);
      prog.text(pd.number+". "+pd.title);

      if (app.phase.get('phase_number') == pd.number) {
        prog.addClass('current');
      } else {
        prog.removeClass('current');
      }
    });
  };

  app.phaseChanged = function(phase) {
    app.updateProgressbar();

    var cpDef = app.lookupPhaseDefinitionByName(phase.get('phase_name'));
    
    jQuery('tr.phase').each(function () {
      var pTr = jQuery(this);
      var pDef = app.lookupPhaseDefinitionByName(pTr.data('phase'));
      
      if (pDef.number < cpDef.number) {
        pTr
          .removeClass('current')
          .addClass('done');

      } else if (pDef.number > cpDef.number) {
        pTr
          .removeClass('current done');

      } else {
        pTr
          .removeClass('done')
          .addClass('current');
      }

    });
    
    

    

    app.users.each(function (u) {
      app.updateStudentMarkerForUser(u);
    });

    // jQuery('tr.phase').each(function () {
    //   var tr = jQuery(this);
    //   var trPhaseDef = app.lookupPhaseDefinitionByName(tr.data('phase'));
    //   if (trPhaseDef.number <= app.phase.get('phase_number')) {
    //     tr.find('.buttons .objective').show();

    //     if (trPhaseDef.name !== 'explanation') {
    //       tr.find('.buttons button').addClass('teacher-button-done');
    //     }

    //     if (trPhaseDef.number < app.phase.get('phase_number')) {
    //       tr.addClass('done');
    //     }
    //   } else {
    //     tr.find('.buttons .objective').hide();
    //   }
    // });

    app.updateOpenInquiryButton();
    app.updatePhaseReady();
  };

  app.studentMarker = function (username) {
    var marker = jQuery('#'+username);
    if (marker.length === 0) {
      marker = jQuery("<span class='student' id='"+username+"'>"+username+"</span>");
    }
    return marker;
  };

  app.flashStudentMarker = function (username) {

  };

  app.updateStudentMarkerForUser = function (user) {
    var username = user.get('username');
    var phaseName = user.get('user_phase') || app.phase.get('phase_name');
    var marker = app.studentMarker(username);

    var phaseDef = app.lookupPhaseDefinitionByName(phaseName);
    
    marker.addClass('team-'+user.get('group_name'));

    jQuery('tr.phase-'+phaseDef.number+' .students').append(marker);

    var readyToMoveOn = user.maxPhaseCompleted() >= app.phase.get('phase_number') ||
        (app.phase.get('phase_name') === 'explanation' && user.isTimePeriodCompleted(app.phase.get('time')));

    if (readyToMoveOn) {
      marker.addClass('ready');
    } else {
      marker.removeClass('ready');
    }
  };

  app.userChanged = function (user) {
    app.updateStudentMarkerForUser(user);
    app.updatePhaseReady();

    app.studentMarker(user.get('username')).effect('highlight');
  };

  app.explanationChanged = function (exp) {
    if (exp.get('published') && exp.get('time_period') === app.phase.get('time')) {
      var time = exp.get('time_period');
      var user = app.lookupUserByUsername(exp.get('username'));
      var timesCompleted = user.get('time_periods_completed') || [];
      if (!_.contains(timesCompleted, time)) {
        timesCompleted.push(time);
        user.save({time_periods_completed: timesCompleted});
      }
    }
  };

  app.updatePhaseReady = function () {
    jQuery('button.start-phase')
      .removeClass('teacher-button-primed ready');

    // if (app.users.length > 0 && app.phase.get('phase_number') < 1) {
    //   jQuery('.phase-rotation_1 button.start-phase')
    //     .removeClass('teacher-button-faded')
    //     .removeClass('teacher-button-done')
    //     .addClass('teacher-button-primed ready');
    // }

    if (app.users.all(function (u) { return u.maxPhaseCompleted() >= app.phase.get('phase_number'); })) {
      jQuery('.phase-'+(app.phase.get('phase_number')+1)+' button.start-phase')
        .removeClass('teacher-button-faded')
        .removeClass('teacher-button-done')
        .addClass('teacher-button-primed ready');
    }
  };

  app.updateOpenInquiryButton = function () {
    var explanationPhase = app.lookupPhaseDefinitionByName('explanation');
    var i = _.indexOf(explanationPhase.time_periods, app.phase.get('time'));
    
    if (explanationPhase.time_periods[i + 1]) {
      jQuery('tr.phase-explanation button.start-phase')
        .text("Start "+explanationPhase.time_periods[i + 1]+" »");
    } else {
      jQuery('tr.phase-explanation button.start-phase').hide();
    }
  };
  
  app.makeInteractive = function() {
    jQuery('button.start-phase').click(function (ev) {
      var button = jQuery(ev.target);
      var phaseName = button.parents('.phase').eq(0).data('phase');

      var pd = app.lookupPhaseDefinitionByName(phaseName);

      if (!confirm("Are you sure you want to "+button.text().toUpperCase().replace(/[^\w ]/,'').trim()+"?"))
        return;

      var newTime;
      if (phaseName == 'explanation') {
        var explanationPhase = app.lookupPhaseDefinitionByName('explanation');
        var currTime = app.phase.get('time');
        var i;
        if (!currTime) {
          newTime = explanationPhase.time_periods[0];
          i = 0;
        } else {
          i = _.indexOf(explanationPhase.time_periods, currTime);

          if (i < explanationPhase.time_periods.length - 1)
            newTime = explanationPhase.time_periods[i + 1];
        }
      }

      app.phase.save({
        time: newTime, 
        phase_name: pd.name,
        phase_number: pd.number
      });
    });
  };
};

window.EvoRoom.Teacher.prototype = new Sail.App();