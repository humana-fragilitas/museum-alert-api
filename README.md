# Museum Alert API

[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/humana-fragilitas/c5e59bb95d53e6062c676cd9b89120a4/raw/coverage-badge.json)](https://github.com/humana-fragilitas/museum-alert/actions)

AWS CDK-based infrastructure for the Museum Alert IoT project, providing cloud services for device management, user authentication, and real-time communication with Arduino-based ultrasonic sensors.

## Architecture Overview

This project creates a complete AWS infrastructure stack comprising:

- **API Gateway**: RESTful endpoints for device and user management;
- **AWS Cognito**: User authentication and authorization services;
- **AWS IoT Core**: Device connectivity, message routing, and provisioning;
- **AWS Lambda**: Serverless business logic and event processing;
- **DynamoDB**: NoSQL database for storing company and device data;
- **CloudWatch**: Logging, monitoring, and alerting.

## Prerequisites

### System Requirements
- **Node.js**: version 18.x or higher;
- **AWS CLI**: configured with appropriate credentials;
- **AWS CDK**: version 2.208.0 or higher.

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

All endpoints require **Cognito JWT authentication** via `Authorization` header.

### Authentication Header

All requests must include the Cognito JWT token:

```bash
Authorization: Bearer eyJraWQiOiJabEZyVGsxN2c4OVpOaUpHVTFVc3V...
```

### Company Management

#### GET `/company`

Get current user's company information.

**Request:**
```bash
curl -X GET \
  https://abcd123456.execute-api.eu-west-2.amazonaws.com/dev/company \
  -H 'Authorization: Bearer eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (200 OK):**
```json
{
  "companyId": "comp_uuid_12345",
  "name": "Louvre Museum",
  "address": "Rue de Rivoli, 75001 Paris, France",
  "contactEmail": "security@louvre.fr",
  "timezone": "Europe/Paris",
  "deviceCount": 15,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-08-20T14:22:00Z"
}
```

#### PATCH `/company`

Update current user's company information.

**Request:**
```bash
curl -X PATCH \
  https://abcd123456.execute-api.eu-west-2.amazonaws.com/dev/company \
  -H 'Authorization: Bearer eyJraWQiOiJabEZyVGsxN2c4OVpO...' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Louvre Museum - Security Division",
    "contactEmail": "security-alerts@louvre.fr",
    "timezone": "Europe/Paris"
  }'
```

**Response (200 OK):**
```json
{
  "companyId": "comp_uuid_12345",
  "name": "Louvre Museum - Security Division",
  "address": "Rue de Rivoli, 75001 Paris, France",
  "contactEmail": "security-alerts@louvre.fr",
  "timezone": "Europe/Paris",
  "deviceCount": 15,
  "updatedAt": "2024-08-29T16:45:00Z"
}
```

### Device Provisioning

#### POST `/provisioning-claims`

Create temporary certificates for device registration. Used during the device setup process.

**Request:**
```bash
curl -X POST \
  https://abcd123456.execute-api.eu-west-2.amazonaws.com/dev/provisioning-claims \
  -H 'Authorization: Bearer eyJraWQiOiJabEZyVGsxN2c4OVpO...' \
  -H 'Content-Type: application/json' \
  -d '{
    "serialNumber": "SENSOR_001_ABC123",
    "deviceType": "Museum-Alert-Sensor",
    "location": "Gallery 12 - Renaissance Wing"
  }'
```

**Response (201 Created):**
```json
{
  "claimId": "claim_uuid_67890",
  "serialNumber": "SENSOR_001_ABC123",
  "certificatePem": "-----BEGIN CERTIFICATE-----\nMIIDQTCCAimgAwIBAgITBmyfz5m...\n-----END CERTIFICATE-----",
  "privateKey": "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA2b1bXDa+cLg...\n-----END RSA PRIVATE KEY-----",
  "expiresAt": "2024-08-30T16:45:00Z",
  "status": "pending_activation"
}
```

### Device Management

#### GET `/things/{thingName}`

Get device information by serial number. The `thingName` parameter should be the device's serial number.

**Request:**
```bash
curl -X GET \
  https://abcd123456.execute-api.eu-west-2.amazonaws.com/dev/things/SENSOR_001_ABC123 \
  -H 'Authorization: Bearer eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (200 OK):**
