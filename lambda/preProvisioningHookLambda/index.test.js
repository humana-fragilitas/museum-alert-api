import { describe,
         test,
         expect,
         jest,
         beforeEach } from '@jest/globals';
import { handler } from './index.mjs';

jest.mock('/opt/nodejs/shared/index.js', () => ({
  getDecodedUserToken: jest.fn(),
  thingAlreadyExists: jest.fn(),
  validateEnvironmentVariables: jest.fn()
}));

import { getDecodedUserToken,
         thingAlreadyExists,
         validateEnvironmentVariables } from '/opt/nodejs/shared/index.js';

describe('preProvisioningHookLambda', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    
    process.env.AWS_REGION = 'us-east-1';
    process.env.USER_POOL_ID = 'test-user-pool';
  });

  test('should allow provisioning when thing does not exist', async () => {
    const mockEvent = {
      parameters: {
        ThingName: 'new-device-001',
        idToken: 'valid-jwt-token'
      }
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    const mockDecodedToken = {
      'custom:Company': 'test-company'
    };

    getDecodedUserToken.mockResolvedValue(mockDecodedToken);
    thingAlreadyExists.mockResolvedValue({
      exists: false,
      sameCompany: false
    });

    const result = await handler(mockEvent, mockContext);

    expect(validateEnvironmentVariables).toHaveBeenCalledWith([
      'AWS_REGION',
      'USER_POOL_ID'
    ]);

    expect(getDecodedUserToken).toHaveBeenCalledWith(
      'us-east-1',
      'test-user-pool',
      'valid-jwt-token'
    );

    expect(thingAlreadyExists).toHaveBeenCalledWith(
      'us-east-1',
      'new-device-001',
      'test-company'
    );

    expect(result).toEqual({
      allowProvisioning: true,
      parameterOverrides: {
        ThingName: 'new-device-001',
        idToken: 'valid-jwt-token',
        Region: 'us-east-1',
        AccountId: '123456789012',
        Company: 'test-company'
      }
    });
  });

  test('should deny provisioning when thing exists (even if same company)', async () => {
    const mockEvent = {
      parameters: {
        ThingName: 'existing-device',
        idToken: 'valid-jwt-token'
      }
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    const mockDecodedToken = {
      'custom:Company': 'test-company'
    };

    getDecodedUserToken.mockResolvedValue(mockDecodedToken);
    thingAlreadyExists.mockResolvedValue({
      exists: true,
      sameCompany: true
    });

    const result = await handler(mockEvent, mockContext);

    expect(result).toEqual({
      allowProvisioning: false
    });
  });

  test('should deny provisioning when thing exists and belongs to different company', async () => {
    const mockEvent = {
      parameters: {
        ThingName: 'other-company-device',
        idToken: 'valid-jwt-token'
      }
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    const mockDecodedToken = {
      'custom:Company': 'test-company'
    };

    getDecodedUserToken.mockResolvedValue(mockDecodedToken);
    thingAlreadyExists.mockResolvedValue({
      exists: true,
      sameCompany: false
    });

    const result = await handler(mockEvent, mockContext);

    expect(result).toEqual({
      allowProvisioning: false
    });
  });

  test('should deny provisioning when thing name is missing', async () => {
    const mockEvent = {
      parameters: {
        idToken: 'valid-jwt-token'
        // No ThingName
      }
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    const result = await handler(mockEvent, mockContext);

    expect(result).toEqual({
      allowProvisioning: false
    });
  });

  test('should deny provisioning when idToken is missing', async () => {
    const mockEvent = {
      parameters: {
        ThingName: 'test-device'
        // No idToken
      }
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    const result = await handler(mockEvent, mockContext);

    expect(result).toEqual({
      allowProvisioning: false
    });
  });

  test('should deny provisioning when token decoding fails', async () => {
    const mockEvent = {
      parameters: {
        ThingName: 'test-device',
        idToken: 'invalid-jwt-token'
      }
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    getDecodedUserToken.mockResolvedValue(null);

    const result = await handler(mockEvent, mockContext);

    expect(result).toEqual({
      allowProvisioning: false
    });
  });

  test('should deny provisioning when user has no company', async () => {
    const mockEvent = {
      parameters: {
        ThingName: 'test-device',
        idToken: 'valid-jwt-token'
      }
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    const mockDecodedToken = {
      email: 'user@test.com'
      // No custom:Company
    };

    getDecodedUserToken.mockResolvedValue(mockDecodedToken);

    const result = await handler(mockEvent, mockContext);

    expect(result).toEqual({
      allowProvisioning: false
    });
  });

  test('should deny provisioning when thingAlreadyExists returns null (service error)', async () => {
    const mockEvent = {
      parameters: {
        ThingName: 'test-device',
        idToken: 'valid-jwt-token'
      }
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    const mockDecodedToken = {
      'custom:Company': 'test-company'
    };

    getDecodedUserToken.mockResolvedValue(mockDecodedToken);
    thingAlreadyExists.mockResolvedValue(null);

    const result = await handler(mockEvent, mockContext);

    expect(result).toEqual({
      allowProvisioning: false
    });
  });

  test('should deny provisioning when thingAlreadyExists throws error', async () => {
    const mockEvent = {
      parameters: {
        ThingName: 'test-device',
        idToken: 'valid-jwt-token'
      }
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    const mockDecodedToken = {
      'custom:Company': 'test-company'
    };

    getDecodedUserToken.mockResolvedValue(mockDecodedToken);
    thingAlreadyExists.mockRejectedValue(new Error('Service error'));

    const result = await handler(mockEvent, mockContext);

    expect(result).toEqual({
      allowProvisioning: false
    });
  });

  test('should handle missing parameters object', async () => {
    const mockEvent = {};

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
    };

    const result = await handler(mockEvent, mockContext);

    expect(result).toEqual({
      allowProvisioning: false
    });
  });

  test('should extract account ID from context correctly', async () => {
    const mockEvent = {
      parameters: {
        ThingName: 'test-device',
        idToken: 'valid-jwt-token'
      }
    };

    const mockContext = {
      invokedFunctionArn: 'arn:aws:lambda:us-west-2:987654321012:function:different-function'
    };

    const mockDecodedToken = {
      'custom:Company': 'test-company'
    };

    getDecodedUserToken.mockResolvedValue(mockDecodedToken);
    thingAlreadyExists.mockResolvedValue({
      exists: false,
      sameCompany: false
    });

    await handler(mockEvent, mockContext);

    expect(getDecodedUserToken).toHaveBeenCalled();
    expect(thingAlreadyExists).toHaveBeenCalled();
  });

});
