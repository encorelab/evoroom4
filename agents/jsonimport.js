// npm install mongodb
// npm install optimist
var fs = require('fs');
var mongodb = require ('mongodb');

var myArgs = require('optimist').argv,
     help = '\nUsage: \n\n    jsonimport.js  <target_collection>  <path/filename.json> \n\n';

if ((myArgs.h)||(myArgs.help)) {
  console.log(help);
  process.exit(0);
}

var collection_name = myArgs._[0];
var filename = './' + myArgs._[1];

var file_to_import = JSON.parse(fs.readFileSync(filename));

var server = new mongodb.Server("127.0.0.1", 27017, {});

new mongodb.Db('evo4-march-2013', server, {w: 1}).open(function (error, client) {
  if (error) throw error;
  var collection = new mongodb.Collection(client, collection_name);

  //collection.remove(function(er))
  collection.remove({},function(err, removed) {
    console.log(removed);
  });

  collection.insert(file_to_import, {safe:true}, function(err, objects) {
    if (err) console.warn(err.message);
    if (err && err.message.indexOf('E11000 ') !== -1) {
      // this _id was already inserted in the database
    }
  });
});
