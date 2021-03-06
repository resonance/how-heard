'use strict';

/**
 * Module dependencies.
 */

var monk = require('monk');
var shopifyAPI = require('shopify-node-api');
var request = require('request');
var thunkify = require('thunkify');
var moment = require('moment-timezone');
var constants = require('./constants');



/**
 * Expose public API.
 */

exports.accessTokenExists = accessTokenExists;
exports.findShop = findShop;
exports.findAllShops = findAllShops;
exports.findOrCreate = findOrCreate;
exports.getAuthUrl = getAuthUrl;
exports.fetchAuthToken = fetchAuthToken;
exports.createAppCharge = createAppCharge;
exports.saveCharge = saveCharge;
exports.checkAppChargeStatus = checkAppChargeStatus;
exports.activateAppCharge = activateAppCharge;
exports.saveActivation = saveActivation;
exports.saveToken = saveToken;
exports.fetchShopFromShopify = fetchShopFromShopify;
exports.updateShop = updateShop;
exports.addShopifyOrderCreateWebhook = addShopifyOrderCreateWebhook;
exports.updateShopWithWebhook = updateShopWithWebhook;
exports.addShopifyUninstallWebhook = addShopifyUninstallWebhook;
exports.uninstallShop = uninstallShop;
exports.findHowHeardList = findHowHeardList;
exports.updateSelections = updateSelections;
exports.addSelections = addSelections;
exports.getHowHeardList = getHowHeardList;
exports.deleteSelection = deleteSelection;
exports.fetchSavedToken = fetchSavedToken;
exports.fetchCustomerFromShopify = fetchCustomerFromShopify;
exports.findShopById = findShopById;
exports.addUserSelection = addUserSelection;
exports.updateUserSelection = updateUserSelection;
exports.findUserSelection = findUserSelection;
exports.shopifyMessageExists = shopifyMessageExists;
exports.saveShopifyMessage = saveShopifyMessage;
exports.getHowHeardSelection = getHowHeardSelection;
exports.addCustomerMetafield = addCustomerMetafield;
exports.appendHowHeardSelection = appendHowHeardSelection;
exports.appendSelectionOrder = appendSelectionOrder;
exports.fetchStoreOrders = fetchStoreOrders;
exports.fetchStoreOrdersWithDates = fetchStoreOrdersWithDates;
exports.findOrders = findOrders;
exports.findOrdersWithDates = findOrdersWithDates;


/**
 * Connect to database.
 * Be sure to grab the right config var, as they can vary for mongodb
 */

var db = monk(process.env.MONGODB_URI || 'mongodb://heroku_s9m52hz8:nlblmjp86jc4jkm2skdh7mlue5@ds013456.mlab.com:13456/heroku_s9m52hz8');
//var db = monk(process.env.MONGODB_URI || 'localhost');





/**
 * Thunkify request methods.
 */

var post = thunkify(request.post);
var get = thunkify(request.get);






// Collection name must be unique on mLab db,
// so we can't use `shops`.

var shopsCollection = db.get('howHeardShops');
var listsCollection = db.get('howHeardLists');
var selectionCollection = db.get('howHeardSelections');
var ordersCollection = db.get('howHeardOrders');





/**
 * Query DB with shop name
 * to check whether access token exists.
 *
 * @return {bool}
 * @api public
 */

function *accessTokenExists(shopName) {
  const shop = yield shopsCollection.findOne({
    companyName: shopName,
    accessToken: { $exists: true },
  });

  //  converting a value to a boolean, then inverting it, then inverting it again
  return !!shop;
}





/**
 * Find a shop by its name.
 *
 * @return {object}
 * @api public
 */

function *findShop(shopName) {
  return yield shopsCollection.findOne({ companyName: shopName });
}

/**
 * Find all shops in the db.
 *
 */


function findAllShops() {
	return new Promise(function(success, reject) {
		shopsCollection.find({}, function(err, data){
			if (err) {
				reject(err);
			} else {
				success(data);
			}
		});
	});
}



