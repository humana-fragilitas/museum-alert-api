import {
  CognitoIdentityProviderClient,
  DeleteGroupCommand,
  AdminRemoveUserFromGroupCommand
} from '@aws-sdk/client-cognito-identity-provider';

import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand
} from '@aws-sdk/client-dynamodb';

import {
  IAMClient,
  DeleteRoleCommand,
  DetachRolePolicyCommand,
  ListAttachedRolePoliciesCommand
} from '@aws-sdk/client-iam';

import {
  IoTClient,
  DetachPolicyCommand,
  DeletePolicyCommand,
  ListTargetsForPolicyCommand
} from '@aws-sdk/client-iot';

import { unmarshall } from '@aws-sdk/util-dynamodb';

// Initialize clients
const cognitoClient = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION
});
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const iamClient = new IAMClient({ region: process.env.AWS_REGION });
const iotClient = new IoTClient({ region: process.env.AWS_REGION });

// Environment variables
const COMPANIES_TABLE = process.env.COMPANIES_TABLE || 'companies';

/**
 * Pre User Delete Lambda Trigger
 * 
 * This function is triggered before a user is deleted from Cognito User Pool.
 * It handles cleanup of company-related resources when:
 * 1. User is the only member of a company - deletes entire company and
 *    resources
 * 2. User is one of multiple members - removes user from company
 * 
 * Cleanup includes:
 * - Company record in DynamoDB
 * - Cognito group
 * - IAM roles (if any)
 * - IoT policies
 */
export const handler = async (event) => {
  
  console.log('Pre User Delete trigger event:', JSON.stringify(event, null, 2));

  const userPoolId = event.userPoolId;
  const username = event.userName;
  const userAttributes = event.request.userAttributes;
  const userEmail = userAttributes.email;
  const companyId = userAttributes['custom:Company'];

  console.log(`Processing user deletion: ${userEmail} (${username})`);

  if (!companyId) {
    console.log('User has no company associated, skipping company cleanup');
    return event;
  }

  try {
    // Get company details
    const company = await getCompanyById(companyId);
    
    if (!company) {
      console.log(`Company ${companyId} not found, skipping cleanup`);
      return event;
    }

    console.log(
        `Found company: ${company.companyName} ` +
        `with ${company.memberCount} members`
    );

    // Check if user is the only member
    if (company.memberCount === 1) {

      console.log('User is the only company member - deleting entire company');
      await deleteEntireCompany(userPoolId, companyId, company);

    } else {

      console.log('User is one of multiple members - removing from company');
      await removeUserFromCompany(userPoolId, username, userEmail, companyId);

    }

    console.log(`✅ Successfully processed deletion for user: ${userEmail}`);

    return event;

  } catch (error) {
    
    console.error('❌ Error during user deletion cleanup:', error);
    
    // Log error but don't fail the deletion - user safety first
    // The user deletion will proceed even if cleanup fails
    console.error('User deletion will proceed despite cleanup errors');
    return event;
    
  }

};

/**
 * Get company by ID from DynamoDB
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
    
    if (!result.Item) {
      return null;
    }

    // Convert DynamoDB format to regular JSON
    return unmarshall(result.Item);
    
  } catch (error) {

    console.error('Error getting company from DynamoDB:', error);
    throw error;

  }

};

/**
 * Delete entire company and all associated resources
 */
const deleteEntireCompany = async (userPoolId, companyId, company) => {

  console.log(`Deleting entire company: ${companyId}`);

  try {

    // 1. Delete IoT policies associated with the company
    await deleteCompanyIoTPolicies(companyId, company.companyName);

    // 2. Delete IAM roles associated with the company (if any)
    await deleteCompanyIAMRoles(companyId);

    // 3. Delete Cognito group
    await deleteCompanyGroup(userPoolId, companyId);

    // 4. Delete company record from DynamoDB
    await deleteCompanyRecord(companyId);

    console.log(`✅ Successfully deleted entire company: ${companyId}`);

  } catch (error) {

    console.error(`❌ Error deleting company ${companyId}:`, error);
    throw error;

  }

};

