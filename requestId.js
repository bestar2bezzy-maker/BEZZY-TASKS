const crypto = require('crypto');
module.exports = function requestId(req,res,next){ req.id = req.get('X-Request-Id') || crypto.randomUUID(); res.set('X-Request-Id', req.id); next(); };