/**
 * Finds or create a shop based
 * on the given shop name.
 *
 * @return {object}
 * @api public
 */

function *findOrCreate(shopName) {
  const shop = yield findShop(shopName);
  if (shop) return shop;
  return yield shopsCollection.insert({
    companyName: shopName,
    connections: [],
  });
}





/**
 * Create a random character string.
 *
 * @return {String}
 * @api private
 */

function getRandomCode(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (var i = 0; i < 20; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}





/**
 * Generate the URL needed for
 * the OAuth flow. See
 * https://docs.shopify.com/api/authentication/oauth.
 *
 * @return {String}
 * @api public
 * Grab Key & Secret from App Admin and add as config vars in Heroku
 */

function getAuthUrl(shopName) {
  var nonce = getRandomCode(20);

  // Build config object
  var Shopify = new shopifyAPI({
    shop: shopName,
    shopify_api_key: constants.SHOPIFY_API_KEY,
    shopify_shared_secret: constants.SHOPIFY_API_SECRET,
    shopify_scope: ['read_orders', 'read_customers', 'write_customers'],
    redirect_uri: constants.HOWHEARD_PUBLIC_URL_ROOT + 'authenticate',
    nonce: nonce
  });

  // Create and return redirect URL.
  return Shopify.buildAuthURL();
}





/**
 * Continue the OAuth flow
 * by POSTing to Shopify
 * to get the auth token.
 *
 * @api public
 */

function fetchAuthToken(query) {
  return new Promise(function(resolve, reject) {

    var config = {
      code: query.code,
      hmac: query.hmac,
      shop: query.shop,
      shopify_api_key: constants.SHOPIFY_API_KEY,
      nonce: query.state,
      shopify_shared_secret: constants.SHOPIFY_API_SECRET,
      timestamp:query.timestamp
    }

    var Shopify = new shopifyAPI(config);

    Shopify.exchange_temporary_token(query, function(err, data){
      if (err) return reject(err);
      resolve(data.access_token)
    });
  });
}





/**
 * Create Recurring application charge
 * by POSTing to Shopify
 * to get confirmation_url to redirect
 * store owner to.
 *
 * @api public
 */

function *createAppCharge(shopName, token, testFlag) {

  console.log("shopName in function", shopName);
  console.log("testFlag in function", testFlag);

  var testStore = '';
  var name = '';
  var ArrayBoolean = {};
  var ArrayString = {};
  ArrayBoolean[testStore] = testFlag;
  ArrayString[name] = shopName;


  console.log("ArrayString[name]", ArrayString[name]);
  console.log("ArrayBoolean[testStore]", ArrayBoolean[testStore]);

  const options = {
    url: `https://${shopName}/admin/recurring_application_charges.json`,
	body: JSON.stringify({
      recurring_application_charge: {
        name: 'Earpiece App Monthly Charge',
        price: 5.0,
        return_url: constants.HOWHEARD_PUBLIC_URL_ROOT + 'activate?shop=' + ArrayString[name],
        trial_days: constants.HOWHEARD_TRIAL_DAYS,
        test: ArrayBoolean[testStore],
        format: 'json',
      }
    }),
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }
  };


  const responseAndBody = yield post(options);
  const response = responseAndBody[0];
  const body = responseAndBody[1];

  //console.log("CREATEAPPCHARGE API RESPONSE", response);
  //console.log("CREATEAPPCHARGE API BODY", body);


  if (response.statusCode >= 400) {
    throw Error('Failed to create app charge ' + body)
  }


  return JSON.parse(body);
}





/**
 * saveCharge
 */

function *saveCharge(id, createdAt, shopName) {
  return yield shopsCollection.findAndModify(
    { companyName: shopName },
    { $set: { charge_id: id,
              charge_created_at: createdAt,
            }
    }
  );
}





/**
 * Activate Recurring application charge
 * by POSTing to Shopify
 *
 * @api public
 */

