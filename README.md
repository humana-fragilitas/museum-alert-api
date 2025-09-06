# Museum Alert API

[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/humana-fragilitas/c5e59bb95d53e6062c676cd9b89120a4/raw/coverage-badge.json)](https://github.com/humana-fragilitas/museum-alert/actions)
[![License][license-badge]](LICENSE.md)

AWS CDK-based infrastructure for the **[Museum Alert](https://github.com/humana-fragilitas/museum-alert)** IoT project, providing cloud services for device management, user authentication, and real-time communication with the Arduino®-based **[Museum Alert Sensor (MAS)](https://github.com/humana-fragilitas/museum-alert-sketch)** and the **[Museum Alert Desktop](https://github.com/humana-fragilitas/museum-alert-desktop)** application.

**Important: please review the [disclaimer](#disclaimer) before using this project.**

## Prerequisites

### System Requirements
- **Node.js**: version 22.19.0 or higher;
- **AWS CLI**: version 2.16.12 or higher, configured with appropriate credentials;
- **AWS CDK**: version 2.1022.0 or higher;
- **Docker**: version 20.10.0 or higher with Docker daemon running and accessible via Docker socket. AWS CDK requires Docker to build the Lambda Layer (`museum-alert-shared-layer-dev`) using the `NODEJS_22_X.bundlingImage` container. 

### AWS Account Setup

#### 1. Create IAM User for CDK Deployment

1. **Log into AWS Console** → Go to **IAM service**;
2. **Create a new IAM user**:
   - click "Users" → "Add users";
   - enter username (e.g., "museum-alert-dev");
   - select "Attach policies directly";
   - attach "AdministratorAccess" policy (for development);
   - click "Create user".
3. **Generate Access Keys**:
   - click on the username → "Security credentials";
   - click "Create access key" → Choose "Command Line Interface (CLI)";
   - **save the credentials securely** - you won't see the secret key again!

#### 2. Install and Configure AWS CLI

Install the AWS CLI following the [instructions on the official guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).

```bash
# Configure AWS credentials
aws configure --profile cdk-deploy
# Enter your Access Key ID and Secret Access Key
# Default region: eu-west-2
# Default output format: json

# Verify setup
aws sts get-caller-identity --profile cdk-deploy
```

#### 3. Install AWS CDK

```bash
npm install -g aws-cdk

# Verify installation
cdk --version
```

## Quick Start

### Architecture Overview

This project creates a complete AWS infrastructure stack comprising:

- **API Gateway**: RESTful endpoints for device and user management;
- **AWS Cognito**: user authentication and authorization services;
- **AWS IoT Core**: device connectivity, message routing, and provisioning;
- **AWS Lambda**: serverless business logic and event processing;
- **DynamoDB**: NoSQL database for storing company and device data;
- **CloudWatch**: logging, monitoring, and alerting.

[Detailed diagrams](#architecture-diagrams) explaining both relationships and flows are available below.

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/humana-fragilitas/museum-alert-api.git
   cd museum-alert-api
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Bootstrap CDK** (first-time only):
   ```bash
   npm run bootstrap:dev
   ```

4. **Deploy the infrastructure**:
   ```bash
   npm run deploy:dev
   ```

## Available Commands

### Deployment Commands

| Command | Description | Environment | Region |
|---------|-------------|-------------|--------|
| `npm run deploy:dev` | Deploy all stacks to development | Development | eu-west-2 |

### Preview Commands

| Command | Description |
|---------|-------------|
| `npm run diff:dev` | Show changes that would be made to dev environment |
| `npm run synth:dev` | Generate CloudFormation templates for dev |

### Cleanup Commands

| Command | Description |
|---------|-------------|
| `npm run destroy:dev` | ⚠️ Delete all development resources |

### Utility Commands

| Command | Description |
|---------|-------------|
| `npm run bootstrap:dev` | One-time CDK setup for dev region |
| `npm test` | Run unit tests |
| `npm run test:coverage` | Run tests with coverage report |

## Infrastructure Components

### Deployment Architecture

The infrastructure is organized into **9 interconnected CloudFormation stacks**:

#### 1. **IAM Stack** (`museum-alert-iam-{stage}`)
- **Purpose**: identity and Access Management roles and policies.
- **Resources**:
  - lambda execution roles;
  - IoT provisioning roles;
  - cross-service permissions.

#### 2. **Shared Infrastructure Stack** (`museum-alert-shared-infra-{stage}`)
- **Purpose**: common resources shared across services.
- **Resources**:
  - lambda Layer with shared utilities;
  - common libraries and dependencies.

#### 3. **Database Stack** (`museum-alert-database-{stage}`)
- **Purpose**: data persistence layer.
- **Resources**:
  - DynamoDB table: `companies` (company information storage);
  - pay-per-request billing;
  - point-in-time recovery enabled.

#### 4. **Cognito Stack** (`museum-alert-cognito-{stage}`)
- **Purpose**: user authentication and authorization.
- **Resources**:
  - User Pool: `museum-alert-user-pool-open-signup`;
  - Identity Pool: `museum-alert-identity-pool`;
  - User Pool Client for Web/mobile applications;
  - Post-confirmation Lambda trigger.

#### 5. **Lambda Stack** (`museum-alert-lambda-{stage}`)
- **Purpose**: serverless business logic.
- **Resources**:
  - **Company Management**: `getCompanyLambda`, `updateCompanyLambda`;
  - **Device Provisioning**: `createProvisioningClaimLambda`, `preProvisioningHookLambda`;
  - **Device Management**: `checkThingExistsLambda`, `deleteThingLambda`;
  - **IoT Integration**: `attachIoTPolicyLambda`, `addThingToGroupLambda`;
  - **Event Processing**: `republishDeviceConnectionStatusLambda`, `postConfirmationLambda`.

#### 6. **IoT Stack** (`museum-alert-iot-{stage}`)
- **Purpose**: IoT device connectivity and management.
- **Resources**:
  - Thing type: `Museum-Alert-Sensor`;
  - Provisioning template: `museum-alert-provisioning-template`;
  - IoT Policies: device and user access policies;
  - Device provisioning workflow.

#### 7. **API Gateway Stack** (`museum-alert-api-{stage}`)
- **Purpose**: RESTful API endpoints.
- **Resources**:
  - REST API: `museum-alert-api`;
  - Cognito authorizer integration;
  - CORS configuration;
  - CloudWatch logging.

#### 8. **Triggers Stack** (`museum-alert-triggers-{stage}`)
- **Purpose**: event-driven automation and routing.
- **Resources**:
  - IoT Rules for message routing;
  - device connection status republishing;
  - automatic thing group management;
  - CloudWatch integration.

#### 9. **Config Output Stack** (`museum-alert-config-{stage}`)
- **Purpose**: configuration export for client applications.
- **Resources**:
  - Angular application configuration;
  - Arduino® sketch configuration;
  - endpoint URLs and resource IDs.

## API Endpoints

Base URL: `https://{api-gateway-id}.execute-api.{region}.amazonaws.com/dev`

All endpoints require **Cognito JWT authorization** header:

```bash
Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpOaUpHVTFVc3V...
```

### Company Management

#### GET `/company`

Gets current user's company information. The company ID is extracted from the JWT token's `custom:Company` property.

**Request:**
```bash
curl -X GET \
  https://{api-gateway-id}.execute-api.eu-west-2.amazonaws.com/dev/company \
  -H 'Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (200 OK):**
```json
{
   "data": {
      "memberCount": 1,
      "ownerEmail": "example@example.com",
      "companyId": "77da02c5-a086-1234-5678-62a884c51b55",
      "ownerUsername": "6642b2e4-1234-5678-38b0-78276fe4bcce",
      "companyName": "",
      "updatedAt": "2025-08-29T14:26:54.593Z",
      "members": [
         {
            "role": "owner",
            "email": "example@example.com",
            "joinedAt": "2025-08-29T14:26:54.593Z",
            "username": "6642b2e4-1234-5678-38b0-78276fe4bcce"
         }
      ],
      "status": "active",
      "createdAt": "2025-08-29T14:26:54.593Z",
      "userRole": "owner",
      "userJoinedAt": "2025-08-29T14:26:54.593Z"
   },
   "timestamp": "2025-09-01T13:51:22.667Z"
}
```

#### PATCH `/company`

Updates current user's company information. Supports partial updates for `companyName` and `status` fields only.

**Request:**
```bash
curl -X PATCH \
  https://{api-gateway-id}.execute-api.eu-west-2.amazonaws.com/dev/company \
  -H 'Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpO...' \
  -H 'Content-Type: application/json' \
  -d '{
    "companyName": "Museo Nazionale del Medioevo"
  }'
```

**Response (200 OK):**
```json
{
   "data": {
   "message": "Company updated successfully",
   "company": {
      "memberCount": 1,
      "ownerEmail": "example@example.com",
      "companyId": "77da02c5-a086-1234-5678-62a884c51b55",
      "ownerUsername": "6642b2e4-1234-5678-38b0-78276fe4bcce",
      "companyName": "Museo Nazionale del Medioevo",
      "updatedAt": "2025-09-01T13:54:09.291Z",
      "members": [
         {
         "role": "owner",
         "email": "example@example.com",
         "joinedAt": "2025-08-29T14:26:54.593Z",
         "username": "6642b2e4-1234-5678-38b0-78276fe4bcce"
         }
      ],
      "status": "active",
      "createdAt": "2025-08-29T14:26:54.593Z"
   },
   "updatedFields": [
      "companyName"
   ]
},
"timestamp": "2025-09-01T13:54:09.310Z"
}
```

### Device Provisioning

#### POST `/provisioning-claims`

Creates temporary certificates for device registration using AWS IoT provisioning template.

**Request:**
```bash
curl -X POST \
  https://{api-gateway-id}.execute-api.eu-west-2.amazonaws.com/dev/provisioning-claims \
  -H 'Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (201 Created):**
```json
{
   "data": {
      "message": "Successfully created provisioning claim",
      "certificateId": "758db7c963ae10fcb05d260055e6eb42e51b2aff761242e04e5332a9adc25bd0",
      "certificatePem": "-----BEGIN CERTIFICATE-----\nMIIDdzCCAl+ ... pt4cRxvmjkd\n-----END CERTIFICATE-----\n",
      "keyPair": {
         "PrivateKey": "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK ... zChXBYwadLx\n-----END RSA PRIVATE KEY-----\n",
         "PublicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgk ... R\nCQIDAQAB\n-----END PUBLIC KEY-----\n"
      },
      "expiration": "2025-09-01T14:04:43.000Z"
   },
   "timestamp": "2025-09-01T13:59:43.779Z"
}
```

### Device Management

#### GET `/things/{thingName}`

Checks if a device exists in the IoT registry and belongs to the user's company.

**Request:**
```bash
curl -X GET \
  https://{api-gateway-id}.execute-api.eu-west-2.amazonaws.com/dev/things/MAS-EC357A188534 \
  -H 'Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (200 OK) - Thing exists in user's company:**
```json
{
   "data": {
      "message": "Thing already exists in the logged user's company \"77da02c5-a086-1234-5678-62a884c51b55\"",
      "thingName": "MAS-EC357A188534",
      "company": "77da02c5-a086-1234-5678-62a884c51b55"
   },
   "timestamp": "2025-09-01T14:09:23.666Z"
}
```

**Response (404 Not Found):**
```json
{
   "error": {
      "message": "Thing not found in IoT registry",
      "timestamp": "2025-09-01T14:06:04.511Z"
   }
}
```

#### DELETE `/things/{thingName}`

Remove device from IoT registry including certificates and policies. Only works for devices in the user's company.

**Request:**
```bash
curl -X DELETE \
  https://{api-gateway-id}.execute-api.eu-west-2.amazonaws.com/dev/things/MAS-EC357A188534 \
  -H 'Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (200 OK):**
```json
{
   "data": {
      "message": "Thing 'MAS-EC357A188534' has been successfully deleted",
      "thingName": "MAS-EC357A188534",
      "company": "77da02c5-a086-1234-5678-62a884c51b55"
   },
   "timestamp": "2025-09-01T14:10:52.079Z"
}
```

### User Authorization

#### POST `/user-policy`

Attaches company-specific IoT permissions to the current user's Cognito Identity. The company ID is extracted from the JWT token's custom:Company property, and the policy is created if it doesn't exist.

**Request:**
```bash
curl -X POST \
  https://{api-gateway-id}.execute-api.eu-west-2.amazonaws.com/dev/user-policy \
  -H 'Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (200 OK):**
```json
{
   "data": {
      "message": "IoT policy attached and user attribute updated successfully",
      "policyName": "company-iot-policy-77da02c5-a086-1234-5678-62a884c51b55",
      "identityId": "eu-west-2:6642b2e4-1234-5678-38b0-78276fe4bcce",
      "company": "77da02c5-a086-1234-5678-62a884c51b55"
   },
   "timestamp": "2025-09-01T14:13:32.045Z"
}
```

### Error Responses

All endpoints return standard error responses with appropriate HTTP status codes in the following form:

```json
{
   "error": {
      "message": "Multiple requests to change this object were submitted simultaneously",
      "timestamp": "2025-09-01T14:22:22.259Z",
      "details": {
         "<optional_details_key>": "<optional_details_value>"
      }
   }
}
```

## Configuration Output

After successful deployment, the CDK outputs ready-to-use configuration values in the console for client applications:

### Angular/Desktop Application Configuration

```javascript
// Copy this from deployment output to src/environments/environment.*.ts
export const APP_CONFIG = {
  production: false,
  environment: 'DEV',
  aws: {
    apiGateway: 'https://xxxxxxxxxx.execute-api.eu-west-2.amazonaws.com/dev',
    region: 'eu-west-2',
    algorithm: 'AWS4-HMAC-SHA256',
    IoTCore: {
      endpoint: 'xxxxxxxxxx-ats.iot.eu-west-2.amazonaws.com',
      service: 'iotdevicegateway'
    },
    amplify: {
      Auth: {
        Cognito: {
          userPoolId: 'eu-west-2_xxxxxxxxx',
          userPoolClientId: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
          identityPoolId: 'eu-west-2:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          mandatorySignIn: true,
          authenticationFlowType: 'USER_SRP_AUTH'
        }
      }
    }
  },
  settings: {
    MQTT_RESPONSE_TIMEOUT: 10000,
    USB_RESPONSE_TIMEOUT: 10000,
  }
};
```

### Arduino Sketch Configuration

```cpp
// Copy this to config.h in the Arduino sketch
namespace AWS {
  static constexpr const char* IOT_CORE_ENDPOINT = "xxxxxxxxxx-ats.iot.eu-west-2.amazonaws.com";
}
```

![Configuration Output](./docs/images/configuration_output.png)

## Architecture Diagrams

### User Registration Flow
![User Registration Flow](./docs/images/registration_flow_diagram.svg)

### User Authentication Flow
![User Authentication Flow](./docs/images/authentication_flow_diagram.svg)

### Device Registration Flow
![Device Registration Flow](./docs/images/device_registration_flow_diagram.svg)

## Disclaimer

### Important Notice

This open source project, including all its submodules, documentation, and associated code (collectively, the "Project"), is provided for educational and experimental purposes only.

### No Warranty

THE PROJECT IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. THE AUTHOR MAKES NO WARRANTIES ABOUT THE ACCURACY, RELIABILITY, COMPLETENESS, OR TIMELINESS OF THE PROJECT OR ITS COMPONENTS.

### Limitation of Liability

IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE PROJECT OR THE USE OR OTHER DEALINGS IN THE PROJECT. THIS INCLUDES, BUT IS NOT LIMITED TO:

- **AWS Costs**: any charges incurred from AWS services deployed using the provided CDK templates;
- **Hardware Damage**: damage to Arduino boards, sensors, or other electronic components;
- **Data Loss**: loss of data or configuration settings;
- **Service Interruptions**: downtime or interruptions to connected services;
- **Security Issues**: any security vulnerabilities or breaches;
- **Indirect Damages**: lost profits, business interruption, or consequential damages of any kind.

### User Responsibility

By using this Project, you acknowledge and agree that:

1. **you use the Project entirely at your own risk**;
2. **you are responsible for understanding AWS pricing** and monitoring your usage to avoid unexpected charges;
3. **you should implement appropriate security measures** for any production deployments;
4. **you are responsible for compliance** with all applicable laws and regulations in your jurisdiction;
5. **you should test thoroughly** in development environments before any production use;
6. **you are responsible for backing up** any important data or configurations.

### AWS Specific Notice

This project may create AWS resources that incur charges; users are solely responsible for:
- understanding AWS pricing models;
- monitoring their AWS usage and costs;
- properly terminating or deleting resources when no longer needed;
- reviewing and understanding all CloudFormation templates before deployment.

### Third-Party Components

This Project may include or reference third-party libraries, services, or components. The author is not responsible for the functionality, security, or licensing of these third-party components. Users should review and comply with all applicable third-party licenses and terms of service.

### Modification and Distribution

Users may modify and distribute this Project under the terms of the applicable open source license. However, any modifications or distributions must include this disclaimer, and the author bears no responsibility for modified versions of the Project.

### Professional Advice

This Project is not intended to replace professional consultation. For production systems or critical applications, please consult with qualified professionals in the relevant fields.

### Acknowledgments

By downloading, cloning, forking, or otherwise using this Project, you acknowledge that you have read, understood, and agree to be bound by this disclaimer.

---

[license-badge]: https://img.shields.io/badge/license-MIT-blue.svg
[license]: https://github.com/humana-fragilitas/museum-alert-desktop/blob/main/LICENSE.md