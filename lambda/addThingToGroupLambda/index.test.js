import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';

import { 
  IoTClient, 
  DescribeThingCommand, 
  CreateThingGroupCommand,
  DescribeThingGroupCommand,
  AddThingToThingGroupCommand
} from '@aws-sdk/client-iot';

import { handler } from './index.mjs';


const iotMock = mockClient(IoTClient);

describe('addThingToGroupLambda', () => {

  beforeEach(() => {
    iotMock.reset();
    jest.clearAllMocks();
  });

  test('should successfully add thing to group when thing has company attribute', async () => {

    const mockEvent = {
      thingName: 'test-device-001'
    };

    const mockThingDetails = {
      attributes: {
        Company: 'test-company'
      }
    };

    iotMock.on(DescribeThingCommand).resolves(mockThingDetails);
    
    const resourceNotFoundError = new Error('ResourceNotFoundException');
    resourceNotFoundError.name = 'ResourceNotFoundException';
    iotMock.on(DescribeThingGroupCommand).rejects(resourceNotFoundError);
    
    iotMock.on(CreateThingGroupCommand).resolves({});
    iotMock.on(AddThingToThingGroupCommand).resolves({});

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(200);
    expect(result.message).toContain('Thing test-device-001 successfully added to group Company-Group-test-company');
    
    expect(iotMock.call(0).args[0].input).toEqual({
      thingName: 'test-device-001'
    });

  });

  test('should skip grouping when thing has no company attribute', async () => {

    const mockEvent = {
      thingName: 'test-device-002'
    };

    const mockThingDetails = {
      attributes: {}
    };

    iotMock.on(DescribeThingCommand).resolves(mockThingDetails);

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(200);
    expect(result.message).toBe('No company attribute found, skipping grouping');
    
    // Should only call DescribeThingCommand
    expect(iotMock.calls()).toHaveLength(1);
    expect(iotMock.call(0).args[0].constructor.name).toBe('DescribeThingCommand');

  });

  test('should handle missing thing name', async () => {

    const mockEvent = {};
    const result = await handler(mockEvent);
    expect(result.statusCode).toBe(500);
    expect(result.message).toContain('Could not extract thing name from event');
    
  });

});
