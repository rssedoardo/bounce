'use strict'

// SETUP AND CONFIG
var express = require('express');
var app = express();
var redis = require("redis");
var redisClient = redis.createClient('6379', 'encounter.czdmke.0001.usw2.cache.amazonaws.com');
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

// ROUTER
// ===========

var router = express.Router();

router.get('/', function(req, res) {
        res.json({success: true, message: 'This is the encounter API!'});
});

router.post('/encounter', function(req, res){
	var cmb, a;
	cmb = combinatorics.combination(req.body.list_ids, 2); // create ids permutation
	// and add them to redis
	cmb.forEach(function(a){
		if (a[0] !== a[1]){
			var key = a[0]+" && "+a[1];
			// store and set or reset TTL
			redisClient.hmset(key, {'timestamp': new Date().getTime()}, redis.print);
			redisClient.expire(key, 300); // expires in 5 minutes
			// stream to the clients
			streams.forEach(function(stream){
				stream.write("ENGAGEMENT "+a[0]+" && "+a[1]); 
			});
		}
	});
	res.json({success: true, message: 'IDs added to Redis'});
});

app.get('/stream', function(req,res) { 
	var newStream = new stream.PassThrough();
	streams.push(newStream); 
	newStream.pipe(res);

	res.on('end', function() { 
		streams.splice(streams.indexOf(newStream),1); 
	}); 
}); 

app.use('/enc/api', router);

app.listen(80);