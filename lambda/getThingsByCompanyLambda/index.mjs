import { IoTClient, ListThingsInThingGroupCommand } from '@aws-sdk/client-iot';

import {
  validateEnvironmentVariables, 
  getUserInfo,
  errorApiResponse,
  successApiResponse
} from '/opt/nodejs/shared/index.js'; 


export const handler = async (event) => {
  
  validateEnvironmentVariables([
    'AWS_REGION',
    'USER_POOL_ID'
  ]);
  
  const authToken = event.headers?.Authorization;
  const region = process.env.AWS_REGION; 
  const userPoolId = process.env.USER_POOL_ID;

  const maxResults = parseInt(event.queryStringParameters?.maxResults || '50');
  const nextToken = event.queryStringParameters?.nextToken;

  if (!authToken) {

    console.error('Received undefined user JWT token; exiting...');

    return errorApiResponse(
      'User token unavailable',
      401
    );

  }

  const decodedUserToken = getUserInfo(event);

  if (!decodedUserToken) {

    console.error('User JWT token decoding failed; exiting...');

    return errorApiResponse(
      'Failed to decode user token',
      401
    );

  }

  const company = decodedUserToken['custom:Company'];

  if (!company) {

    console.error('Company not found in user JWT token; exiting...');

    return errorApiResponse(
      'Company not found in user JWT token',
      400
    );

  } else {

    console.log(`Found company: ${company}`);

  }

  try {

    const listResponse = await listThingsByCompanyGroup(region, company, {
      maxResults,
      nextToken
    });

    console.log(
      `Found ${listResponse.things.length} things ` +
      `for company: ${company}`
    );

    return successApiResponse({
      company,
      thingGroupName: listResponse.thingGroupName,
      things: listResponse.things,
      totalCount: listResponse.totalCount,
      nextToken: listResponse.nextToken,
      hasMore: !!listResponse.nextToken
    });

  } catch (error) {

    console.error('Error listing things:', error);

    // Handle case where thing group doesn't exist
    if (error.name === 'ResourceNotFoundException') {
      console.log(`Thing group for company ${company} not found - returning empty result`);
      
      return successApiResponse({
        company,
        thingGroupName: `Company-Group-${company}`,
        things: [],
        totalCount: 0,
        nextToken: null,
        hasMore: false
      });
    }

    return errorApiResponse(
      'Failed to list things by company',
      500,
      error.message
    );

  }

};

// Helper functions

async function listThingsByCompanyGroup(region, company, options = {}) {

  const client = new IoTClient({ region });
  
  const { maxResults = 50, nextToken } = options;
  const thingGroupName = `Company-Group-${company}`;
  
  try {

    const input = {
      thingGroupName,
      maxResults: Math.min(maxResults, 250), // AWS limit is 250
      ...(nextToken && { nextToken })
    };

    console.log(`Listing things in group: ${thingGroupName} with params:`, input);
    
    const command = new ListThingsInThingGroupCommand(input);
    const response = await client.send(command);
    
    console.log(
      `Found ${response.things?.length || 0} things ` +
      `in group ${thingGroupName}`
    );
    
    const thingNames = response.things || [];

    return {
      thingGroupName,
      things: thingNames,
      totalCount: thingNames.length,
      nextToken: response.nextToken
    };

  } catch (error) {

    console.error('Error in listThingsByCompanyGroup:', error);
    throw error;

  }

}