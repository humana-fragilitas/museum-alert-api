import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { IoTClient, ListThingsInThingGroupCommand } from '@aws-sdk/client-iot';
import { handler } from '../../lambda/getThingsByCompanyLambda/index.mjs';

const iotMock = mockClient(IoTClient);

// Mock the lambda layer helpers
jest.mock('/opt/nodejs/shared/index.js', () => ({
  errorApiResponse: jest.fn(),
  successApiResponse: jest.fn(),
  validateEnvironmentVariables: jest.fn(),
  getUserInfo: jest.fn()
}));

import { errorApiResponse, successApiResponse, validateEnvironmentVariables, getUserInfo } from '/opt/nodejs/shared/index.js';

describe('getThingsByCompanyLambda', () => {
  beforeEach(() => {
    iotMock.reset();
    jest.clearAllMocks();
    
    process.env.AWS_REGION = 'us-east-1';
    process.env.USER_POOL_ID = 'test-user-pool';
    
    errorApiResponse.mockImplementation((message, statusCode, details) => ({
      statusCode,
      body: JSON.stringify({ error: { message, details } })
    }));
    
    successApiResponse.mockImplementation((data) => ({
      statusCode: 200,
      body: JSON.stringify({ data })
    }));
  });

  test('should successfully retrieve things for company', async () => {
    const mockEvent = {
      headers: {
        Authorization: 'Bearer valid-token'
      },
      queryStringParameters: {
        maxResults: '25'
      }
    };

    const mockUserInfo = {
      'custom:Company': 'test-company'
    };

    const mockThingsResponse = {
      things: ['device-001', 'device-002', 'device-003'],
      nextToken: 'next-page-token'
    };

    getUserInfo.mockReturnValue(mockUserInfo);
    iotMock.on(ListThingsInThingGroupCommand).resolves(mockThingsResponse);

    const result = await handler(mockEvent);

    expect(validateEnvironmentVariables).toHaveBeenCalledWith([
      'AWS_REGION',
      'USER_POOL_ID'
    ]);

    expect(iotMock.call(0).args[0].input).toEqual({
      thingGroupName: 'Company-Group-test-company',
      maxResults: 25,
      nextToken: undefined
    });

    expect(successApiResponse).toHaveBeenCalledWith({
      company: 'test-company',
      thingGroupName: 'Company-Group-test-company',
      things: ['device-001', 'device-002', 'device-003'],
      totalCount: 3,
      nextToken: 'next-page-token',
      hasMore: true
    });
  });

  test('should use pagination parameters', async () => {
    const mockEvent = {
      headers: {
        Authorization: 'Bearer valid-token'
      },
      queryStringParameters: {
        maxResults: '10',
        nextToken: 'existing-token'
      }
    };

    const mockUserInfo = {
      'custom:Company': 'test-company'
    };

    const mockThingsResponse = {
      things: ['device-001'],
      nextToken: undefined
    };

    getUserInfo.mockReturnValue(mockUserInfo);
    iotMock.on(ListThingsInThingGroupCommand).resolves(mockThingsResponse);

    await handler(mockEvent);

    expect(iotMock.call(0).args[0].input).toEqual({
      thingGroupName: 'Company-Group-test-company',
      maxResults: 10,
      nextToken: 'existing-token'
    });
  });

  test('should use default maxResults when not provided', async () => {
    const mockEvent = {
      headers: {
        Authorization: 'Bearer valid-token'
      }
    };

    const mockUserInfo = {
      'custom:Company': 'test-company'
    };

    const mockThingsResponse = {
      things: [],
      nextToken: undefined
    };

    getUserInfo.mockReturnValue(mockUserInfo);
    iotMock.on(ListThingsInThingGroupCommand).resolves(mockThingsResponse);

    await handler(mockEvent);

    expect(iotMock.call(0).args[0].input.maxResults).toBe(50);
  });

  test('should return error when authorization token is missing', async () => {
    const mockEvent = {
      headers: {}
    };

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'User token unavailable',
      401
    );
  });

  test('should return error when user token decoding fails', async () => {
    const mockEvent = {
      headers: {
        Authorization: 'Bearer invalid-token'
      }
    };

    getUserInfo.mockReturnValue(null);

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Failed to decode user token',
      401
    );
  });

  test('should return error when user has no company', async () => {
    const mockEvent = {
      headers: {
        Authorization: 'Bearer valid-token'
      }
    };

    const mockUserInfo = {
      email: 'user@test.com'
      // No custom:Company
    };

    getUserInfo.mockReturnValue(mockUserInfo);

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Company not found in user JWT token',
      400
    );
  });

  test('should handle ResourceNotFoundException', async () => {
    const mockEvent = {
      headers: {
        Authorization: 'Bearer valid-token'
      }
    };

    const mockUserInfo = {
      'custom:Company': 'non-existent-company'
    };

    const error = new Error('Thing group not found');
    error.name = 'ResourceNotFoundException';

    getUserInfo.mockReturnValue(mockUserInfo);
    iotMock.on(ListThingsInThingGroupCommand).rejects(error);

    await handler(mockEvent);

    expect(successApiResponse).toHaveBeenCalledWith({
      company: 'non-existent-company',
      thingGroupName: 'Company-Group-non-existent-company',
      things: [],
      totalCount: 0,
      nextToken: null,
      hasMore: false
    });
  });

  test('should handle InvalidRequestException', async () => {
    const mockEvent = {
      headers: {
        Authorization: 'Bearer valid-token'
      }
    };

    const mockUserInfo = {
      'custom:Company': 'test-company'
    };

    const error = new Error('Invalid parameters');
    error.name = 'InvalidRequestException';

    getUserInfo.mockReturnValue(mockUserInfo);
    iotMock.on(ListThingsInThingGroupCommand).rejects(error);

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Failed to list things by company',
      500,
      'Invalid parameters'
    );
  });

  test('should handle ThrottlingException', async () => {
    const mockEvent = {
      headers: {
        Authorization: 'Bearer valid-token'
      }
    };

    const mockUserInfo = {
      'custom:Company': 'test-company'
    };

    const error = new Error('Rate exceeded');
    error.name = 'ThrottlingException';

    getUserInfo.mockReturnValue(mockUserInfo);
    iotMock.on(ListThingsInThingGroupCommand).rejects(error);

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Failed to list things by company',
      500,
      'Rate exceeded'
    );
  });

  test('should handle generic errors', async () => {
    const mockEvent = {
      headers: {
        Authorization: 'Bearer valid-token'
      }
    };

    const mockUserInfo = {
      'custom:Company': 'test-company'
    };

    const error = new Error('Unexpected error');

    getUserInfo.mockReturnValue(mockUserInfo);
    iotMock.on(ListThingsInThingGroupCommand).rejects(error);

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Failed to list things by company',
      500,
      'Unexpected error'
    );
  });

  test('should handle missing headers object', async () => {
    const mockEvent = {};

    await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'User token unavailable',
      401
    );
  });

  test('should handle invalid maxResults parameter', async () => {
    const mockEvent = {
      headers: {
        Authorization: 'Bearer valid-token'
      },
      queryStringParameters: {
        maxResults: 'invalid'
      }
    };

    const mockUserInfo = {
      'custom:Company': 'test-company'
    };

    const mockThingsResponse = {
      things: [],
      nextToken: undefined
    };

    getUserInfo.mockReturnValue(mockUserInfo);
    iotMock.on(ListThingsInThingGroupCommand).resolves(mockThingsResponse);

    await handler(mockEvent);

    // parseInt('invalid') returns NaN, parseInt(x) || 50 returns 50 when NaN
    expect(iotMock.call(0).args[0].input.maxResults).toBe(50);
  });
});
