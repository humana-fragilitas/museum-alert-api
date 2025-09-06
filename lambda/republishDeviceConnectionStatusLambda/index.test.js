import { describe,
         test,
         expect,
         jest,
         beforeEach } from '@jest/globals';

import { mockClient } from 'aws-sdk-client-mock';
import { IoTClient,
         DescribeThingCommand,
         DescribeEndpointCommand } from '@aws-sdk/client-iot';
import { IoTDataPlaneClient,
         PublishCommand } from '@aws-sdk/client-iot-data-plane';

import { handler } from './index.mjs';


const iotMock = mockClient(IoTClient);
const iotDataMock = mockClient(IoTDataPlaneClient);

describe('republishDeviceConnectionStatusLambda', () => {

  beforeEach(() => {
    iotMock.reset();
    iotDataMock.reset();
    jest.clearAllMocks();
  });

  test('should successfully republish connection status for connected device', async () => {

    const mockEvent = {
      clientId: 'test-device-001',
      eventType: 'connected',
      timestamp: 1234567890
    };

    iotMock.on(DescribeEndpointCommand).resolves({
      endpointAddress: 'test-endpoint.iot.amazonaws.com'
    });

    iotMock.on(DescribeThingCommand).resolves({
      thingName: 'test-device-001',
      attributes: {
        Company: 'test-company'
      }
    });

    iotDataMock.on(PublishCommand).resolves({});

    const result = await handler(mockEvent);

    expect(iotMock.call(0).args[0].input).toEqual({
      endpointType: 'iot:Data-ATS'
    });

    expect(iotMock.call(1).args[0].input).toEqual({
      thingName: 'test-device-001'
    });

    expect(iotDataMock.call(0).args[0].input).toEqual({
      topic: 'companies/test-company/events',
      payload: expect.any(Buffer),
      qos: 0
    });

    const sentPayload = iotDataMock.call(0).args[0].input.payload;
    const payloadString = sentPayload.toString();
    const payload = JSON.parse(payloadString);
    
    expect(payload).toEqual({
      type: 1,
      timestamp: 1234567890,
      sn: 'test-device-001',
      data: { connected: true }
    });

    expect(result).toEqual({
      statusCode: 200,
      body: 'Processed event for thing: test-device-001 and company: test-company'
    });

  });

  test('should successfully republish connection status for disconnected device', async () => {

    const mockEvent = {
      clientId: 'test-device-002',
      eventType: 'disconnected',
      timestamp: 1234567890
    };

    iotMock.on(DescribeEndpointCommand).resolves({
      endpointAddress: 'test-endpoint.iot.amazonaws.com'
    });

    iotMock.on(DescribeThingCommand).resolves({
      thingName: 'test-device-002',
      attributes: {
        Company: 'test-company'
      }
    });

    iotDataMock.on(PublishCommand).resolves({});

    await handler(mockEvent);

    const sentPayload = iotDataMock.call(0).args[0].input.payload;
    const payloadString = sentPayload.toString();
    const payload = JSON.parse(payloadString);
    
    expect(payload).toEqual({
      type: 1,
      timestamp: 1234567890,
      sn: 'test-device-002',
      data: { connected: false }
    });

  });

  test('should return error when client ID is missing', async () => {

    const mockEvent = {
      eventType: 'connected',
      timestamp: 1234567890
    };

    const result = await handler(mockEvent);

    expect(result).toEqual({
      statusCode: 500,
      body: 'Error: Missing client id in event'
    });

  });

  test('should return error when thing has no company attribute', async () => {

    const mockEvent = {
      clientId: 'test-device-003',
      eventType: 'connected',
      timestamp: 1234567890
    };

    iotMock.on(DescribeEndpointCommand).resolves({
      endpointAddress: 'test-endpoint.iot.amazonaws.com'
    });

    iotMock.on(DescribeThingCommand).resolves({
      thingName: 'test-device-003',
      attributes: {}
    });

    const result = await handler(mockEvent);

    expect(result).toEqual({
      statusCode: 400,
      body: 'No Company attribute found for thing: test-device-003'
    });

  });

  test('should handle DescribeThingCommand errors', async () => {

    const mockEvent = {
      clientId: 'test-device-004',
      eventType: 'connected',
      timestamp: 1234567890
    };

    iotMock.on(DescribeEndpointCommand).resolves({
      endpointAddress: 'test-endpoint.iot.amazonaws.com'
    });

    iotMock.on(DescribeThingCommand).rejects(new Error('Thing not found'));

    const result = await handler(mockEvent);

    expect(result).toEqual({
      statusCode: 500,
      body: 'Error: Thing not found'
    });

  });

  test('should handle PublishCommand errors', async () => {

    const mockEvent = {
      clientId: 'test-device-006',
      eventType: 'connected',
      timestamp: 1234567890
    };

    iotMock.on(DescribeEndpointCommand).resolves({
      endpointAddress: 'test-endpoint.iot.amazonaws.com'
    });

    iotMock.on(DescribeThingCommand).resolves({
      thingName: 'test-device-006',
      attributes: {
        Company: 'test-company'
      }
    });

    iotDataMock.on(PublishCommand).rejects(new Error('Publish failed'));

    const result = await handler(mockEvent);

    expect(result).toEqual({
      statusCode: 500,
      body: 'Error: Publish failed'
    });

  });
  
});
