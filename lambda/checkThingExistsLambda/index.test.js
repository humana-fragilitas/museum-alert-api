import {
  describe,
  test,
  expect,
  jest,
  beforeEach
} from '@jest/globals';

import { handler } from './index.mjs';

// Mock the lambda layer helpers
jest.mock('/opt/nodejs/shared/index.js', () => ({
  errorApiResponse: jest.fn(),
  successApiResponse: jest.fn(),
  validateEnvironmentVariables: jest.fn(),
  getUserInfo: jest.fn(),
  thingAlreadyExists: jest.fn()
}));

import { 
  errorApiResponse, 
  successApiResponse, 
  validateEnvironmentVariables,
  getUserInfo,
  thingAlreadyExists
} from '/opt/nodejs/shared/index.js';


describe('checkThingExistsLambda', () => {

  beforeEach(() => {

    jest.clearAllMocks();
    
    process.env.AWS_REGION = 'us-east-1';
    process.env.USER_POOL_ID = 'test-user-pool';
    
    errorApiResponse.mockImplementation((message, statusCode) => ({
      statusCode,
      body: JSON.stringify({ error: { message } })
    }));
    
    successApiResponse.mockImplementation((data) => ({
      statusCode: 200,
      body: JSON.stringify({ data })
    }));

  });

  test('should return success when thing exists in same company', async () => {

    const mockEvent = {
      pathParameters: {
        thingName: 'test-device-001'
      },
      headers: {
        Authorization: 'Bearer valid-token'
      },
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'test-company',
            email: 'user@test.com'
          }
        }
      }
    };

    getUserInfo.mockReturnValue({
      'custom:Company': 'test-company',
      email: 'user@test.com'
    });

    thingAlreadyExists.mockResolvedValue({
      exists: true,
      sameCompany: true
    });

    const result = await handler(mockEvent);

    expect(validateEnvironmentVariables).toHaveBeenCalledWith(['AWS_REGION']);
    expect(getUserInfo).toHaveBeenCalledWith(mockEvent);
    expect(thingAlreadyExists).toHaveBeenCalledWith('us-east-1', 'test-device-001', 'test-company');
    expect(successApiResponse).toHaveBeenCalledWith({
      message: 'Thing already exists in the logged user\'s company "test-company"',
      thingName: 'test-device-001',
      company: 'test-company'
    });

  });

  test('should return success when thing exists in different company', async () => {

    const mockEvent = {
      pathParameters: {
        thingName: 'test-device-002'
      },
      headers: {
        Authorization: 'Bearer valid-token'
      },
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'test-company'
          }
        }
      }
    };

    getUserInfo.mockReturnValue({
      'custom:Company': 'test-company'
    });

    thingAlreadyExists.mockResolvedValue({
      exists: true,
      sameCompany: false
    });

    await handler(mockEvent);

    expect(successApiResponse).toHaveBeenCalledWith({
      message: 'Thing already exists in a different company',
      thingName: 'test-device-002',
      company: ''
    });

  });

  test('should return error when thing does not exist', async () => {

    const mockEvent = {
      pathParameters: {
        thingName: 'nonexistent-device'
      },
      headers: {
        Authorization: 'Bearer valid-token'
      },
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'test-company'
          }
        }
      }
    };

    getUserInfo.mockReturnValue({
      'custom:Company': 'test-company'
    });

    thingAlreadyExists.mockResolvedValue({
      exists: false
    });

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Thing not found in IoT registry',
      404
    );

  });

  test('should return error when thing name is missing', async () => {

    const mockEvent = {
      pathParameters: {},
      headers: {
        Authorization: 'Bearer valid-token'
      }
    };

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Missing or invalid thing name',
      403
    );

  });

  test('should return error when authorization token is missing', async () => {

    const mockEvent = {
      pathParameters: {
        thingName: 'test-device'
      },
      headers: {}
    };

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Authentication token not found',
      401
    );

  });

  test('should return error when user info decoding fails', async () => {

    const mockEvent = {
      pathParameters: {
        thingName: 'test-device'
      },
      headers: {
        Authorization: 'Bearer invalid-token'
      }
    };

    getUserInfo.mockReturnValue(null);

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Failed to decode user JWT token',
      500
    );

  });

  test('should return error when company is missing from token', async () => {

    const mockEvent = {
      pathParameters: {
        thingName: 'test-device'
      },
      headers: {
        Authorization: 'Bearer valid-token'
      },
      requestContext: {
        authorizer: {
          claims: {
            email: 'user@test.com'
          }
        }
      }
    };

    getUserInfo.mockReturnValue({
      email: 'user@test.com'
    });

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Company information not found in logged user\'s JWT token',
      403
    );

  });

  test('should return error when thing check fails', async () => {

    const mockEvent = {
      pathParameters: {
        thingName: 'test-device'
      },
      headers: {
        Authorization: 'Bearer valid-token'
      },
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'test-company'
          }
        }
      }
    };

    getUserInfo.mockReturnValue({
      'custom:Company': 'test-company'
    });

    thingAlreadyExists.mockResolvedValue(null);

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Failed to check if thing exists in IoT registry',
      500
    );
  });
  
});
