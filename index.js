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
var json2csv = require('json2csv');
var send = require('koa-send');
var admin = require('./admin');
var howHeard = require('./howheard');
var constants = require('./constants');





/**
 * Create mini-app.
 */

var app = koa();

var post = thunkify(request.post);
var get = thunkify(request.get);

var pageSize = 200;

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
    const shopName = this.query.shop;
	this.status = err.status || 500;
	this.app.emit('error', err, this);
	this.redirect('./error?shop='+shopName);
    
    //this.body = 'Sorry, we made a mistake.';

  }
});





/**
 * Load jade template files.
 */

var homeTemplate = fs.readFileSync(__dirname + '/home.jade', 'utf8');
var dropdownTemplate = fs.readFileSync(__dirname + '/dropdown.jade', 'utf8');
var reportingTemplate = fs.readFileSync(__dirname + '/reporting.jade', 'utf8');
var instructionsTemplate = fs.readFileSync(__dirname + '/instructions.jade', 'utf8');
var errorTemplate = fs.readFileSync(__dirname + '/error.jade', 'utf8');




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
	
  const exists = yield howHeard.accessTokenExists(this.query.shop);
    
  // if token does not exist, redirect to /install
  if (!exists) {
    this.redirect('./install?shop='+this.query.shop);
    return;
  }
  

  // find store object in db
  const shop = yield howHeard.findShop(this.query.shop);


  // if payment is not active, exit
  if (shop.charge_status != "activated") {
	this.redirect('./error?shop='+this.query.shop);
    return;
  }

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

  this.redirect('./?shop='+shopName);

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

  this.redirect('./?shop='+shopName);


});





/**
 * Save new shop into DB.
 * Create Auth url for user to approve our access
 */

router.get('/install', function *() {
  
  const shopName = this.query.shop;

  // Use `findOrCreate` in case an
  // uninstalled shop still exists
  // in the db.
  yield howHeard.findOrCreate(shopName);

  const url = howHeard.getAuthUrl(shopName);

  // redirect user to accept authentication, when accepted, redirects to /authenticate
  this.redirect(url);

});





/**
 * Store an auth token and
 * update shop document in DB.
 */

router.get('/authenticate', function *() {
	
  const token = yield howHeard.fetchAuthToken(this.query);
  const shopName = this.query.shop;
  
  console.log("SHOPNAME", shopName);


  yield howHeard.saveToken(token, shopName);

  // ping Shopify API for Shop object
  const shop = yield howHeard.fetchShopFromShopify(shopName, token);
 
  const shopId = shop.shop.id;

  const chargeStatus = 'pending';

  // save shop to db
  yield howHeard.updateShop(shopName, shop.shop, chargeStatus);

  // set createOrder webhook
  const setWebhookResponse = yield howHeard.addShopifyOrderCreateWebhook(shopName, token);

  // save shop to db
  yield howHeard.updateShopWithWebhook(shopName, setWebhookResponse.webhook);

  // set uninstall webhook
  yield howHeard.addShopifyUninstallWebhook(shopName, token);

  // allow Resonance and affiliates to use app for free
  const storeEmail = shop.shop.email;
  const splitEmail = storeEmail.split('@');
  const emailDomain = splitEmail[1];
  var testFlag = null;

  if ((constants.HOWHEARD_APP_TEST == true) || (emailDomain == "resonance.nyc") || (shop.shop.plan_name == "affiliate")) {
    var testFlag = true;
  } 

  // send API request to Shopify to create app charge
  const payRequest = yield howHeard.createAppCharge(shopName, token, testFlag);

  // save charge_id and created_at to db
  yield howHeard.saveCharge(payRequest.recurring_application_charge.id, payRequest.recurring_application_charge.created_at, shopName);

  // get confirmation_url from API response and then redirect store owner
  this.redirect(payRequest.recurring_application_charge.confirmation_url);

});





/**
 * Activate approved charge with Shopify
 */

