'use strict';

/**
 * Module dependencies
 */

var fs = require('fs');
var koa = require('koa');

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


