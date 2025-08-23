import {
  IoTClient,
  DescribeThingCommand,
  DeleteThingCommand,
  ListThingPrincipalsCommand,
  DetachThingPrincipalCommand,
  DeleteCertificateCommand,
  UpdateCertificateCommand,
  ListTargetsForPolicyCommand,
  ListPoliciesCommand,
  DetachPolicyCommand
} from '@aws-sdk/client-iot';

import {
  errorApiResponse,
  successApiResponse,
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js';

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
      
      // 4. For each certificate, detach policies and delete the certificate
      for (const principal of principalsResponse.principals) {
        console.log(`Processing principal: ${principal}`);
        
        // Extract certificate ID from ARN
        const certificateId = principal.split('/').pop();
        
        try {
          // 4a. Get policies attached to this certificate
          // Since ListPrincipalPoliciesCommand is deprecated, we need to:
          // 1. List all policies
          // 2. For each policy, check if our principal is a target
          const listPoliciesCommand = new ListPoliciesCommand({});
          const allPoliciesResponse = await iotClient.send(listPoliciesCommand);
          
          const attachedPolicies = [];
          
          if (allPoliciesResponse.policies && allPoliciesResponse.policies.length > 0) {
            // Check each policy to see if our principal is attached
            for (const policy of allPoliciesResponse.policies) {
              try {
                const listTargetsCommand = new ListTargetsForPolicyCommand({
                  policyName: policy.policyName
                });
                const targetsResponse = await iotClient.send(listTargetsCommand);
                
                if (targetsResponse.targets && targetsResponse.targets.includes(principal)) {
                  attachedPolicies.push(policy);
                }
              } catch (targetError) {
                // If we can't check targets for a policy, skip it
                console.warn(`Could not check targets for policy ${policy.policyName}:`, targetError.message);
              }
            }
          }
          
          // 4b. Detach all policies from the certificate
          if (attachedPolicies.length > 0) {
            console.log(`Detaching ${attachedPolicies.length} policies from certificate`);
            
            for (const policy of attachedPolicies) {
              const detachPolicyCommand = new DetachPolicyCommand({
                policyName: policy.policyName,
                target: principal
              });
              await iotClient.send(detachPolicyCommand);
              console.log(`Detached policy: ${policy.policyName}`);
            }
          }
          
          // 4c. Detach certificate from thing
          const detachPrincipalCommand = new DetachThingPrincipalCommand({
            thingName,
            principal
          });
          await iotClient.send(detachPrincipalCommand);
          console.log(`Detached certificate from thing: ${certificateId}`);
          
          // 4d. Set certificate to INACTIVE before deletion
          const updateCertCommand = new UpdateCertificateCommand({
            certificateId,
            newStatus: 'INACTIVE'
          });
          await iotClient.send(updateCertCommand);
          
          // 4e. Delete the certificate
          const deleteCertCommand = new DeleteCertificateCommand({
            certificateId,
            forceDelete: true
          });
          await iotClient.send(deleteCertCommand);
          console.log(`Deleted certificate: ${certificateId}`);
          
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