function *checkAppChargeStatus(shopName, id, token) {

  const options = {
    url: `https://${shopName}/admin/recurring_application_charges/${id}.json`,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }
  };

  const responseAndBody = yield get(options);
  const response = responseAndBody[0];
  const body = responseAndBody[1];

  if (response.statusCode >= 400) {
    throw Error('Failed to check app charge ' + body)
    return;
  }

  return JSON.parse(body);
}





/**
 * Activate Recurring application charge
 * by POSTing to Shopify
 *
 * @api public
 */

function *activateAppCharge(shopName, id, timestamp, billingDate, token) {

  // convert values to an object for use inside JSON.stringify
  var chargeId = '';
  var timestamp = '';
  var billingDate = '';
  var name = '';
  var values = {};
  values[chargeId] = id;
  values[timestamp] = timestamp;
  values[billingDate] = billingDate;
  values[name] = shopName;

  const options = {
    url: `https://${shopName}/admin/recurring_application_charges/${id}/activate.json`,
	body: JSON.stringify({
      recurring_application_charge: {
        id: values[id],
        name: 'Earpiece App Monthly Charge',
        app_client_id: constants.HOWHEARD_APP_CLIENT_ID,
        price: 5.0,
        status: 'accepted',
        return_url: constants.HOWHEARD_PUBLIC_URL_ROOT + '?shop=' + values[name],
        billing_on: values[billingDate],
        created_at: values[timestamp],
        updated_at: values[timestamp],
        test: constants.HOWHEARD_APP_TEST,
        activated_on: null,
        trial_ends_on: null,
        canceled_on: null,
        trial_days: constants.HOWHEARD_TRIAL_DAYS,
        decorated_return_url: constants.HOWHEARD_PUBLIC_URL_ROOT + '?shop=' + values[name],
        format: 'json',
      }
    }),
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }
  };

  //console.log("ACTIVATE APP API URL", options.url);

  const responseAndBody = yield post(options);
  const response = responseAndBody[0];
  const body = responseAndBody[1];

  //console.log("ACTIVATEAPPCHARGE API RETURNED", body);

  if (response.statusCode >= 400) {
    throw Error('Failed to activate app charge ' + body)
    return;
  }

  return JSON.parse(body);
}





/**
 * saveActivation
 */

function *saveActivation(activatedOn, trialEndsOn, chargeStatus, chargeType, shopName) {
  return yield shopsCollection.findAndModify(
    { companyName: shopName },
    { $set: { charge_activated_on: activatedOn,
	          charge_trial_ends: trialEndsOn,
	          charge_status: chargeStatus,
	          charge_type: chargeType,
	        }
    }
  );
}




/**
 * Save the auth token with
 * the shop it belongs to.
 *
 * @return {object} The updated shop.
 * @api public
 */

function *saveToken(token, shopName) {
  return yield shopsCollection.findAndModify(
    { companyName: shopName },
    { $set: { accessToken: token }
    }
  );
}





/**
 * @param {String} shopName
 * @param {String} token
 * @api public
 */

function *fetchShopFromShopify(shopName, token) {
  const options = {
    url: `https://${shopName}/admin/shop.json`,
    headers: {
      'X-Shopify-Access-Token': token,
    }
  }
  const responseAndBody = yield get(options);
  const response = responseAndBody[0];
  const body = responseAndBody[1];

  //console.log("FETCHSHOPFROMSHOPIFY API RETURNED", body);

  if (response.statusCode >= 400) {
    throw Error('Failed to fetch shop ' + body)
  }

  return JSON.parse(body);
}





/**
 * @param {String} shopName
 * @param {Object} update
 * @api public
 */

function *updateShop(shopName, update, chargeStatus) {
  yield shopsCollection.update({
    companyName: shopName,
  }, {
    $set: { id: update.id,
            name: update.name ,
            email: update.email,
            domain: update.domain,
            created_at: update.created_at,
            province: update.province,
            country: update.country,
            address1: update.address1,
            zip: update.zip,
            city: update.city,
            phone: update.phone,
            shop_owner: update.shop_owner,
            plan_display_name: update.plan_display_name,
            myshopify_domain: update.myshopify_domain,
            iana_timezone: update.iana_timezone,
            charge_status: chargeStatus,
          }
  });

}





