/*jshint browser: true, devel: true, debug: true, strict: false, undef:true, node:true */

if (typeof exports !== "undefined" && exports !== null) {
  // we're in node
  var jQuery = require('jquery');
    var _ = require('underscore');
    var Backbone = require('backbone');
    Backbone.$ = jQuery;
    var Drowsy = require('Backbone.Drowsy').Drowsy;
    //var Wakeful = require('Backbone.Drowsy/wakeful').Wakeful;

    var EvoRoom = {};

    exports.EvoRoom = EvoRoom;
} else {
  window.EvoRoom = window.EvoRoom || {};

  var EvoRoom = window.EvoRoom;
}

EvoRoom.Model = (function() {
  "use strict";

  var model = {};

  model.init = function(drowsyUrl, dbName) {
    var dfInit = jQuery.Deferred();

    if (drowsyUrl === null || drowsyUrl === undefined) {
      throw "Cannot configure model because no DrowsyDromedary URL was given!";
    }

    if (dbName === null || drowsyUrl === undefined) {
      throw "Cannot configure model because no database name was given!";
    }

    model.baesURL = drowsyUrl;
    model.dbUrl = "" + drowsyUrl + "/" + dbName;
    model.server = new Drowsy.Server(drowsyUrl);
    model.db = model.server.database(dbName);

    model.createNecessaryCollections([
      'users',
      'phases',
      'groups',
      'observations',
      'notes',
      'explanations',
      'events'
    ]).then(function () {
      model.defineModelClasses();
      dfInit.resolve();
    });

    return dfInit;
  };

  model.createNecessaryCollections = function(requiredCollections) {
    var df, dfs;
    dfs = [];
    df = jQuery.Deferred();

    model.db.collections(function(colls) {
      var existingCollections = _.pluck(colls, 'name');
      _.each(_.difference(requiredCollections, existingCollections), function (col) {
        console.log("Creating collection '" + col + "' under " + model.dbUrl);
        dfs.push(model.db.createCollection(col));
      });
    });

    jQuery.when.apply(jQuery, dfs).done(function() {
      return df.resolve();
    });

    return df;
  };

  model.defineModelClasses = function () {
    Drowsy.Document.prototype.defaults = function () {
      return {
        created_at: new Date()
      };
    };

    model.User = model.db.Document('users').extend({
      setPhaseData: function(phaseKey, value) {
        // var pd = this.get('phase_data');
        var pd = _.clone(this.get('phase_data'));
        pd[phaseKey] = value;
        this.set('phase_data', pd);
      },
      maxPhaseCompleted: function () {
        return _.max(this.get('phases_completed'));
      },
      isPhaseCompleted: function (phaseNum) {
        return _.contains(this.get('phases_completed'), phaseNum);
      },
      isTimePeriodCompleted: function (timePeriod) {
        return _.contains(this.get('time_periods_completed'), timePeriod);
      }
    });

    model.Users = model.db.Collection('users').extend({
      model: model.User,
      allObservationsCompleted: function(phaseNum) {
        return this.all(function(u) {
          return (u.get('phase_data').role === "participant" && _.contains(u.get('phases_completed'), phaseNum)) || u.get('phase_data').role === "guide";
        });
      }
    });

    model.Phase = model.db.Document('phases').extend({
      /* define any document methods here */
    });
    model.Phases = model.db.Collection('phases').extend({
      model: model.Phase
      /* define any collection methods here */
    });

    model.Group = model.db.Document('groups').extend({
      /* define any document methods here */
    });
    model.Groups = model.db.Collection('groups').extend({
      model: model.Group
      /* define any collection methods here */
    });

    model.Observation = model.db.Document('observations').extend({
      /* define any document methods here */
    });
    model.Observations = model.db.Collection('observations').extend({
      model: model.Observation
      /* define any collection methods here */
    });

    model.Note = model.db.Document('notes').extend({
      /* define any document methods here */
    });
    model.Notes = model.db.Collection('notes').extend({
      model: model.Note
      /* define any collection methods here */
    });

    model.Explanation = model.db.Document('explanations').extend({
      /* define any document methods here */
    });
    model.Explanations = model.db.Collection('explanations').extend({
      model: model.Explanation
      /* define any collection methods here */
    });

    /* define additional document and collection types here! 
    ... just copy and paste the Observation and Observations classes and rename them */
  };

  model.initWakefulCollections = function(wakefulUrl) {
    var deferreds = [];

    model.awake = {};

    model.awake.users = new model.Users();
    model.awake.users.wake(wakefulUrl);
    deferreds.push(model.awake.users.fetch());

    model.awake.phases = new model.Phases();
    model.awake.phases.wake(wakefulUrl);
    deferreds.push(model.awake.phases.fetch());

    model.awake.groups = new model.Groups();
    model.awake.groups.wake(wakefulUrl);
    deferreds.push(model.awake.groups.fetch());

    model.awake.observations = new model.Observations();
    model.awake.observations.wake(wakefulUrl);
    deferreds.push(model.awake.observations.fetch());

    model.awake.notes = new model.Notes();
    model.awake.notes.wake(wakefulUrl);
    deferreds.push(model.awake.notes.fetch());

    model.awake.explanations = new model.Explanations();
    model.awake.explanations.wake(wakefulUrl);
    deferreds.push(model.awake.explanations.fetch());

    return jQuery.when.apply(jQuery, deferreds);
  };

  return model;
})();


