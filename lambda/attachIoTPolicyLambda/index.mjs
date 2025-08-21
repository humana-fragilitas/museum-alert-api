import {
  AttachPolicyCommand,
  CreatePolicyCommand,
  IoTClient
} from '@aws-sdk/client-iot';
import {
  CognitoIdentityClient,
  GetIdCommand
} from '@aws-sdk/client-cognito-identity';
import {
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient
} from '@aws-sdk/client-cognito-identity-provider';


import { 
  errorApiResponse,
  successApiResponse,
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js';


export const handler = async (event, context) => {

  validateEnvironmentVariables([
    'AWS_REGION',
    'IDENTITY_POOL_ID'
  ]);

  const identityPoolId = process.env.IDENTITY_POOL_ID;
  const iotClient = new IoTClient({
    region: process.env.AWS_REGION
  });
  const cognitoIdentityClient = new CognitoIdentityClient({
    region: process.env.AWS_REGION
  });
  const cognitoIdpClient = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION
  });

  if (!event.requestContext?.authorizer?.claims) {

    console.error('Logged user\'s claims not found; exiting...');

    return errorApiResponse(
      'Missing or invalid authentication context',
      401
    );

  }
  
  const userSub = event.requestContext.authorizer.claims.sub;
  const userPoolId = event.requestContext.authorizer.claims.iss.split('/')[3];
  const accountId = context.invokedFunctionArn.split(':')[4];
  const region = context.invokedFunctionArn.split(':')[3];

  if (!userSub) {

    console.error(
      `User ID (sub) not found in logged user\'s authentication token; ` +
      `exiting...`
    );

    return errorApiResponse(
      'User ID (sub) not found in authentication token',
      400
    );

  }

  const company = event.requestContext.authorizer.claims['custom:Company'];

  if (!company) { 

    console.error(
      `Company information not found in logged user\'s custom properties; ` +
      `exiting...`
    );

    return errorApiResponse(
      'Company information not found in user profile',
      400
    );

  }

  const policyDocument = {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": "iot:Connect",
        "Resource": 
          `arn:aws:iot:${region}:${accountId}:client/` +
          `\${cognito-identity.amazonaws.com:sub}`
      },
      {
        "Effect": "Allow",
        "Action": [
          "iot:Subscribe",
          "iot:Receive"
        ],
        "Resource": [
          `arn:aws:iot:${region}:${accountId}:topic/companies/` +
            `${company}/events`,
          `arn:aws:iot:${region}:${accountId}:topicfilter/companies/` +
            `${company}/events`
        ]
      },
      {
        "Effect": "Allow",
        "Action": "iot:Publish",
        "Resource": 
          `arn:aws:iot:${region}:${accountId}:topic/companies/` +
          `${company}/devices/*/commands`
      }
    ]
  };

  const policyName = `company-iot-policy-${company}`;

  const createPolicyParams = {
      policyName,
      policyDocument: JSON.stringify(policyDocument)
  };

  try {

    console.log(`Attempting to create IoT policy with name: ${policyName}`);

    await iotClient.send(new CreatePolicyCommand(createPolicyParams));

  } catch (error) {

    if (error.name === 'ResourceAlreadyExistsException') {

      console.warn(`Policy ${policyName} already exists, skipping creation.`);

    } else if (error.name === 'ConcurrentModificationException') {

      console.error(`The request was rejected because multiple requests `   +
                    `to change this object were submitted simultaneously. ` +
                    `Wait a few minutes and submit your request again; `    +
                    `error details: `, error);

      return errorApiResponse(
        'Multiple requests to change this object were submitted simultaneously',
        400,
        { policyName, originalError: error.message }
      );

    } else if (error.name === 'InvalidRequestException') {

      console.error('Invalid policy configuration:', error);

      return errorApiResponse(
        'Invalid policy configuration',
        400,
        { policyName, error: error.message }
      );

    } else if (error.name === 'UnauthorizedException') {

      console.error('Insufficient permissions to create IoT policy:', error);

      return errorApiResponse(
        'Insufficient permissions to create IoT policy',
        403
      );

    } else {

      console.error('Unexpected error creating IoT policy:', error);

      return errorApiResponse(
        'Failed to create IoT policy',
        500,
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
          [`cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${userPoolId}`]:
              event.headers.Authorization
        }
    };
    
    const identityIdResponse = await cognitoIdentityClient.send(
      new GetIdCommand(identityIdParams)
    );
    identityId = identityIdResponse.IdentityId;

    if (!identityId) {

      return errorApiResponse(
        'Failed to retrieve Cognito Identity ID',
        400
      );

    }

    console.log('Cognito Identity ID retrieved successfully:', identityId);

  } catch(error) {

    if (error.name === 'InvalidParameterException') {

      console.error('Invalid parameters for Cognito Identity ID retrieval:',
        error);

      return errorApiResponse(
        'Invalid identity pool configuration',
        400
      );

    } else if (error.name === 'NotAuthorizedException') {

      console.error('Unauthorized access to Cognito Identity Pool:', error);

      return errorApiResponse(
        'Invalid or expired authentication token',
        401
      );

    } else if (error.name === 'ResourceNotFoundException') {

      console.error('Cognito Identity Pool not found:', error);

      return errorApiResponse(
        'Cognito Identity Pool not found',
        500
      );

    } else {

      console.error('Error getting Cognito Identity ID:', error);

      return errorApiResponse(
        'Failed to retrieve Cognito Identity ID',
        500,
        { error: error.message }
      );

    }

  }

  try {

    const attachPolicyCommand = new AttachPolicyCommand({
        policyName,
        target: identityId
    });
      
    await iotClient.send(attachPolicyCommand);
      
  } catch (error) {
      
    if (error.name === 'ResourceNotFoundException') {

      return errorApiResponse(
        'IoT policy not found',
        404,
        { policyName }
      );

    } else if (error.name === 'InvalidRequestException') {

      return errorApiResponse(
        'Invalid policy attachment request',
        400,
        { policyName, identityId }
      );

    } else if (error.name === 'UnauthorizedException') {

      return errorApiResponse(
        'Insufficient permissions to attach IoT policy',
        403
      );

    } else if (error.name === 'ServiceUnavailableException') {

      return errorApiResponse(
        'IoT service temporarily unavailable',
        503
      );

    } else {

      console.error('Error attaching IoT policy:', error); 

      return errorApiResponse(
        'Failed to attach IoT policy',
        500,
        { policyName, identityId, error: error.message }
      );

    }
      
  }

  try {

    console.log(
      `Updating user '${userSub}' attribute ` + 
      `'custom:hasPolicy' in Cognito User Pool`
    );

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

    await cognitoIdpClient.send(
      new AdminUpdateUserAttributesCommand(updateUserParams)
    );

    console.log(
      `User '${userSub}' attribute 'custom:hasPolicy' ` +
      `updated successfully`
    );

    return successApiResponse({
      message: 'IoT policy attached and user attribute updated successfully',
      policyName: policyName,
      identityId: identityId,
      company: company
    });

  } catch (error) {

    if (error.name === 'UserNotFoundException') {

      console.error(`User '${userSub}' not found in Cognito User Pool:`, error);

      return errorApiResponse(
        'User not found in Cognito User Pool',
        404,
        { username: userSub }
      );

    } else if (error.name === 'InvalidParameterException') {

      console.error('Invalid parameters for user attribute update:', error);

      return errorApiResponse(
        'Invalid user attribute update request',
        400
      );

    } else if (error.name === 'NotAuthorizedException') {

      console.error('Unauthorized access to update user attributes:', error);

      return errorApiResponse(
        'Insufficient permissions to update user attributes',
        403
      );

    } else {

      console.error('Error updating user attribute:', error);

      return errorApiResponse(
        'Failed to update user attribute',
        500,
        { username: userSub, error: error.message }
      );
      
    }

  }
    
};
