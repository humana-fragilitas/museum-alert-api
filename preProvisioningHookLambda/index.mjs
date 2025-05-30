import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { IoTClient, DescribeThingCommand } from "@aws-sdk/client-iot";
import { createRemoteJWKSet, jwtVerify } from "jose";

/*
mkdir my-layer
cd my-layer
mkdir -p nodejs
zip -r my-layer.zip

lambda-layer/
└── nodejs/
    ├── package.json
    ├── helpers.mjs

# package.json
{
  "type": "module"
}

export function formatString(input) {
  return input.trim().toLowerCase().replace(/\s+/g, ' ').replace(/ /g, '-');
}

cd lambda-layer
zip -r layer.zip nodejs
aws lambda publish-layer-version --layer-name helpers-layer --zip-file fileb://layer.zip --compatible-runtimes nodejs18.x

import { formatString } from '/opt/nodejs/helpers.mjs';

export async function handler(event) {
  console.log(formatString("  Hello   World  ")); // Output: "hello-world"
}

*/


function toKebabCase(input) {
  return (input || "")
      .trim() // Remove leading and trailing spaces
      .toLowerCase() // Convert to lowercase
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
      .replace(/ /g, '-'); // Replace spaces with minus character
}

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

  if (await thingAlreadyExists(region, thingName, company)) {
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

// HELPER FUNCTIONS

async function getDecodedUserToken(reg, userPoolId, token) {

  const JWKS_URI = `https://cognito-idp.${reg}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  const jwks = createRemoteJWKSet(new URL(JWKS_URI));

  try {
    console.log('Decoding user JWT token...');
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ["RS256"],
    });
    return payload;
  } catch (err) {
    console.error("JWT token decoding failed:", err);
    return null;
  }

}

async function thingAlreadyExists(reg, thingName, company) {
  try {
    const client = new IoTClient({
      reg
    });
    const input = {
      thingName,
      attributes: {
      "custom:Company": company
    }};
    const command = new DescribeThingCommand(input);
    const response = await client.send(command);
    return true;
  } catch(e) {
    return false;
  }
}


