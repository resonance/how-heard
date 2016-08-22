'use strict';

/**
 * Module dependencies
 */

var fs = require('fs');
var koa = require('koa');
var koaRouter = require('koa-router');
var bodyParser = require('koa-bodyparser');
var serve = require('koa-static');
var cors = require('koa-cors');
var jade = require('jade');
var mount = require('koa-mount');
var request = require('request');
var thunkify = require('thunkify');
var moment = require('moment-timezone');
var admin = require('./admin');
var howHeard = require('./howheard');
var constants = require('./constants');





/**
 * Load jade template files.
 */

var homeTemplate = fs.readFileSync(__dirname + '/home.jade', 'utf8');
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






/**
 * Mount admin
 */

app.use(mount('/admin', admin));
app.use(mount('/howheard', howHeard));




/**
 * Publicly expose static assets.
 */

app.use(mount('/public', serve(__dirname+'/public')));


var router = koaRouter();
app.use(router.routes());


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





/**
 * Initial incoming request from shopify app store
 * ex. https://how-heard.herokuapp.com/?shop=tuckernyc.myshopify.com
 * Redirect user to either Sign-up flow
 * or home view of app by checking DB.
 */

router.get('/', function *() {
  const exists = yield howheard.accessTokenExists(this.query.shop);
  if (!exists) {
    this.redirect('./install?shop='+this.query.shop);
    return;
  }
  
  // find store object in db
  const shop = yield howheard.findShop(this.query.shop);


  // Create jade options with default properties.
  var jadeOptions = {
    shopName: shop.companyName,
    // Needed for initializing embedded Shopify framework.
    apiKey: constants.SHOPIFY_API_KEY,

    // Leave as empty object for jade.
    connection: {},
  };


  // Serve html to client.
  var html = jade.compile(homeTemplate, {
    basedir: __dirname
  })(jadeOptions);

  this.body = html;
});





/**
 * Save new shop into DB.
 */

router.get('/install', function *() {
  // check for empty shop query???
  const shopName = this.query.shop;

  // Use `findOrCreate` in case an
  // uninstalled shop still exists
  // in the db.
  yield howheard.findOrCreate(shopName);

  const url = howheard.getAuthUrl(shopName);

  // redirects to /authenticate
  this.redirect(url);
});





/**
 * Create an auth token and
 * update shop document in DB.
 */

router.get('/authenticate', function *() {
  const token = yield howheard.fetchAuthToken(this.query);
  const shopName = this.query.shop;
  yield howheard.saveToken(token, shopName);

  const shop = yield howheard.fetchShopFromShopify(shopName, token);
  yield howheard.updateShop(shopName, shop.shop);

  yield howheard.addShopifyUninstallWebhook(shopName, token);

  this.redirect('./?shop='+shopName);
});





/**
 * Save slack webhook URL into DB.
 */

 router.post('/uninstall', function *() {
   console.log('request body', this.request.body);
   console.log('content-type', this.request.type);
   const shopName = this.request.body.domain;
   yield howheard.uninstallShop(shopName);
   this.status = 200;
});





/**
 * Initial request for iframe from checkout
 */

router.get('/initialize.js', function *() {

  this.redirect('/public/initialize.js');

});





/**
 * Read store_id from url param
 * Fetch store if available and gather dropdown list
 */

router.get('/dropdown', function *() {

  var bookArray = ["A", "B", "C"];

  var jadeOptions = {
    books: bookArray,
  };

  /*
  const crossOrigin = howHeard.makeCorsRequest();

  if(!crossOrigin) {
	console.log("CORS failure");
  }
  */



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






