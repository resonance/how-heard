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


var app = koa();

app.use(function *(){
	this.body="hi mom";
	}	
)

var port = process.env.PORT || 4000;

app.listen(port,function() {
console.log("mjk-test up and running on",port);
}
);


