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
	
  // if submitting form from our homepage, bypass	
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

	
  const howHeardList = yield howHeard.findHowHeardList(shop.companyName);


  // if list exists, add to jadeOptions
  if (howHeardList) {
	
	// get existing list of howheards if available, use shopsCollection object
	const list = yield howHeard.getHowHeardList(shop.companyName);
	
	jadeOptions.choices = {
      selections: list.selections
    }
  }
  else {
	jadeOptions.choices = {
      selections: ['From A Friend', 'Other']
    }

    console.log("NOT HOWHEARDLIST");
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


  // separate selections text field by \n into an array
  const selections = this.request.body.selection;
  const selectionsArray = selections.match(/[^\r\n]+/g);


  // see if shop has an existing how heard list in our db
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

  // ping Shopify API for Shop object
  const shop = yield howHeard.fetchShopFromShopify(shopName, token);
 
  // save shop to db
  yield howHeard.updateShop(shopName, shop.shop);

  // set createOrder webhook
  const setWebhookResponse = yield howHeard.addShopifyOrderCreateWebhook(shopName, token);

  // save shop to db
  yield howHeard.updateShopWithWebhook(shopName, setWebhookResponse.webhook);

  // set uninstall webhook
  yield howHeard.addShopifyUninstallWebhook(shopName, token);

  this.redirect('./?shop='+shopName);
});





/**
 * Save how heard webhook URL into DB.
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
 * This is the incoming request from the store's checkout
 * Fetch store if available and gather dropdown list
 */

router.get('/dropdown', function *() {

  const email = this.query.email;
  const storeId = parseInt(this.query.storeId);

  // get shopName by using storeId
  const shop = yield howHeard.findShopById(storeId);

  if (!shop) {
    return;
  }

  const shopName = shop.companyName;

  // if store does not exist in our db, exit
  if (!shopName) {
    return;
  }

  // see if store has an existing how heard list with us
  const howHeardList = yield howHeard.findHowHeardList(shopName);

  // if list does not exist, exit
  if (!howHeardList) {
    return;
  }

  const token = shop.accessToken;

  // ping Shopify API for Customer object
  const customer = yield howHeard.fetchCustomerFromShopify(email, shopName, token);

  //console.log("CUSTOMER ORDER COUNT IS ", customer.customers[0].orders_count);
  //console.log("CUSTOMER EMAIL IS ", customer.customers[0].email);

  const custId = customer.customers[0].id;

  // is customer is not new, then exit
  if (customer.customers[0].orders_count > 0) {
    return;	
  }
  
  // get store's how heard list
  const list = yield howHeard.getHowHeardList(shop.companyName);
  
  var listArray = list.selections;

  var jadeOptions = {
    selections: listArray,
    shopName: shopName,
    custId: custId,
  };

  // Serve html to client.
  var html = jade.compile(dropdownTemplate, {
    basedir: __dirname
  })(jadeOptions);

  this.body = html;

});





/**
 *
 */

router.get('/response', function *() {

  const shopName = this.query.shopName;
  const custId = this.query.custId;
  const choice = this.query.choice;

  // see if user has an existing shopName, custId pair
  const howHeardList = yield howHeard.findUserSelection(shopName, custId);

  // if pair does not exist, add it
  if (!howHeardList) {
	
	  // add selections to listsCollection
	  yield howHeard.addUserSelection(shopName, custId, choice);

  }
  else {

	  // update user selection with new choice
	  yield howHeard.updateUserSelection(shopName, custId, choice);

  }

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











