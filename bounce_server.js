// SETUP
// =============================================================================

var express    = require('express');
var app        = express();                
var fs         = require('fs');
var https      = require('https');
var bodyParser = require('body-parser');
var morgan     = require('morgan');
var mongoose   = require('mongoose');
var jwt	       = require('jsonwebtoken');
var crypto     = require('crypto');
var env        = require('node-env-file');

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

// DATABASE
// =============================================================================

var mongodb_uri = 'mongodb://localhost:27017/local'
mongoose.connect(mongodb_uri); // connect to our database

// Schemas
var User     = require('./app/models/user');

// ROUTES
// =============================================================================
var router = express.Router();

// basic route
router.get('/', function(req, res) {
    res.json({ message: 'This is the Bounce API!' });   
});

// Users route
router.route('/user/register')

    .post(function(req, res) {
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
		if (err)
                	res.json({success: false, message: err.message});
            	res.json({success: true,  message: 'User created!', username: user.username});
        });
        
    });

router.route('/user/login')    
   
    .post(function(req, res) {
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
          					token: token
        				});
				}
			});
		}
	});
    }
);

// more routes for our API will happen here

// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/api', router);

// START THE SERVER
// =============================================================================
https.createServer(server_opts, app).listen(443);
console.log('Server started on port 443');
