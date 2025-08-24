import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

import { 
  errorApiResponse,
  successApiResponse,
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js';


const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const COMPANIES_TABLE = process.env.COMPANIES_TABLE;

/**
 * Allows to write company data with partial updates,
 * supporting "companyName" and "status" fields;
 * does NOT update members array (separate endpoint needed for that).
 */
export const handler = async (event) => {
  
  validateEnvironmentVariables(['COMPANIES_TABLE']);

  const userClaims = event.requestContext?.authorizer?.claims;
  const companyId = userClaims?.['custom:Company'];
  
  if (!companyId) {
    return errorApiResponse(
      'User has no company ID associated with their account',
      404
    );
  }

  let updateData;

  try {

    updateData = JSON.parse(event.body || '{}');

  } catch {

    return errorApiResponse(
      'Invalid JSON in request body',
      400
    );

  }

  // Validate that we have at least one field to update
  const allowedFields = ['companyName', 'status'];
  const providedFields = Object.keys(updateData)
                               .filter(key => allowedFields.includes(key));
  
  if (providedFields.length === 0) {

    return errorApiResponse(
      `No valid fields provided. Allowed fields: ${allowedFields.join(', ')}`,
      400
    );

  }

  // Validate field values
  const validationError = validateUpdateFields(updateData);

  if (validationError) {

    return errorApiResponse(
      validationError,
      400,
    );

  }

  try {

    const existingCompany = await getCompanyById(companyId);

    if (!existingCompany) {
      return errorApiResponse(
        'Company not found',
        404
      );
    }

    const updateExpression = buildUpdateExpression(updateData);
    const expressionAttributeNames = buildExpressionAttributeNames(
      updateData
    );
    const expressionAttributeValues = buildExpressionAttributeValues(
      updateData
    );

    // Update the company
    const command = new UpdateItemCommand({
      TableName: COMPANIES_TABLE,
      Key: {
        companyId: { S: companyId }
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      // Ensure company exists before updating
      ConditionExpression: 'attribute_exists(companyId)',
      ReturnValues: 'ALL_NEW'
    });

    const result = await dynamoClient.send(command);
    
    // Convert DynamoDB format to regular JSON
    const updatedCompany = unmarshall(result.Attributes);

    console.log(`✅ Successfully updated company: ${companyId}`);

    return successApiResponse({
      message: 'Company updated successfully',
      company: updatedCompany,
      updatedFields: providedFields
    });

  } catch (error) {
    
    if (error.name === 'ConditionalCheckFailedException') {
      return errorApiResponse(
        'Company not found',
        404
      );
    }

    console.error('Error updating company:', error);
    
    return errorApiResponse(
      'Failed to update company',
      500,
      error.message
    );

  }
  
};

/**
 * Get company by id from DynamoDB
 */
const getCompanyById = async (companyId) => {

  try {

    const command = new GetItemCommand({
      TableName: COMPANIES_TABLE,
      Key: {
        companyId: { S: companyId }
      }
    });

    const result = await dynamoClient.send(command);
    return result.Item ? unmarshall(result.Item) : null;
    
  } catch (error) {

    console.error('Error getting company:', error);
    return null;

  }

};

/**
 * Validate update fields
 */
const validateUpdateFields = (updateData) => {

  // Validate company name
  if (updateData.companyName !== undefined) {
    if (typeof updateData.companyName !== 'string') {
      return 'Company name must be a string';
    }
    if (updateData.companyName.trim().length < 3) {
      return 'Company name must be at least 3 characters';
    }
    if (updateData.companyName.trim().length > 50) {
      return 'Company name must not exceed 96 characters';
    }
  }

  // Validate status
  if (updateData.status !== undefined) {
    const validStatuses = ['active', 'inactive', 'suspended'];
    if (!validStatuses.includes(updateData.status)) {
      return `Status must be one of: ${validStatuses.join(', ')}`;
    }
  }

  return null;

};

/**
 * Build dynamic UPDATE expression
 */
const buildUpdateExpression = (updateData) => {

  const setClauses = [];
  
  // Always update the updatedAt timestamp
  setClauses.push('#updatedAt = :updatedAt');
  
  // Add dynamic fields
  Object.keys(updateData).forEach(field => {
    if (['companyName', 'status'].includes(field)) {
      setClauses.push(`#${field} = :${field}`);
    }
  });

  return `SET ${setClauses.join(', ')}`;

};

/**
 * Build expression attribute names
 */
const buildExpressionAttributeNames = (updateData) => {

  const names = {
    '#updatedAt': 'updatedAt'
  };

  Object.keys(updateData).forEach(field => {
    if (['companyName', 'status'].includes(field)) {
      names[`#${field}`] = field;
    }
  });

  return names;

};

/**
 * Build expression attribute values
 */
const buildExpressionAttributeValues = (updateData) => {

  const values = {
    ':updatedAt': { S: new Date().toISOString() }
  };

  // Add dynamic values
  if (updateData.companyName !== undefined) {
    values[':companyName'] = { S: updateData.companyName.trim() };
  }

  if (updateData.status !== undefined) {
    values[':status'] = { S: updateData.status };
  }

  return values;

};