function rateLimit(options = {}) {
  const windowMs = Number(options.windowMs || 60000);
  const max = Number(options.max || 100);

  const hits = new Map();

  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();

    let record = hits.get(key);

    if (!record || now - record.start >= windowMs) {
      record = {
        start: now,
        count: 0
      };

      hits.set(key, record);
    }

    record.count += 1;

    if (record.count > max) {
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Too many requests',
        retry_after_seconds: Math.ceil(
          (windowMs - (now - record.start)) / 1000
        )
      });
    }

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, max - record.count))
    );

    next();
  };
}

module.exports = rateLimit;
