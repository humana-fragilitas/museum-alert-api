import { IoTClient, AttachPolicyCommand, CreatePolicyCommand } from "@aws-sdk/client-iot";
import { CognitoIdentityClient, GetIdCommand } from "@aws-sdk/client-cognito-identity";
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";

import { 
  toKebabCase,
  errorApiResponse,
  successApiResponse,
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js';


export const handler = async (event, context, callback) => {

  validateEnvironmentVariables(['IDENTITY_POOL_ID']);

  const stage = event.requestContext?.stage;
  const identityPoolId = process.env.IDENTITY_POOL_ID;
  const iotClient = new IoTClient({ region: process.env.AWS_REGION });
  const cognitoIdentityClient = new CognitoIdentityClient({ region: process.env.AWS_REGION });
  const cognitoIdpClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

  if (!event.requestContext?.authorizer?.claims) {

    return errorApiResponse(
      stage,
      401,
      'UNAUTHORIZED',
      'Missing or invalid authentication context'
    );

  }
  
  const userSub = event.requestContext.authorizer.claims.sub;
  const userPoolId = event.requestContext.authorizer.claims.iss.split('/')[3];
  const accountId = context.invokedFunctionArn.split(":")[4];
  const region = context.invokedFunctionArn.split(":")[3];

  if (!userSub) {

    console.error('User ID (sub) not found in logged user\'s authentication token; exiting...');

    return errorApiResponse(
      stage,
      401,
      'INVALID_TOKEN',
      'User ID (sub) not found in authentication token'
    );

  }

  const rawCompany = event.requestContext.authorizer.claims['custom:Company'];

  if (!rawCompany) {

    console.error('Company information not found in logged user\'s profile; exiting...');

    return errorApiResponse(
      stage,
      403,
      'MISSING_COMPANY',
      'Company information not found in user profile'
    );

  }

  // TO DO: does this still need to be normalized?
  const company = toKebabCase(rawCompany);

  const policyDocument = {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": "iot:Connect",
        "Resource": `arn:aws:iot:${region}:${accountId}:client/\${cognito-identity.amazonaws.com:sub}`
      },
      {
        "Effect": "Allow",
        "Action": [
          "iot:Subscribe",
          "iot:Receive"
        ],
        "Resource": [
          `arn:aws:iot:${region}:${accountId}:topic/companies/${company}/events`,
          `arn:aws:iot:${region}:${accountId}:topicfilter/companies/${company}/events`
        ]
      },
      {
        "Effect": "Allow",
        "Action": "iot:Publish",
        "Resource": `arn:aws:iot:${region}:${accountId}:topic/companies/${company}/devices/*/commands`
      }
    ]
  };

  const policyName = `company-iot-policy-${company}`;

  const createPolicyParams = {
      policyName,
      policyDocument: JSON.stringify(policyDocument)
  };

  try {

    console.log('Attempting to create IoT policy:', policyName);

    await iotClient.send(new CreatePolicyCommand(createPolicyParams));

  } catch (error) {

    if (error.name === 'ResourceAlreadyExistsException') {

      console.warn(`Policy ${policyName} already exists, skipping creation.`);

    } else if (error.name === 'InvalidRequestException') {

      console.error('Invalid policy configuration:', error);

      return errorApiResponse(
        stage,
        400,
        'INVALID_POLICY',
        'Invalid policy configuration',
        { policyName, originalError: error.message }
      );

    } else if (error.name === 'UnauthorizedException') {

      console.error('Insufficient permissions to create IoT policy:', error);

      return errorApiResponse(
        stage,
        403,
        'INSUFFICIENT_PERMISSIONS',
        'Insufficient permissions to create IoT policy'
      );

    } else {

      console.error('Unexpected error creating IoT policy:', error);

      return errorApiResponse(
        stage,
        500,
        'IOT_POLICY_CREATION_FAILED',
        'Failed to create IoT policy',
        { policyName, error: error.message }
      );

    }

  }

  let identityId;

  try {

    console.log('Retrieving Cognito Identity ID for user:', userSub);

    const identityIdParams = {
        IdentityPoolId: identityPoolId,
        Logins: {
            [`cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${userPoolId}`]: event.headers.Authorization
        }
    };
    
    const identityIdResponse = await cognitoIdentityClient.send(new GetIdCommand(identityIdParams));
    identityId = identityIdResponse.IdentityId;

    if (!identityId) {

      return errorApiResponse(
        stage,
        500,
        'IDENTITY_ID_NOT_FOUND',
        'Failed to retrieve Cognito Identity ID'
      );

    }

    console.log('Cognito Identity ID retrieved successfully:', identityId);

  } catch(error) {

    if (error.name === 'InvalidParameterException') {

      console.error('Invalid parameters for Cognito Identity ID retrieval:', error);

      return errorApiResponse(
        stage,
        400,
        'INVALID_IDENTITY_POOL',
        'Invalid identity pool configuration'
      );

    } else if (error.name === 'NotAuthorizedException') {

      console.error('Unauthorized access to Cognito Identity Pool:', error);

      return errorApiResponse(
        stage,
        401,
        'INVALID_TOKEN',
        'Invalid or expired authentication token'
      );

    } else if (error.name === 'ResourceNotFoundException') {

      console.error('Cognito Identity Pool not found:', error);

      return errorApiResponse(
        stage,
        500,
        'IDENTITY_POOL_NOT_FOUND',
        'Cognito Identity Pool not found'
      );

    } else {

      console.error('Error getting Cognito Identity ID:', error);

      return errorApiResponse(
        stage,
        500,
        'IDENTITY_ID_RETRIEVAL_FAILED',
        'Failed to retrieve Cognito Identity ID',
        { error: error.message }
      );

    }

  }

  try {

    const attachPolicyCommand = new AttachPolicyCommand({
        policyName: policyName,
        target: identityId
    });
      
    await iotClient.send(attachPolicyCommand);
      
  } catch (error) {
      
    if (error.name === 'ResourceNotFoundException') {
      return errorApiResponse(
        stage,
        404,
        'POLICY_NOT_FOUND',
        'IoT policy not found',
        { policyName }
      );
    } else if (error.name === 'InvalidRequestException') {
      return errorApiResponse(
        stage,
        400,
        'INVALID_ATTACH_REQUEST',
        'Invalid policy attachment request',
        { policyName, identityId }
      );
    } else if (error.name === 'UnauthorizedException') {
      return errorApiResponse(
        stage,
        403,
        'INSUFFICIENT_PERMISSIONS',
        'Insufficient permissions to attach IoT policy'
      );
    } else if (error.name === 'ServiceUnavailableException') {
      return errorApiResponse(
        stage,
        503,
        'IOT_SERVICE_UNAVAILABLE',
        'IoT service temporarily unavailable'
      );
    } else {
      console.error('Error attaching IoT policy:', error);
      return errorApiResponse(
        stage,
        500,
        'POLICY_ATTACHMENT_FAILED',
        'Failed to attach IoT policy',
        { policyName, identityId, error: error.message }
      );
    }
      
  }

  try {

    console.log(`Updating user "${userSub}" attribute "custom:hasPolicy" in Cognito User Pool`);

    const updateUserParams = {
      UserPoolId: userPoolId,
      Username: userSub,
      UserAttributes: [
        {
            Name: 'custom:hasPolicy',
            Value: '1'
        }
      ]
    };

    await cognitoIdpClient.send(new AdminUpdateUserAttributesCommand(updateUserParams));

    console.log(`User "${userSub}" attribute "custom:hasPolicy" updated successfully`);

    return successApiResponse(stage, {
      message: 'IoT policy attached and user attribute updated successfully',
      policyName: policyName,
      identityId: identityId,
      company: company
    });

  } catch (error) {

    if (error.name === 'UserNotFoundException') {

      console.error(`User "${userSub}" not found in Cognito User Pool:`, error);

      return errorApiResponse(
        stage,
        404,
        'USER_NOT_FOUND',
        'User not found in Cognito User Pool',
        { username: userSub }
      );

    } else if (error.name === 'InvalidParameterException') {

      console.error('Invalid parameters for user attribute update:', error);

      return errorApiResponse(
        stage,
        400,
        'INVALID_USER_ATTRIBUTE',
        'Invalid user attribute update request'
      );

    } else if (error.name === 'NotAuthorizedException') {

      console.error('Unauthorized access to update user attributes:', error);

      return errorApiResponse(
        stage,
        403,
        'INSUFFICIENT_PERMISSIONS',
        'Insufficient permissions to update user attributes'
      );

    } else {

      console.error('Error updating user attribute:', error);

      return errorApiResponse(
        stage,
        500,
        'USER_ATTRIBUTE_UPDATE_FAILED',
        'Failed to update user attribute',
        { username: userSub, error: error.message }
      );
      
    }

  }
    
};
