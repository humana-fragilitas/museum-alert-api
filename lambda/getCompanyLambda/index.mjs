import { DynamoDBClient,
         GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

import { errorApiResponse,
         successApiResponse,
         validateEnvironmentVariables } from '/opt/nodejs/shared/index.js';


const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const COMPANIES_TABLE = process.env.COMPANIES_TABLE;

/**
 * Retrieves the authenticated user's Company data;
 * Company id is extracted from session JWT token (custom:Company property).
 */
export const handler = async (event) => {
  
  validateEnvironmentVariables([
    'COMPANIES_TABLE'
  ]);

  const userClaims = event.requestContext?.authorizer?.claims;
  const companyId = userClaims?.['custom:Company'];
  const userEmail = userClaims?.email;
  
  if (!userClaims) {

    console.error('Missing user claims in request context; exiting...');

    return errorApiResponse(
      'Missing or invalid authentication context',
      401
    );

  }
  
  if (!companyId) {

    return errorApiResponse(
      'User has no company associated with their account',
      404
    );

  }

  try {

    const company = await getCompanyById(companyId);
    
    if (!company) {
      return errorApiResponse(
        'Company not found',
        404
      );
    }

    const userBelongsToCompany = company.members?.some(member => 
      member.email === userEmail || member.username === userEmail
    );

    if (!userBelongsToCompany) {

      console.warn(
        `User ${userEmail} tried to access company ${companyId} ` +
        `but is not a member`
      );

      return errorApiResponse(
        'User does not belong to this company',
        403
      );

    }

    const userMembership = company.members?.find(member => 
      member.email === userEmail || member.username === userEmail
    );

    const responseData = {
      ...company,
      userRole: userMembership?.role || 'unknown',
      userJoinedAt: userMembership?.joinedAt
    };

    console.log(
      `Successfully retrieved company: ${companyId} ` +
      `for user: ${userEmail}`
    );

    return successApiResponse(responseData);

  } catch (error) {

    console.error('Error retrieving company:', error);
    
    return errorApiResponse(
      'Failed to retrieve company data',
      500,
      { error: error.message }
    );

  }

};


const getCompanyById = async (companyId) => {

  try {

    const command = new GetItemCommand({
      TableName: COMPANIES_TABLE,
      Key: {
        companyId: { S: companyId }
      }
    });

    const result = await dynamoClient.send(command);
    
    if (!result.Item) {
      return null;
    }

    return unmarshall(result.Item);
    
  } catch (error) {

    console.error('Error getting company from DynamoDB:', error);
    throw error;

  }

};
