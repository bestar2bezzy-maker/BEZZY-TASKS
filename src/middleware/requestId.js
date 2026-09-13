const crypto = require('crypto');

function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];

  const id =
    typeof incoming === 'string' && incoming.trim()
      ? incoming.trim().slice(0, 100)
      : crypto.randomUUID();

  req.id = id;
  res.setHeader('X-Request-Id', id);

  next();
}

module.exports = requestId;
