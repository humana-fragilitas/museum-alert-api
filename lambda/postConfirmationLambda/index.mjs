import crypto from 'node:crypto';

import {
  AdminAddUserToGroupCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient, 
  CreateGroupCommand
} from '@aws-sdk/client-cognito-identity-provider';
import {
  DynamoDBClient,
  PutItemCommand
} from '@aws-sdk/client-dynamodb';

import {
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js'; 


const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION
});
const dynamoClient = new DynamoDBClient(
  { region: process.env.AWS_REGION }
);
const COMPANIES_TABLE = process.env.COMPANIES_TABLE;


/**
 * Lambda function to handle Cognito Post Confirmation trigger:
 * 1. creates a new Company in DynamoDB with unique id;
 * 2. updates user's custom:Company attribute with the Company id;
 * 3. creates Cognito group with Company id as name;
 * 4. adds user to the group.
 */
export const handler = async (event) => {

  validateEnvironmentVariables([
    'AWS_REGION',
    'COMPANIES_TABLE'
  ]);

  const userPoolId = event.userPoolId;
  const username = event.userName;
  const userAttributes = event.request.userAttributes;
  const userEmail = userAttributes.email;
  const companyId = crypto.randomUUID();

  let createdResources = {
    dynamoCompany: false,
    cognitoGroup: false,
    userInGroup: false,
    userAttributes: false
  };

  try {

    console.log(`Setting up company "${companyId}" for user ${userEmail}`);

    // Step 1: Create Company in DynamoDB
    // (single source of truth for company name)
    await createCompanyInDynamoDB(companyId, '', userEmail, username);
    createdResources.dynamoCompany = true;
    console.log(`✅ Created company in DynamoDB: ${companyId}`);

    // Step 2: Update user with ONLY company ID (no name stored in Cognito)
    await updateUserWithCompanyId(userPoolId, username, companyId);
    createdResources.userAttributes = true;
    console.log(`✅ Updated user with company ID: ${companyId}`);

    // Step 3: Create Cognito group without IAM role
    await createCompanyGroup(userPoolId, companyId);
    createdResources.cognitoGroup = true;
    console.log(`✅ Created Cognito group: ${companyId}`);

    // Step 4: Add user to the group
    await addUserToGroup(userPoolId, username, companyId);
    createdResources.userInGroup = true;
    console.log(`✅ Added user to group: ${companyId}`);

    console.log(
      `🎉 Successfully set up company with id ${companyId} ` + 
      `for user ${userEmail}`
    );

    return event;

  } catch (error) {

    console.error('❌ Error during company setup:', error);
    console.error('Company setup failed, but user confirmation will proceed');

    return event;

  }

};

/**
 * Create company entry in DynamoDB with conditional write for uniqueness
 */
const createCompanyInDynamoDB = async (
  companyId,
  companyName,
  ownerEmail,
  ownerUsername
) => {

  const now = new Date().toISOString();
  
  const command = new PutItemCommand({
    TableName: COMPANIES_TABLE,
    Item: {
      companyId: { S: companyId },
      companyName: { S: companyName },
      createdAt: { S: now },
      updatedAt: { S: now },
      ownerEmail: { S: ownerEmail },
      ownerUsername: { S: ownerUsername },
      memberCount: { N: '1' },
      members: {
        L: [{
          M: {
            email: { S: ownerEmail },
            username: { S: ownerUsername },
            role: { S: 'owner' },
            joinedAt: { S: now }
          }
        }]
      },
      status: { S: 'active' }
    },
    // CRITICAL: This ensures uniqueness at database level
    ConditionExpression: 'attribute_not_exists(companyId)',
    // Return the created item
    ReturnValues: 'ALL_OLD'
  });

  const result = await dynamoClient.send(command);
  return result.Attributes;

};

/**
 * Update user with only company ID - company name is stored in DynamoDB
 */
const updateUserWithCompanyId = async (userPoolId, username, companyId) => {

  const command = new AdminUpdateUserAttributesCommand({
    UserPoolId: userPoolId,
    Username: username,
    UserAttributes: [
      {
        Name: 'custom:Company',
        Value: companyId
      }
    ]
  });

  await cognitoClient.send(command);

};

/**
 * Create Cognito group without IAM role
 */
const createCompanyGroup = async (userPoolId, companyId) => {

  const command = new CreateGroupCommand({
    UserPoolId: userPoolId,
    GroupName: companyId,
    Description: `User group for company with id: ${companyId}`,
    // No RoleArn - group is for organization only
    Precedence: 100
  });

  await cognitoClient.send(command);

};

/**
 * Add user to company group
 */
const addUserToGroup = async (userPoolId, username, companyId) => {

  const command = new AdminAddUserToGroupCommand({
    UserPoolId: userPoolId,
    Username: username,
    GroupName: companyId
  });

  await cognitoClient.send(command);

};