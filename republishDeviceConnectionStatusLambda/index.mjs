// Lambda function to process AWS IoT connection/disconnection events
// and republish to company-specific topics using AWS SDK v3 with ES modules

import { IoTClient, DescribeThingCommand } from '@aws-sdk/client-iot';
import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';

// Initialize clients
const iotClient = new IoTClient();
const iotDataClient = new IoTDataPlaneClient({
  endpoint: `https://${process.env.IOT_ENDPOINT}`
});

export const handler = async (event) => {
  try {
    console.log('Received event:', JSON.stringify(event));
    
    // Extract clientId and thingName from the event
    const clientId = event.clientId;
    const thingName = event.thingName || clientId; // Use thingName if available, otherwise use clientId
    
    if (!thingName) {
      throw new Error('Missing thingName/clientId in event');
    }
    
    // Determine connection state based on eventType
    const connected = event.eventType === 'connected' ? 1 : 0;
    
    // Look up the thing to get its attributes
    const describeThingCommand = new DescribeThingCommand({ thingName });
    const thingData = await iotClient.send(describeThingCommand);
    console.log('Thing data:', JSON.stringify(thingData));
    
    // Extract company from thing attributes
    const company = thingData.attributes?.Company;
    if (!company) {
      console.warn(`No Company attribute found for thing: ${thingName}`);
      return {
        statusCode: 400,
        body: `No Company attribute found for thing: ${thingName}`
      };
    }
    
    // Prepare the message to publish
    const message = {
      type: 101,
      timestamp: event.timestamp,
      sn: clientId,
      data: {
        connected: !!connected,
      }
    };
    
    // Publish to company-specific topic
    const topicName = `companies/${company}/events`;
    const publishCommand = new PublishCommand({
      topic: topicName,
      payload: Buffer.from(JSON.stringify(message)),
      qos: 0
    });
    
    await iotDataClient.send(publishCommand);
    console.log(`Successfully published to topic: ${topicName}`);
    
    return {
      statusCode: 200,
      body: `Successfully processed event for thing: ${thingName} and company: ${company}`
    };
  } catch (error) {
    console.error('Error processing event:', error);
    return {
      statusCode: 500,
      body: `Error processing event: ${error.message}`
    };
  }
};