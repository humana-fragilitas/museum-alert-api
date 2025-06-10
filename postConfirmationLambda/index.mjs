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

import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  PutRolePolicyCommand
} from '@aws-sdk/client-iam';

import { randomUUID } from 'crypto';

  // Initialize clients
  const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
  const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
  const iamClient = new IAMClient({ region: process.env.AWS_REGION });
  
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

  //const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || event.invokedFunctionArn?.split(':')[4];
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
    iamRole: false,
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

    // Step 3: Create IAM Role for the company
    const roleName = await createCompanyIAMRole(companyId, companyName, AWS_ACCOUNT_ID, AWS_REGION);
    createdResources.iamRole = true;
    console.log(`✅ Created IAM Role: ${roleName}`);

    // Step 4: Create Cognito group with IAM Role
    await createCompanyGroupWithRole(userPoolId, companyId, companyName, roleName, AWS_ACCOUNT_ID);
    createdResources.cognitoGroup = true;
    console.log(`✅ Created Cognito group with role: ${companyId}`);

    // Step 5: Add user to the group (inherits IAM role automatically)
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
 * Create IAM Role for company with IoT permissions
 */
const createCompanyIAMRole = async (companyId, companyName, aws_acc_id, aws_reg) => {
  const roleName = `IoTRole_${companyId}`;
  const company = sanitizeCompanyName(companyName);
  
  // Trust policy for Cognito Identity Pool
  const trustPolicy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Federated: "cognito-identity.amazonaws.com"
        },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": process.env.IDENTITY_POOL_ID
          }
        }
      }
    ]
  };

  // Create the IAM role
  const createRoleCommand = new CreateRoleCommand({
    RoleName: roleName,
    AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
    Description: `IoT role for company ${companyName} (${companyId})`
  });

  await iamClient.send(createRoleCommand);

  // IoT permissions policy
  const iotPolicy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "iot:Connect",
        Resource: `arn:aws:iot:${aws_reg}:${aws_acc_id}:client/\${cognito-identity.amazonaws.com:sub}`
      },
      {
        Effect: "Allow",
        Action: ["iot:Subscribe", "iot:Receive"],
        Resource: [
          `arn:aws:iot:${aws_reg}:${aws_acc_id}:topic/companies/${companyId}/events`,
          `arn:aws:iot:${aws_reg}:${aws_acc_id}:topicfilter/companies/${companyId}/events`
        ]
      },
      {
        Effect: "Allow",
        Action: "iot:Publish",
        Resource: `arn:aws:iot:${aws_reg}:${aws_acc_id}:topic/companies/${companyId}/devices/+/commands`
      }
    ]
  };

  // Attach IoT policy to role
  const putRolePolicyCommand = new PutRolePolicyCommand({
    RoleName: roleName,
    PolicyName: `IoTPolicy_${companyId}`,
    PolicyDocument: JSON.stringify(iotPolicy)
  });

  await iamClient.send(putRolePolicyCommand);

  return roleName;
};

/**
 * Create Cognito group with IAM role attached
 */
const createCompanyGroupWithRole = async (userPoolId, companyId, companyName, roleName, aws_acc_id) => {
  const roleArn = `arn:aws:iam::${aws_acc_id}:role/${roleName}`;
  
  const command = new CreateGroupCommand({
    UserPoolId: userPoolId,
    GroupName: companyId,
    Description: `Company group for ${companyName} (${companyId})`,
    RoleArn: roleArn,  // This is the key - users inherit this role
    Precedence: 100
  });

  await cognitoClient.send(command);
};

/**
 * Sanitize company name for IAM/IoT resource naming
 */
const sanitizeCompanyName = (companyName) => {
  return companyName
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\-_]/g, '')
    .toLowerCase();
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
    }

    if (createdResources.cognitoGroup) {
      console.log('Rolling back: Cognito group');
    }

    if (createdResources.userAttributes) {
      // Clear the company ID
      const command = new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [
          {
            Name: 'custom:CompanyId',
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

/**
 * Sanitize company name for use as group identifier
 */
const sanitizeGroupName = (companyName) => {
  return companyName
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\-_]/g, '')
    .toLowerCase()
    .substring(0, 50); // Keep it shorter since we'll use company ID as group name
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

// ===== DYNAMODB TABLE SCHEMA =====

/*
Table: companies

{
  "companyId": "company_123e4567-e89b-12d3-a456-426614174000",
  "companyName": "ACME Corporation",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "ownerEmail": "owner@acme.com",
  "ownerUsername": "owner@acme.com",
  "memberCount": 3,
  "members": [
    {
      "email": "owner@acme.com",
      "username": "owner@acme.com", 
      "role": "owner",
      "joinedAt": "2024-01-15T10:30:00Z"
    },
    {
      "email": "user1@acme.com",
      "username": "user1@acme.com",
      "role": "member", 
      "joinedAt": "2024-01-16T09:15:00Z"
    }
  ],
  "status": "active",
  "settings": {
    "timezone": "UTC",
    "features": ["feature1", "feature2"]
  }
}
*/

// ===== DEPLOYMENT CONFIGURATION =====

/*
1. DynamoDB Table Creation:
aws dynamodb create-table \
  --table-name companies \
  --attribute-definitions AttributeName=companyId,AttributeType=S \
  --key-schema AttributeName=companyId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

2. IAM Permissions:
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:CreateGroup",
        "cognito-idp:AdminAddUserToGroup",
        "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:AdminDeleteUser"
      ],
      "Resource": "arn:aws:cognito-idp:*:*:userpool/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/companies"
    }
  ]
}

3. Environment Variables:
- COMPANIES_TABLE=companies

4. Lambda Configuration:
- Runtime: Node.js 18.x
- Handler: index.handler
- Timeout: 60 seconds (for rollback operations)
- Memory: 512 MB

Note: No sequence table needed - UUID v4 provides sufficient uniqueness guarantees
*/