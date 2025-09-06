import { CreateProvisioningClaimCommand,
         IoTClient } from '@aws-sdk/client-iot';

import { errorApiResponse,
         successApiResponse,
         validateEnvironmentVariables } from '/opt/nodejs/shared/index.js'; 


export const handler = async (event) => {

  validateEnvironmentVariables([
    'AWS_REGION',
    'TEMPLATE_NAME'
  ]);
  
  const region = process.env.AWS_REGION;
  const templateName = process.env.TEMPLATE_NAME;
  
  const client = new IoTClient({ region });
  const command = new CreateProvisioningClaimCommand({ templateName });

  try {

      const data = await client.send(command);

      return successApiResponse({
        message: 'Successfully created provisioning claim',
        certificateId: data.certificateId,
        certificatePem: data.certificatePem,
        keyPair: data.keyPair,
        expiration: data.expiration
      });

  } catch (error) {

    if (error.name === 'InternalFailureException') {

      return errorApiResponse(
        `An internal failure prevented the provisioning claim ` +
        `from being created`,
        500,
        error.message
      );

    } else if (error.name === 'InvalidRequestException') {

      return errorApiResponse(
        'An invalid request prevented the provisioning claim from being created',
        400, 
        error.message
      );

    } else if (error.name === 'ResourceNotFoundException') { 

      return errorApiResponse(
        `A non existing required resource prevented the provisioning claim ` +
        `from being created`,
        404,
        error.message
      );

    } else if (error.name === 'ServiceUnavailableException') {

      return errorApiResponse(
        `Service unavailability prevented the provisioning claim ` +
        `from being created`,
        503,
        error.message
      );

    } else if (error.name === 'ThrottlingException') {

      return errorApiResponse(
        'Service throttling prevented the provisioning claim from being created',
        429,
        error.message
      );

    } else if (error.name === 'UnauthorizedException') {
      
      return errorApiResponse(
        `Unauthorized access prevented the provisioning claim ` +
        `from being created`,
        403,
        error.message
      );

    } else {

      return errorApiResponse(
        `An unexpected error prevented the provisioning claim ` +
        `from being created`,
        500,
        error.message
      );

    }

  }

};