```json
{
  "thingName": "SENSOR_001_ABC123",
  "thingType": "Museum-Alert-Sensor",
  "attributes": {
    "serialNumber": "SENSOR_001_ABC123",
    "location": "Gallery 12 - Renaissance Wing",
    "companyId": "comp_uuid_12345",
    "firmwareVersion": "1.2.3",
    "lastSeen": "2024-08-29T15:30:00Z"
  },
  "connectivity": {
    "connected": true,
    "lastConnected": "2024-08-29T15:30:00Z",
    "lastDisconnected": "2024-08-29T10:15:00Z"
  },
  "createdAt": "2024-07-15T09:20:00Z",
  "updatedAt": "2024-08-29T15:30:00Z"
}
```

**Response (404 Not Found):**
```json
{
  "error": "ThingNotFound",
  "message": "Device with serial number 'SENSOR_001_XYZ999' not found in your company fleet",
  "timestamp": "2024-08-29T16:45:00Z"
}
```

#### DELETE `/things/{thingName}`

Remove device from company fleet. This permanently deletes the device and its certificates.

**Request:**
```bash
curl -X DELETE \
  https://abcd123456.execute-api.eu-west-2.amazonaws.com/dev/things/SENSOR_001_ABC123 \
  -H 'Authorization: Bearer eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (200 OK):**
```json
{
  "message": "Device 'SENSOR_001_ABC123' successfully removed from company fleet",
  "thingName": "SENSOR_001_ABC123",
  "deletedAt": "2024-08-29T16:45:00Z",
  "certificatesRevoked": 1
}
```

### User Authorization

#### POST `/user-policy`

Attach IoT permissions to current user. This grants the user access to subscribe to device topics and send commands.

**Request:**
```bash
curl -X POST \
  https://abcd123456.execute-api.eu-west-2.amazonaws.com/dev/user-policy \
  -H 'Authorization: Bearer eyJraWQiOiJabEZyVGsxN2c4OVpO...'
```

**Response (200 OK):**
```json
{
  "message": "IoT policy successfully attached to user",
  "userId": "us-west-2:12345678-1234-1234-1234-123456789012",
  "policyName": "museum-alert-user-policy-comp_uuid_12345",
  "attachedAt": "2024-08-29T16:45:00Z",
  "permissions": [
    "iot:Subscribe",
    "iot:Receive",
    "iot:Publish"
  ],
  "allowedTopics": [
    "museum-alert/company/comp_uuid_12345/+/status",
    "museum-alert/company/comp_uuid_12345/+/data",
    "museum-alert/company/comp_uuid_12345/+/commands"
  ]
}
```

### Error Responses

All endpoints may return the following error responses:

#### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid authorization token",
  "timestamp": "2024-08-29T16:45:00Z"
}
```

#### 403 Forbidden
```json
{
  "error": "Forbidden", 
  "message": "User does not have permission to access this resource",
  "timestamp": "2024-08-29T16:45:00Z"
}
```

#### 500 Internal Server Error
```json
{
  "error": "InternalServerError",
  "message": "An unexpected error occurred. Please try again later.",
  "requestId": "12345678-1234-1234-1234-123456789012",
  "timestamp": "2024-08-29T16:45:00Z"
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

## Related Projects

This infrastructure supports:

- **[Museum Alert Desktop](https://github.com/humana-fragilitas/museum-alert-desktop)**: Cross-platform device management application
- **[Museum Alert Sketch](https://github.com/humana-fragilitas/museum-alert-sketch)**: Arduino firmware for ultrasonic sensors

## Architecture Diagrams

### User Registration Flow
![User Registration Flow](./docs/images/registration_flow_diagram.svg)

### User Authentication Flow
![User Authentication Flow](./docs/images/authentication_flow_diagram.svg)

### Device Registration Flow
![Device Registration Flow](./docs/images/device_registration_flow_diagram.svg)

---

