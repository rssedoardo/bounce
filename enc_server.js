'use strict'

// SETUP AND CONFIG
var express = require('express');
var app = express();
var redis = require("redis");
var redisClient = redis.createClient('6379', 'encounter.czdmke.0001.usw2.cache.amazonaws.com');
var notificationRedisClient = redis.createClient('6379', 'encounter.czdmke.0001.usw2.cache.amazonaws.com');
var bodyParser = require('body-parser');
var morgan     = require('morgan');
var stream = require('stream');
var combinatorics = require('js-combinatorics');

// BodyParser let us get the data from a POST req
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


var streams = [];
// use logger
app.use(morgan('dev'));

// REDIS SETUP
// ===========
redisClient.on("error", function (err) {
    console.log("Error " + err);
});

redisClient.on("connect", function () {
    console.log("Connection to Redis was successful!");
});

notificationRedisClient.on("subscribe", function (channel, count) {
    console.log('Subscribed to "expired" messages');
});

notificationRedisClient.subscribe("__keyevent@0__:expired");

notificationRedisClient.on("message", function (channel, message) {
				    	streams.forEach(function(stream){
						stream.write("DISENGAGEMENT "+message+'\n'); 
					});
});
// ROUTER
// ===========

var router = express.Router();

router.get('/', function(req, res) {
        res.json({success: true, message: 'This is the encounter API!'});
});

router.post('/encounter', function(req, res){
	if (typeof req.body.list_ids == 'undefined') {
		res.json({success: false, message: 'No IDs to  add'});
		return;
	}
	saveEncounters(req.body.list_ids, res);
});

router.get('/stream', function(req,res) { 
	var newStream = new stream.PassThrough();
	streams.push(newStream);
	newStream.pipe(res);

	res.on('end', function() { 
		streams.splice(streams.indexOf(newStream),1); 
	}); 
}); 

app.use('/enc/api', router);

app.listen(80);


// HELPER METHODS
// ===========

var saveEncounters = function(list_ids, res){
	var cmb, a;
	// remove duplicates ids from the array and slice it - maximum 32 ids for each request are supported
	list_ids = removeDuplicates(list_ids).slice(0, 32);
	if (list_ids.length === 1) return;
	cmb = combinatorics.combination(list_ids, 2); // create ids permutation
	// and add them to redis
	cmb.forEach(function(a){
		if (a[0] !== a[1]){
			var key = a[0]+" && "+a[1];
			redisClient.exists(key, function(err, reply) {
			    if (reply === 1) {
			    	// do nothing
			    } else {
			    	streams.forEach(function(stream){
				
						stream.write("ENGAGEMENT "+key+'\n'); 
					});
			    }
			});
			// store and set or reset TTL
			redisClient.hmset(key, {'timestamp': new Date().getTime()}, redis.print);
			redisClient.expire(key, 10); // expires in 5 minutes
		}
	});
	res.json({success: true, message: 'IDs added to Redis'});
}

var removeDuplicates = function(a) {
    var seen = {};
    return a.filter(function(item) {
        return seen.hasOwnProperty(item) ? false : (seen[item] = true);
    });
}
