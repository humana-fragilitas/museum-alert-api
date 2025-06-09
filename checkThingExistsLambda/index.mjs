import { 
  toKebabCase,
  getDecodedUserToken,
  thingAlreadyExists,
  errorApiResponse,
  successApiResponse,
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js'; 


export const handler = async (event, context, callback) => {

  validateEnvironmentVariables(['USER_POOL_ID']);

  const stage = event.requestContext?.stage;
  const thingName = event.pathParameters?.thingName;
  const authToken = event.headers?.Authorization;
  const region = process.env.AWS_REGION; 
  const userPoolId = process.env.USER_POOL_ID;

  if (!thingName) {

    console.error('Thing name unavailable; exiting...');

    return errorApiResponse(
      stage,
      403,
      'MISSING_THING_NAME',
      'Missing or invalid thing name'
    );

  }

  if (!authToken) {

    console.error('Cannot retrieve logged user\'s JWT token; exiting...');

    return errorApiResponse(
      stage,
      401,
      'INVALID_TOKEN',
      'Authentication token not found'
    );

  }

  const decodedUserToken = await getDecodedUserToken(region, userPoolId, authToken);

  if (!decodedUserToken) {

    console.error('User JWT token decoding failed; exiting...');

    return errorApiResponse(
      stage,
      500,
      'TOKEN_DECODING_FAILED',
      'Failed to decode user JWT token'
    );

  }

  const company = toKebabCase(decodedUserToken["custom:Company"]);

  if (!company) {

    console.error('Company not found in logged user\'s JWT token; exiting...');

    return errorApiResponse(
      stage,
      403,
      'MISSING_COMPANY',
      'Company information not found in logged user\'s JWT token'
    );

  }

  const checkResponse = await thingAlreadyExists(region, thingName, company);

  if (checkResponse === null) {

    console.error('Failed to check if thing exists; exiting...');

    return errorApiResponse(
      stage,
      500,
      'THING_CHECK_FAILED',
      'Failed to check if thing exists in IoT registry'
    );

  }

  if (checkResponse.exists) {

    const message = (checkResponse.sameCompany) ?
      `Thing already exists in the logged user\'s company "${company}"` :
      'Thing already exists in a different company';

    console.log(message);

    // TO DO: update the frontend to handle the response
    // and display the message accordingly; this payload is passed as data: { ... }
    return successApiResponse(stage, {
      message,
      thingName,
      company: (checkResponse.sameCompany) ? company : ''
    });

  } else {

    console.log(`Thing "${thingName}" not found in IoT registry`);

    return errorApiResponse(
      stage,
      404,
      'THING_NOT_FOUND',
      'Thing not found in IoT registry'
    );

  }
     
};