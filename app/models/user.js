var mongoose     = require('mongoose');
var crypto	 = require('crypto');
var Schema       = mongoose.Schema;
var ObjectId	 = Schema.ObjectId;

var UserSchema   = new Schema({
	username: { type :  String, lowercase: true,  unique: true},
	password: String,
	salt: String,
	email: { type: String, unique: true},
	beacon_id: String,
	total_bounces: Number,
	encounters: [{ other_user: { type: ObjectId, ref: 'User'},
			post: { type: ObjectId, ref: 'Post'},
			timestamp: Date,
			bounces: Number}],
	posts: [{ type: ObjectId, ref: 'Post'}]
});

UserSchema.path('email').validate(function (email) {
	var emailRegex = /^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/;
   	return emailRegex.test(email);
}, 'The e-mail field cannot be empty.');

var encrypt = function(password, salt){
	crypto.pbkdf2(password, salt, parseInt(process.env.ENCITER),parseInt(process.env.ENCLENGTH), process.env.ENCHASHF,  function (err, hash) {
        		if (err) { throw err; };
			return (new Buffer(hash).toString('hex'));
      });
};

UserSchema.pre('save', function(next){
	var user = this;
	if (!user.isModified('password')) return next();
	crypto.randomBytes(128, function(err, salt){
		user.password = encrypt(user.password, salt);
		user.salt = salt;
		next();
	});
});

UserSchema.methods.comparePassword = function(candidatePass, cb){
	var match = this.password === encrypt(candidatePass, this.salt);
	cb(null, match);
};
 
module.exports = mongoose.model('User', UserSchema);
