/*jshint node: true, strict: false, devel: true, debug: true, unused:false, undef:true */

var fs = require('fs');
var $ = require('jquery');
var _ = require('underscore');
var Backbone = require('backbone');
// Drowsy and Wakeful to connect to the MongoDB
var Drowsy = require('backbone.drowsy').Drowsy;
var Wakeful = require('backbone.drowsy/wakeful').Wakeful;

var config = JSON.parse(fs.readFileSync('./config.json'));
Backbone.$ = $; 
// NOTE: i have to modify evoroom.model.js a bit to make it node-compatible
var EvoModel = require('../js/evoroom.model.js').Model;
 
var users = new EvoModel.Users();
users.wake(config.wakeful.url);
 
users.on('add remove reset change', function () {
    console.log('...');
});
 
users.fetch();