import {
  errorApiResponse,
  getDecodedUserToken,
  successApiResponse,
  thingAlreadyExists,
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js'; 


export const handler = async (event) => {

  validateEnvironmentVariables([
    'AWS_REGION',
    'USER_POOL_ID'
  ]);

  const stage = event.requestContext?.stage;
  const thingName = event.pathParameters?.thingName;
  const authToken = event.headers?.Authorization;
  const region = process.env.AWS_REGION; 
  const userPoolId = process.env.USER_POOL_ID;

  if (!thingName) {

    console.error('Thing name unavailable; exiting...');

    return errorApiResponse(
      stage,
      'Missing or invalid thing name',
      403
    );

  }

  if (!authToken) {

    console.error(`Cannot retrieve logged user's JWT token; exiting...`);

    return errorApiResponse(
      stage,
      'Authentication token not found',
      401
    );

  }

  const decodedUserToken = await getDecodedUserToken(
    region, userPoolId, authToken
  );

  if (!decodedUserToken) {

    console.error('User JWT token decoding failed; exiting...');

    return errorApiResponse(
      stage,
      'Failed to decode user JWT token',
      500
    );

  }

  const company = decodedUserToken["custom:Company"];

  if (!company) {

    console.error(`Company not found in logged user's JWT token; exiting...`);

    return errorApiResponse(
      stage,
      `Company information not found in logged user's JWT token`,
      403
    );

  }

  const checkResponse = await thingAlreadyExists(region, thingName, company);

  if (checkResponse === null) {

    console.error('Failed to check if thing exists; exiting...');

    return errorApiResponse(
      stage,
      'Failed to check if thing exists in IoT registry',
      500
    );

  }

  if (checkResponse.exists) {

    const message = (checkResponse.sameCompany) ?
      `Thing already exists in the logged user's company "${company}"` :
      'Thing already exists in a different company';

    console.log(message);

    return successApiResponse(stage, {
      message,
      thingName,
      company: (checkResponse.sameCompany) ? company : ''
    });

  } else {

    console.log(`Thing "${thingName}" not found in IoT registry`);

    return errorApiResponse(
      stage,
      'Thing not found in IoT registry',
      404
    );

  }
     
};