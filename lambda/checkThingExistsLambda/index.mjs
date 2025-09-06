import { errorApiResponse,
         getUserInfo,
         successApiResponse,
         thingAlreadyExists,
         validateEnvironmentVariables } from '/opt/nodejs/shared/index.js'; 


export const handler = async (event) => {

  validateEnvironmentVariables([
    'AWS_REGION'
  ]);

  const thingName = event.pathParameters?.thingName;
  const authToken = event.headers?.Authorization;
  const region = process.env.AWS_REGION;

  if (!thingName) {

    console.error('Thing name unavailable; exiting...');

    return errorApiResponse(
      'Missing or invalid thing name',
      403
    );

  }

  if (!authToken) {

    console.error(`Cannot retrieve logged user's JWT token; exiting...`);

    return errorApiResponse(
      'Authentication token not found',
      401
    );

  }

  const decodedUserToken = getUserInfo(event);

  if (!decodedUserToken) {

    console.error('User JWT token decoding failed; exiting...');

    return errorApiResponse(
      'Failed to decode user JWT token',
      500
    );

  }

  const company = decodedUserToken["custom:Company"];

  if (!company) {

    console.error(`Company not found in logged user's JWT token; exiting...`);

    return errorApiResponse(
      `Company information not found in logged user's JWT token`,
      403
    );

  }

  const checkResponse = await thingAlreadyExists(region, thingName, company);

  if (checkResponse === null) {

    console.error('Failed to check if thing exists; exiting...');

    return errorApiResponse(
      'Failed to check if thing exists in IoT registry',
      500
    );

  }

  if (checkResponse.exists) {

    const message = (checkResponse.sameCompany) ?
      `Thing already exists in the logged user's company "${company}"` :
      'Thing already exists in a different company';

    console.log(message);

    return successApiResponse({
      message,
      thingName,
      company: (checkResponse.sameCompany) ? company : ''
    });

  } else {

    console.log(`Thing "${thingName}" not found in IoT registry`);

    return errorApiResponse(
      'Thing not found in IoT registry',
      404
    );

  }
     
};