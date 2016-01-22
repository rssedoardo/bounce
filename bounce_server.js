// =============================================================================
// SETUP
// =============================================================================

var express    = require('express');
var app        = express();                
var fs         = require('fs');
var https      = require('https');
var http       = require('http');
var bodyParser = require('body-parser');
var morgan     = require('morgan');
var mongoose   = require('mongoose');
var jwt	       = require('jsonwebtoken');
var crypto     = require('crypto');
var env        = require('node-env-file');
var async      = require('async');

// BodyParser let us get the data from a POST req
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// load certificate and p_key
var p_key = fs.readFileSync('var/private-key.pem');
var certificate = fs.readFileSync('var/server.crt');
var server_opts = { key : p_key, cert : certificate};

// use logger
app.use(morgan('dev'));

// load env
env( __dirname +  '/.env');
// authentication setup
app.set('jwtTokenSecret', process.env.JWTSECRET);

// =============================================================================
// DATABASE
// =============================================================================

var mongodb_uri = 'mongodb://localhost:27017/local'
mongoose.connect(mongodb_uri); // connect to our database

// Schemas
var models = require('./app/models/schemas');
var User     = mongoose.model('User');
var Post     = mongoose.model('Post');

// =============================================================================
// CACHING SYSTEM
// =============================================================================

var cache = {};

var streamEncounters = function(){
	http.get('http://rssedoardo.me:80/enc/api/stream/', function(res) {
		res.on('data', function(chunk){
			chunk = ''+chunk;
			//console.log(chunk);
			var arr = chunk.trim().split(' ');
			if (arr.length < 4){
				console.log('Unable to parse stream from the encounter server');
				
			} else if (arr[0] == 'ENGAGEMENT'){
				if (arr[1] in cache && cache[arr[1]].indexOf(arr[3]) == -1){
					cache[arr[1]].push(arr[3]);
				} else {
					cache[arr[1]] = [arr[3]];
				}
				if (arr[3] in cache && cache[arr[3]].indexOf(arr[1]) == -1){
					cache[arr[3]].push(arr[1]);
				} else {
					cache[arr[3]] = [arr[1]];
				}

			} else if (arr[0] == 'DISENGAGEMENT'){
				if (arr[1] in cache){
					index = cache[arr[1]].indexOf(arr[3]);
					if (index > -1) cache[arr[1]].splice(index, 1);
					if (cache[arr[1]].length == 0) delete cache[arr[1]]; // remove property if needed
				}
				if (arr[3] in cache){
					index = cache[arr[3]].indexOf(arr[1]);
					if (index > -1) cache[arr[3]].splice(index, 1);
					if (cache[arr[3]].length == 0) delete cache[arr[3]]; // remove property if needed
				}
			}
		});
res.on('end', function(){
	console.log('Stream closed, reconnecting...');
	streamEncounters();
});
}).on('error', function(e) {
	console.log("Got error: " + e.message + ' - reconnecting');
	streamEncounters();
});
}

streamEncounters();

// =============================================================================
// ROUTES
// =============================================================================

var router = express.Router();

// basic route
router.get('/', function(req, res) {
	res.json({ message: 'This is the Bounce API!' });   
});

// Users route
router.route('/user/register').post(function(req, res) {
	var user  = new User({
		username: req.body.username,
		password: req.body.password,
		beacon_id: req.body.beacon_id,
		email: req.body.email,
		total_bounces: 0,
		encounters: [],
		posts: []
	});

	// save and check for errors
	user.save(function(err) {
		if (err) {
			res.json({success: false, message: err.message});
		} else res.json({success: true,  message: 'User created!', username: user.username});
	});
	
});

router.route('/user/login').post(function(req, res) {
		// find the user
		User.findOne({
			username: req.body.username
		}, function(err, user) {
			if (err) throw err;
			if (!user) {
				res.json({success: false, message: "Authentication failed, user not found!"});
			} else {
				user.comparePassword( req.body.password, function(err, matched){
					if (err) throw err;
				// check that pass is right
				if (!matched){
					res.json({ success: false, message: 'Authentication failed, wrong password.' });
				} else {
					// create a token
					var token = jwt.sign(user.username, app.get('jwtTokenSecret') , {
							expiresIn: 60* 1440*365 // expires in 365 days
						});
					res.json({
						success: true,
						message: 'Enjoy your token!',
						token: token,
						beacon_id: user.beacon_id
					});
				}
			});
			}
		});
	});

router.route('/beacon/available').post(function(req, res) {
	beacons = req.body.beacons;
	availableBeacons = [];
	async_calls = [];

	async.each(beacons, function (beacon, cb){ 
		User.findOne({
			beacon_id: beacon
		}, function(err, user) {
			if (err) cb(err);
			if (user) {
				if (err) cb(err);
				if (!user) availableBeacons.push(beacons[beacon]);
				cb(null); // no user	
			}
		});
	}, function (err){
		if (err) return console.log(err);
		res.json({ success: true, beacons: availableBeacons }); 
	});
});