/**
 * Remove user from company (when company has multiple members)
 */
const removeUserFromCompany = async (
    userPoolId,
    username,
    userEmail,
    companyId
) => {

  console.log(`Removing user ${userEmail} from company ${companyId}`);

  try {
    // 1. Remove user from Cognito group
    await removeUserFromGroup(userPoolId, username, companyId);

    // 2. Update company record - remove user from members array
    await removeUserFromCompanyRecord(companyId, userEmail);

    console.log(`✅ Successfully removed user from company: ${companyId}`);

  } catch (error) {
    console.error(`❌ Error removing user from company ${companyId}:`, error);
    throw error;
  }

};

/**
 * Delete company IoT policies
 */
// TO DO: fix this; use company id to form policy name
const deleteCompanyIoTPolicies = async (companyId, companyName) => {

  try {

    const policyName = `company-iot-policy-${companyName}`;

    console.log(`Checking for IoT policy: ${policyName}`);

    // Check if policy exists and has targets
    const targetsCommand = new ListTargetsForPolicyCommand({
      policyName: policyName
    });

    try {
        
      const targets = await iotClient.send(targetsCommand);
      
      // Detach policy from all targets
      if (targets.targets && targets.targets.length > 0) {

        console.log(
            `Detaching IoT policy from ` +
            `${targets.targets.length} targets`
        );
        
        for (const target of targets.targets) {
          await iotClient.send(new DetachPolicyCommand({
            policyName: policyName,
            target: target
          }));
        }

      }

      // Delete the policy
      await iotClient.send(new DeletePolicyCommand({
        policyName: policyName
      }));

      console.log(`✅ Deleted IoT policy: ${policyName}`);

    } catch (error) {

      if (error.name === 'ResourceNotFoundException') {
        console.log(`IoT policy ${policyName} not found - skipping`);
      } else {
        throw error;
      }

    }

  } catch (error) {
    console.error('Error deleting IoT policies:', error);
    // Don't throw - continue with other cleanup
  }

};

/**
 * Delete company IAM roles
 */
const deleteCompanyIAMRoles = async (companyId) => {

  try {

    const roleName = `IoTRole_${companyId}`;

    console.log(`Checking for IAM role: ${roleName}`);

    // List attached policies
    const listPoliciesCommand = new ListAttachedRolePoliciesCommand({
      RoleName: roleName
    });

    try {

      const policies = await iamClient.send(listPoliciesCommand);

      // Detach all policies
      if (policies.AttachedPolicies && policies.AttachedPolicies.length > 0) {
        for (const policy of policies.AttachedPolicies) {
          await iamClient.send(new DetachRolePolicyCommand({
            RoleName: roleName,
            PolicyArn: policy.PolicyArn
          }));
        }
      }

      // Delete the role
      await iamClient.send(new DeleteRoleCommand({
        RoleName: roleName
      }));

      console.log(`✅ Deleted IAM role: ${roleName}`);

    } catch (error) {

      if (error.name === 'NoSuchEntityException') {
        console.log(`IAM role ${roleName} not found - skipping`);
      } else {
        throw error;
      }

    }

  } catch (error) {

    console.error('Error deleting IAM roles:', error);
    // Don't throw - continue with other cleanup

  }

};

/**
 * Delete Cognito group
 */
const deleteCompanyGroup = async (userPoolId, companyId) => {

  try {

    const command = new DeleteGroupCommand({
      UserPoolId: userPoolId,
      GroupName: companyId
    });

    await cognitoClient.send(command);
    console.log(`✅ Deleted Cognito group: ${companyId}`);

  } catch (error) {

    if (error.name === 'ResourceNotFoundException') {
      console.log(`Cognito group ${companyId} not found - skipping`);
    } else {
      console.error('Error deleting Cognito group:', error);
      // Don't throw - continue with other cleanup
    }

  }

};