router.get('/activate', function *() {

  // store owner has accepted payment, now activate payment with shopify
  const shopName = this.query.shop;

  const shop = yield howHeard.findShop(shopName);

  const timestamp = moment().format();
  const billingDate = moment().add(constants.HOWHEARD_TRIAL_DAYS, 'days').format('YYYY-MM-DD');

  // get status of app charge from shopify
  const chargeAccepted = yield howHeard.checkAppChargeStatus(shopName, shop.charge_id, shop.accessToken);

  // if store owner declined charge, exit
  if (chargeAccepted.recurring_application_charge.status != "accepted") {
	this.redirect('./error?shop='+shopName);
    return;
  }


  // send API request to Shopify to create app charge
  const activateRequest = yield howHeard.activateAppCharge(shopName, shop.charge_id, timestamp, billingDate, shop.accessToken);
  
  const chargeStatus = 'activated';

  var chargeType = '';
 

  // assign charge_type
  if (activateRequest.recurring_application_charge.test == true) {
    var chargeType = 'test';
		
  }
  else {
	var chargeType = 'paid';
  }

  // save activated_on, trial_ends_on, status, charge_type
  yield howHeard.saveActivation(activateRequest.recurring_application_charge.activated_on, activateRequest.recurring_application_charge.trial_ends_on, chargeStatus, chargeType, shopName);

  // success, redirect store owner to admin homepage
  this.redirect('./?shop='+shopName);

});





/**
 * Uninstall store
 * Don't worry about deleting app charge, shopify
 * has already deleted it
 * Just uninstall the shop from db
 */

router.post('/uninstall', function *() {
	
  //console.log('request body', this.request.body);
  //console.log('content-type', this.request.type);
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
  const fontFamily = this.query.fontFamily;
  const fontSize = this.query.fontSize;
  const fontWeight = this.query.fontWeight;
  const fontColor = this.query.fontColor;
  const textTransform = this.query.textTransform;
  const letterSpacing = this.query.letterSpacing;


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
    fontFamily: fontFamily,
    fontSize: fontSize,
    fontWeight: fontWeight,
    fontColor: fontColor,
    textTransform: textTransform,
    letterSpacing: letterSpacing,
    urlRoot: constants.HOWHEARD_PUBLIC_URL_ROOT
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
  const custId = parseInt(this.query.custId);
  const choice = this.query.choice;

  // see if user has an existing shopName, custId pair
  const userSelectionExists = yield howHeard.findUserSelection(shopName, custId);

  // if pair does not exist, add it
  if (!userSelectionExists) {
	
	  // add selections to listsCollection
	  yield howHeard.addUserSelection(shopName, custId, choice);

  }
  else {

	  // update user selection with new choice
	  yield howHeard.updateUserSelection(shopName, custId, choice);

  }

});





/**
 * Receive an orderCreate message from Shopify 
 */

router.post('/messages/:shopName/:type', function *() {
	
  const body = this.request.body;

  const sourceName = body.source_name;

  // if order is from POS, there's nothing more to do
  if (sourceName != "web") {
	this.body = 'OK'
	return;
  }


  const shopName = this.params.shopName;
  const shop = yield howHeard.findShop(shopName);
  const token = shop.accessToken;
  const custId = body.customer.id;
  const custOrderCount = parseInt(body.customer.orders_count);

  const incomingMessage = {
    orderId: body.id,
    orderEmail: body.email,
    orderCreatedAt: body.created_at,
    orderSubtotalPrice: body.subtotal_price,
    orderReferringSite: body.referring_site,
    orderSourceUrl: body.source_url,
    orderNumber: body.order_number,
    customerId: body.customer.id,
    customerEmail: body.customer.email,
    customerCreatedAt: body.customer.created_at,
    customerFirstName: body.customer.first_name,
    customerLastName: body.customer.last_name,
    customerOrdersCount: body.customer.orders_count,
    customerTotalSpent: body.customer.total_spent,
    customerLastOrderId: body.customer.last_order_id,
    customerCompany: body.customer.default_address.company,
    customerAddress1: body.customer.default_address.address1,
    customerAddress2: body.customer.default_address.address2,
    customerCity: body.customer.default_address.city,
    customerProvince: body.customer.default_address.province,
    customerCountry: body.customer.default_address.country,
    customerZipcode: body.customer.default_address.zip,
    customerProvinceCode: body.customer.default_address.province_code,
    customerCountryName: body.customer.default_address.country_name,
  };

  // Check if shop exists
  if (!shop) {
    this.body = "Shop for shopify message could not be found";
    return;
  }

  // Check if order message was already sent
  const messageExists = yield howHeard.shopifyMessageExists(shop.companyName, incomingMessage.orderNumber);
  if (messageExists) {
    console.warn('Received message that was already sent by Shopify:', this.request.body);
    this.body = 'OK'
    return;
  };

  // Save order message to db
  yield howHeard.saveShopifyMessage(shop.companyName, incomingMessage);


  // if this isn't the customer's first order, there's nothing more to do
  if (custOrderCount != 1) {
	return;
	
  }


  // see if we have a howheard for customer in order
  const custSelectionExists = yield howHeard.findUserSelection(shop.companyName, custId);


  // Check if they selected a choice, if not, set default value of "Did Not Answer"
  if (custSelectionExists) {
	
	  // get customer selection	
	  var selection = yield howHeard.getHowHeardSelection(shop.companyName, custId);

      var choice = selection.selection;    
	
  } else {
	
	  var choice = 'Did not answer';
	
  }

	
  // POST customer selection as a metafield to store
  const customerMetafield = yield howHeard.addCustomerMetafield(shop.companyName, custId, choice, token);
	
  // add selection to orderCollection document and save metafield id
  const metafieldId = customerMetafield.metafield.id;

  yield howHeard.appendHowHeardSelection(shop.companyName, custId, metafieldId);

  yield howHeard.appendSelectionOrder(body.id, choice);

  this.status = 200;

});





