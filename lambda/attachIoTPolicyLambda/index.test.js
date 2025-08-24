import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { IoTClient, AttachPolicyCommand, CreatePolicyCommand } from '@aws-sdk/client-iot';
import { CognitoIdentityClient, GetIdCommand } from '@aws-sdk/client-cognito-identity';
import { 
  CognitoIdentityProviderClient, 
  AdminUpdateUserAttributesCommand 
} from '@aws-sdk/client-cognito-identity-provider';
import { handler } from './index.mjs';

const iotMock = mockClient(IoTClient);
const cognitoIdentityMock = mockClient(CognitoIdentityClient);
const cognitoIdpMock = mockClient(CognitoIdentityProviderClient);

// Mock the lambda layer helpers
jest.mock('/opt/nodejs/shared/index.js', () => ({
  errorApiResponse: jest.fn(),
  successApiResponse: jest.fn(),
  validateEnvironmentVariables: jest.fn()
}));

import { errorApiResponse, successApiResponse, validateEnvironmentVariables } from '/opt/nodejs/shared/index.js';

describe('attachIoTPolicyLambda', () => {
  beforeEach(() => {
    iotMock.reset();
    cognitoIdentityMock.reset();
    cognitoIdpMock.reset();
    jest.clearAllMocks();
    
    process.env.AWS_REGION = 'us-east-1';
    process.env.IDENTITY_POOL_ID = 'us-east-1:12345678-1234-1234-1234-123456789012';
    
    errorApiResponse.mockImplementation((message, statusCode, details) => ({
      statusCode,
      body: JSON.stringify({ error: { message, details } })
    }));
    
    successApiResponse.mockImplementation((data) => ({
      statusCode: 200,
      body: JSON.stringify({ data })
    }));
  });

  test('should successfully attach IoT policy to user', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
            'custom:Company': 'test-company',
            'cognito:username': 'testuser',
            iss: 'https://cognito-idp.us-east-1.amazonaws.com/test-user-pool'
          }
        }
      },
      headers: {
        Authorization: 'Bearer test-token'
      }
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    const mockIdentityId = 'us-east-1:identity-123';
    
    cognitoIdentityMock.on(GetIdCommand).resolves({
      IdentityId: mockIdentityId
    });
    
    iotMock.on(AttachPolicyCommand).resolves({});
    cognitoIdpMock.on(AdminUpdateUserAttributesCommand).resolves({});

    const result = await handler(mockEvent, mockContext);

    expect(validateEnvironmentVariables).toHaveBeenCalledWith([
      'AWS_REGION',
      'IDENTITY_POOL_ID'
    ]);
    
    expect(cognitoIdentityMock.call(0).args[0].input).toEqual({
      IdentityPoolId: 'us-east-1:12345678-1234-1234-1234-123456789012',
      Logins: {
        'cognito-idp.us-east-1.amazonaws.com/test-user-pool': 'Bearer test-token'
      }
    });
    
    expect(successApiResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('IoT policy attached'),
        identityId: mockIdentityId,
        company: 'test-company',
        policyName: 'company-iot-policy-test-company'
      })
    );
  });

  test('should return error when user claims are missing', async () => {
    const mockEvent = {
      requestContext: {}
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    await handler(mockEvent, mockContext);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Missing or invalid authentication context',
      401
    );
  });

  test('should return error when user has no company', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
            'cognito:username': 'testuser',
            iss: 'https://cognito-idp.us-east-1.amazonaws.com/test-user-pool'
            // No custom:Company
          }
        }
      },
      headers: {
        Authorization: 'Bearer test-token'
      }
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    await handler(mockEvent, mockContext);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Company information not found in user profile',
      400
    );
  });

  test('should handle GetIdCommand errors', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
            'custom:Company': 'test-company',
            'cognito:username': 'testuser',
            iss: 'https://cognito-idp.us-east-1.amazonaws.com/test-user-pool'
          }
        }
      },
      headers: {
        Authorization: 'Bearer test-token'
      }
    };

    const error = new Error('Identity pool error');
    cognitoIdentityMock.on(GetIdCommand).rejects(error);

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    await handler(mockEvent, mockContext);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Failed to retrieve Cognito Identity ID',
      500,
      { error: 'Identity pool error' }
    );
  });

  test('should handle AttachPolicyCommand errors', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
            'custom:Company': 'test-company',
            'cognito:username': 'testuser',
            iss: 'https://cognito-idp.us-east-1.amazonaws.com/test-user-pool'
          }
        }
      },
      headers: {
        Authorization: 'Bearer test-token'
      }
    };

    const mockIdentityId = 'us-east-1:identity-123';
    
    cognitoIdentityMock.on(GetIdCommand).resolves({
      IdentityId: mockIdentityId
    });
    
    const error = new Error('Policy attachment failed');
    iotMock.on(AttachPolicyCommand).rejects(error);

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    await handler(mockEvent, mockContext);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Failed to attach IoT policy',
      500,
      { 
        policyName: 'company-iot-policy-test-company',
        identityId: 'us-east-1:identity-123',
        error: 'Policy attachment failed' 
      }
    );
  });

  test('should create policy if it does not exist', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
            'custom:Company': 'test-company',
            'cognito:username': 'testuser',
            iss: 'https://cognito-idp.us-east-1.amazonaws.com/test-user-pool'
          }
        }
      },
      headers: {
        Authorization: 'Bearer test-token'
      }
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    const mockIdentityId = 'us-east-1:identity-123';
    
    cognitoIdentityMock.on(GetIdCommand).resolves({
      IdentityId: mockIdentityId
    });
    
    // Policy doesn't exist, gets created, then attached
    iotMock.on(CreatePolicyCommand).resolves({});
    iotMock.on(AttachPolicyCommand).resolves({});
    
    cognitoIdpMock.on(AdminUpdateUserAttributesCommand).resolves({});

    await handler(mockEvent, mockContext);

    expect(iotMock.calls()).toHaveLength(2); // CreatePolicy, AttachPolicy (success)
    expect(successApiResponse).toHaveBeenCalled();
  });

  test('should handle policy creation errors', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
            'custom:Company': 'test-company',
            'cognito:username': 'testuser',
            iss: 'https://cognito-idp.us-east-1.amazonaws.com/test-user-pool'
          }
        }
      },
      headers: {
        Authorization: 'Bearer test-token'
      }
    };

    const mockIdentityId = 'us-east-1:identity-123';
    
    cognitoIdentityMock.on(GetIdCommand).resolves({
      IdentityId: mockIdentityId
    });
    
    const resourceNotFoundError = new Error('ResourceNotFoundException');
    resourceNotFoundError.name = 'ResourceNotFoundException';
    
    iotMock.on(AttachPolicyCommand).rejects(resourceNotFoundError);
    iotMock.on(CreatePolicyCommand).rejects(new Error('Policy creation failed'));

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    await handler(mockEvent, mockContext);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Failed to create IoT policy',
      500,
      { 
        policyName: 'company-iot-policy-test-company',
        error: 'Policy creation failed' 
      }
    );
  });

  test('should handle AdminUpdateUserAttributesCommand errors', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
            'custom:Company': 'test-company',
            'cognito:username': 'testuser',
            iss: 'https://cognito-idp.us-east-1.amazonaws.com/test-user-pool'
          }
        }
      },
      headers: {
        Authorization: 'Bearer test-token'
      }
    };

    const mockIdentityId = 'us-east-1:identity-123';
    
    cognitoIdentityMock.on(GetIdCommand).resolves({
      IdentityId: mockIdentityId
    });
    
    iotMock.on(AttachPolicyCommand).resolves({});
    cognitoIdpMock.on(AdminUpdateUserAttributesCommand).rejects(new Error('Update failed'));

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    // Should return error when user attribute update fails
    await handler(mockEvent, mockContext);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Failed to update user attribute',
      500,
      { username: 'user-123', error: 'Update failed' }
    );
  });
});
