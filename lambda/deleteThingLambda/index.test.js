import {
  describe,
  test,
  expect,
  jest,
  beforeEach
} from '@jest/globals';

import { mockClient } from 'aws-sdk-client-mock';
import {
  IoTClient,
  DescribeThingCommand,
  DeleteThingCommand,
  ListThingPrincipalsCommand,
  DetachThingPrincipalCommand,
  DeleteCertificateCommand,
  UpdateCertificateCommand,
  ListAttachedPoliciesCommand,
  DetachPolicyCommand,
  DeletePolicyCommand
} from '@aws-sdk/client-iot';

import { handler } from './index.mjs';


const iotMock = mockClient(IoTClient);

// Mock the lambda layer helpers
jest.mock('/opt/nodejs/shared/index.js', () => ({
  errorApiResponse: jest.fn(),
  successApiResponse: jest.fn(),
  validateEnvironmentVariables: jest.fn()
}));

import { errorApiResponse, successApiResponse, validateEnvironmentVariables } from '/opt/nodejs/shared/index.js';

describe('deleteThingLambda', () => {

  beforeEach(() => {
    iotMock.reset();
    jest.clearAllMocks();
    
    // Set up environment variables
    process.env.AWS_REGION = 'us-east-1';
    
    // Mock helper responses
    errorApiResponse.mockImplementation((message, statusCode, details) => ({
      statusCode,
      body: JSON.stringify({ error: { message, details } })
    }));
    
    successApiResponse.mockImplementation((data, statusCode = 200) => ({
      statusCode,
      body: JSON.stringify(data)
    }));
  });

  test('should successfully delete thing with certificates when user owns the thing', async () => {
    const mockEvent = {
      pathParameters: {
        thingName: 'test-device-001'
      },
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'test-company-123'
          }
        }
      }
    };

    const mockThingData = {
      attributes: {
        Company: 'test-company-123',
        SerialNumber: 'SN001'
      }
    };

    const mockPrincipals = [
      'arn:aws:iot:us-east-1:123456789012:cert/certificate-id-1',
      'arn:aws:iot:us-east-1:123456789012:cert/certificate-id-2'
    ];

    // Mock successful responses
    iotMock.on(DescribeThingCommand).resolves(mockThingData);
    iotMock.on(ListThingPrincipalsCommand).resolves({ principals: mockPrincipals });
    iotMock.on(DetachThingPrincipalCommand).resolves({});
    // Mock policy management commands - simulate finding policies attached to certificates
    iotMock.on(ListAttachedPoliciesCommand).resolves({ 
      policies: [
        { policyName: 'device-policy-certificate-id-1' }
      ]
    });
    iotMock.on(DetachPolicyCommand).resolves({});
    iotMock.on(DeletePolicyCommand).resolves({});
    iotMock.on(UpdateCertificateCommand).resolves({});
    iotMock.on(DeleteCertificateCommand).resolves({});
    iotMock.on(DeleteThingCommand).resolves({});

    const result = await handler(mockEvent);

    // Verify the correct sequence of calls
    expect(iotMock.commandCalls(DescribeThingCommand)).toHaveLength(1);
    expect(iotMock.commandCalls(ListThingPrincipalsCommand)).toHaveLength(1);
    expect(iotMock.commandCalls(DetachThingPrincipalCommand)).toHaveLength(2);
    expect(iotMock.commandCalls(UpdateCertificateCommand)).toHaveLength(2);
    expect(iotMock.commandCalls(DeleteCertificateCommand)).toHaveLength(2);
    expect(iotMock.commandCalls(DeleteThingCommand)).toHaveLength(1);
    
    // Verify policy management calls were made
    expect(iotMock.commandCalls(ListAttachedPoliciesCommand)).toHaveLength(2); // One for each certificate
    expect(iotMock.commandCalls(DetachPolicyCommand)).toHaveLength(2); // One policy per certificate in our mock
    expect(iotMock.commandCalls(DeletePolicyCommand)).toHaveLength(2); // One policy per certificate in our mock

    // Verify the calls were made with correct parameters
    expect(iotMock.commandCalls(DescribeThingCommand)[0].args[0].input).toEqual({
      thingName: 'test-device-001'
    });

    expect(iotMock.commandCalls(UpdateCertificateCommand)[0].args[0].input).toEqual({
      certificateId: 'certificate-id-1',
      newStatus: 'INACTIVE'
    });

    expect(iotMock.commandCalls(DeleteCertificateCommand)[0].args[0].input).toEqual({
      certificateId: 'certificate-id-1',
      forceDelete: true
    });

    expect(successApiResponse).toHaveBeenCalledWith({
      message: "Thing 'test-device-001' has been successfully deleted",
      thingName: 'test-device-001',
      company: 'test-company-123'
    }, 200);
  });

  test('should successfully delete thing without certificates', async () => {
    const mockEvent = {
      pathParameters: {
        thingName: 'test-device-002'
      },
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'test-company-123'
          }
        }
      }
    };

    const mockThingData = {
      attributes: {
        Company: 'test-company-123'
      }
    };

    // Mock responses - no principals attached
    iotMock.on(DescribeThingCommand).resolves(mockThingData);
    iotMock.on(ListThingPrincipalsCommand).resolves({ principals: [] });
    iotMock.on(DeleteThingCommand).resolves({});

    const result = await handler(mockEvent);

    // Verify only necessary calls were made
    expect(iotMock.commandCalls(DescribeThingCommand)).toHaveLength(1);
    expect(iotMock.commandCalls(ListThingPrincipalsCommand)).toHaveLength(1);
    expect(iotMock.commandCalls(DetachThingPrincipalCommand)).toHaveLength(0);
    expect(iotMock.commandCalls(DeleteThingCommand)).toHaveLength(1);

    expect(successApiResponse).toHaveBeenCalledWith({
      message: "Thing 'test-device-002' has been successfully deleted",
      thingName: 'test-device-002',
      company: 'test-company-123'
    }, 200);
  });

  test('should return 400 when thingName is missing', async () => {
    const mockEvent = {
      pathParameters: {},
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'test-company-123'
          }
        }
      }
    };

    const result = await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Thing name is required',
      400
    );
  });

  test('should return 401 when company information is missing', async () => {
    const mockEvent = {
      pathParameters: {
        thingName: 'test-device-001'
      },
      requestContext: {
        authorizer: {
          claims: {}
        }
      }
    };

    const result = await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'User company information not found',
      401
    );
  });

  test('should return 404 when thing does not exist', async () => {
    const mockEvent = {
      pathParameters: {
        thingName: 'non-existent-device'
      },
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'test-company-123'
          }
        }
      }
    };

    const notFoundError = new Error('Thing not found');
    notFoundError.name = 'ResourceNotFoundException';
    iotMock.on(DescribeThingCommand).rejects(notFoundError);

    const result = await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      "Thing 'non-existent-device' not found",
      404
    );
  });

  test('should return 403 when thing belongs to different company', async () => {
    const mockEvent = {
      pathParameters: {
        thingName: 'test-device-001'
      },
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'user-company'
          }
        }
      }
    };

    const mockThingData = {
      attributes: {
        Company: 'different-company'
      }
    };

    iotMock.on(DescribeThingCommand).resolves(mockThingData);

    const result = await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      "Thing 'test-device-001' does not belong to your company",
      403
    );
  });

  test('should return 403 when thing has no company attribute', async () => {
    const mockEvent = {
      pathParameters: {
        thingName: 'test-device-001'
      },
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'user-company'
          }
        }
      }
    };

    const mockThingData = {
      attributes: {
        SerialNumber: 'SN001'
        // No Company attribute
      }
    };

    iotMock.on(DescribeThingCommand).resolves(mockThingData);

    const result = await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      "Thing 'test-device-001' does not belong to your company",
      403
    );
  });

  test('should return 500 when certificate deletion fails', async () => {
    const mockEvent = {
      pathParameters: {
        thingName: 'test-device-001'
      },
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'test-company-123'
          }
        }
      }
    };

    const mockThingData = {
      attributes: {
        Company: 'test-company-123'
      }
    };

    const mockPrincipals = [
      'arn:aws:iot:us-east-1:123456789012:cert/certificate-id-1'
    ];

    iotMock.on(DescribeThingCommand).resolves(mockThingData);
    iotMock.on(ListThingPrincipalsCommand).resolves({ principals: mockPrincipals });
    iotMock.on(DetachThingPrincipalCommand).resolves({});
    // Mock policy management commands
    iotMock.on(ListAttachedPoliciesCommand).resolves({ policies: [{ policyName: 'test-policy' }] });
    iotMock.on(DetachPolicyCommand).resolves({});
    iotMock.on(DeletePolicyCommand).resolves({});
    iotMock.on(UpdateCertificateCommand).resolves({});
    
    const deleteError = new Error('Certificate deletion failed');
    iotMock.on(DeleteCertificateCommand).rejects(deleteError);

    const result = await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Failed to delete certificate certificate-id-1: Certificate deletion failed',
      500
    );
  });

  test('should return 500 when thing deletion fails', async () => {
    const mockEvent = {
      pathParameters: {
        thingName: 'test-device-001'
      },
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'test-company-123'
          }
        }
      }
    };

    const mockThingData = {
      attributes: {
        Company: 'test-company-123'
      }
    };

    iotMock.on(DescribeThingCommand).resolves(mockThingData);
    iotMock.on(ListThingPrincipalsCommand).resolves({ principals: [] });
    
    const deleteThingError = new Error('Thing deletion failed');
    deleteThingError.$metadata = { httpStatusCode: 500 };
    iotMock.on(DeleteThingCommand).rejects(deleteThingError);

    const result = await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Failed to delete thing: Thing deletion failed',
      500,
      {
        errorType: 'Error',
        errorCode: 500
      }
    );
  });

  test('should handle unexpected DescribeThing errors', async () => {
    const mockEvent = {
      pathParameters: {
        thingName: 'test-device-001'
      },
      requestContext: {
        authorizer: {
          claims: {
            'custom:Company': 'test-company-123'
          }
        }
      }
    };

    const unexpectedError = new Error('AWS service unavailable');
    iotMock.on(DescribeThingCommand).rejects(unexpectedError);

    const result = await handler(mockEvent);

    expect(errorApiResponse).toHaveBeenCalledWith(
      'Failed to delete thing: AWS service unavailable',
      500,
      {
        errorType: 'Error',
        errorCode: undefined
      }
    );
  });

});
