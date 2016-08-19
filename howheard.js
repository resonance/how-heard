'use strict';

/**
 * Module dependencies.
 */

//var monk = require('monk');
//var shopifyAPI = require('shopify-node-api');
var request = require('request');
var thunkify = require('thunkify');
var moment = require('moment-timezone');
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
//var constants = require('./constants');



/**
 * Expose public API.
 */
exports.createCORSRequest = createCORSRequest;


//exports.findShop = findShop;
// Create the XHR object.
function createCORSRequest(method, url) {
  var xhr = new XMLHttpRequest();
  if ("withCredentials" in xhr) {
    // XHR for Chrome/Firefox/Opera/Safari.
    xhr.open(method, url, true);
  } else if (typeof XDomainRequest != "undefined") {
    // XDomainRequest for IE.
    xhr = new XDomainRequest();
    xhr.open(method, url);
  } else {
    // CORS not supported.
    xhr = null;
  }
  return xhr;
}


var url = 'https://tuckernyc-dev.myshopify.com';
var xhr = createCORSRequest('GET', url);
xhr.send();