/**
 * User reporting in admin
 */

router.get('/reporting', function *() {
  
  const shopName = this.query.shop;
  var fromDate = 0;
  var toDate = 0;

  // find store object in db
  const shop = yield howHeard.findShop(shopName);

  // if payment is not active, exist
  if (shop.charge_status != "activated") {
	this.redirect('./error?shop='+shopName);
    return;
  }


  // if fromDate and toDate was passed in the url query
  if (this.query.fromDate && this.query.toDate) {
	
    fromDate = this.query.fromDate;
    toDate = this.query.toDate;

    // get timezone for the store
    var zone = moment.tz.zone(shop.iana_timezone);
    // get offset from UTC
    var offset = zone.parse();

    // set fromDate time to the begining of the day specified
    var fromStartOfDay = moment(fromDate).startOf("day").format();
    // convert time to UTC to query db
    var fromUtcTime = moment(fromStartOfDay).utcOffset(offset).format();

    // set toDate time to the begining of the day specified
    var toStartOfDay = moment(toDate).startOf("day").format();
    // convert time to UTC to query db
    var toUtcTime = moment(toStartOfDay).utcOffset(offset).format();

    var orders = yield howHeard.fetchStoreOrdersWithDates(shopName, fromUtcTime, toUtcTime);

  }
  else {
	var orders = yield howHeard.fetchStoreOrders(shopName);
  }


  for(var i = 0; i < orders.length; i++) {
   
    if (orders[i].createdAt) {
	  orders[i].createdAt = moment(orders[i].createdAt).tz(shop.iana_timezone).format('MM/DD/YYYY h:mm');
    }

    if (orders[i].howHeard == null) {
		orders[i].howHeard = "Repeat Customer";
   }

  }


  if (orders.length > pageSize) {
	
	var pageCount = Math.ceil(orders.length/pageSize);
	var currentPage = 1;
	var ordersArray = [];
	var arrayPosition = 0;
	var ordersList = [];
	
	// split orders into groups of length equal to pageSize
	while (orders.length > 0) {
		ordersArray.push(orders.splice(0, pageSize));
	}
	
	// set currentPage if passed in url string
	if (this.query.page) {
		currentPage = this.query.page;
	}
	
	// set the subset of order records to show
	arrayPosition = currentPage - 1;
	ordersList = ordersArray[arrayPosition];
	
	var jadeOptions = {
	  shopName: shopName,
      apiKey: constants.SHOPIFY_API_KEY,
      orders: ordersList,
	  fromDate: fromDate,
      toDate: toDate,
      currentPage: currentPage,
      pageCount: pageCount,
    };
		
  }
  else {
	
	var jadeOptions = {
      shopName: shopName,
	  apiKey: constants.SHOPIFY_API_KEY,
	  orders: orders,
	  fromDate: fromDate,
      toDate: toDate,
	  currentPage: 1,
	  pageCount: 1,
	};
	
  }

  var html = jade.compile(reportingTemplate, {
    basedir: __dirname
  })(jadeOptions);

  this.body = html;


});





/**
 * User reporting in admin
 */

