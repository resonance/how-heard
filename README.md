Read checkout.email on the payment_method step of checkout.

class="section section--payment-method"
$('.section.section--payment-method') on 'step=payment_method'

Ping Shopify API to see if customer is new. If new, show the dropdown (pass email address along in route).

When customer selects an option from the dropdown (.change() in jquery), save it to the database.

Ping Shopify API to save the option in a metafield (https://help.shopify.com/api/reference/metafield#create).

Create admin for shops to construct their howHeard list (CRUD)


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


