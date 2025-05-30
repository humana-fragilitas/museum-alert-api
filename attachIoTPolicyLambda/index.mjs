import { IoTClient, AttachPolicyCommand, CreatePolicyCommand } from "@aws-sdk/client-iot";
import { CognitoIdentityClient, GetIdCommand } from "@aws-sdk/client-cognito-identity";
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";

import { 
  toKebabCase
} from '/opt/nodejs/shared/index.js'; 

const iotClient = new IoTClient({ region: process.env.AWS_REGION });
const cognitoIdentityClient = new CognitoIdentityClient({ region: process.env.AWS_REGION });
const cognitoIdpClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler = async (event, context, callback) => {
    
    try {
        
        console.log("--- BEGIN LOG: EVENT ---");
        console.log(JSON.stringify(event));
        console.log("--- END LOG: EVENT ---");
        
        // Extract user details from the event
        const userSub = event.requestContext.authorizer.claims.sub;
        const userPoolId = event.requestContext.authorizer.claims.iss.split('/')[3];
        const accountId = context.invokedFunctionArn.split(":")[4];
        const region = context.invokedFunctionArn.split(":")[3];

        const company = toKebabCase(event.requestContext.authorizer.claims['custom:Company']);

        // Get the identity pool ID from the Cognito identity pool ARN
        const identityPoolId = process.env.IDENTITY_POOL_ID;

            // Define the policy inline with placeholders replaced by actual values
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
                  "Resource": `arn:aws:iot:${region}:${accountId}:topic/companies/${company}/devices/+/commands`
                }
              ]
            };

        // Create the policy name
        const policyName = `company-iot-policy-${company}`;

        // Create and attach the policy
        const createPolicyParams = {
            policyName: policyName,
            policyDocument: JSON.stringify(policyDocument)
        };

        try {
            await iotClient.send(new CreatePolicyCommand(createPolicyParams));
        } catch (error) {
            if (error.name !== 'ResourceAlreadyExistsException') {
                throw error;
            }
        }

        // Get the Identity ID
        const identityIdParams = {
            IdentityPoolId: identityPoolId,
            Logins: {
                [`cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${userPoolId}`]: event.headers.Authorization
            }
        };
        
        const identityIdResponse = await cognitoIdentityClient.send(new GetIdCommand(identityIdParams));
        const identityId = identityIdResponse.IdentityId;
        
        console.log(`IdentityId: ${identityId}`);

        const attachPolicyCommand = new AttachPolicyCommand({
            policyName: policyName,
            target: identityId
        });

        try {
            
            await iotClient.send(attachPolicyCommand);
            
        } catch (error) {
            
            console.error('Error attaching IoT policy:', error);
            return {
                statusCode: 500,
                headers: {
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify('Error attaching IoT policy or updating user attribute.')
            };
            
        }

        // Update the user's custom attribute to indicate the policy is attached
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

        return {
            statusCode: 200,
            headers: {
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify('IoT policy attached and user attribute updated successfully.')
        };

    } catch (error) {
        
        console.error('Error attaching IoT policy or updating user attribute:', error);
        return {
            statusCode: 500,
            headers: {
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify('Error attaching IoT policy or updating user attribute.')
        };
        
    }
    
};