/**
 * Adds an orderCreate webhook. This Shopify webhook
 * fires whenever an order is placed for the store
 * @param {String} shopName
 * @param {String} token
 * @api public
 */

function *addShopifyOrderCreateWebhook(shopName, token) {

  // convert shopName to an object for use inside JSON.stringify
  var name = '';
  var shopObj = {};
  shopObj[name] = shopName;

  const options = {
    url: `https://${shopName}/admin/webhooks.json`,
    body: JSON.stringify({
      webhook: {
        topic: 'orders/create',
        address: constants.HOWHEARD_PUBLIC_URL_ROOT+'messages/' + shopObj[name] + '/orderCreate',
        format: 'json',
      }
    }),
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }
  };


  // Post returns an array [response, body]
  const responseAndBody = yield post(options);
  const response = responseAndBody[0];
  const body = responseAndBody[1];

  if (response.statusCode >= 400) {
    throw Error('Failed to set orderCreate webhook ' + response.body);
  }

  return JSON.parse(body);
}





/**
 * Saves webhook details in db
 *
 * @param {String} shopName
 * @api public
 */

function *updateShopWithWebhook(shopName, update) {

  const shopifyEvent = 'orderCreate';

  yield shopsCollection.findAndModify({
    companyName: shopName,
  }, {
    $set: { connections: update }
  });
}





/**
 * Adds an uninstall webhook. This Shopify webhook
 * fires when a shop uninstalls our app.
 *
 * @param {String} shopName
 * @param {String} token
 * @api public
 */

function *addShopifyUninstallWebhook(shopName, token) {
  const options = {
    url: `https://${shopName}/admin/webhooks.json`,
    body: JSON.stringify({
      webhook: {
        topic: 'app/uninstalled',
        address: constants.HOWHEARD_PUBLIC_URL_ROOT+'uninstall',
        format: 'json',
      }
    }),
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }
  };

  // Post returns an array [response, body]
  const responseAndBody = yield post(options);
  const response = responseAndBody[0];

  if (response.statusCode >= 400) {
    throw Error('Failed to set uninstall webhook ' + response.body);
  }
}





/**
 * Uninstall shop by removing its access and slack token
 * and clearing connections.
 *
 * @return {object} The updated shop
 * @api public
 */

 function *uninstallShop(shopName) {
  return yield shopsCollection.findAndModify({
    companyName: shopName,
  }, {
    $unset: { accessToken: "",
              charge_id: "",
			  charge_type: "",
			  charge_status: "",
			  charge_created_at: "",
			  charge_activated_on: "",
			  charge_trial_ends: "",
			  charge_canceled_on: "",
            },
    $set: { connections: [] },
  });
 }






/**
 * See if How Heards already exist for the store
 *
 * @return {object}
 * @api public
 */

function *findHowHeardList(shopName) {
  const list = yield listsCollection.findOne({ companyName: shopName });

  //  converting a value to a boolean, then inverting it, then inverting it again
  return !!list;
}





/**
 * See if How Heards already exist for the store
 *
 * @return {object}
 * @api public
 */

function *getHowHeardList(shopName) {
  return yield listsCollection.findOne({ companyName: shopName });
}





/**
 * @param {String} shopName
 * @param {array} selectionsArray
 * @api public
 */

function *updateSelections(shopName, selectionsArray) {
// can we update only if unique?
// what does 'issued' mean?
// what does the 'coupon' document look like?

  yield listsCollection.update({
      companyName: shopName
    }, {
      $addToSet: { selections: {$each: selectionsArray } },
  });


}





/**
 * @param {String} shopName
 * @param {array} selectionsArray
 * @api public
 */

function *addSelections(shopName, selectionsArray, insert) {

  yield listsCollection.insert({
      companyName: shopName,
      selections: selectionsArray,
    }, {
      $set: insert,
  });

}





