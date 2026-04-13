const errorHandler = (err, req, res, next) => {
  const statusCode =
    res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  console.error(`❌ ${err.message}`);

  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

const notFound = (req, res, next) => {
  res.status(404);
  const error = new Error(`المسار مش موجود — ${req.originalUrl}`);
  next(error);
};

module.exports = { errorHandler, notFound };
