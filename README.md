Read checkout.id on the payment_method step of checkout.
- Need to import css class for the dropdown from checkout

Create admin for shops to construct their howHeard list (CRUD)
- Add "From A Friend" as a default
- Delete option
- Proper case the howHeard list when inserting into db

Ping Shopify API to see if customer is new. If new, show the dropdown (pass email address along in route?).

When customer selects an option from the dropdown (.change() in jquery), save it to the database.

Ping Shopify API to save the option in a metafield (https://help.shopify.com/api/reference/metafield#create).




Authentication steps:

“/“
  if ! slackify.accessTokenExists
    “/install”
      slackify.findOrCreate
      slackify.getAuthUrl
	shopify.buildAuthURL (shopify-node-api)
	“/authenticate”
	  slackify.fetchAuthToken
	  slackfiy.saveToken
	  slackify.fetchShopFromShopify
	  slackify.updateShop
	  slackify.addShopifyUninstallWebhook
	    “/“
	
	
	“/connections”
      slackify.makeHTTPRequest


