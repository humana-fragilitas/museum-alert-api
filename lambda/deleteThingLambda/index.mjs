import {
  IoTClient,
  DescribeThingCommand,
  DeleteThingCommand,
  ListThingPrincipalsCommand,
  DetachThingPrincipalCommand,
  DeleteCertificateCommand,
  UpdateCertificateCommand,
  ListAttachedPoliciesCommand,
  DetachPolicyCommand,
  DeletePolicyCommand
} from '@aws-sdk/client-iot';

import {
  errorApiResponse,
  successApiResponse,
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js';


/**
 * Helper function to find and delete policies attached to a certificate
 * @param {IoTClient} iotClient - The IoT client instance
 * @param {string} certificateArn - The ARN of the certificate
 */
async function detachAndDeletePoliciesForCertificate(iotClient, certificateArn) {
  try {
    const certificateId = certificateArn.split('/').pop();
    
    // Get all policies attached to this certificate
    const listPoliciesCommand = new ListAttachedPoliciesCommand({
      target: certificateArn
    });
    const policiesResponse = await iotClient.send(listPoliciesCommand);
    
    if (policiesResponse.policies && policiesResponse.policies.length > 0) {
      console.log(`Found ${policiesResponse.policies.length} policies attached to certificate ${certificateId}`);
      
      for (const policy of policiesResponse.policies) {
        const policyName = policy.policyName;
        
        try {
          // Detach the policy from the certificate
          const detachPolicyCommand = new DetachPolicyCommand({
            policyName,
            target: certificateArn
          });
          await iotClient.send(detachPolicyCommand);
          console.log(`Detached policy ${policyName} from certificate ${certificateId}`);
          
          // Delete the policy (this will only succeed if no other targets are attached)
          try {
            const deletePolicyCommand = new DeletePolicyCommand({
              policyName
            });
            await iotClient.send(deletePolicyCommand);
            console.log(`Deleted policy ${policyName}`);
          } catch (deleteError) {
            if (deleteError.name === 'DeleteConflictException') {
              console.log(`Policy ${policyName} has other targets attached, not deleting`);
            } else {
              console.error(`Error deleting policy ${policyName}:`, deleteError);
            }
          }
          
        } catch (error) {
          console.error(`Error handling policy ${policyName}:`, error);
          // Don't fail the whole operation for individual policy issues
        }
      }
    } else {
      console.log(`No policies found attached to certificate ${certificateId}`);
    }
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`Certificate ${certificateArn} not found for policy lookup`);
    } else {
      console.error('Error in detachAndDeletePoliciesForCertificate:', error);
    }
    // Don't fail the whole operation for policy issues
  }
}


/**
 * Lambda function to delete a thing from AWS IoT Core.
 * Only deletes things that belong to the authenticated user's company.
 */
export const handler = async (event) => {

  validateEnvironmentVariables([
    'AWS_REGION'
  ]);

  const region = process.env.AWS_REGION;
  const iotClient = new IoTClient({ region });

  try {
    // Extract thingName from path parameters
    const thingName = event.pathParameters?.thingName;
    
    if (!thingName) {
      return errorApiResponse(
        'Thing name is required',
        400
      );
    }

    // Extract company from authenticated user token
    const company = event.requestContext.authorizer.claims['custom:Company'];
    
    if (!company) {
      return errorApiResponse(
        'User company information not found',
        401
      );
    }

    console.log(`Attempting to delete thing: ${thingName} for company: ${company}`);

    // 1. Describe the thing to check if it exists and get its attributes
    let thingData;
    try {
      const describeCommand = new DescribeThingCommand({ thingName });
      thingData = await iotClient.send(describeCommand);
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        return errorApiResponse(
          `Thing '${thingName}' not found`,
          404
        );
      }
      throw error;
    }

    // 2. Check if the thing belongs to the user's company
    const thingCompany = thingData.attributes?.Company;
    
    if (!thingCompany || thingCompany !== company) {
      return errorApiResponse(
        `Thing '${thingName}' does not belong to your company`,
        403
      );
    }

    console.log(`Thing belongs to company ${company}, proceeding with deletion`);

    // 3. Get all certificates (principals) attached to the thing
    const listPrincipalsCommand = new ListThingPrincipalsCommand({ thingName });
    const principalsResponse = await iotClient.send(listPrincipalsCommand);
    
    if (principalsResponse.principals && principalsResponse.principals.length > 0) {
      console.log(`Found ${principalsResponse.principals.length} principals attached to thing`);
      
      // 4. For each certificate, detach from thing and delete with forced cleanup
      for (const principal of principalsResponse.principals) {
        console.log(`Processing principal: ${principal}`);
        
        // Extract certificate ID from ARN
        const certificateId = principal.split('/').pop();
        
        try {
          // 4a. Detach certificate from thing first
          const detachPrincipalCommand = new DetachThingPrincipalCommand({
            thingName,
            principal
          });
          await iotClient.send(detachPrincipalCommand);
          console.log(`Detached certificate from thing: ${certificateId}`);
          
          // 4b. Find and detach/delete policies attached to this certificate
          await detachAndDeletePoliciesForCertificate(iotClient, principal);
          
          // 4c. Set certificate to INACTIVE before deletion
          const updateCertCommand = new UpdateCertificateCommand({
            certificateId,
            newStatus: 'INACTIVE'
          });
          await iotClient.send(updateCertCommand);
          console.log(`Set certificate to INACTIVE: ${certificateId}`);
          
          // 4d. Delete the certificate with forceDelete as additional safeguard
          const deleteCertCommand = new DeleteCertificateCommand({
            certificateId,
            forceDelete: true
          });
          await iotClient.send(deleteCertCommand);
          console.log(`Deleted certificate with forced cleanup: ${certificateId}`);
          
        } catch (error) {
          console.error(`Error processing certificate ${certificateId}:`, error);
          return errorApiResponse(
            `Failed to delete certificate ${certificateId}: ${error.message}`,
            500
          );
        }
      }
    }

    // 5. Finally, delete the thing itself
    const deleteThingCommand = new DeleteThingCommand({ thingName });
    await iotClient.send(deleteThingCommand);
    
    console.log(`Successfully deleted thing: ${thingName}`);

    return successApiResponse(
      {
        message: `Thing '${thingName}' has been successfully deleted`,
        thingName: thingName,
        company: company
      },
      200
    );

  } catch (error) {
    console.error('Error deleting thing:', error);
    
    return errorApiResponse(
      `Failed to delete thing: ${error.message}`,
      500,
      {
        errorType: error.name,
        errorCode: error.$metadata?.httpStatusCode
      }
    );
  }
};
