import { 
  getDecodedUserToken,
  thingAlreadyExists,
  validateEnvironmentVariables
} from '/opt/nodejs/shared/index.js'; 


export const handler = async (event, context) => {

  validateEnvironmentVariables([
    'AWS_REGION',
    'USER_POOL_ID'
  ]);

  let company;

  const provisioningRequest = event.parameters;
  const thingName = provisioningRequest.ThingName;
  const idToken = provisioningRequest.idToken;

  const region = process.env.AWS_REGION; 
  const userPoolId = process.env.USER_POOL_ID;
  const accountId = context.invokedFunctionArn.split(":")[4];

  if (!thingName || !idToken) {

    console.error(`Recevide undefined thing name and/or user JWT token; ` +
                  `exiting...`);

    return {
      allowProvisioning: false
    };

  }

  const decodedUserToken = await getDecodedUserToken(
    region,
    userPoolId,
    idToken
  );

  if (!decodedUserToken) {

    console.error('User JWT token decoding failed; exiting...');
    
    return {
      allowProvisioning: false
    };

  }

  company = decodedUserToken["custom:Company"];

  if (!company) {

    console.error('Company not found in user JWT token; exiting...');
    
    return {
      allowProvisioning: false
    };

  }

  if (await thingAlreadyExists(region, thingName, company).exists) {

    console.error('Thing already exists; exiting...');

    return {
      allowProvisioning: false
    };

  }

  provisioningRequest.Region = region;
  provisioningRequest.AccountId = accountId;
  provisioningRequest.Company = company;

  console.log(
    `Provisioning request with overrides:`,
    JSON.stringify(provisioningRequest, null, 2)
  );

  return { 
    allowProvisioning: true,
    parameterOverrides: provisioningRequest
  };
     
};

