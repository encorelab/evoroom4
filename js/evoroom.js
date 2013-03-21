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
  app.ancestors = null;
  app.phases = null;
  app.phase = null;
  app.users = null;
  app.user = null;
  app.groups = null;
  app.group = null;
  app.observations = null;
  app.observation = null;
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
          // grab all the stuff that won't be changing (ancestors, OTHER)
          app.fetchStaticData();
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
    jQuery.get(app.config.drowsy.url + "/" + app.run.name + "/ancestors", function(data) {
      app.ancestors = data[0];
    });
  };

  app.initModels = function() {
    console.log('Initializing models...');

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
        }
        app.group.wake(Sail.app.config.wakeful.url);
        app.group.on('change', app.updateGroupHTML);
        app.updateGroupHTML();
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

  };

  app.initObservationModels = function() {
    // OBSERVATIONS collection
    if (app.observation === null) {
      app.observations = new EvoRoom.Model.Observations();
      app.observations.wake(Sail.app.config.wakeful.url);   // do we actually need this?

      var fetchObservationsSuccess = function(collection, response) {
        console.log("Retrieved observations collection...");
        // OBSERVATION model
        app.createNewObservation();   // TODO - how will this interact with restoreState? Maybe needs an if to see if an unpublished obs exists?
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
    app.observation.set('observed_organism','none');
    // app.observation.set('group_name', app.rollcallObservationName);
    app.observation.wake(Sail.app.config.wakeful.url);
    app.observation.save();

    // var saveSuccess = function(model, response) {
    //   app.observation.wake(Sail.app.config.wakeful.url); // make observation object wakeful
    //   app.observation.on('change', app.updateUserHTML);
    //   app.updateUserHTML();
    // };
    // app.observation.save(null, {success: saveSuccess}); // save the observation object to the database    
  };


  /************** UI related functions **************/

  app.updatePhaseHTML = function() {
    console.log('Updating phase model related UI elements...');

    jQuery('#phase-number-container').text(app.phase.get('phase_number'));
  };

  app.updateGroupHTML = function() {
    console.log('Updating group model related UI elements...');

    // TODO - make this dynamic with current_members - might have to change the way members are structured
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
    // TODO change group listing to dynamic based on who's in the room? (replacing stuff in updateObservationHTML)
    jQuery('.time').text(app.user.get('phase_data').time);

    if (app.user.get('current_organism')) {
      jQuery('.assigned-organism-text').text(app.convertToHumanReadable(app.user.get('current_organism')));
      jQuery('#assigned-organism-container .organism-image').attr('src', '/assets/images/' + app.user.get('current_organism') + '_icon.png');
    }    

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
    jQuery('#organism-presence .small-button').hide();
    jQuery('#ancestor-choice').hide();
    jQuery('#ancestor-description').hide();
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
        if (app.user.get('direction') === "forward") {
          app.user.setPhaseData('time', '200 mya');
        } else {
          app.user.setPhaseData('time', '50 mya');
        }
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
      app.phase.set('phase_number', '1');
      jQuery('#rotation-instructions').show();
    });

    jQuery('#participant-instructions .small-button').click(function() {
      app.hidePageElements();
      app.phase.set('phase_number', '1');
      app.assignOrganism();
      jQuery('#assigned-organism-container').show();
      jQuery('#organism-presence').show();
    });

    // ROTATIONS
    // PARTICIPANT

    jQuery('#organism-presence .presence-choice-button').click(function() {       
      jQuery('#organism-presence .small-button').show();
    });
    jQuery('#organism-presence .small-button').click(function() {
      if (jQuery(':radio:checked').data('choice') === "yes") {
        app.observation.set('observed_organism',app.observation.get('current_organism'));
        app.observation.save();
        app.clearPageElements();
        app.hidePageElements();
        // assignOrganism();
        // change time
        // jQuery('#organism-presence');
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
      if (app.observation.get('observed_organism') !== "none") {
        app.observation.save();
        app.hidePageElements();
        jQuery('#organism-presence').show();        
      } else if (app.observation.get('observed_organism') === "organism_is_present") {
        app.observation.set('observed_organism',app.observation.get('current_organism'));
        app.observation.save();
        app.clearPageElements();
        app.hidePageElements();
        // START HERE - abstract this all and figure out how to handle going to next time cleanly
        // also do buttons for ancestor-choice
        // and do the dynamic group members present?
      } else {
        alert("Which of the following is most likely the organism's ancestor or predecessor?\n\nPlease make a selection.");
      }
    });

    jQuery('#ancestor-description .small-button').click(function() {
      app.hidePageElements();
      jQuery('#ancestor-choice').show();
    });

  };



  /************** Helper functions **************/

  app.assignOrganism = function() {
    // take the first org out of the assigned_orgs array and put it into current_organism
    var orgArray = app.user.get('phase_data').assigned_organisms;
    if (orgArray) {
      app.user.set('current_organism',orgArray[0]);
      orgArray.shift();   // removes first element (like an inverse pop)      
    } else {
      console.error('No assigned_organisms received from the agent!');
    }
  };

  app.setupAncestorTable = function(organism) {
    var k = 0;
    var tr;
    var table;
    var time = app.user.get('phase_data').time;

    var dropdownTd = jQuery('<td class="organism-boxes"><div><b>Selection</b></div></td>');          // TODO check the dropdown on the tablet
    var dropdown = '<select class="organism-selector-dropdown"><option value="none">...</option>';    

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
          chosenAncestor = 'fig_tree_test';       // TODO: get rid of me when there are real ancestor descriptions to fetch
          
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
    dropdown = dropdown + '<option value="organism_is_present">I changed my mind, my assigned organism is actually present</option></select>';
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

  app.convertToHumanReadable = function(str) {
    str = str[0].toUpperCase() + str.slice(1);
    str = str.replace(/_/g, " ");
    return str;
  };

};

EvoRoom.Mobile.prototype = new Sail.App();

