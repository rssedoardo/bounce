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
//
// NOTE: this cache should be synchronised and only store users...maybe in V2 ;)
// =============================================================================

var cache = {};
var chunk = '';

var streamEncounters = function(){
	http.get('http://rssedoardo.me:80/enc/api/stream/', function(res) {
		res.on('data', function(buf){
			
			chunk+=buf;
			var match = /\n/.exec(chunk);
			if (match) {
				data = chunk.substring(0, match.index+1);
				chunk = chunk.substring(match.index+1);
				// now parse
				data = JSON.parse(data);
				if (data._type == 'ENGAGEMENT'){
					// create array if needed
					if (!(data.value1 in cache)) cache[data.value1] = {};
					if (!(data.value2 in cache)) cache[data.value2] = {};
					// add beacon only if it's not already there
					if (!(data.value2 in cache[data.value1])) cache[data.value1][data.value2] = new Date();
					if (!(data.value1 in cache[data.value2])) cache[data.value2][data.value1] = new Date();
				} else if (data._type == 'DISENGAGEMENT'){
					// if the value1 exists in the cache and contains the value2
					// remove value2 from cache[value1]
					if (data.value1 in cache && data.value2 in cache[data.value1]){ 
						delete cache[data.value1][data.value2]
					}
					if (data.value1 in cache && Object.keys(cache[data.value1]).length == 0) delete cache[data.value1]; // remove property if needed

					// repeat for value2
					if (data.value2 in cache && data.value1 in cache[data.value2]){
						delete cache[data.value2][data.value1]
					}
					if (data.value2 in cache && Object.keys(cache[data.value2]).length == 0) delete cache[data.value2];
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
			beacon_id: beacon.id
		}, function(err, user) {
			if (err) cb(err);
			if (!user) availableBeacons.push(beacon);
			cb(null); // no user
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
	
	async.each(Object.keys(beacons), function (beacon, cb){ 
		User.findOne({
			beacon_id: beacon
		}, function(err, user) {
			if (err) cb(err);
			if (user) {
					post.subscribers.push(user.username); // subscribe to post
					bounceCounts++;
					var temp = { other_user: req.body.decoded,
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
		if (bounceCounts == 0) return res.json({success: false, bounces: bounceCounts, message: 'Post not create! No one is around'});	
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
	
	var temp = { other_user: req.body.decoded,
		post: req.body.post_id,
		timestamp: new Date(),
		bounces: parseInt(req.body.bounces) + 1};
		var bounceCounts = 0;

		async.each(Object.keys(beacons), function (beacon, cb){ 
			User.findOne({
				beacon_id: beacon
			}, function(err, user) {
				if (err) cb(err);
				if (user) {
					bounceCounts++;
					users.push(user.username); // used later for subscribing
					user.timeline.push(temp); // and update timeline
					user.save(function(err){
						console.log(err);
					});
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
	if (req.query.beacon_id in cache){
		beacons = Object.keys(cache[req.query.beacon_id]);
	} else {
		return res.json({success: true, beacons: []});
	}
	usersBeacons = [];
	async_calls = [];

	async.each(beacons, function (beacon, cb){ 
		User.findOne({
			beacon_id: beacon
		}, function(err, user) {
			if (err) cb(err);
			if (user) usersBeacons.push(beacon);
			cb(null); // no user
		});
	}, function (err){
		if (err) return console.log(err);
		res.json({ success: true, beacons: usersBeacons }); 
	});
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

// GET USER'S POSTS
router.route('/user/posts').get(function(req, res) {
		User.findOne({
			username: req.body.decoded
		}).populate('user_posts').sort({'user_posts.timestamp': 1})
		.exec(function (err, user) {
			if (err) cb(err);
			if (user) return res.json({success: true, total_bounces: user.total_bounces, user_posts: user.user_posts.reverse()});
			res.json([]);
		});
});

// GET USER'S NOTIFICATIONS
router.route('/user/posts').get(function(req, res) {
		User.findOne({
			username: req.body.decoded
		}, function(err, user){
			if (err) return console.log(err);
			if (user){
				return res.json({success: true, notifications: user.notifications});
			}
			return res.json({success: false, message: "No such user!"});
		}
});

// GET A POST
router.route('/post/get').get(function(req, res) {
	Post.findOne({
		_id: req.query.post_id
	}, function(err, post) {
			if (err) return console.log(err);
			if (post) {
				return res.json({success: true, post: post});
			}
			res.json({success: false, post: null});
	});
});

// ADD COMMENT TO A POST
router.route('/post/comment').post(function(req, res) {
	Post.findOne({
		_id: req.body.post_id
	}, function(err, post) {
			if (err) console.log(err);
			if (post) {
				post.comments.push({user: req.body.decoded, timestamp: new Date(), comment: req.body.comment})
				var notification = req.body.decoded + " added a comment to one of the posts that you follow!";
				temp = {content: notification, timestamp: new Date(), post_id: req.body.post_id};
				User.find({
					username: { $in: post.subscribers }
				}, function(err, users){
					if (users) {
						users.forEach(function(user) {
							if (user != req.body.decoded){
								user.notifications.push(temp);
								user.save();
							}	
						});
						post.save();
						return res.json({success: true, message: 'Comment added successfully!'});
					}
				});
			}
			res.json({success: false, message: 'No such a post'});
	});
});

// LIKE/DISLIKE A POST
router.route('/post/like').post(function(req, res) {
	Post.findOne({
		_id: req.body.post_id
	}, function(err, post) {
			if (err) console.log(err);
			if (post) {
				var index = post.likes.indexOf(req.body.decoded);
				if ( index == -1){
					post.likes.push(req.body.decoded);
				} else{
					post.likes.splice(index, 1)
				}
				post.save();
				return res.json({success: true, message: 'Like added/removed successfully!'});
			}
			res.json({success: false, message: 'Unable to like/dislike!'});
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
