import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';

// Initialize the Cognito client
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

/**
 * Cognito Pre Sign-up Lambda Trigger
 * 
 * This function:
 * 1. Checks if another user exists with the same company name
 * 2. If exists, throws an error to prevent registration
 * 3. If not exists, sanitizes the company name (spaces -> hyphens)
 * 4. Allows registration to proceed
 */
export const handler = async (event) => {
  console.log('Pre Sign-up trigger event:', JSON.stringify(event, null, 2));

  try {
    // Get the user pool ID from the event
    const userPoolId = event.userPoolId;
    
    // Extract the custom:Company attribute from user attributes
    const userAttributes = event.request.userAttributes;
    const companyName = userAttributes['custom:Company'];

    if (!companyName) {
      throw new Error('Company name is required for registration');
    }

    console.log(`Checking if company "${companyName}" already exists...`);

    // Step 1: Check if any user already exists with this company name
    const existingUsers = await findUsersByCompany(userPoolId, companyName);

    if (existingUsers.length > 0) {
      console.log(`Found ${existingUsers.length} existing user(s) with company: ${companyName}`);
      
      // Prevent registration by throwing an error
      throw new Error(`A user with company "${companyName}" already exists. Please contact your system administrator.`);
    }

    console.log(`No existing users found for company: ${companyName}`);

    // Step 2: Sanitize company name (replace spaces with hyphens)
    const sanitizedCompanyName = sanitizeCompanyName(companyName);
    
    if (sanitizedCompanyName !== companyName) {
      console.log(`Sanitized company name from "${companyName}" to "${sanitizedCompanyName}"`);
      
      // Update the user attribute with sanitized value
      event.response.userAttributes = {
        ...event.request.userAttributes,
        'custom:Company': sanitizedCompanyName
      };
    }

    console.log('Pre Sign-up validation passed, proceeding with registration');
    
    // Return the event to allow registration to proceed
    return event;

  } catch (error) {
    console.error('Pre Sign-up validation failed:', error);
    
    // Throwing an error here will prevent the user registration
    // The error message will be returned to the client
    throw error;
  }
};

/**
 * Find users by company attribute
 */
const findUsersByCompany = async (userPoolId, companyName) => {
  try {
    const command = new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `custom:Company = "${companyName}"`,
      Limit: 10 // We only need to know if ANY exist
    });

    const result = await cognitoClient.send(command);
    return result.Users || [];

  } catch (error) {
    console.error('Error searching for existing users:', error);
    throw new Error('Unable to validate company uniqueness. Please try again.');
  }
};

/**
 * Sanitize company name by replacing spaces with hyphens
 * You can extend this function for additional sanitization rules
 */
const sanitizeCompanyName = (companyName) => {
  return companyName
    .trim()                           // Remove leading/trailing spaces
    .replace(/\s+/g, '-')            // Replace one or more spaces with single hyphen
    .replace(/[^a-zA-Z0-9\-_]/g, '')  // Remove special chars (optional)
    .toLowerCase();                   // Convert to lowercase (optional)
};

// ===== ALTERNATIVE VERSION WITH MORE SOPHISTICATED SANITIZATION =====

/**
 * More comprehensive sanitization function
 */
const advancedSanitizeCompanyName = (companyName) => {
  return companyName
    .trim()                                    // Remove leading/trailing spaces
    .replace(/\s+/g, '-')                     // Replace spaces with hyphens
    .replace(/[^\w\-]/g, '')                  // Keep only alphanumeric, underscore, hyphen
    .replace(/-+/g, '-')                      // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, '')                  // Remove leading/trailing hyphens
    .toLowerCase();                           // Convert to lowercase
};

// ===== PACKAGE.JSON FOR DEPLOYMENT =====

/*
{
  "name": "cognito-presignup-validator",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-cognito-identity-provider": "^3.x.x"
  }
}
*/

// ===== DEPLOYMENT CONFIGURATION =====

/*
To deploy this Lambda function, you'll need:

1. IAM Role with these permissions:
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:ListUsers"
      ],
      "Resource": "arn:aws:cognito-idp:*:*:userpool/*"
    }
  ]
}

2. Lambda Function Configuration:
- Runtime: Node.js 18.x or later
- Handler: index.handler
- Timeout: 30 seconds
- Memory: 256 MB

3. Cognito User Pool Trigger Configuration:
- Trigger Type: Pre sign-up
- Lambda Function: Your deployed function ARN

4. Environment Variables (if needed):
- AWS_REGION: Your AWS region (usually auto-set)
*/

// ===== FRONTEND ANGULAR CODE =====

/*
// In your Angular component where you handle Amplify auth
import { Auth } from '@aws-amplify/auth';

export class SignupComponent {
  errorMessage = '';

  async handleSignUp(formData) {
    try {
      const result = await Auth.signUp({
        username: formData.email,
        password: formData.password,
        attributes: {
          email: formData.email,
          'custom:Company': formData.company
        }
      });
      
      console.log('Sign up successful:', result);
      // Success - proceed to confirmation step
      this.navigateToConfirmation();
      
    } catch (error) {
      console.error('Sign up error:', error);
      
      // Check if it's our custom company validation error
      if (error.message && error.message.includes('company') && error.message.includes('already exists')) {
        this.showCompanyExistsError(error.message);
      } else if (error.message && error.message.includes('Company name is required')) {
        this.errorMessage = 'Please enter your company name.';
      } else {
        this.showGenericError(error.message || 'An error occurred during registration.');
      }
    }
  }

  showCompanyExistsError(message) {
    this.errorMessage = message;
    // You could also show a more user-friendly message:
    // this.errorMessage = 'This company is already registered. Please contact your administrator or use a different company name.';
  }

  showGenericError(message) {
    this.errorMessage = `Registration failed: ${message}`;
  }

  navigateToConfirmation() {
    // Navigate to email confirmation page
    this.router.navigate(['/confirm-signup']);
  }
}
*/

// ===== DEPLOYMENT SCRIPT =====

/*
#!/bin/bash
# deploy.sh

# Install dependencies
npm install

# Create deployment package
zip -r lambda-function.zip index.js node_modules/ package.json

# Deploy using AWS CLI (replace with your function name and role ARN)
aws lambda create-function \
  --function-name cognito-presignup-validator \
  --runtime nodejs18.x \
  --role arn:aws:iam::YOUR_ACCOUNT:role/lambda-cognito-role \
  --handler index.handler \
  --zip-file fileb://lambda-function.zip \
  --timeout 30 \
  --memory-size 256

# Update function if it already exists
# aws lambda update-function-code \
#   --function-name cognito-presignup-validator \
#   --zip-file fileb://lambda-function.zip

echo "Lambda function deployed successfully!"
*/

// ===== TESTING EVENT =====

/*
Sample test event for Lambda console testing:

{
  "version": "1",
  "region": "us-east-1",
  "userPoolId": "us-east-1_example123",
  "triggerSource": "PreSignUp_SignUp",
  "request": {
    "userAttributes": {
      "email": "test@example.com",
      "custom:Company": "My Test Company"
    },
    "validationData": null
  },
  "response": {}
}
*/