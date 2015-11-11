// BASE SETUP
// =============================================================================

// call the packages we need
var express    = require('express');        // call express
var app        = express();                 // define our app using express
var bodyParser = require('body-parser');
var mongoose = require('mongoose');

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = process.env.PORT || 8080;        // set our port

// DATABASE
// =============================================================================

var mongodb_uri = 'mongodb://localhost:27017/local'
mongoose.connect(mongodb_uri); // connect to our database

// Schemas
var Beacon     = require('./app/models/beacon');

// ROUTES FOR OUR API
// =============================================================================
var router = express.Router();              // get an instance of the express Router

// middleware to use for all requests
router.use(function(req, res, next) {
    // do logging
    console.log('Something is happening. Req is: ');
	console.log(req);
    next(); // make sure we go to the next routes and don't stop here
});

// basic route
router.get('/', function(req, res) {
    res.json({ message: 'This is the Bounce API!' });   
});

// Beacons api
router.route('/beacons')

    // create a beacon
    .post(function(req, res) {
        
        var beacon = new Beacon();
        beacon.name = req.body.name;  
		beacon.beacon_id = req.body.beacon_id;  

        // save and check for errors
        beacon.save(function(err) {
            if (err)
                res.send(err);

            res.json({ message: 'Beacon created!' });
        });
        
    });


// more routes for our API will happen here

// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/api', router);

// START THE SERVER
// =============================================================================
app.listen(port);
console.log('Server started on port ' + port);