router.route('/beacon/cache').get(function(req, res) {
	res.json(cache);
});

router.route('/user/all').get(function(req, res) {
	User.findOne({
		username: req.query.username
	}).populate('timeline.post')
	.exec(function (err, user) {
		if (err) return console.log(err);
		res.json(user);
	});
});

// =============================================================================
// MIDDLEWARE to verify a token
// =============================================================================

router.use(function(req, res, next) {

  // check header or url parameters or post parameters for token
  var token = req.body.token || req.query.token || req.headers['x-access-token'];

  // decode token
  if (token) {

	// verifies secret and checks exp
	jwt.verify(token, app.get('jwtTokenSecret'), function(err, decoded) {      
		if (err) {
			return res.json({ success: false, message: 'Failed to authenticate token.' });    
		} else {
			// if everything is good, save to request and call next function
			req.body.decoded = decoded;    
			next();
		}
	});

} else {
	// if there is no token return an error
	return res.status(403).send({ 
		success: false, 
		message: 'No token provided.' 
	});
	
}
});

// POST CREATION
router.route('/post/create').post(function(req, res) {
	async_calls = [];
	beacons = cache[req.body.beacon_id];
	date = new Date();
	if (typeof beacons == 'undefined' || beacons == []) return res.json({success: false, message: "Unable to create the post, no people around"});
	// create initial post
	var post  = new Post({
		total_bounces: 0,
		content: req.body.content,
		timestamp: date,
		likes: [],
		subscribers: [],
		comment: []
	});
	// and bounce for the first time
	var bounceCounts = 0;

	async.each(beacons, function (beacon, cb){ 
		User.findOne({
			beacon_id: beacon
		}, function(err, user) {
			if (err) cb(err);
			if (user) {
					post.subscribers.push(user._id); // subscribe to post
					bounceCounts++;
					var temp = { other_user: user._id,
						post: post._id,
						timestamp: date,
						bounces: 1};
					user.timeline.push(temp); // and update timeline
					user.save();
					cb(null);
				} else {
				cb(null); // no user	
			}
		});
	}, function (err){
		if (err) return console.log(err);
			// update owner:
			User.findOne({
				username: req.body.decoded
			}, function(err, user) {
				if (err) throw err;
				if (user) {
					user.user_posts.push(post._id);
					user.total_bounces += bounceCounts;
					user.save();
					post.owner = user.username;
					post.total_bounces += bounceCounts;
					post.save(function(err, post){
						if (err) console.log(err)
							res.json({success: true, bounces: bounceCounts, message: "Post successfully created and bounced!"});
					});
				}
			});
		});
});

router.route('/post/bounce').post(function(req, res) {
	
	async_calls = [];
	beacons = cache[req.body.beacon_id];
	users = []

	if (typeof beacons == 'undefined' || beacons == []) return res.json({success: false, message: "Unable to bounce the post, no people around"});
	
	var temp = { other_user: req.body.other_user,
		post: req.body.post_id,
		timestamp: new Date(),
		bounces: req.body.bounces+1};
		
		var bounceCounts = 0;

		async.each(beacons, function (beacon, cb){ 
			User.findOne({
				beacon_id: beacon
			}, function(err, user) {
				if (err) cb(err);
				if (user) {
					bounceCounts++;
					users.push(user.username); // used later for subscribing
					user.timeline.push(temp); // and update timeline
					user.save();
					cb(null);
				} else {
					cb(null); // no user	
				}
			});
		}, function (err){
			if (err) return console.log(err);
				// update owner:
				User.findOne({
					username: req.body.decoded
				}, function(err, user) {
					if (err) throw err;
					if (user) {
						user.total_bounces += bounceCounts;
						user.save();
						Post.findOne({
							_id : req.body.post_id
						}, function(err, post){
							if (err) console.log(err);
							for (user in users){
								if (post.subscribers.indexOf(users[user]) == -1) post.subscribers.push(user.username);
							}
							post.total_bounces += bounceCounts;
							post.save(function(err, post){
								if (err) console.log(err);
								res.json({success: true, bounces: bounceCounts, message: "Post successfully bounced!"});
							});
						});
					}
				});
			});
});

// GET PEOPLE AROUND THE USER
router.route('/beacon/around').get(function(req, res) {
	res.json(cache[req.body.decoded]);
});

// GET USER'S TIMELINE
router.route('/user/timeline').get(function(req, res) {
	User.findOne({
		username: req.body.decoded
	}).populate('timeline.post')
	.exec(function (err, user) {
		if (err) return console.log(err);
		res.json(user.timeline.reverse());
	});
});

// =============================================================================
// REGISTER ROUTES
// =============================================================================

app.use('/api', router); // all of our routes will be prefixed with /api

// =============================================================================
// START THE SERVER
// =============================================================================

https.createServer(server_opts, app).listen(443);
console.log('Server started on port 443');
