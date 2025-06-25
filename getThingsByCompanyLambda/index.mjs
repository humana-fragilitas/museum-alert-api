import { IoTClient, ListThingsCommand } from '@aws-sdk/client-iot';

import {
  validateEnvironmentVariables, 
  getDecodedUserToken
} from '/opt/nodejs/shared/index.js'; 


export const handler = async (event) => {
  
  validateEnvironmentVariables([
    'AWS_REGION',
    'USER_POOL_ID'
  ]);
  
  const stage = event.requestContext?.stage;
  const authToken = event.headers?.Authorization;
  const region = process.env.AWS_REGION; 
  const userPoolId = process.env.USER_POOL_ID;

  const maxResults = parseInt(event.queryStringParameters?.maxResults || '50');
  const nextToken = event.queryStringParameters?.nextToken;
  const thingTypeName = event.queryStringParameters?.thingTypeName;

  if (!authToken) {

    console.error('Received undefined user JWT token; exiting...');

    return errorApiResponse(
      stage,
      'User token unavailable',
      401
    );

  }

  const decodedUserToken = await getDecodedUserToken(
    region,
    userPoolId,
    authToken
  );

  if (!decodedUserToken) {

    console.error('User JWT token decoding failed; exiting...');

    return errorApiResponse(
      stage,
      'Failed to decode user token',
      401
    );

  }

  const company = decodedUserToken['custom:Company'];

  if (!company) {

    console.error('Company not found in user JWT token; exiting...');

    return errorApiResponse(
      stage,
      'Company not found in user JWT token',
      400
    );

  } else {

    console.log(`Found company: ${company}`);

  }

  try {

    const listResponse = await listThingsByCompany(region, company, {
      maxResults,
      nextToken,
      thingTypeName
    });

    console.log(
      `Found ${listResponse.things.length} things ` +
      `for company: ${company}`
    );

    return successApiResponse(stage, {
      company,
      things: listResponse.things,
      totalCount: listResponse.totalCount,
      nextToken: listResponse.nextToken,
      hasMore: !!listResponse.nextToken
    });

  } catch (error) {

    console.error('Error listing things:', error);

    return errorApiResponse(
      stage,
      'Failed to list things by company',
      500,
      error.message
    );

  }

};

// Helper functions

async function listThingsByCompany(region, company, options = {}) {

  const client = new IoTClient({ region });
  
  const { maxResults = 50, nextToken, thingTypeName } = options;
  
  try {
    // Use ListThings with attribute-based filtering
    const input = {
      maxResults: Math.min(maxResults, 250), // AWS limit is 250
      nextToken,
      ...(thingTypeName && { thingTypeName })
    };

    console.log(`Listing things for company: ${company} with params:`, input);
    
    const command = new ListThingsCommand(input);
    const response = await client.send(command);
    
    console.log(
      `Raw response: Found ${response.things?.length || 0} ` +
      `total things`
    );
    
    // Filter things that belong to the specified company
    const companyThings = (response.things || []).filter(thing => {

      const thingCompany = thing.attributes?.Company;
      const matches = thingCompany === company;
      
      if (matches) {
        console.log(`✅ Thing ${thing.thingName} belongs to company ${company}`);
      }
      
      return matches;

    });

    console.log(
      `Filtered result: ${companyThings.length} ` +
      `things belong to company ${company}`
    );

    // Transform the response to include only relevant information
    const transformedThings = companyThings.map(thing => ({
      thingName: thing.thingName,
      thingTypeName: thing.thingTypeName,
      thingArn: thing.thingArn,
      attributes: thing.attributes,
      version: thing.version,
      creationDate: thing.creationDate
    }));

    return {
      things: transformedThings,
      totalCount: companyThings.length,
      nextToken: response.nextToken,
      rawTotalCount: response.things?.length || 0
    };

  } catch (error) {

    console.error('Error in listThingsByCompany:', error);
    throw error;

  }

}