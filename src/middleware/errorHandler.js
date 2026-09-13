function notFound(req, res) {
  res.status(404).json({
    error: 'NOT_FOUND',
    request_id: req.id
  });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = Number(err.status || err.statusCode || 500);

  const body = {
    error: status >= 500 ? 'INTERNAL_ERROR' : (err.code || 'REQUEST_ERROR'),
    request_id: req.id
  };

  if (process.env.NODE_ENV !== 'production' && err.message) {
    body.message = err.message;
  }

  console.error(err);
  res.status(status).json(body);
}

module.exports = {
  notFound,
  errorHandler
};
