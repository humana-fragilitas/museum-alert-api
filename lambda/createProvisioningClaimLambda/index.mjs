import {
  CreateProvisioningClaimCommand,
  IoTClient
} from '@aws-sdk/client-iot';

import { 
  errorApiResponse,
  successApiResponse,
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js'; 


export const handler = async (event) => {

  validateEnvironmentVariables([
    'AWS_REGION',
    'TEMPLATE_NAME'
  ]);
  
  const stage = event.requestContext?.stage;
  const region = process.env.AWS_REGION;
  const templateName = process.env.TEMPLATE_NAME;
  
  const client = new IoTClient({ region });

  const command = new CreateProvisioningClaimCommand({ templateName });

  try {

      const data = await client.send(command);

      return successApiResponse(stage, {
        message: 'Successfully created provisioning claim',
        certificateId: data.certificateId,
        certificatePem: data.certificatePem,
        keyPair: data.keyPair,
        expiration: data.expiration
      });

  } catch (error) {

    if (error.name === 'InternalFailureException') {

      return errorApiResponse(
        stage,
        `An internal failure prevented the provisionig claim ` +
        `from being created`,
        500,
        error.message
      );

    } else if (error.name === 'InvalidRequestException') {

      return errorApiResponse(
        stage,
        'An invalid request prevented the provisionig claim from being created',
        400, 
        error.message
      );

    } else if (error.name === 'ResourceNotFoundException') { 

      return errorApiResponse(
        stage,
        `A non existing required resource prevented the provisionig claim ` +
        `from being created`,
        404,
        error.message
      );

    } else if (error.name === 'ServiceUnavailableException') {

      return errorApiResponse(
        stage,
        `Service unavailability prevented the provisionig claim ` +
        `from being created`,
        503,
        error.message
      );

    } else if (error.name === 'ThrottlingException') {

      return errorApiResponse(
        stage,
        'Service throttling prevented the provisionig claim from being created',
        400,
        error.message
      );

    } else if (error.name === 'UnauthorizedException') {
      
      return errorApiResponse(
        stage,
        `Unauthorized access prevented the provisionig claim ` +
        `from being created`,
        401,
        error.message
      );

    } else {

      return errorApiResponse(
        stage,
        `An unexpected error prevented the provisionig claim ` +
        `from being created`,
        500,
        error.message
      );

    }

  }

};