router.post('/reporting', function *() {

  const shopName = this.query.shop;

  const body = this.request.body;

  const fromDate = body.fromdate;
  const toDate = body.todate;


  // find store object in db
  const shop = yield howHeard.findShop(shopName);


  // if payment is not active, exit
  if (shop.charge_status != "activated") {
	this.redirect('./error?shop='+shopName);
    return;
  }


  // get timezone for the store
  var zone = moment.tz.zone(shop.iana_timezone);
  // get offset from UTC
  var offset = zone.parse();

  // set fromDate time to the begining of the day specified
  var fromStartOfDay = moment(fromDate).startOf("day").format();
  // convert time to UTC to query db
  var fromUtcTime = moment(fromStartOfDay).utcOffset(offset).format();

  // set toDate time to the begining of the day specified
  var toStartOfDay = moment(toDate).startOf("day").format();
  // convert time to UTC to query db
  var toUtcTime = moment(toStartOfDay).utcOffset(offset).format();

  const orders = yield howHeard.fetchStoreOrdersWithDates(shopName, fromUtcTime, toUtcTime);

  for(var i = 0; i < orders.length; i++) {

    if (orders[i].createdAt) {
	  orders[i].createdAt = moment(orders[i].createdAt).tz(shop.iana_timezone).format('MM/DD/YYYY h:mm');
    }  

    if (orders[i].howHeard == null) {
		orders[i].howHeard = "Repeat Customer";
   }

  }

  if (orders.length > pageSize) {
	
	var pageCount = Math.ceil(orders.length/pageSize);
	var currentPage = 1;
	var ordersArray = [];
	var arrayPosition = 0;
	var ordersList = [];
	
	// split orders into groups of length equal to pageSize
	while (orders.length > 0) {
		ordersArray.push(orders.splice(0, pageSize));
	}
	
	// set currentPage if passed in url string
	if (this.query.page) {
		currentPage = this.query.page;
	}
	
	// set the subset of order records to show
	arrayPosition = currentPage - 1;
	ordersList = ordersArray[arrayPosition];
	
	var jadeOptions = {
	  shopName: shopName,
      apiKey: constants.SHOPIFY_API_KEY,
      orders: ordersList,
	  fromDate: fromDate,
      toDate: toDate,
      currentPage: currentPage,
      pageCount: pageCount,
    };
		
  }
  else {
	
	var jadeOptions = {
      shopName: shopName,
	  apiKey: constants.SHOPIFY_API_KEY,
	  orders: orders,
	  fromDate: 0,
      toDate: 0,
	  currentPage: 1,
	  pageCount: 1,
	};
	
  }

  var html = jade.compile(reportingTemplate, {
    basedir: __dirname
  })(jadeOptions);

  this.body = html;

});






/**
 * Orders export from reporting
 */

router.get('/export', function *() {

  const shopName = this.query.shop;  
  var fields = ['companyName', 'createdAt', 'subtotalPrice', 'orderNumber', 'customerEmail', 
                'customerFirstName', 'customerLastName', 'customerOrdersCount', 'customerTotalSpent', 
                'customerCity', 'customerProvinceCode', 'customerCountryName', 'howHeard'];

  // find store object in db
  const shop = yield howHeard.findShop(shopName);

  const orders = yield howHeard.fetchStoreOrders(shopName);

  for(var i = 0; i < orders.length; i++) {

    if (orders[i].createdAt) {

	  orders[i].createdAt = moment(orders[i].createdAt).tz(shop.iana_timezone).format('MM/DD/YYYY h:mm');							  

    }

    if (orders[i].howHeard == null) {
		orders[i].howHeard = "Repeat Customer";
   }

  }

  //console.log("ORDERS", orders);

  var csv = json2csv({ data: orders, fields: fields });

  fs.writeFile('file.csv', csv, function(err) {
	if (err) throw err;
  });
	
		
  this.set('Content-disposition', 'attachment; filename=file.csv');
  this.set('Content-type', 'text/csv');
  yield send(this, 'file.csv');
	


});




/**
 * User install instructions
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





/**
 * Error page
 */
router.get('/error', function *() {

  var jadeOptions = {
	shopName: this.query.shop,
    apiKey: constants.SHOPIFY_API_KEY,
  };
	
  var html = jade.compile(errorTemplate, {
    basedir: __dirname
  })(jadeOptions);

  this.body = html;

});