/**
 * Delete How Heard selection
 *
 * @return {object} The updated shop
 * @api public
 */

function *deleteSelection(shopName, selectionChoice) {

  return yield listsCollection.findOneAndUpdate({
    companyName: shopName,
  }, {
    $pull: { selections: selectionChoice },
  });

 }





/**
 * Get the shopify API token for the shop
 *
 * @return {object} The updated shop
 * @api public
 */

function *fetchSavedToken(shopName) {
  return yield shopsCollection.findOne({ companyName: shopName });

}





/**
 * @param {String} email
 * @param {String} token
 * @api public
 */

function *fetchCustomerFromShopify(email, shopName, token) {
  const options = {
    url: `https://${shopName}/admin/customers/search.json?query=email:${email}`,
    headers: {
      'X-Shopify-Access-Token': token,
    }
  }

  const responseAndBody = yield get(options);
  const response = responseAndBody[0];
  const body = responseAndBody[1];

  //console.log("SHOPIFY API URL", options.url);
  //console.log("SHOPIFY API RETURNED", body);


  if (response.statusCode >= 400) {
    throw Error('Failed to fetch customer ' + body)
  }

  return JSON.parse(body);
}





/**
 * Find a shop by its id
 *
 * @return {object}
 * @api public
 */

function *findShopById(storeId) {
  return yield shopsCollection.findOne({ id: storeId });
}





/**
 * See if user selection exists
 */

function *findUserSelection(shopName, custId) {
  const userSelection = yield selectionCollection.findOne(
	{
		companyName: shopName,
		customerId: custId
	});

  //  converting a value to a boolean, then inverting it, then inverting it again
  return !!userSelection;
}





/**
 * @param {String} shopName
 * @param {Int} custId
 * @param {String} choice
 * @api public
 */

function *addUserSelection(shopName, custId, choice) {

  yield selectionCollection.insert(
	{
      companyName: shopName,
      customerId: custId,
      selection: choice,
    });

}





/**
 * @param {String} shopName
 * @param {Int} custId
 * @param {String} choice
 * @api public
 */

function *updateUserSelection(shopName, custId, choice) {

	  yield selectionCollection.update(
		{
	      companyName: shopName,
	      customerId: custId
	    }, {
	      $set: { selection: choice },
	  });
}





/**
 * Query DB with shop name and message orderName
 * to check whether message exists.
 *
 * @return {bool}
 * @api public
 */

function *shopifyMessageExists(shopName, orderNumber) {
  const shop = yield ordersCollection.findOne({
    companyName: shopName,
    orderNumber: orderNumber,
  });
  return !!shop;
}





/**
 * Query documents with shopName, then
 * push message object into 'messages' array.
 * Pass doc as argument into resolve callback.
 *
 * @return {object} The updated shop document.
 * @api public
 */

function *saveShopifyMessage(shopName, shopifyMessage) {

  // Create a new document for every order
  return yield ordersCollection.insert({
    companyName: shopName,
    orderId: shopifyMessage.orderId,
    orderEmail: shopifyMessage.orderEmail,
    createdAt: shopifyMessage.orderCreatedAt,
    subtotalPrice: shopifyMessage.orderSubtotalPrice,
    referringSite: shopifyMessage.orderReferringSite,
    sourceUrl: shopifyMessage.orderSourceUrl,
    orderNumber: shopifyMessage.orderNumber,
    customerId: shopifyMessage.customerId,
    customerEmail: shopifyMessage.customerEmail,
    customerCreatedAt: shopifyMessage.customerCreatedAt,
    customerFirstName: shopifyMessage.customerFirstName,
    customerLastName: shopifyMessage.customerLastName,
    customerOrdersCount: shopifyMessage.customerOrdersCount,
    customerTotalSpent: shopifyMessage.customerTotalSpent,
    customerLastOrderId: shopifyMessage.customerLastOrderId,
    customerCompany: shopifyMessage.customerCompany,
    customerAddress1: shopifyMessage.customerAddress1,
    customerAddress2: shopifyMessage.customerAddress2,
    customerCity: shopifyMessage.customerCity,
    customerProvince: shopifyMessage.customerProvince,
    customerCountry: shopifyMessage.customerCountry,
    customerZipCode: shopifyMessage.customerZipcode,
    customerProvinceCode: shopifyMessage.customerProvinceCode,
    customerCountryName: shopifyMessage.customerCountryName,
  });
}





