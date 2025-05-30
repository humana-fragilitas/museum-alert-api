import { IoTClient, ListThingsCommand } from "@aws-sdk/client-iot";
import { createRemoteJWKSet, jwtVerify } from "jose";

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
  
  const authToken = event.headers?.Authorization?.replace('Bearer ', '') || 
                    event.headers?.authorization?.replace('Bearer ', '');
  const region = process.env.AWS_REGION; 
  const userPoolId = process.env.USER_POOL_ID;

  // Pagination parameters
  const maxResults = parseInt(event.queryStringParameters?.maxResults || '50');
  const nextToken = event.queryStringParameters?.nextToken;
  
  // Optional filtering parameters
  const thingTypeName = event.queryStringParameters?.thingTypeName;
  
  console.log('-EVENT:---------------');
  console.log(JSON.stringify(event, 2));
  console.log('----------------------');

  console.log('-CONTEXT:-------------');
  console.log(JSON.stringify(context, 2));
  console.log('----------------------');

  const accountId = context.invokedFunctionArn.split(":")[4];

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
        errorCode: 0, // UNAUTHORIZED
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
        errorCode: 0, // UNAUTHORIZED
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
        errorCode: 0, // UNAUTHORIZED
        message: 'Company not found in user JWT token'
      })
    };
  }

  try {
    const listResponse = await listThingsByCompany(region, company, {
      maxResults,
      nextToken,
      thingTypeName
    });

    console.log('-LIST RESPONSE:-------');
    console.log(`Found ${listResponse.things.length} things for company: ${company}`);
    console.log('----------------------');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      },
      body: JSON.stringify({
        company,
        things: listResponse.things,
        totalCount: listResponse.totalCount,
        nextToken: listResponse.nextToken,
        hasMore: !!listResponse.nextToken
      })
    };

  } catch (error) {
    console.error('Error listing things:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      },
      body: JSON.stringify({
        errorCode: 5, // GENERIC_ERROR
        message: 'Failed to list things',
        error: error.message
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

async function listThingsByCompany(region, company, options = {}) {
  const client = new IoTClient({ region });
  
  const { maxResults = 50, nextToken, thingTypeName } = options;
  
  try {
    // First approach: Use ListThings with attribute-based filtering
    const input = {
      maxResults: Math.min(maxResults, 250), // AWS limit is 250
      nextToken,
      ...(thingTypeName && { thingTypeName })
    };

    console.log(`Listing things for company: ${company} with params:`, input);
    
    const command = new ListThingsCommand(input);
    const response = await client.send(command);
    
    console.log(`Raw response: Found ${response.things?.length || 0} total things`);
    
    // Filter things that belong to the specified company
    const companyThings = (response.things || []).filter(thing => {
      const thingCompany = thing.attributes?.Company;
      const matches = thingCompany === company;
      
      if (matches) {
        console.log(`✅ Thing ${thing.thingName} belongs to company ${company}`);
      }
      
      return matches;
    });

    console.log(`Filtered result: ${companyThings.length} things belong to company ${company}`);

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

// Alternative approach using search query (if your things have predictable naming)
async function listThingsByCompanyWithQuery(region, company, options = {}) {
  const client = new IoTClient({ region });
  
  const { maxResults = 50, nextToken } = options;
  
  try {
    // Use attribute-based query (requires things to have Company attribute indexed)
    const input = {
      queryString: `attributes.Company:${company}`,
      maxResults: Math.min(maxResults, 250),
      nextToken
    };

    console.log(`Searching things with query: ${input.queryString}`);
    
    // Note: This would use SearchIndexCommand if you have fleet indexing enabled
    // For now, we'll fall back to the filtering approach above
    
    return await listThingsByCompany(region, company, options);
    
  } catch (error) {
    console.error('Error in listThingsByCompanyWithQuery:', error);
    throw error;
  }
}

// Batch processing for large datasets
async function listAllThingsByCompany(region, company, options = {}) {
  const allThings = [];
  let nextToken = options.nextToken;
  let hasMore = true;
  let batchCount = 0;
  const maxBatches = options.maxBatches || 10; // Prevent infinite loops
  
  while (hasMore && batchCount < maxBatches) {
    console.log(`Processing batch ${batchCount + 1} for company ${company}`);
    
    const batchResponse = await listThingsByCompany(region, company, {
      ...options,
      nextToken,
      maxResults: options.batchSize || 50
    });
    
    allThings.push(...batchResponse.things);
    nextToken = batchResponse.nextToken;
    hasMore = !!nextToken;
    batchCount++;
    
    console.log(`Batch ${batchCount} complete. Total things so far: ${allThings.length}`);
  }
  
  return {
    things: allThings,
    totalCount: allThings.length,
    batchesProcessed: batchCount,
    hasMore: hasMore && batchCount >= maxBatches,
    nextToken: hasMore ? nextToken : null
  };
}

function toKebabCase(input) {
  return (input || "")
    .trim() // Remove leading and trailing spaces
    .toLowerCase() // Convert to lowercase
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
    .replace(/ /g, '-'); // Replace spaces with minus character
}

// Optional: Export helper functions for testing
export { 
  listThingsByCompany, 
  listThingsByCompanyWithQuery, 
  listAllThingsByCompany,
  getDecodedUserToken,
  toKebabCase 
};