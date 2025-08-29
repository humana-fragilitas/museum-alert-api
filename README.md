# Museum Alert API

[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/humana-fragilitas/c5e59bb95d53e6062c676cd9b89120a4/raw/coverage-badge.json)](https://github.com/humana-fragilitas/museum-alert/actions)

AWS CDK-based infrastructure for the Museum Alert IoT project, providing cloud services for device management, user authentication, and real-time communication with Arduino-based ultrasonic sensors.

## Related Projects

This infrastructure supports:

- **[Museum Alert Desktop](https://github.com/humana-fragilitas/museum-alert-desktop)**: cross-platform device management application;
- **[Museum Alert Sketch](https://github.com/humana-fragilitas/museum-alert-sketch)**: Arduino firmware for ultrasonic sensors.

## Architecture Overview

This project creates a complete AWS infrastructure stack comprising:

- **API Gateway**: RESTful endpoints for device and user management;
- **AWS Cognito**: user authentication and authorization services;
- **AWS IoT Core**: device connectivity, message routing, and provisioning;
- **AWS Lambda**: serverless business logic and event processing;
- **DynamoDB**: NoSQL database for storing company and device data;
- **CloudWatch**: logging, monitoring, and alerting.

## Prerequisites

⚠️ **Please read the [disclaimer](#disclaimer) before using this project.**

### System Requirements
- **Node.js**: version 22.12.0 or higher;
- **AWS CLI**: version 2.16.12 or higher, configured with appropriate credentials;
- **AWS CDK**: version 2.1022.0 or higher.

### AWS Account Setup

#### 1. Create IAM User for CDK Deployment

1. **Log into AWS Console** → Go to **IAM service**
2. **Create a new IAM user**:
   - click "Users" → "Add users";
   - enter username (e.g., "museum-alert-dev");
   - select "Attach policies directly";
   - attach "AdministratorAccess" policy (for development);
   - click "Create user".
3. **Generate Access Keys**:
   - click on the username → "Security credentials";
   - click "Create access key" → Choose "Command Line Interface (CLI)";
   - **Save the credentials securely** - you won't see the secret key again!

#### 2. Install and Configure AWS CLI

Install the AWS CLI following the [instructions on the official guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).

```bash
# Configure AWS credentials
aws configure --profile cdk-deploy
# Enter your Access Key ID and Secret Access Key
# Default region: eu-west-2 (for development)
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

## 🏭 Infrastructure Components

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
- **Purpose**: User authentication and authorization.
- **Resources**:
  - User Pool: `museum-alert-user-pool-open-signup`;
  - Identity Pool: `museum-alert-identity-pool`;
  - User Pool Client for web/mobile applications;
  - Post-confirmation Lambda trigger.

#### 5. **Lambda Stack** (`museum-alert-lambda-{stage}`)
- **Purpose**: Serverless business logic.
- **Resources**:
  - **Company Management**: `getCompanyLambda`, `updateCompanyLambda`;
  - **Device Provisioning**: `createProvisioningClaimLambda`, `preProvisioningHookLambda`;
  - **Device Management**: `checkThingExistsLambda`; `deleteThingLambda`
  - **IoT Integration**: `attachIoTPolicyLambda`, `addThingToGroupLambda`;
  - **Event Processing**: `republishDeviceConnectionStatusLambda`.

#### 6. **IoT Stack** (`museum-alert-iot-{stage}`)
- **Purpose**: IoT device connectivity and management.
- **Resources**:
  - Thing Type: `Museum-Alert-Sensor`
  - Provisioning Template: `museum-alert-provisioning-template`
  - IoT Policies: device and user access policies
  - Device provisioning workflow

#### 7. **API Gateway Stack** (`museum-alert-api-{stage}`)
- **Purpose**: RESTful API endpoints.
- **Resources**:
  - REST API: `museum-alert-api`;
  - Cognito authorizer integration;
  - CORS configuration;
  - CloudWatch logging.

#### 8. **Triggers Stack** (`museum-alert-triggers-{stage}`)
- **Purpose**: Event-driven automation and routing.
- **Resources**:
  - IoT Rules for message routing;
  - device connection status republishing;
  - automatic thing group management;
  - CloudWatch integration.

#### 9. **Config Output Stack** (`museum-alert-config-{stage}`)
- **Purpose**: Configuration export for client applications.
- **Resources**:
  - Angular application configuration;
  - Arduino sketch configuration;
  - endpoint URLs and resource IDs.

## API Endpoints

Base URL: `https://{api-gateway-id}.execute-api.{region}.amazonaws.com/dev`

All endpoints require **Cognito JWT authorization**:

```bash
Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpOaUpHVTFVc3V...
```

### Company Management

#### GET `/company`

Get current user's company information. The company ID is extracted from the JWT token's `custom:Company` property.

**Request:**
```bash
curl -X GET \
  https://{api-gateway-id}.execute-api.eu-west-2.amazonaws.com/dev/company \
  -H 'Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (200 OK):**
```json
{
  "statusCode": 200,
  "body": {
    "companyId": "123e4567-e89b-12d3-a456-426614174000",
    "companyName": "Louvre Museum Security",
    "status": "active",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-06-12T14:22:15.000Z",
    "ownerEmail": "security@louvre.fr",
    "ownerUsername": "security@louvre.fr",
    "memberCount": 3,
    "members": [
      {
        "email": "security@louvre.fr",
        "username": "security@louvre.fr",
        "role": "owner",
        "joinedAt": "2024-01-15T10:30:00.000Z"
      },
      {
        "email": "guard1@louvre.fr",
        "username": "guard1@louvre.fr",
        "role": "member",
        "joinedAt": "2024-01-16T09:15:00.000Z"
      }
    ],
    "userRole": "owner",
    "userJoinedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### PATCH `/company`

Update current user's company information. Supports partial updates for `companyName` and `status` fields only.

**Request:**
```bash
curl -X PATCH \
  https://{api-gateway-id}.execute-api.eu-west-2.amazonaws.com/dev/company \
  -H 'Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpO...' \
  -H 'Content-Type: application/json' \
  -d '{
    "companyName": "Louvre Museum - Security Division",
    "status": "active"
  }'
```

**Response (200 OK):**
```json
{
  "statusCode": 200,
  "body": {
    "message": "Company updated successfully",
    "company": {
      "companyId": "123e4567-e89b-12d3-a456-426614174000",
      "companyName": "Louvre Museum - Security Division",
      "status": "active",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-08-29T16:45:00.000Z",
      "ownerEmail": "security@louvre.fr",
      "memberCount": 3,
      "members": [...]
    },
    "updatedFields": ["companyName", "status"]
  }
}
```

### Device Provisioning

#### POST `/provisioning-claims`

Create temporary certificates for device registration using AWS IoT provisioning template.

**Request:**
```bash
curl -X POST \
  https://{api-gateway-id}.execute-api.eu-west-2.amazonaws.com/dev/provisioning-claims \
  -H 'Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (201 Created):**
```json
{
  "statusCode": 201,
  "body": {
    "message": "Successfully created provisioning claim",
    "certificateId": "a1b2c3d4e5f6789012345678901234567890abcd",
    "certificatePem": "-----BEGIN CERTIFICATE-----\nMIIDQTCCAimgAwIBAgITBmyfz5m...\n-----END CERTIFICATE-----",
    "keyPair": {
      "PublicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEF...\n-----END PUBLIC KEY-----",
      "PrivateKey": "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA2b1bXDa+cLg...\n-----END RSA PRIVATE KEY-----"
    },
    "expiration": "2024-08-30T16:45:00.000Z"
  }
}
```

### Device Management

#### GET `/things/{thingName}`

Check if a device exists in the IoT registry and belongs to the user's company.

**Request:**
```bash
curl -X GET \
  https://{api-gateway-id}.execute-api.eu-west-2.amazonaws.com/dev/things/SENSOR_001_ABC123 \
  -H 'Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (200 OK) - Thing exists in user's company:**
```json
{
  "statusCode": 200,
  "body": {
    "message": "Thing already exists in the logged user's company \"123e4567-e89b-12d3-a456-426614174000\"",
    "thingName": "SENSOR_001_ABC123",
    "company": "123e4567-e89b-12d3-a456-426614174000"
  }
}
```

**Response (404 Not Found):**
```json
{
  "statusCode": 404,
  "body": {
    "error": "THING_NOT_FOUND",
    "message": "Thing not found in IoT registry"
  }
}
```

#### DELETE `/things/{thingName}`

Remove device from IoT registry including certificates and policies. Only works for devices in the user's company.

**Request:**
```bash
curl -X DELETE \
  https://{api-gateway-id}.execute-api.eu-west-2.amazonaws.com/dev/things/SENSOR_001_ABC123 \
  -H 'Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (200 OK):**
```json
{
  "statusCode": 200,
  "body": {
    "message": "Thing and associated resources deleted successfully",
    "thingName": "SENSOR_001_ABC123",
    "deletedResources": {
      "certificates": 1,
      "policies": 2,
      "thing": true
    }
  }
}
```

### User Authorization

#### POST `/user-policy`

Attach company-specific IoT permissions to the current user's Cognito Identity. Creates the policy if it doesn't exist.

**Request:**
```bash
curl -X POST \
  https://{api-gateway-id}.execute-api.eu-west-2.amazonaws.com/dev/user-policy \
  -H 'Authorization: eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (200 OK):**
```json
{
  "statusCode": 200,
  "body": {
    "message": "IoT policy successfully attached to user identity",
    "policyName": "museum-alert-user-policy-123e4567-e89b-12d3-a456-426614174000",
    "identityId": "eu-west-2:12345678-1234-1234-1234-123456789012",
    "company": "123e4567-e89b-12d3-a456-426614174000",
    "permissions": {
      "connect": "arn:aws:iot:eu-west-2:123456789012:client/${cognito-identity.amazonaws.com:sub}",
      "subscribe": [
        "arn:aws:iot:eu-west-2:123456789012:topicfilter/museum-alert/123e4567-e89b-12d3-a456-426614174000/+/data",
        "arn:aws:iot:eu-west-2:123456789012:topicfilter/museum-alert/123e4567-e89b-12d3-a456-426614174000/+/status"
      ],
      "publish": [
        "arn:aws:iot:eu-west-2:123456789012:topic/museum-alert/123e4567-e89b-12d3-a456-426614174000/+/commands"
      ]
    }
  }
}
```

### Error Responses

All endpoints may return the following standard error responses:

#### 401 Unauthorized
```json
{
  "statusCode": 401,
  "body": {
    "error": "UNAUTHORIZED",
    "message": "Missing or invalid authentication context"
  }
}
```

#### 403 Forbidden
```json
{
  "statusCode": 403,
  "body": {
    "error": "ACCESS_DENIED",
    "message": "User does not have permission to access this resource"
  }
}
```

#### 500 Internal Server Error
```json
{
  "statusCode": 500,
  "body": {
    "error": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred. Please try again later.",
    "details": "Specific error details when available"
  }
}
```

## Configuration Output

After successful deployment, the system provides ready-to-use configuration for client applications:

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

## Environment Configuration

### Development Environment (`dev`)
- **Region**: `eu-west-2` (Europe - London)
- **Purpose**: Testing and development
- **Features**: Debug logging, auto-cleanup on destroy
- **Cost**: Minimal (pay-per-use resources)

## Development Workflow

### 1. Preview Changes
```bash
# See what would change before deploying
npm run diff:dev
```

### 2. Deploy to Development
```bash
# Deploy all stacks
npm run deploy:dev
```

### 3. Test Your Changes
- Use the configuration outputs to test with client applications;
- verify API endpoints and IoT functionality.

### 5. Cleanup Development Resources
```bash
# Remove all development resources
npm run destroy:dev
```

## Monitoring and Logging

The infrastructure includes comprehensive monitoring:

- **CloudWatch Logs**: All Lambda functions and API Gateway
- **CloudWatch Metrics**: API Gateway performance and Lambda execution
- **IoT Logging**: Device connection and message flow
- **Access Logs**: API Gateway request/response logging

## Cost Optimization

### Development Environment
- **DynamoDB**: Pay-per-request (minimal cost for testing)
- **Lambda**: Free tier eligible
- **API Gateway**: Pay-per-request
- **IoT Core**: Pay-per-message

## Security Features

- **IAM Roles**: Least-privilege access principles
- **Cognito Authentication**: JWT token-based API access
- **IoT Policies**: Device-specific permissions
- **VPC Integration**: Optional for enhanced security
- **Encryption**: Data encrypted in transit and at rest

## Troubleshooting

### Common Issues

1. **Bootstrap Required**:
   ```bash
   npm run bootstrap:dev
   ```

2. **Permission Denied**:
   - Verify AWS credentials and IAM permissions
   - Check AWS profile configuration

3. **Stack Dependency Errors**:
   - Stacks have built-in dependency management
   - Use `npm run destroy:dev` and redeploy if needed

4. **Region Mismatch**:
   - Ensure AWS CLI region matches environment configuration
   - Dev: `eu-west-2`

### Cleanup Failed Deployments

```bash
# List all stacks
aws cloudformation list-stacks --region eu-west-2 --profile cdk-deploy

# Force cleanup if needed
npm run destroy:dev
```

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

The [museum-alert-desktop](https://github.com/humana-fragilitas/museum-alert-desktop) project has been derived from Maxime Gris's [angular-electron](https://github.com/maximegris/angular-electron) starter project (see the license for further information).

---



