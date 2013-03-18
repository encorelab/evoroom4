/*jshint browser: true, devel: true, debug: true, strict: false, undef:true, node:true */
/*globals jQuery, EvoRoom, Rollcall */

if (typeof exports !== "undefined" && exports !== null) {
	// we're in node
	var jQuery = require('jquery');
    var _ = require('underscore');
    var Backbone = require('backbone');
    Backbone.$ = jQuery;
    var Drowsy = require('backbone.drowsy').Drowsy;
    var Wakeful = require('backbone.drowsy/wakeful').Wakeful;

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
			'explanations'
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
				console.log("Creating collection '" + col + "' under " + model.dbURL);
				dfs.push(model.db.createCollection(col));
			});
		});

		jQuery.when.apply(jQuery, dfs).done(function() {
			return df.resolve();
		});

		return df;
	};

	model.defineModelClasses = function () {

		model.User = model.db.Document('users').extend({
			/* define any document methods here */
		});
		model.Users = model.db.Collection('users').extend({
			model: model.User
			/* define any collection methods here */
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

  return model;
})();


