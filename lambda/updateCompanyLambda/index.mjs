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
 * Update Company Lambda Function
 * 
 * Updates company data with partial updates - only provided fields are updated
 * Supports: companyName, status, and other company-level attributes
 * Does NOT update members array (separate endpoint needed for that)
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

  // Parse request body
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

    // Build dynamic update expression
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
 * Get company by ID
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
    if (updateData.companyName.trim().length > 96) {
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

  return null; // No validation errors

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

// ===== USAGE EXAMPLES =====

/*
API Gateway Integration:

PUT /companies/{companyId}

Path Parameters:
- companyId: UUID of the company to update

Request Body Examples:

1. Update company name only:
{
  "companyName": "New Company Name Ltd"
}

2. Update status only:
{
  "status": "inactive"
}

3. Update multiple fields:
{
  "companyName": "Updated Company Name",
  "status": "active"
}

Response Example:
{
  "statusCode": 200,
  "body": {
    "message": "Company updated successfully",
    "company": {
      "companyId": "123e4567-e89b-12d3-a456-426614174000",
      "companyName": "New Company Name Ltd",
      "status": "active",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-06-12T14:22:15.000Z",
      "ownerEmail": "owner@company.com",
      "ownerUsername": "owner@company.com",
      "memberCount": 3,
      "members": [...]
    },
    "updatedFields": ["companyName"]
  }
}

Error Response Examples:

1. Company not found:
{
  "statusCode": 404,
  "body": {
    "error": "COMPANY_NOT_FOUND",
    "message": "Company not found"
  }
}

2. Validation error:
{
  "statusCode": 400,
  "body": {
    "error": "VALIDATION_ERROR", 
    "message": "Company name must be at least 3 characters"
  }
}

Required Environment Variables:
- COMPANIES_TABLE: DynamoDB table name
- AWS_REGION: AWS region

Required IAM Permissions:
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:UpdateItem",
        "dynamodb:GetItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/companies"
    }
  ]
}
*/