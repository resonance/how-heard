Read checkout.id on the payment_method step of checkout.

Ping Shopify API to see if customer is new. If new, show the dropdown (pass email address along in route?).
- use checkout.email property
- GET /admin/customers/search.json?query=email:[checkout.email]
- Need to html encode email param?


When customer selects an option from the dropdown (.change() in jquery)
- create webhook to customer creation
- save it to the database.

Ping Shopify API to save the option in a metafield (https://help.shopify.com/api/reference/metafield#create).

admin reports

	
	
	“/connections”
      slackify.makeHTTPRequest




To fix:
- limit fields from shopify shop api call to insert into db
- Need to import css class for the dropdown from checkout   