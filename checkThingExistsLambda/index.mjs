import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { IoTClient, DescribeThingCommand } from "@aws-sdk/client-iot";
import { createRemoteJWKSet, jwtVerify } from "jose";


export const handler = async (event, context, callback) => {

  let company = "";

  const thingName = event.pathParameters?.thingName || 
                    event.queryStringParameters?.thingName;
  const authToken = event.headers?.Authorization?.replace('Bearer ', '') || 
                    event.headers?.authorization?.replace('Bearer ', '');
  const region = process.env.AWS_REGION; 
  const userPoolId = process.env.USER_POOL_ID;

  console.log(JSON.stringify(event, 2));

  const accountId = context.invokedFunctionArn.split(":")[4];

  if (!thingName) {
    console.log('Thing name unavailable; exiting...');
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      },
      body: JSON.stringify({ 
          error: 'Unauthorized',
          message: 'Thing name unavailable'
      })
    };
  }

  if (!idToken) {
    console.log('Received undefined user JWT token; exiting...');
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      },
      body: JSON.stringify({ 
          error: 'Unauthorized',
          message: 'Invalid or expired token'
      })
    };
  }

  const decodedUserToken = await getDecodedUserToken(region, userPoolId, idToken);

  if (!decodedUserToken) {
    console.log('User JWT token decoding failed; exiting...');
    callback(null, {
      allowProvisioning: false
    });
  }

  company = toKebabCase(decodedUserToken["custom:Company"]);

  if (!company) {
    console.log('Company not found in user JWT token; exiting...');
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      },
      body: JSON.stringify({ 
          error: 'Unauthorized',
          message: 'Company not found in user JWT token'
      })
    };
  }

  const checkResponse = await thingAlreadyExists(region, thingName, company);

  if (checkResponse.exists) {
    console.log('Thing already exists in a different company; exiting...');
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      },
      body: JSON.stringify({
        error: 'ok',
        message: (checkResponse.sameCompany) ? 
          'Thing has already been registered in your company' :
              'Thing has already been registered in a company different from yours'
      })
    };
  } else {
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      },
      body: JSON.stringify({
        error: 'Not found',
        message: 'Thing has not been registered yet'  
      })
    };
  }
     
};

// HELPER FUNCTIONS

async function getDecodedUserToken(reg, userPoolId, token) {

  const JWKS_URI = `https://cognito-idp.${reg}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  const jwks = createRemoteJWKSet(new URL(JWKS_URI));

  try {
    console.log('Decoding user JWT token...');
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ["RS256"],
    });
    return payload;
  } catch (err) {
    console.error("JWT token decoding failed:", err);
    return null;
  }

}

// TO DO: share this function with other lambdas
async function thingAlreadyExists(reg, thingName, company) {
  try {
    const client = new IoTClient({
      reg
    });
    const input = {
      thingName,
      attributes: {
      "custom:Company": company
    }};
    const command = new DescribeThingCommand(input);
    const response = await client.send(command);
    return {
      exists: true,
      sameCompany: response.attributes["custom:Company"] === company
    };
  } catch(e) {
    return {
      exists: false,
      sameCompany: false
    };
  }
}

function toKebabCase(input) {
  return (input || "")
      .trim() // Remove leading and trailing spaces
      .toLowerCase() // Convert to lowercase
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
      .replace(/ /g, '-'); // Replace spaces with minus character
}