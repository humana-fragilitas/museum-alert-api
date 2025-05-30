import {
  IoTClient,
  CreateProvisioningClaimCommand 
} from "@aws-sdk/client-iot";

/*

export enum AppErrorType {
    UNAUTHORIZED,
    FAILED_PROVISIONING_CLAIM_CREATION,
    FAILED_EXISTING_THING_CHECK,
    THING_ALREADY_EXISTS,
    THING_ALREADY_EXISTS_IN_OTHER_ORGANIZATION,
    GENERIC_ERROR
};

*/

export const handler = async (event, context, callback) => {
  
  const region = process.env.AWS_REGION;
  const identityPoolId = process.env.IDENTITY_POOL_ID;
  const accountId = process.env.AWS_ACCOUNT_ID;
  
  // Get user's company from user attributes
  //const company = event.requestContext.authorizer.claims['custom:Company'];
  
  const client = new IoTClient({ region });

  const templateName = 'museum-alert-provisioning-template';

  const command = new CreateProvisioningClaimCommand({ templateName });

  try {
      const data = await client.send(command);
      return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
              certificateId: data.certificateId,
              certificatePem: data.certificatePem,
              keyPair: data.keyPair,
              expiration: data.expiration
          }),
      };
  } catch (err) {
      return {
          statusCode: 500,
          headers: {
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
              code: 0, // see enum above
              message: "Failed to create provisioning claim",
              description: err.message
          }),
      };
  }

};
