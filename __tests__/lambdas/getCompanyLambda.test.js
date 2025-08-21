import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { handler } from '../../lambda/getCompanyLambda/index.mjs';

const dynamoMock = mockClient(DynamoDBClient);

describe('getCompanyLambda', () => {
  beforeEach(() => {
    dynamoMock.reset();
    jest.clearAllMocks();
    
    process.env.COMPANIES_TABLE = 'test-companies-table';
    process.env.AWS_REGION = 'us-east-1';
  });

  test('should successfully return company data for authorized user', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'company-123',
            email: 'user@test.com'
          }
        }
      }
    };

    const mockCompany = {
      Item: {
        companyId: { S: 'company-123' },
        companyName: { S: 'Test Company' },
        status: { S: 'active' },
        members: {
          L: [
            {
              M: {
                email: { S: 'user@test.com' },
                role: { S: 'admin' },
                joinedAt: { S: '2023-01-01T00:00:00Z' }
              }
            }
          ]
        }
      }
    };

    dynamoMock.on(GetItemCommand).resolves(mockCompany);

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(200);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.data.companyId).toBe('company-123');
    expect(responseBody.data.companyName).toBe('Test Company');
    expect(responseBody.data.userRole).toBe('admin');
    expect(responseBody.data.userJoinedAt).toBe('2023-01-01T00:00:00Z');
  });

  test('should return error when user claims are missing', async () => {
    const mockEvent = {
      requestContext: {}
    };

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(401);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error.message).toBe('Missing or invalid authentication context');
  });

  test('should return error when company ID is missing from claims', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            email: 'user@test.com'
          }
        }
      }
    };

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(404);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error.message).toBe('User has no company associated with their account');
  });

  test('should return error when company is not found', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'nonexistent-company',
            email: 'user@test.com'
          }
        }
      }
    };

    dynamoMock.on(GetItemCommand).resolves({});

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(404);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error.message).toBe('Company not found');
  });

  test('should return error when user does not belong to company', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'company-123',
            email: 'unauthorized@test.com'
          }
        }
      }
    };

    const mockCompany = {
      Item: {
        companyId: { S: 'company-123' },
        companyName: { S: 'Test Company' },
        members: {
          L: [
            {
              M: {
                email: { S: 'other@test.com' },
                role: { S: 'admin' }
              }
            }
          ]
        }
      }
    };

    dynamoMock.on(GetItemCommand).resolves(mockCompany);

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(403);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error.message).toBe('User does not belong to this company');
  });
});
