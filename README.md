# Museum Alert API

[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/humana-fragilitas/c5e59bb95d53e6062c676cd9b89120a4/raw/coverage-badge.json)](https://github.com/humana-fragilitas/museum-alert/actions)

AWS CDK-based infrastructure for the Museum Alert IoT project, providing cloud services for device management, user authentication, and real-time communication with Arduino-based ultrasonic sensors.

## Architecture Overview

This project creates a complete AWS infrastructure stack comprising:

- **API Gateway**: RESTful endpoints for device and user management
- **AWS Cognito**: User authentication and authorization services
- **AWS IoT Core**: Device connectivity, message routing, and provisioning
- **AWS Lambda**: Serverless business logic and event processing
- **DynamoDB**: NoSQL database for storing company and device data
- **CloudWatch**: Logging, monitoring, and alerting

## Prerequisites

### System Requirements
- **Node.js**: version 18.x or higher
- **AWS CLI**: configured with appropriate credentials
- **AWS CDK**: version 2.208.0 or higher

### AWS Account Setup

#### 1. Create IAM User for CDK Deployment

1. **Log into AWS Console** → Go to **IAM service**
2. **Create a new IAM user**:
   - Click "Users" → "Add users"
   - Enter username (e.g., "museum-alert-dev")
   - Select "Attach policies directly"
   - Attach "AdministratorAccess" policy (for development)
   - Click "Create user"
3. **Generate Access Keys**:
   - Click on the username → "Security credentials"
   - Click "Create access key" → Choose "Command Line Interface (CLI)"
   - **Save the credentials securely** - you won't see the secret key again!

#### 2. Configure AWS CLI

```bash
# Install AWS CLI if not already installed
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS credentials
aws configure --profile cdk-deploy
# Enter your Access Key ID and Secret Access Key
# Default region: eu-west-2 (for development) or eu-west-1 (for production)
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

### Option 1: AWS CloudShell (Recommended for first-time users)

1. **Open AWS CloudShell** in your AWS Console
2. **Clone and deploy**:
   ```bash
   git clone https://github.com/humana-fragilitas/museum-alert-api.git
   cd museum-alert-api
   npm install
   
   # Deploy to development environment
   npm run deploy:dev
   ```

### Option 2: Local Development

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
| `npm run deploy:prod` | Deploy all stacks to production | Production | eu-west-1 |

### Preview Commands

| Command | Description |
|---------|-------------|
| `npm run diff:dev` | Show changes that would be made to dev environment |
| `npm run diff:prod` | Show changes that would be made to prod environment |
| `npm run synth:dev` | Generate CloudFormation templates for dev |
| `npm run synth:prod` | Generate CloudFormation templates for prod |

### Cleanup Commands

| Command | Description |
|---------|-------------|
| `npm run destroy:dev` | ⚠️ Delete all development resources |
| `npm run destroy:prod` | ⚠️ Delete all production resources |

### Utility Commands

| Command | Description |
|---------|-------------|
| `npm run bootstrap:dev` | One-time CDK setup for dev region |
| `npm run bootstrap:prod` | One-time CDK setup for prod region |
| `npm test` | Run unit tests |
| `npm run test:coverage` | Run tests with coverage report |

## 🏭 Infrastructure Components

### Deployment Architecture

The infrastructure is organized into **9 interconnected CloudFormation stacks**:

#### 1. **IAM Stack** (`museum-alert-iam-{stage}`)
- **Purpose**: Identity and Access Management roles and policies
- **Resources**:
  - Lambda execution roles
  - IoT provisioning roles
  - Cross-service permissions

#### 2. **Shared Infrastructure Stack** (`museum-alert-shared-infra-{stage}`)
- **Purpose**: Common resources shared across services
- **Resources**:
  - Lambda Layer with shared utilities
  - Common libraries and dependencies

#### 3. **Database Stack** (`museum-alert-database-{stage}`)
- **Purpose**: Data persistence layer
- **Resources**:
  - DynamoDB table: `companies` (company information storage)
  - Pay-per-request billing
  - Point-in-time recovery enabled

#### 4. **Cognito Stack** (`museum-alert-cognito-{stage}`)
- **Purpose**: User authentication and authorization
- **Resources**:
  - User Pool: `museum-alert-user-pool-open-signup`
  - Identity Pool: `museum-alert-identity-pool`
  - User Pool Client for web/mobile applications
  - Post-confirmation Lambda trigger

#### 5. **Lambda Stack** (`museum-alert-lambda-{stage}`)
- **Purpose**: Serverless business logic
- **Resources**:
  - **Company Management**: `getCompanyLambda`, `updateCompanyLambda`
  - **Device Provisioning**: `createProvisioningClaimLambda`, `preProvisioningHookLambda`
  - **Device Management**: `checkThingExistsLambda`, `deleteThingLambda`
  - **IoT Integration**: `attachIoTPolicyLambda`, `addThingToGroupLambda`
  - **Event Processing**: `republishDeviceConnectionStatusLambda`

#### 6. **IoT Stack** (`museum-alert-iot-{stage}`)
- **Purpose**: IoT device connectivity and management
- **Resources**:
  - Thing Type: `Museum-Alert-Sensor`
  - Provisioning Template: `museum-alert-provisioning-template`
  - IoT Policies: device and user access policies
  - Device provisioning workflow

#### 7. **API Gateway Stack** (`museum-alert-api-{stage}`)
- **Purpose**: RESTful API endpoints
- **Resources**:
  - REST API: `museum-alert-api`
  - Cognito authorizer integration
  - CORS configuration
  - CloudWatch logging

#### 8. **Triggers Stack** (`museum-alert-triggers-{stage}`)
- **Purpose**: Event-driven automation and routing
- **Resources**:
  - IoT Rules for message routing
  - Device connection status republishing
  - Automatic thing group management
  - CloudWatch integration

#### 9. **Config Output Stack** (`museum-alert-config-{stage}`)
- **Purpose**: Configuration export for client applications
- **Resources**:
  - Angular application configuration
  - Arduino sketch configuration
  - Endpoint URLs and resource IDs

## API Endpoints

Base URL: `https://{api-gateway-id}.execute-api.{region}.amazonaws.com/{stage}`

All endpoints require **Cognito JWT authentication** via `Authorization` header.

### Company Management

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/company` | GET | Get current user's company information | None | Company object |
| `/company` | PATCH | Update current user's company information | Company data | Updated company object |

### Device Provisioning

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/provisioning-claims` | POST | Create temporary certificates for device registration | Device metadata | Certificate and private key |

### Device Management

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/things/{thingName}` | GET | Get device information by serial number | None | Device object |
| `/things/{thingName}` | DELETE | Remove device from company fleet | None | Deletion confirmation |

### User Authorization

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/user-policy` | POST | Attach IoT permissions to current user | None | Policy attachment confirmation |

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

## 🌍 Environment Configuration

### Development Environment (`dev`)
- **Region**: `eu-west-2` (Europe - London)
- **Purpose**: Testing and development
- **Features**: Debug logging, auto-cleanup on destroy
- **Cost**: Minimal (pay-per-use resources)

### Production Environment (`prod`)
- **Region**: `eu-west-1` (Europe - Ireland)
- **Purpose**: Live production workloads
- **Features**: Enhanced logging, resource retention
- **Cost**: Production-scale pricing

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
- Use the configuration outputs to test with client applications
- Verify API endpoints and IoT functionality

### 4. Deploy to Production
```bash
# Preview production changes
npm run diff:prod

# Deploy to production
npm run deploy:prod
```

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

## ⚠️ Important Notes

- **Bootstrap is required** once per AWS account/region before first deployment
- **Development resources** are configured for auto-deletion to minimize costs
- **Production resources** are retained even after stack deletion for data protection
- **Configuration outputs** are essential for client application setup
- **IAM permissions** require administrative access for initial setup

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

