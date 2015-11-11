var mongoose     = require('mongoose');
var Schema       = mongoose.Schema;

var BeaconSchema   = new Schema({
    name: String,
	beacon_id : String
});

module.exports = mongoose.model('Bear', BearSchema);
