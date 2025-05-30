import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { IoTClient, DescribeThingCommand } from "@aws-sdk/client-iot";
import { createRemoteJWKSet, jwtVerify } from "jose";


import { 
  toKebabCase,
  getDecodedUserToken,
  thingAlreadyExists

} from '/opt/nodejs/shared/index.js'; 
/*

export enum AppErrorType {
    UNAUTHORIZED,
    FAILED_PROVISIONING_CLAIM_CREATION,
    FAILED_EXISTING_THING_CHECK,
    THING_ALREADY_EXISTS,
    THING_ALREADY_EXISTS_IN_OTHER_ORGANIZATION,
    GENERIC_ERROR
};

*/

export const handler = async (event, context, callback) => {

  let company = "";

  const thingName = event.pathParameters?.thingName || 
                    event.queryStringParameters?.thingName;
  const authToken = event.headers?.Authorization?.replace('Bearer ', '') || 
                    event.headers?.authorization?.replace('Bearer ', '');
  const region = process.env.AWS_REGION; 
  const userPoolId = process.env.USER_POOL_ID;

  console.log('-EVENT:---------------');
  console.log(JSON.stringify(event, 2));
  console.log('----------------------');

  console.log('-CONTEXT:-------------');
  console.log(JSON.stringify(context, 2));
  console.log('----------------------');

  console.log('-THING NAME:----------');
  console.log(thingName);
  console.log('----------------------');

  const accountId = context.invokedFunctionArn.split(":")[4];

  if (!thingName) {
    console.log('----------------------');
    console.log('Thing name unavailable; exiting...');
    console.log('----------------------');
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      },
      body: JSON.stringify({
          errorCode: 5, // see enum above
          message: "Thing name unavailable",
      })
    };
  }

  if (!authToken) {
    console.log('----------------------');
    console.log('Received undefined user JWT token; exiting...');
    console.log('----------------------');
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      },
      body: JSON.stringify({
        errorCode: 5, // see enum above
        message: "User token unavailable",
      })
    };
  }

  const decodedUserToken = await getDecodedUserToken(region, userPoolId, authToken);

  if (!decodedUserToken) {
    console.log('----------------------');
    console.log('User JWT token decoding failed; exiting...');
    console.log('----------------------');
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      },
      body: JSON.stringify({
        errorCode: 5, // see enum above
        message: "Failed to decode user token",
      })
    };
  }

  company = toKebabCase(decodedUserToken["custom:Company"]);

  console.log('-COMPANY:-------------');
  console.log(company);
  console.log('----------------------');

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
          errorCode: 0,
          message: 'Company not found in user JWT token'
      })
    };
  }

  const checkResponse = await thingAlreadyExists(region, thingName, company);

  console.log('-CHECK RESPONSE:------');
  console.log(checkResponse);
  console.log('----------------------');

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
        thingName,
        company: (checkResponse.sameCompany) ? company : ''
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
      }
    };
  }
     
};