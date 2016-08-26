Read checkout.id on the payment_method step of checkout.
- Need to import css class for the dropdown from checkout

Ping Shopify API to see if customer is new. If new, show the dropdown (pass email address along in route?).
- use checkout.email property
- GET /admin/customers/search.json?query=email:[checkout.email]
- Need to html encode email param?

- customer.orders_count == 0



When customer selects an option from the dropdown (.change() in jquery), save it to the database.

Ping Shopify API to save the option in a metafield (https://help.shopify.com/api/reference/metafield#create).

admin reports

	
	
	“/connections”
      slackify.makeHTTPRequest


