'use strict';

/**
 * Module dependencies
 */

var fs = require('fs');
var koa = require('koa');
var koaRouter = require('koa-router');
var bodyParser = require('koa-bodyparser');
var serve = require('koa-static');
var cors = require('kcors');
var jade = require('jade');
var mount = require('koa-mount');
var request = require('request');
var thunkify = require('thunkify');
var moment = require('moment-timezone');
var admin = require('./admin');




/**
 * Load jade template files.
 */

var dropdownTemplate = fs.readFileSync(__dirname + '/dropdown.jade', 'utf8');


/**
 * Create mini-app.
 */

var app = koa();

var post = thunkify(request.post);
var get = thunkify(request.get);


module.exports = app;



/**
 * Initialize all needed middleware packages
 */

app.use(cors());
app.use(bodyParser());
var router = koaRouter();
app.use(router.routes());



/**
 * Mount other apps as middleware
 */

app.use(mount('/admin', admin));




/**
 * Publicly expose static assets.
 */

app.use(mount('/public', serve(__dirname+'/public')));





/**
 * Error handling.
 */

app.use(function *(next) {
  try {
    yield next;
  } catch(err) {
    this.status = err.status || 500;
    this.body = 'Sorry, we made a mistake.';
    this.app.emit('error', err, this);
  }
});







router.get('/dropdown', function *() {
  
  var jadeOptions = {

  };


  // Serve html to client.
  var html = jade.compile(dropdownTemplate, {
    basedir: __dirname
  })(jadeOptions);

  this.body = html;
});





/**
 * logging
 */



var port = process.env.PORT || 4000;

app.listen(port,function() {
console.log("mjk-test up and running on",port);
}
);