/**
 * Remove user from Cognito group
 */
const removeUserFromGroup = async (userPoolId, username, companyId) => {

  try {

    const command = new AdminRemoveUserFromGroupCommand({
      UserPoolId: userPoolId,
      Username: username,
      GroupName: companyId
    });

    await cognitoClient.send(command);
    console.log(`✅ Removed user from Cognito group: ${companyId}`);

  } catch (error) {

    console.error('Error removing user from group:', error);
    // Don't throw - user is being deleted anyway

  }

};

/**
 * Delete company record from DynamoDB
 */
const deleteCompanyRecord = async (companyId) => {

  try {

    const command = new DeleteItemCommand({
      TableName: COMPANIES_TABLE,
      Key: {
        companyId: { S: companyId }
      }
    });

    await dynamoClient.send(command);
    console.log(`✅ Deleted company record: ${companyId}`);

  } catch (error) {
    
    console.error('Error deleting company record:', error);
    throw error;

  }

};

/**
 * Remove user from company members array
 */
const removeUserFromCompanyRecord = async (companyId, userEmail) => {

  try {

    // First, get the current company to find the user's index
    const company = await getCompanyById(companyId);
    
    if (!company || !company.members) {
      console.log('Company or members not found');
      return;
    }

    // Find user index in members array
    const userIndex = company.members.findIndex(member => 
      member.email === userEmail || member.username === userEmail
    );

    if (userIndex === -1) {
      console.log('User not found in company members');
      return;
    }

    // Use REMOVE to delete the specific index
    const command = new UpdateItemCommand({
      TableName: COMPANIES_TABLE,
      Key: {
        companyId: { S: companyId }
      },
      UpdateExpression: `REMOVE members[${userIndex}] SET memberCount = ` +
                        `memberCount - :dec, updatedAt = :now`,
      ExpressionAttributeValues: {
        ':dec': { N: '1' },
        ':now': { S: new Date().toISOString() }
      }
    });

    await dynamoClient.send(command);
    console.log(`✅ Removed user from company members: ${userEmail}`);

  } catch (error) {

    console.error('Error removing user from company record:', error);
    throw error;
    
  }

};

// ===== CONFIGURATION GUIDE =====

/*
AWS Lambda Configuration:

1. Function Name: user-pre-delete-trigger
2. Runtime: Node.js 18.x or later
3. Handler: index.handler
4. Timeout: 60 seconds (cleanup can take time)
5. Memory: 512 MB

Environment Variables:
- COMPANIES_TABLE: Your DynamoDB companies table name
- AWS_REGION: Your AWS region

Cognito User Pool Trigger Configuration:
- Trigger Type: Pre delete user
- Lambda Function: user-pre-delete-trigger

Required IAM Permissions:
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
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/companies"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:DeleteGroup",
        "cognito-idp:AdminRemoveUserFromGroup"
      ],
      "Resource": "arn:aws:cognito-idp:*:*:userpool/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:DeleteRole",
        "iam:DetachRolePolicy",
        "iam:ListAttachedRolePolicies"
      ],
      "Resource": "arn:aws:iam::*:role/IoTRole_*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iot:DetachPolicy",
        "iot:DeletePolicy",
        "iot:ListTargetsForPolicy"
      ],
      "Resource": "*"
    }
  ]
}

Testing:
1. Create a test user with a company
2. Verify company is created with user as only member
3. Delete the user from Cognito console
4. Check that company, group, and policies are deleted
5. Test with multiple users in same company
6. Verify only the user is removed, company remains

Error Handling:
- Function will not fail user deletion if cleanup fails
- All errors are logged for debugging
- Cleanup continues even if individual steps fail
- User safety is prioritized over resource cleanup

Monitoring:
- Check CloudWatch logs for cleanup status
- Set up alarms for function errors
- Monitor DynamoDB for orphaned companies
- Regular audit of IoT policies and IAM roles
*/