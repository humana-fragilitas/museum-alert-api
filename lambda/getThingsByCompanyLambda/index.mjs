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
  
  const stage = event.requestContext?.stage;
  const authToken = event.headers?.Authorization;
  const region = process.env.AWS_REGION; 
  const userPoolId = process.env.USER_POOL_ID;

  const maxResults = parseInt(event.queryStringParameters?.maxResults || '50');
  const nextToken = event.queryStringParameters?.nextToken;
  // Note: thingTypeName filtering is not directly supported by ListThingsInThingGroup
  // You would need to implement additional filtering if this is required

  if (!authToken) {

    console.error('Received undefined user JWT token; exiting...');

    return errorApiResponse(
      stage,
      'User token unavailable',
      401
    );

  }

  const decodedUserToken = getUserInfo(event);

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

    const listResponse = await listThingsByCompanyGroup(region, company, {
      maxResults,
      nextToken
    });

    console.log(
      `Found ${listResponse.things.length} things ` +
      `for company: ${company}`
    );

    return successApiResponse(stage, {
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
      
      return successApiResponse(stage, {
        company,
        thingGroupName: `Company-Group-${company}`,
        things: [],
        totalCount: 0,
        nextToken: null,
        hasMore: false
      });
    }

    return errorApiResponse(
      stage,
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
    
    // Note: ListThingsInThingGroupCommand returns thing names only
    // If you need full thing details (attributes, etc.), you would need to
    // call DescribeThing for each thing name returned
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

// Optional: Enhanced version that fetches full thing details
async function listThingsByCompanyGroupWithDetails(region, company, options = {}) {

  const client = new IoTClient({ region });
  
  const { maxResults = 50, nextToken } = options;
  const thingGroupName = `Company-Group-${company}`;
  
  try {

    const input = {
      thingGroupName,
      maxResults: Math.min(maxResults, 250),
      ...(nextToken && { nextToken })
    };

    console.log(`Listing things in group: ${thingGroupName} with params:`, input);
    
    const command = new ListThingsInThingGroupCommand(input);
    const response = await client.send(command);
    
    const thingNames = response.things || [];
    
    // If you need full thing details, uncomment and modify the following:
    /*
    const { DescribeThingCommand } = await import('@aws-sdk/client-iot');
    
    const thingDetails = await Promise.all(
      thingNames.map(async (thingName) => {
        try {
          const describeCommand = new DescribeThingCommand({ thingName });
          const thingResponse = await client.send(describeCommand);
          
          return {
            thingName: thingResponse.thingName,
            thingTypeName: thingResponse.thingTypeName,
            thingArn: thingResponse.thingArn,
            attributes: thingResponse.attributes,
            version: thingResponse.version,
            creationDate: thingResponse.creationDate
          };
        } catch (error) {
          console.warn(`Failed to describe thing ${thingName}:`, error);
          return { thingName, error: 'Failed to fetch details' };
        }
      })
    );
    
    return {
      thingGroupName,
      things: thingDetails,
      totalCount: thingDetails.length,
      nextToken: response.nextToken
    };
    */
    
    return {
      thingGroupName,
      things: thingNames,
      totalCount: thingNames.length,
      nextToken: response.nextToken
    };

  } catch (error) {

    console.error('Error in listThingsByCompanyGroupWithDetails:', error);
    throw error;

  }

}