/**
 * Fetch how heard selection for customer
 *
 * @return {object}
 * @api public
 */

function *getHowHeardSelection(shopName, custId) {
  return yield selectionCollection.findOne({
	  companyName: shopName,
      customerId: custId
  });
}





/**
 * Add a metafield for new customers for the store
 * @api public
 */

function *addCustomerMetafield(shopName, custId, choice, token) {

  // convert choice to an object for use inside JSON.stringify
  var chosen = '';
  var selection = {};
  selection[chosen] = choice;

  const options = {
    url: `https://${shopName}/admin/customers/${custId}/metafields.json`,
    body: JSON.stringify({
      metafield: {
        namespace: 'Acquisition',
        key: 'How Customer Heard About Us',
        value: selection[chosen],
        value_type: 'string'
      }
    }),
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }
  };

  //console.log("URL for webhook", options.url);
  //console.log("JSON.stringify body", options.body);


  // Post returns an array [response, body]
  const responseAndBody = yield post(options);
  const response = responseAndBody[0];
  const body = responseAndBody[1];

  //console.log("SHOPIFY API METAFIELD", body);
  //console.log("SHOPIFY WEBHOOK VAR", selection[chosen]);
  //console.log("SHOPIFY WEBHOOK URL", options.url);


  if (response.statusCode >= 400) {
    throw Error('Failed to create customer metafield ' + response.body);
  }

  return JSON.parse(body);

}





/**
 * Update message with metafieldId and customer's choice
 * @api public
 */

function *appendHowHeardSelection(shopName, custId, metafieldId) {

  yield selectionCollection.update({
      companyName: shopName,
      customerId: custId
    }, {
      $set: { confirmationId: metafieldId },
  });
	// change to int or string
	//console.log("CONFIRMATION ID", metafieldId);

}





/**
 * Update message with metafieldId and customer's choice
 * @api public
 */

function *appendSelectionOrder(orderId, choice) {

  yield ordersCollection.update({
      orderId: orderId
    }, {
      $set: { howHeard: choice },
  });


}





/**
 * Fetch orders for a shop
 *
 * @return {object} The updated orders
 * @api public
 */

function *fetchStoreOrders(shopName) {
  return yield ordersCollection.find({
	  companyName: shopName
	},
    {
		sort: { createdAt : -1 }
    });

}






/**
 * Fetch orders for a shop
 *
 * @return {object} The updated orders
 * @api public
 */

function *fetchStoreOrdersWithDates(shopName, fromUtcTime, toUtcTime) {
  return yield ordersCollection.find({
	  companyName: shopName,
	  createdAt : {$gte: fromUtcTime, $lt: toUtcTime}
	},
    {
		sort: { createdAt : -1 }
    });

}

/**
 * Find all orders for a shop
 *
 */

function findOrders(shopName) {
	return new Promise(function(success, reject) {
		ordersCollection.find({ companyName: shopName}, { sort: { createdAt : -1 } }, function(err, data){
			if (err) {
				reject(err);
			} else {
				success(data);
			}
		});
	});
}



/**
 * Find orders for a shop
 *
 */

function findOrdersWithDates(shopName, fromUtcTime, toUtcTime) {
  return new Promise(function(success, reject) {
    ordersCollection.find({companyName: shopName, createdAt : {$gte: fromUtcTime, $lt: toUtcTime}}, {sort: { createdAt : -1 }}, function(err, data){
      if (err) {
        reject(err);
      } else {
        success(data);
      }
    });
  });
}
