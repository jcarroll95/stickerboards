// @desc Main application file for the server
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const pinoHttp = require("pino-http");
const logger = require("./utils/logger");
const crypto = require("crypto");
const morgan = require('morgan');
const connectDB = require('./config/db');
const fileupload = require('express-fileupload');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const colors = require('colors');
const helmet = require('helmet');
const { xss } = require('express-xss-sanitizer');   // xss is an object, destructure it so we can call it as xss()
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const cors = require('cors');
const compression = require('compression');
// tack on middleware for admin metrics
const { performanceMiddleware } = require('./middleware/performance');
const { requestIdMiddleware } = require('./middleware/requestId');

// load environmental vars for dotenv
dotenv.config({ path: './config/config.env' });

// Connect to MongoDB (skip when running test; test manage their own in-memory DB connection)
if (process.env.NODE_ENV !== 'test') {
    connectDB();
}

// only load npm-cron jobs if not in test - if these run during test runs, the test will never finish!
if (process.env.NODE_ENV !== 'test') {
    require('./scripts/jobScheduler.js');
    console.log('Scheduled jobs initialized'.green);
}

// route files
const stickerboard = require('./routes/stickerboard');
const stick = require('./routes/stix');
const auth = require('./routes/auth');
const users = require('./routes/users');
const comments = require('./routes/comments');
const admin = require('./routes/admin');
const stickers = require('./routes/stickers');
const logEntry = require('./routes/logEntry');

// define express app
const app = express();

app.get('/healthz', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'UP',
    timestamp: new Date().toISOString()
  });
});

// Attach request IDs early so all downstream logs/metrics can include them
app.use(requestIdMiddleware);
morgan.token('request-id', (req) => req.id);

// If behind NGINX (reverse proxy), make Express respect X-Forwarded-For
app.set('trust proxy', 1);

// Use compression middleware
app.use(compression());

// Use performance middleware to track http requests
app.use(performanceMiddleware);

// Body parser middleware which lets our methods access json seed-data in req.body
// original body parser no longer needed
app.use(express.json());

// each request produces a JSON log line that includes method, url, status, responseTime, requestId, etc.
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
});

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    customProps: (req, res) => ({
      requestId: req.id,
      userId: req.user?.id,
    }),
  })
);

// setup morgan to skip noisy endpoints
const morganSkip = (req, res) => {
    // Skip noisy endpoints (adjust as needed)
    const url = req.originalUrl || '';
    if (url === '/healthz' || url === '/readyz') return true;
    // skip static assets
    if (url.startsWith('/favicon')) return true;
    if (url.startsWith('/assets/')) return true;

    return false;
};
// setup morgan to log with request id in prod, to stdout
if (process.env.NODE_ENV === 'development') {
    // Custom dev-like format to avoid double dashes when content-length is missing (e.g. 304s)
    app.use(morgan((tokens, req, res) => {
        const status = tokens.status(req, res);
        let statusColor = colors.green;
        if (status >= 500) statusColor = colors.red;
        else if (status >= 400) statusColor = colors.yellow;
        else if (status >= 300) statusColor = colors.cyan;

        const length = tokens.res(req, res, 'content-length');
        const lengthStr = length ? ` - ${length}` : '';

        return [
            tokens.method(req, res),
            tokens.url(req, res),
            statusColor(status),
            tokens['response-time'](req, res), 'ms',
            lengthStr,
            `rid=${req.id}`.grey
        ].join(' ');
    }, { skip: morganSkip }));
} else {
    // "combined" + request id appended
    app.use(
        morgan(':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms rid=:request-id', {
            skip: morganSkip,
        })
    );
}


// express xss clean middleware
app.use(bodyParser.json({limit:'1kb'}));
app.use(bodyParser.urlencoded({extended: true, limit:'1kb'}));
app.use(xss());

// rate limiting for express
const limiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 mins
    max: 1000
});
app.use(limiter);

// prevent http param pollution
app.use(hpp());

// enable cors
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));

// Cookie parser middleware
app.use(cookieParser());

// deprecated logger middleware
// app.use(logger);

// file upload for express
app.use(fileupload());

// helmet
app.use(helmet());

// mount routers
app.use('/api/v1/stickerboards', stickerboard);
app.use('/api/v1/stix', stick);
app.use('/api/v1/auth', auth);
app.use('/api/v1/auth/users', users);
app.use('/api/v1/comments', comments)
app.use('/api/v1/admin', admin);
app.use('/api/v1/stickers', stickers);
app.use('/api/v1/logs', logEntry);

app.use((req, res, next) => {
    const opts = { allowDots: true };
    if (req.body) mongoSanitize.sanitize(req.body, opts);
    if (req.params) mongoSanitize.sanitize(req.params, opts);
    if (req.headers) mongoSanitize.sanitize(req.headers, opts);
    if (req.query) mongoSanitize.sanitize(req.query, opts);
    next();
});


app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d',
    etag: true
}));

// Also serve the web build if it exists
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../web/dist'), {
        maxAge: '1y',
        etag: true,
        immutable: true
    }));
}

// Bring in idempotency error handling
const { idempotencyErrorHandler } = require('./middleware/idempotency');
app.use(idempotencyErrorHandler); // must be before main error handler

// Bring in the error wrapper
const errorHandler = require('./middleware/error');
app.use(errorHandler);

// Query Parsing setting for Express to let query work in nested functions
app.set('query parser', 'extended');

// set port to config.env value or 5000 if not present
const PORT = process.env.PORT || 5000;

// Only start the HTTP listener when this file is executed directly (not when required by test)
let server;
if (require.main === module) {
    // We'll put app.listen into a variable so we can listen for unhandled promise rejections
    server = app.listen(
        PORT,
        () => console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
    );

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
        console.log(`Error (unhandledRejection): ${err.message}`.underline.red.bold);
        // close server and exit process if this happens so app doesn't stay running
        server.close(() => process.exit(1));
    });
}

module.exports = app;
