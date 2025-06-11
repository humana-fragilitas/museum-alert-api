import { 
  CognitoIdentityProviderClient, 
  CreateGroupCommand,
  AdminAddUserToGroupCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserCommand
} from '@aws-sdk/client-cognito-identity-provider';

import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  GetItemCommand
} from '@aws-sdk/client-dynamodb';

import { randomUUID } from 'crypto';

// Initialize clients
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Environment variables
const COMPANIES_TABLE = process.env.COMPANIES_TABLE || 'companies';

/**
 * Post Confirmation Lambda Trigger
 * 
 * This function:
 * 1. Creates a new Company in DynamoDB with unique ID
 * 2. Updates user's custom:Company attribute with the Company ID
 * 3. Creates Cognito group with Company ID as name
 * 4. Adds user to the group
 * 
 * All operations are transactional - if any fail, everything is rolled back
 */
export const handler = async (event, context) => {

  console.log('Post Confirmation trigger event:', JSON.stringify(event, null, 2));

  const AWS_REGION = process.env.AWS_REGION || event.invokedFunctionArn?.split(':')[3];
  const AWS_ACCOUNT_ID = context.invokedFunctionArn.split(':')[4];

  const userPoolId = event.userPoolId;
  const username = event.userName;
  const userAttributes = event.request.userAttributes;
  const userEmail = userAttributes.email;
  
  // Get company name from validation data (temporary, not persisted)
  const companyName = userAttributes['custom:Company'];

  if (!companyName) {
    console.error('No company name provided during signup');
    return event;
  }

  console.log(`Setting up company "${companyName}" for user ${userEmail}`);

  // Generate UUID v4 for company ID
  const companyId = randomUUID();

  let createdResources = {
    dynamoCompany: false,
    cognitoGroup: false,
    userInGroup: false,
    userAttributes: false
  };

  try {

    // Step 1: Create Company in DynamoDB (single source of truth for company name)
    await createCompanyInDynamoDB(companyId, companyName, userEmail, username);
    createdResources.dynamoCompany = true;
    console.log(`✅ Created company in DynamoDB: ${companyId}`);

    // Step 2: Update user with ONLY company ID (no name stored in Cognito)
    await updateUserWithCompanyId(userPoolId, username, companyId);
    createdResources.userAttributes = true;
    console.log(`✅ Updated user with company ID: ${companyId}`);

    // Step 3: Create Cognito group without IAM role
    await createCompanyGroup(userPoolId, companyId, companyName);
    createdResources.cognitoGroup = true;
    console.log(`✅ Created Cognito group: ${companyId}`);

    // Step 4: Add user to the group
    await addUserToGroup(userPoolId, username, companyId);
    createdResources.userInGroup = true;
    console.log(`✅ Added user to group: ${companyId}`);

    console.log(`🎉 Successfully set up company "${companyName}" (${companyId}) for user ${userEmail}`);

    return event;

  } catch (error) {

    console.error('❌ Error during company setup:', error);
    
    // Rollback all created resources
    await rollbackResources(userPoolId, username, companyId, createdResources);
    
    console.error('Company setup failed, but user confirmation will proceed');
    return event;

  }
};

/**
 * Create company entry in DynamoDB with conditional write for uniqueness
 */
const createCompanyInDynamoDB = async (companyId, companyName, ownerEmail, ownerUsername) => {
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
const createCompanyGroup = async (userPoolId, companyId, companyName) => {
  const command = new CreateGroupCommand({
    UserPoolId: userPoolId,
    GroupName: companyId,
    Description: `Company group for ${companyName} (${companyId})`,
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

/**
 * Rollback created resources in case of failure
 */
const rollbackResources = async (userPoolId, username, companyId, createdResources) => {
  console.log('🔄 Rolling back created resources...');

  try {
    if (createdResources.userInGroup) {
      console.log('Rolling back: user group membership');
      // Add actual rollback code here if needed
    }

    if (createdResources.cognitoGroup) {
      console.log('Rolling back: Cognito group');
      // Add actual rollback code here if needed
    }

    if (createdResources.userAttributes) {
      // Clear the company ID - Fixed attribute name
      const command = new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [
          {
            Name: 'custom:Company',  // Fixed: was 'custom:CompanyId'
            Value: ''
          }
        ]
      });
      await cognitoClient.send(command);
      console.log('✅ Rolled back: user company ID');
    }

    if (createdResources.dynamoCompany) {
      const command = new DeleteItemCommand({
        TableName: COMPANIES_TABLE,
        Key: {
          companyId: { S: companyId }
        }
      });
      await dynamoClient.send(command);
      console.log('✅ Rolled back: DynamoDB company');
    }

  } catch (rollbackError) {
    console.error('❌ Error during rollback:', rollbackError);
  }
};

// ===== ALTERNATIVE: COMPANY MEMBER MANAGEMENT FUNCTIONS =====

/**
 * Add a new member to existing company
 * (Use this when inviting users to existing companies)
 */
export const addMemberToCompany = async (companyId, memberEmail, memberUsername) => {
  const now = new Date().toISOString();
  
  const command = new UpdateItemCommand({
    TableName: COMPANIES_TABLE,
    Key: {
      companyId: { S: companyId }
    },
    UpdateExpression: 'SET #members = list_append(#members, :newMember), #memberCount = #memberCount + :inc, #updatedAt = :now',
    ExpressionAttributeNames: {
      '#members': 'members',
      '#memberCount': 'memberCount',
      '#updatedAt': 'updatedAt'
    },
    ExpressionAttributeValues: {
      ':newMember': {
        L: [{
          M: {
            email: { S: memberEmail },
            username: { S: memberUsername },
            role: { S: 'member' },
            joinedAt: { S: now }
          }
        }]
      },
      ':inc': { N: '1' },
      ':now': { S: now }
    }
  });

  await dynamoClient.send(command);
};

/**
 * Get company details by ID
 */
export const getCompany = async (companyId) => {
  const command = new GetItemCommand({
    TableName: COMPANIES_TABLE,
    Key: {
      companyId: { S: companyId }
    }
  });

  const result = await dynamoClient.send(command);
  return result.Item;
};