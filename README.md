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

# Then, before deploying
# Configure a new profile for CDK
aws configure --profile cdk-deploy
# Enter the Access Key ID and Secret for your CDK user
# Region: eu-west-2
# Output format: json
```

# Clean up and redeploy

```bash
# Clean up the failed stack
npm run destroy:dev

# Verify all stacks are gone
aws cloudformation list-stacks --region eu-west-2 --stack-status-filter DELETE_COMPLETE --query 'StackSummaries[?contains(StackName, `museum-alert`)].StackName'

# Deploy again with proper dependencies
npm run deploy:dev
```

If ```npm run destroy:dev```fails:

aws cloudformation list-stacks \
  --query "StackSummaries[?StackStatus=='CREATE_COMPLETE'].StackName" \
  --profile cdk-deploy \
  --region eu-west-2

And deleted stacks one by one:

```cdk destroy museum-alert-cognito-dev --context stage=dev --force```

Or...

```bash
#!/bin/bash

# Set AWS profile and region
AWS_PROFILE=cdk-deploy
REGION=eu-west-2
CONTEXT=stage=dev

# Get stack names with CREATE_COMPLETE status
STACKS=$(aws cloudformation list-stacks \
  --profile $AWS_PROFILE \
  --region $REGION \
  --query "StackSummaries[?StackStatus=='CREATE_COMPLETE'].StackName" \
  --output text)

# Loop through stacks and destroy them one by one
for STACK in $STACKS; do
  echo "Destroying stack: $STACK"
  cdk destroy $STACK --context $CONTEXT --force --profile $AWS_PROFILE
