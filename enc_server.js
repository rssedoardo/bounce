'use strict'

// SETUP AND CONFIG
var express = require('express');
var app = express();
var redis = require("redis");
// var redisClient = redis.createClient('6370', 'encounter.czdmke.0001.usw2.cache.amazonaws.com');
var bodyParser = require('body-parser');
var morgan     = require('morgan');
var Combinatorics = require('js-combinatorics');

// BodyParser let us get the data from a POST req
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

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
	cmb = Combinatorics.combination(req.body.list_ids, 2); // create ids permutation
	// and add them to redis
	while(a = cmb.next()){
		// store with timestamp
		redisClient.hmset(a[0]+a[1], {
		    'timestamp': new Date().getTime()
		}, redis.print);
		redisClient.expire(a[0]+a[1], 300); // expires in 5 minutes
	}
	res.json({success: true, message: 'IDs added to Redis'});
});

app.use('/enc/api', router);

app.listen(80);