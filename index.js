'use strict';

/**
 * Module dependencies
 */

var fs = require('fs');
var koa = require('koa');
var logger = require('koa-logger');
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
 * Create mini-app.
 */

var app = koa();

var post = thunkify(request.post);
var get = thunkify(request.get);


module.exports = app;



// Add db call


/**
 * logging
 */

var port = process.env.PORT || 4000;

app.use(logger());





/**
 * See if the app is running.
 */

app.use(function *(next) {
  if (this.path === '/status') {
    this.body = 'Ok';
    return;
  }
  yield next;
});





/**
 * Favicons.
 */

app.use(function *(next) {
  if (this.path === '/favicon') {
    this.body = 'haha';
    return;
  }
  yield next;
})





/**
 * Listen to the port set and
 * log connection on success.
 */
app.listen(port,function() {
  console.log("how-heard up and running on",port);
}
);





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
 * Load jade template files.
 */

var homeTemplate = fs.readFileSync(__dirname + '/home.jade', 'utf8');
var dropdownTemplate = fs.readFileSync(__dirname + '/dropdown.jade', 'utf8');





/**
 * Initialize all needed middleware packages
 */

app.use(cors());
app.use(bodyParser());






/**
 * Mount admin
 */

app.use(mount('/admin', admin));




/**
 * Publicly expose static assets.
 */

app.use(mount('/public', serve(__dirname+'/public')));





var router = koaRouter();





app.use(router.routes());







/**
 * Initial incoming request from shopify app store
 * ex. https://how-heard.herokuapp.com/?shop=tuckernyc.myshopify.com
 * Redirect user to either Sign-up flow
 * or home view of app by checking DB.
 */

router.get('/', function *() {
	
  // if already coming from our homepage, bypass	
  if (!this.query.circuit) {
    const exists = yield howHeard.accessTokenExists(this.query.shop);
    if (!exists) {
      this.redirect('./install?shop='+this.query.shop);
      return;
    }
  }
  

  // find store object in db
  const shop = yield howHeard.findShop(this.query.shop);


  // Create jade options with default properties.
  var jadeOptions = {
    shopName: shop.companyName,
    // Needed for initializing embedded Shopify framework.
    apiKey: constants.SHOPIFY_API_KEY,

    // Leave as empty object for jade.
    choices: {},
  };


  // get existing list of howheards if available, use shopsCollection object
  const howHeardList = yield howHeard.findHowHeardList(shop.companyName);

  // if list exists, add to jadeOptions
  if (howHeardList) {
	
	const list = yield howHeard.getHowHeardList(shop.companyName);
	
	jadeOptions.choices = {
      selections: list.selections
    }
  }
  else {
	jadeOptions.choices = {
      selections: ['From A Friend', 'Other']
    }
  }
 


  // Serve html to client.
  var html = jade.compile(homeTemplate, {
    basedir: __dirname
  })(jadeOptions);

  this.body = html;
});





/**
 * User wants to delete a how heard selection
 * 
 */

router.get('/delete', function *() {
	
  const shopName = this.query.shop;
  const selectionChoice = this.query.selection;
	
	
  yield howHeard.deleteSelection(shopName, selectionChoice);

  // need to pass 'success' msg to user?

  this.redirect('./?circuit=yes&shop='+shopName);

});





/**
 * User wants to add a how heard selection
 * 
 */

router.post('/add', function *() {

  const shopName = this.request.body.shopName;

  // get store object in db
  //const shop = yield howHeard.findShop(shopName);


  // separate selections text field by \n into an array
  const selections = this.request.body.selection;
  const selectionsArray = selections.match(/[^\r\n]+/g);


  // get existing list of howheards if available, use shopsCollection object
  const howHeardList = yield howHeard.findHowHeardList(shopName);

  // if list does not exist, append 'Other'
  if (!howHeardList) {
	  selectionsArray.push("From A Friend", "Other");
	  
	  // add selections to listsCollection
	  yield howHeard.addSelections(shopName, selectionsArray);
		
  }
  else {
	
	  // update listsCollection with new selections
	  yield howHeard.updateSelections(shopName, selectionsArray);

  }

  // need to pass 'success' msg to user?

  this.redirect('./?circuit=yes&shop='+shopName);


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
  yield howHeard.findOrCreate(shopName);

  const url = howHeard.getAuthUrl(shopName);

  // redirects to /authenticate
  this.redirect(url);
});





/**
 * Create an auth token and
 * update shop document in DB.
 */

router.get('/authenticate', function *() {
  const token = yield howHeard.fetchAuthToken(this.query);
  const shopName = this.query.shop;
  yield howHeard.saveToken(token, shopName);

  const shop = yield howHeard.fetchShopFromShopify(shopName, token);
  yield howHeard.updateShop(shopName, shop.shop);

  yield howHeard.addShopifyUninstallWebhook(shopName, token);

  this.redirect('./?shop='+shopName);
});





/**
 * Save slack webhook URL into DB.
 */

 router.post('/uninstall', function *() {
   console.log('request body', this.request.body);
   console.log('content-type', this.request.type);
   const shopName = this.request.body.domain;
   yield howHeard.uninstallShop(shopName);
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
 * User instructions linked from the Shopify App Bar
 */
router.get('/instructions', function *() {
  var jadeOptions = {
    shopName: this.query.shop,
    apiKey: constants.SHOPIFY_API_KEY,
  };

  var html = jade.compile(instructionsTemplate, {
    basedir: __dirname
  })(jadeOptions);
  this.body = html;
});











