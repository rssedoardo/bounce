var mongoose     = require('mongoose');
var crypto	 = require('crypto');
var Schema       = mongoose.Schema;
var ObjectId	 = Schema.ObjectId;

var PostSchema   = new Schema({
	total_bounces: Number,
    content: String,
	owner: { type: String},
	timestamp: Date,
	likes: [{ type: String, unique: true}],
	subscribers: [{ type: String, unique: true}],
	comments: [{ user: String,
			timestamp: Date,
			comment: String}]
});

var UserSchema   = new Schema({
	username: { type :  String, lowercase: true,  unique: true},
	password: String,
	salt: String,
	email: { type: String, unique: true},
	beacon_id: String,
	total_bounces: Number,
	timeline: [{ other_user: String,
			post: { type: ObjectId, ref: 'Post'},
			timestamp: Date,
			bounces: Number}],
	notifications: [{content: String, timestamp: Date, post_id: String}],
	user_posts: [{ type: ObjectId, ref: 'Post'}]
});

UserSchema.path('email').validate(function (email) {
	if (email === null || email === undefined) return false;
	var emailRegex = /^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/;
   	return emailRegex.test(email);
}, 'Invalid email');

UserSchema.path('username').validate(function (username) {
        if (username === null || username === undefined) return false;
        return (username.length > 1);
}, 'Invalid username');



var encrypt = function(password, salt, cb) {
	crypto.pbkdf2(password, salt, parseInt(process.env.ENCITER),parseInt(process.env.ENCLENGTH), process.env.ENCHASHF,  function (err, hash) {
        		if (err) cb (err, null);
			hash = new Buffer(hash).toString('hex');
			return cb(null, hash); 
	});
};

UserSchema.pre('save', function(next){
	var user = this;
	var err = "";
	// some checks
	if (!user.password) err += "- Invalid password ";
	if (!user.email) err += "- Invalid email ";
	if (!user.beacon_id) err+= "- Invalid beacon id ";

	if (err !== "" ) next(new Error(err));
	

	if (!user.isModified('password')) return next();

	crypto.randomBytes(128, function(err, salt){
		salt = salt.toString('hex');
		encrypt(user.password, salt, function(err, hashedPass){
			if (err) throw err;
			user.password = hashedPass;
			user.salt = salt;
			next();
		});
	});
});

UserSchema.methods.comparePassword = function(candidatePass, cb){
	var user = this
	encrypt(candidatePass, user.salt, function(err, hashedPass){
		if (err) cb(err, null);
		var match = (user.password == hashedPass);
		cb(null, match)
	});
};
 
module.exports = mongoose.model('User', UserSchema);
module.exports = mongoose.model('Post', PostSchema);
