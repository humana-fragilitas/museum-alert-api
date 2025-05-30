import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { IoTClient, DescribeThingCommand } from "@aws-sdk/client-iot";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { 
  toKebabCase,
  getDecodedUserToken,
  thingAlreadyExists

} from '/opt/nodejs/shared/index.js'; 


export const handler = async (event, context, callback) => {

  console.log(JSON.stringify(event));
  console.log(JSON.stringify(context));

  let company = "";

  const provisioningRequest = event.parameters;
  const thingName = provisioningRequest.ThingName;
  const idToken = provisioningRequest.idToken;

  const region = process.env.AWS_REGION; 
  const userPoolId = process.env.USER_POOL_ID;

  const accountId = context.invokedFunctionArn.split(":")[4];

  if (!thingName || !idToken) {
    console.log('Recevide undefined thing name and/or user JWT token; exiting...');
    callback(null, {
      allowProvisioning: false
    });
  }

  console.log("REGION: ", region);

  const decodedUserToken = await getDecodedUserToken(region, userPoolId, idToken);

  if (!decodedUserToken) {
    console.log('User JWT token decoding failed; exiting...');
    callback(null, {
      allowProvisioning: false
    });
  }

  company = toKebabCase(decodedUserToken["custom:Company"]);

  if (!company) {
    console.log('Company not found in user JWT token; exiting...');
    callback(null, {
      allowProvisioning: false
    });
  }

  if (await thingAlreadyExists(region, thingName, company).exists) {
    console.log('Thing already exists; exiting...');
    callback(null, {
      allowProvisioning: false,
      //failureReason: "DEVICE_ALREADY_EXISTS"
      // remove this
      parameterOverrides: {
        errorCode: "DEVICE_ALREADY_EXISTS",
        errorMessage: "Device already exists"
      }
    });
  }

  provisioningRequest.Region = region;
  provisioningRequest.AccountId = accountId;
  provisioningRequest.Company = company;

  console.log("Provisioning request with overrides:", JSON.stringify(provisioningRequest, null, 2));

  callback(null, { 
    allowProvisioning: true,
    parameterOverrides: provisioningRequest
  });
     
};

