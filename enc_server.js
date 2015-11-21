'use strict'

// SETUP AND CONFIG
var express = require('express');
var app = express();
var redis = require("redis");
var client = redis.createClient();
var bodyParser = require('body-parser');

// BodyParser let us get the data from a POST req
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


// ROUTER
// ===========

var router = express.Router();

router.get('/', function(req, res) {
        res.json({success: true, message: 'This is the encounter API!'});
});

router.post('encounter/', function(req, res){
	var ids = req.body.ids;
	console.log(ids);
});

app.use('/enc/api', router);

app.listen(80);