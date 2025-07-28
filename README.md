# museum-alert-api
RESTful APIs meant to complement the "Museum Alert" IoT project

## Lambda layer deployment

Zip and upload the nodejs folder.

## Prerequisites

### Getting AWS Access Keys

Option 1: Create IAM User (Recommended for Development)

Log into AWS Console → Go to IAM service
Create a new IAM user:

- Click "Users" → "Add users"
- Enter username (e.g., "iot-project-dev")
- Select "Attach policies directly"
   - Attach permissions:
   - For development/testing: Attach "AdministratorAccess (AWS managed - job function)" policy
   - For production: Create more restrictive policies later
- Click "Create user"
- Click on username "iot-project-dev"
- Click on "Create access key", the choose "Use case: Command Line Iterface (CLI)"
- Take note of access key and secret access key and/or download the "iot-project-dev_accessKeys.csv" file containing the credentials

Download credentials:

Copy the Access Key ID and Secret Access Key
Important: Save these securely - you won't see the secret key again!

### Install AWS CDK globally:

```bash
npm install -g aws-cdk
```

# Verify your setup:

```bash
cdk --version
aws --version
aws configure
````

Enter your credentials when prompted

- AWS Access Key ID: (from the CSV)
- AWS Secret Access Key: (from the CSV)
- Default region name: us-west-1
- Default output format: json

Then test the connection: This should show your AWS account info

```bash
aws sts get-caller-identity
```

You should see an output as follows:

```bash
{
    "UserId": "{USER_ID}",
    "Account": "{ACCOUNT_ID}",
    "Arn": "arn:aws:iam::{ACCOUNT_ID}:user/iot-project-dev"
}
```

Bootstrap environment

```bash
cdk bootstrap
```

Useful commands

```bash
# Make sure your AWS CLI is pointing to eu-west-1
aws configure get region

# If not eu-west-1, set it:
aws configure set region eu-west-1

# Or set temporarily:
export AWS_DEFAULT_REGION=eu-west-1

# Now run the inventory against your working infrastructure
chmod +x scripts/inventory.sh
./scripts/inventory.sh

# Then analyze the patterns
./scripts/analyze-resources.sh
```

# ==== CLAUDE DOCUMENTATION ==== 

# IoT Project - Infrastructure Deployment

This project supports two deployment methods. Choose the one that works best for you:

## 🚀 Quick Start (AWS CloudShell) - Recommended

**Perfect for: Quick testing, first-time users, or those who want minimal setup**

1. **Open AWS CloudShell**:
   - Log into your AWS Console
   - Click the CloudShell icon (terminal) in the top navigation bar
   - Wait for the environment to initialize

2. **Clone and Deploy**:
   ```bash
   # Clone the repository
   git clone https://github.com/your-username/your-iot-project.git
   cd your-iot-project/infrastructure
   
   # Install dependencies
   npm install
   
   # Deploy (includes automatic bootstrap)
   npm run deploy:dev
   ```

3. **Access your deployment**:
   - The deployment will output important URLs and identifiers
   - Use these in your Angular app configuration

**Pros**: No credential setup, consistent environment, secure
**Cons**: 1GB storage limit, requires internet connection

---

## 💻 Local Development Setup

**Perfect for: Contributors, developers who want to modify the code, or extended development**

### Prerequisites
- Node.js 18+ installed locally
- AWS CLI configured with credentials

### Setup Steps
1. **Install AWS CDK**:
   ```bash
   npm install -g aws-cdk
   ```

2. **Configure AWS Credentials**:
   ```bash
   aws configure
   # Enter your Access Key ID, Secret Access Key, and preferred region
   ```

3. **Clone and Deploy**:
   ```bash
   git clone https://github.com/your-username/your-iot-project.git
   cd your-iot-project/infrastructure
   npm install
   npm run deploy:dev  # Includes automatic bootstrap
   ```

**Pros**: Full IDE support, unlimited storage, offline capability
**Cons**: Requires credential management, more setup steps

---

## 🛠️ Development Commands

Once you have either setup working:

```bash
# Preview changes before deployment
npm run diff:dev

# Deploy specific stack
cdk deploy iot-project-lambda-dev --context stage=dev

# Clean up resources
npm run destroy:dev
```

## ⚠️ Important Notes

- **Development environment** deploys to `eu-west-1` by default
- **Production environment** uses `us-west-1` (use `npm run deploy:prod`)
- All resources are tagged and named consistently for easy identification
- DynamoDB tables in development are set to auto-delete when stack is destroyed