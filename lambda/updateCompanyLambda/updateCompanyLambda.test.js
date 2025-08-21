import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { handler } from './index.mjs';

const dynamoMock = mockClient(DynamoDBClient);

describe('updateCompanyLambda', () => {
  beforeEach(() => {
    dynamoMock.reset();
    jest.clearAllMocks();
    
    process.env.COMPANIES_TABLE = 'test-companies-table';
    process.env.AWS_REGION = 'us-east-1';
  });

  test('should successfully update company with valid data', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'company-123'
          }
        }
      },
      body: JSON.stringify({
        companyName: 'Updated Company Name',
        status: 'active'
      })
    };

    // Mock the GetItemCommand for checking if company exists
    dynamoMock.on(GetItemCommand).resolves({
      Item: {
        companyId: { S: 'company-123' },
        companyName: { S: 'Old Company Name' },
        status: { S: 'inactive' }
      }
    });

    // Mock the UpdateItemCommand
    dynamoMock.on(UpdateItemCommand).resolves({
      Attributes: {
        companyId: { S: 'company-123' },
        companyName: { S: 'Updated Company Name' },
        status: { S: 'active' }
      }
    });

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(200);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.data.message).toBe('Company updated successfully');
    expect(responseBody.data.company).toEqual({
      companyId: 'company-123',
      companyName: 'Updated Company Name',
      status: 'active'
    });
    expect(responseBody.data.updatedFields).toEqual(['companyName', 'status']);
  });

  test('should return error when company ID is missing from claims', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {}
        }
      },
      body: JSON.stringify({
        companyName: 'Test Company'
      })
    };

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(404);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error.message).toBe('User has no company ID associated with their account');
  });

  test('should return error when no valid fields are provided', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'company-123'
          }
        }
      },
      body: JSON.stringify({
        invalidField: 'invalid value'
      })
    };

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(400);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error.message).toBe('No valid fields provided. Allowed fields: companyName, status');
  });

  test('should handle company not found error', async () => {
    const mockEvent = {
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'nonexistent-company'
          }
        }
      },
      body: JSON.stringify({
        companyName: 'New Name'
      })
    };

    // Mock GetItemCommand to return null (company not found)
    dynamoMock.on(GetItemCommand).resolves({});

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(404);
    
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error.message).toBe('Company not found');
  });
});