done
```

# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template


# ==== WHAT ARE THE NPM SCRIPTS MEANT FOR ====

Deployment Scripts
deploy:dev and deploy:prod
bashnpm run build && cdk deploy --all --context stage=dev --require-approval never

npm run build: Compiles TypeScript to JavaScript first
cdk deploy --all: Deploys ALL stacks in your app
--context stage=dev: Sets the stage variable to "dev" (or "prod")

This makes your app use the dev config from environments.ts (eu-west-2)
Or prod config (eu-west-1)


--require-approval never: Skips confirmation prompts (auto-approves changes)

Result: Creates your entire infrastructure in the specified region
Destruction Scripts
destroy:dev and destroy:prod
bashcdk destroy --all --context stage=dev --force

cdk destroy --all: Deletes ALL stacks and resources
--context stage=dev: Targets the dev environment (eu-west-2)
--force: Skips confirmation prompts (immediately destroys)

⚠️ Warning: This permanently deletes all your infrastructure!
Preview Scripts
diff:dev and diff:prod
bashcdk diff --all --context stage=dev

Shows what changes would be made WITHOUT actually deploying
Compares your CDK code vs. what's currently deployed
Safe to run - doesn't make any changes

synth:dev and synth:prod
bashcdk synth --all --context stage=dev

Generates CloudFormation templates from your CDK code
Shows the raw AWS CloudFormation that would be created
Saves templates to cdk.out/ directory
Safe to run - doesn't deploy anything

Bootstrap Scripts
bootstrap:dev and bootstrap:prod
bashcdk bootstrap --context stage=dev

One-time setup required per AWS account/region
Creates S3 bucket and IAM roles needed for CDK deployments
Only needs to be run once per region
Safe to run multiple times (idempotent)

Utility Scripts
inventory
bash./scripts/inventory.sh

Runs your custom script to document existing AWS resources
Useful for understanding current infrastructure

Typical Workflow
bash# 1. Preview what will be created
npm run diff:dev

# 2. Deploy to test region (eu-west-2)
npm run deploy:dev

# 3. Test your application...

# 4. If everything works, preview production changes
npm run diff:prod

# 5. Deploy to production (eu-west-1)
npm run deploy:prod

# 6. Clean up test environment when done
npm run destroy:dev
The --context stage=dev is what tells your app which configuration to use from environments.ts!

# ==== BOOTSTRAP ====

No, bootstrapping is NOT dangerous at all! It's actually a required prerequisite for CDK deployments. Let me explain what it does:
What CDK Bootstrap Does ✅
CDK bootstrap is a one-time setup that creates essential infrastructure CDK needs to work:
Creates Safe Infrastructure:

S3 bucket - For storing CloudFormation templates and Lambda code
IAM roles - For CDK to deploy resources on your behalf
SSM parameters - For version tracking
ECR repository - For container images (if needed)

What It DOESN'T Do:

❌ Doesn't create your application resources (Lambda, API Gateway, etc.)
❌ Doesn't modify existing resources
❌ Doesn't cost much (S3 bucket + minimal IAM roles)
❌ Doesn't affect your production environment (this is dev-only)

The Bootstrap Command Breakdown
bashnpm run bootstrap:dev
Translates to:
bashcdk bootstrap --context stage=dev
Which runs:
bashcdk bootstrap aws://767398097786/eu-west-2
What You'll See
Bootstrap creates resources with names like:

cdk-hnb659fds-assets-767398097786-eu-west-2 (S3 bucket)
cdk-hnb659fds-deploy-role-767398097786-eu-west-2 (IAM role)
A few SSM parameters

Why You Need It
Without bootstrap: CDK has nowhere to store your Lambda code and CloudFormation templates, so deployment fails.
With bootstrap: CDK uploads your code to the S3 bucket, then deploys from there.
Cost Impact 💰
Minimal cost:

S3 bucket: ~$0.02/month (nearly free)
IAM roles: Free
SSM parameters: Free

Is It Safe? 🛡️
Absolutely yes:

✅ Standard AWS best practice
✅ Used by millions of CDK developers
✅ Only creates support infrastructure
✅ Can be deleted anytime with cdk bootstrap --cleanup

Recommendation
Just run it! It's completely safe and necessary:
bashnpm run bootstrap:dev
npm run deploy:dev
The bootstrap only needs to run once per region per account. After that, you can deploy as many CDK apps as you want in that region.
Would you like to proceed with bootstrapping?RiprovaABWhen I am done with testing, how do I reverse this bootstrap?ModificaGreat question! Here are the ways to clean up the bootstrap resources when you're done:
Option 1: Automatic Cleanup (Easiest) ✅
CDK v2 has a built-in cleanup command:
bashcdk bootstrap --toolkit-stack-name CDKToolkit --cleanup
Or for your specific region:
bashcdk bootstrap --context stage=dev --cleanup
This removes all bootstrap resources automatically.
Option 2: Manual Cleanup (More Control) 🔧
If the automatic cleanup doesn't work or you want more control:
1. Delete the CloudFormation Stack
bashaws cloudformation delete-stack --stack-name CDKToolkit --region eu-west-2
2. Empty and Delete S3 Bucket
bash# List the bucket name first
aws s3 ls | grep cdk-hnb659fds-assets

# Empty the bucket (replace with actual bucket name)
aws s3 rm s3://cdk-hnb659fds-assets-767398097786-eu-west-2 --recursive

# Delete the bucket
aws s3 rb s3://cdk-hnb659fds-assets-767398097786-eu-west-2
Option 3: AWS Console (Visual) 🖱️

CloudFormation Console:

Go to CloudFormation in eu-west-2
Find stack named "CDKToolkit"
Delete it


S3 Console:

Go to S3
Find bucket cdk-hnb659fds-assets-*
Empty and delete it



What Gets Cleaned Up 🧹
Bootstrap cleanup removes:

✅ S3 bucket and all contents
✅ IAM roles (cdk-*-deploy-role, cdk-*-file-publishing-role, etc.)
✅ SSM parameters (/cdk-bootstrap/*/version)
✅ ECR repository (if created)

Important Notes ⚠️

Don't cleanup while stacks exist - First destroy your app stacks:
bashnpm run destroy:dev
# Then cleanup bootstrap
cdk bootstrap --cleanup

Per-region cleanup - Bootstrap is per-region, so clean up each region separately
Shared bootstrap - If you have other CDK apps in the same region, don't cleanup until all are destroyed

Complete Cleanup Sequence 📝
When you're completely done testing:
bash# 1. Destroy your application stacks
npm run destroy:dev

# 2. Clean up bootstrap
cdk bootstrap --context stage=dev --cleanup

# 3. Verify cleanup (should show no CDK resources)
aws cloudformation list-stacks --region eu-west-2 --query 'StackSummaries[?contains(StackName, `CDK`) || contains(StackName, `cdk`)]'
Cost During Testing 💰
Don't worry about costs during testing:

Bootstrap resources cost ~$0.02/month
Your actual app resources (Lambda, API Gateway, etc.) cost more, but are deleted with npm run destroy:dev

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


### ERRORS

state of deployment

------------------------------------------------------------------------------------------------------------------------------------
|                                                        DescribeStackEvents                                                       |
+-----------------------------------+---------------------+-----------------------------------------+------------------------------+
|  2025-07-28T13:08:15.060000+00:00 |  CREATE_COMPLETE    |  CognitoTriggerUpdaterLogGroup4B83A68F  |  None                        |
|  2025-07-28T13:08:12.854000+00:00 |  CREATE_IN_PROGRESS |  CognitoTriggerResource                 |  None                        |
|  2025-07-28T13:08:12.282000+00:00 |  CREATE_COMPLETE    |  CognitoTriggerUpdater81E025A2          |  None                        |
|  2025-07-28T13:08:07.972000+00:00 |  CREATE_IN_PROGRESS |  CognitoTriggerUpdaterLogGroup4B83A68F  |  Resource creation Initiated |
|  2025-07-28T13:08:07.108000+00:00 |  CREATE_IN_PROGRESS |  CognitoTriggerUpdaterLogGroup4B83A68F  |  None                        |
+-----------------------------------+---------------------+-----------------------------------------+------------------------------+

Hanged for 30 minutes here

To investigate:

aws cloudformation describe-stack-events --stack-name museum-alert-triggers-dev --region eu-west-2 --query 'StackEvents[0:5].[Timestamp,ResourceStatus,LogicalResourceId,ResourceStatusReason]' --output table

This function errors out:

CognitoTriggerUpdaterLogGroup4B83A68F

It is probably not needed

## Architecture diagrams

### User registration flow

![alt text](./docs/images/registration_flow_diagram.svg "Museum Alert User Registration Flow Diagram")

### User authentication flow

![alt text](./docs/images/authentication_flow_diagram.svg "Museum Alert User Authentication Flow Diagram")

### Device registration flow

![alt text](./docs/images/device_registration_flow_diagram.svg "Museum Alert Device Registration Flow Diagram")