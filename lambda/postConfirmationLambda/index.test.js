import { describe,
         test,
         expect,
         jest,
         beforeEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { CognitoIdentityProviderClient, 
         AdminAddUserToGroupCommand,
         AdminUpdateUserAttributesCommand,
         CreateGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient,
         PutItemCommand } from '@aws-sdk/client-dynamodb';
import { handler } from './index.mjs';

const cognitoMock = mockClient(CognitoIdentityProviderClient);
const dynamoMock = mockClient(DynamoDBClient);

jest.mock('/opt/nodejs/shared/index.js', () => ({
  validateEnvironmentVariables: jest.fn()
}));

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn()
}));

import crypto from 'node:crypto';
import { validateEnvironmentVariables } from '/opt/nodejs/shared/index.js';


describe('postConfirmationLambda', () => {

  beforeEach(() => {
    cognitoMock.reset();
    dynamoMock.reset();
    jest.clearAllMocks();
    
    process.env.AWS_REGION = 'us-east-1';
    process.env.COMPANIES_TABLE = 'test-companies-table';
    
    crypto.randomUUID.mockReturnValue('12345678-1234-1234-1234-123456789012');
  });

  test('should successfully create company and configure user', async () => {
    const mockEvent = {
      userPoolId: 'us-east-1_ABC123DEF',
      userName: 'testuser',
      request: {
        userAttributes: {
          email: 'user@test.com',
          name: 'Test User'
        }
      }
    };

    dynamoMock.on(PutItemCommand).resolves({});
    cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});
    cognitoMock.on(CreateGroupCommand).resolves({});
    cognitoMock.on(AdminAddUserToGroupCommand).resolves({});

    const result = await handler(mockEvent);

    expect(validateEnvironmentVariables).toHaveBeenCalledWith([
      'AWS_REGION',
      'COMPANIES_TABLE'
    ]);

    // Check DynamoDB company creation
    expect(dynamoMock.call(0).args[0].input).toMatchObject({
      TableName: 'test-companies-table',
      Item: expect.objectContaining({
        companyId: { S: '12345678-1234-1234-1234-123456789012' },
        companyName: { S: '' }, // Empty string initially
        createdAt: { S: expect.any(String) },
        updatedAt: { S: expect.any(String) },
        ownerEmail: { S: 'user@test.com' },
        ownerUsername: { S: 'testuser' },
        memberCount: { N: '1' },
        members: {
          L: [
            {
              M: expect.objectContaining({
                email: { S: 'user@test.com' },
                username: { S: 'testuser' },
                role: { S: 'owner' },
                joinedAt: { S: expect.any(String) }
              })
            }
          ]
        },
        status: { S: 'active' }
      })
    });

    // Check user attribute update
    expect(cognitoMock.call(0).args[0].input).toEqual({
      UserPoolId: 'us-east-1_ABC123DEF',
      Username: 'testuser',
      UserAttributes: [
        {
          Name: 'custom:Company',
          Value: '12345678-1234-1234-1234-123456789012'
        }
      ]
    });

    // Check group creation
    expect(cognitoMock.call(1).args[0].input).toEqual({
      UserPoolId: 'us-east-1_ABC123DEF',
      GroupName: '12345678-1234-1234-1234-123456789012',
      Description: 'User group for company with id: 12345678-1234-1234-1234-123456789012',
      Precedence: 100
    });

    // Check user added to group
    expect(cognitoMock.call(2).args[0].input).toEqual({
      UserPoolId: 'us-east-1_ABC123DEF',
      Username: 'testuser',
      GroupName: '12345678-1234-1234-1234-123456789012'
    });

    expect(result).toEqual(mockEvent);
  });

  test('should handle DynamoDB errors and continue', async () => {
    const mockEvent = {
      userPoolId: 'us-east-1_ABC123DEF',
      userName: 'testuser',
      request: {
        userAttributes: {
          email: 'user@test.com'
        }
      }
    };

    const error = new Error('DynamoDB error');
    dynamoMock.on(PutItemCommand).rejects(error);

    const result = await handler(mockEvent);

    // Should return the event and not throw, even if DynamoDB fails
    expect(result).toEqual(mockEvent);
  });

  test('should handle user attribute update errors and continue', async () => {
    const mockEvent = {
      userPoolId: 'us-east-1_ABC123DEF',
      userName: 'testuser',
      request: {
        userAttributes: {
          email: 'user@test.com'
        }
      }
    };

    dynamoMock.on(PutItemCommand).resolves({});
    
    const error = new Error('Cognito update error');
    cognitoMock.on(AdminUpdateUserAttributesCommand).rejects(error);

    const result = await handler(mockEvent);

    // Should return the event and not throw, even if Cognito update fails
    expect(result).toEqual(mockEvent);
  });

  test('should handle group creation errors and continue', async () => {
    const mockEvent = {
      userPoolId: 'us-east-1_ABC123DEF',
      userName: 'testuser',
      request: {
        userAttributes: {
          email: 'user@test.com'
        }
      }
    };

    dynamoMock.on(PutItemCommand).resolves({});
    cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});
    
    const error = new Error('Group creation error');
    cognitoMock.on(CreateGroupCommand).rejects(error);

    const result = await handler(mockEvent);

    // Should return the event and not throw, even if group creation fails
    expect(result).toEqual(mockEvent);
  });

  test('should handle add user to group errors and continue', async () => {
    const mockEvent = {
      userPoolId: 'us-east-1_ABC123DEF',
      userName: 'testuser',
      request: {
        userAttributes: {
          email: 'user@test.com'
        }
      }
    };

    dynamoMock.on(PutItemCommand).resolves({});
    cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});
    cognitoMock.on(CreateGroupCommand).resolves({});
    
    const error = new Error('Add to group error');
    cognitoMock.on(AdminAddUserToGroupCommand).rejects(error);

    const result = await handler(mockEvent);

    // Should return the event and not throw, even if adding to group fails
    expect(result).toEqual(mockEvent);
  });

  test('should generate unique company ID', async () => {
    crypto.randomUUID.mockReturnValue('unique-company-id');
    
    const mockEvent = {
      userPoolId: 'us-east-1_ABC123DEF',
      userName: 'testuser',
      request: {
        userAttributes: {
          email: 'user@test.com'
        }
      }
    };

    dynamoMock.on(PutItemCommand).resolves({});
    cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});
    cognitoMock.on(CreateGroupCommand).resolves({});
    cognitoMock.on(AdminAddUserToGroupCommand).resolves({});

    await handler(mockEvent);

    expect(dynamoMock.call(0).args[0].input.Item.companyId.S).toBe('unique-company-id');
  });

  test('should use empty string for company name initially', async () => {
    const mockEvent = {
      userPoolId: 'us-east-1_ABC123DEF',
      userName: 'testuser',
      request: {
        userAttributes: {
          email: 'user@test.com'
          // No name attribute
        }
      }
    };

    dynamoMock.on(PutItemCommand).resolves({});
    cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});
    cognitoMock.on(CreateGroupCommand).resolves({});
    cognitoMock.on(AdminAddUserToGroupCommand).resolves({});

    await handler(mockEvent);

    expect(dynamoMock.call(0).args[0].input.Item.companyName.S).toBe('');
  });

  test('should create correct company structure in DynamoDB', async () => {
    const mockEvent = {
      userPoolId: 'us-east-1_ABC123DEF',
      userName: 'testuser',
      request: {
        userAttributes: {
          email: 'user@test.com',
          name: 'Test User'
        }
      }
    };

    dynamoMock.on(PutItemCommand).resolves({});
    cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});
    cognitoMock.on(CreateGroupCommand).resolves({});
    cognitoMock.on(AdminAddUserToGroupCommand).resolves({});

    await handler(mockEvent);

    const putItemCall = dynamoMock.call(0).args[0].input;
    
    expect(putItemCall.Item).toMatchObject({
      companyId: { S: expect.any(String) },
      companyName: { S: '' }, // Empty string initially
      status: { S: 'active' },
      createdAt: { S: expect.any(String) },
      ownerEmail: { S: 'user@test.com' },
      ownerUsername: { S: 'testuser' },
      memberCount: { N: '1' },
      members: {
        L: [
          {
            M: {
              email: { S: 'user@test.com' },
              username: { S: 'testuser' },
              role: { S: 'owner' },
              joinedAt: { S: expect.any(String) }
            }
          }
        ]
      }
    });
  });

});
