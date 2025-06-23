import {
  IoTClient,
  CreateProvisioningClaimCommand 
} from "@aws-sdk/client-iot";

import { 
  errorApiResponse,
  successApiResponse,
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js'; 


export const handler = async (event) => {

  validateEnvironmentVariables([
    'AWS_REGION'
  ]);
  
  const stage = event.requestContext?.stage;
  const region = process.env.AWS_REGION;
  
  const client = new IoTClient({ region });

  const templateName = 'museum-alert-provisioning-template';

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
        500,
        'FAILED_PROVISIONING_CLAIM_CREATION',
        'An internal failure prevented the provisionig claim from being created',
        error.message
      );

    } else if (error.name === 'InvalidRequestException') {

      return errorApiResponse(
        stage,
        400,
        'FAILED_PROVISIONING_CLAIM_CREATION',
        'An invalid request prevented the provisionig claim from being created',
        error.message
      );

    } else if (error.name === 'ResourceNotFoundException') { 

      return errorApiResponse(
        stage,
        404,
        'FAILED_PROVISIONING_CLAIM_CREATION',
        'A non existing required resource prevented the provisionig claim from being created',
        error.message
      );

    } else if (error.name === 'ServiceUnavailableException') {

      return errorApiResponse(
        stage,
        503,
        'FAILED_PROVISIONING_CLAIM_CREATION',
        'Service unavailability prevented the provisionig claim from being created',
        error.message
      );

    } else if (error.name === 'ThrottlingException') {

      return errorApiResponse(
        stage,
        400,
        'FAILED_PROVISIONING_CLAIM_CREATION',
        'Service throttling prevented the provisionig claim from being created',
        error.message
      );

    } else if (error.name === 'UnauthorizedException') {
      
      return errorApiResponse(
        stage,
        401,
        'FAILED_PROVISIONING_CLAIM_CREATION',
        'Unauthorized access prevented the provisionig claim from being created',
        error.message
      );

    } else {

      return errorApiResponse(
        stage,
        500,
        'FAILED_PROVISIONING_CLAIM_CREATION',
        'An unexpected error prevented the provisionig claim from being created',
        error.message
      );

    }

  }

};
