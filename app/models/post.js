var mongoose     = require('mongoose');
var Schema       = mongoose.Schema;
var ObjectId     = Schema.ObjectId;

var PostSchema   = new Schema({
        content: String,
	owner: { type: ObjectId, ref: 'User'},
	timestamp: Date,
	likes: [{ type: ObjectId, unique: true,  ref: 'User'}],
	subscribers: [{ type: ObjectId, unique: true, ref: 'User'}],
	comments: [{ user: {type: ObjectId, ref: 'User'},
			timestamp: Date,
			comment: String}]
});

module.exports = mongoose.model('Post', PostSchema);

